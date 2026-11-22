"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import asyncio
import base64
import json
import os
import secrets
import tempfile
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from pydantic import BaseModel
from sqlalchemy import delete, insert, select, update

from boq import (amendments, bid, catalog, chat, db, events, inbox, mail, partners, partners_demo, pipeline, retrieve, risk,
                 runs, spend, supply, voice)
from boq import dates as tender_dates
from boq import intake as intake_rules
from boq.checks import run_checks, sort_findings
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.env import load_env
from boq.lvpages import render
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file
from boq.pdfmarks import locate
from boq.prices import load_history, suggest_prices
from boq.project import analyse_project, lv_name
from boq.report import build_report, render_handover, render_html, render_questions
from boq.whatif import Scenario, what_if

load_env()

ROOT = Path(__file__).resolve().parents[2]
DATASET = Path(os.environ.get("BOQ_DATASET_DIR", ROOT / "dataset"))
WEB_DIST = ROOT / "web" / "dist"
MAX_BYTES = 30 * 1024 * 1024
PAGES = ROOT / "data" / "processed" / "pages"  # pages drawn for LVs that came without a PDF (git-ignored)



@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.engine()  # create the tables, and fail at start rather than on the first request; nothing is seeded
    if runs.AUTO:
        runs.resume_interrupted()  # runs a restart cut off go on where they stood
    # Polier looks into the web for partners now and then, where the estimator switched that on (boq.partners)
    looking = asyncio.create_task(partners.keep_looking()) if runs.AUTO else None
    # ... and into the mailbox every few minutes, for answers, quotes and new tenders (sweep_inbox)
    sweeping = asyncio.create_task(_keep_sweeping()) if runs.AUTO else None
    yield
    if looking:
        looking.cancel()
    if sweeping:
        sweeping.cancel()


app = FastAPI(title="BoQ analysis", lifespan=lifespan)

# A public URL without accounts: anyone who finds it could run the AI review on our API key. With
# BOQ_PASSWORD set, every request needs it (HTTP basic auth, any user name); the browser asks once.
PASSWORD = os.environ.get("BOQ_PASSWORD", "")


@app.middleware("http")
async def password_gate(request: Request, call_next):
    if PASSWORD and request.url.path != "/api/health":
        scheme, _, encoded = request.headers.get("authorization", "").partition(" ")
        try:
            given = base64.b64decode(encoded).decode().partition(":")[2] if scheme.lower() == "basic" else ""
        except ValueError:
            given = ""
        if not secrets.compare_digest(given.encode(), PASSWORD.encode()):
            return Response("Password required.", 401, {"WWW-Authenticate": 'Basic realm="LV Check"'})
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"ok": True}

# Analysed LVs are kept in the database (table analyses), so the LLM review, the report and the prices can
# refer to one by id across restarts and server instances. The newest few stay in memory as well.
_RECENT: OrderedDict[str, tuple[BoQ, list[Finding]]] = OrderedDict()
_RECENT_SIZE = 60
_KEEP = 2000  # analyses kept in the database; older ones are dropped

# What the PDF view needs per analysis. This lives in memory only: after a restart an analysis is still in the
# database, but a kept PDF is shown again only once its file has been opened again.
_SOURCES: OrderedDict[str, Path] = OrderedDict()  # the PDF behind an analysis (dataset file or project document)
# an LV without a PDF (GAEB, Excel): the pages the app drew for it and where each item stands on them
_DRAWN: dict[str, tuple[Path, dict[str, tuple[int, float]]]] = {}
# an LV shown on another file's pages (a GAEB file on the client's print-out of the same LV): that file's
# name and where the print-out has each item
_PRINT_OUT: dict[str, tuple[str, dict[str, tuple[int, float]]]] = {}
_PARSED: dict[tuple[str, float], BoQ] = {}  # project files read for a print-out or the chat, by path and mtime
_PROJECT_OF: dict[str, str] = {}  # the catalog project an analysis was opened from
_INDEXES: dict[tuple, tuple[retrieve.Index, dict]] = {}  # search index and whole-project cost per set of documents
_MARKS: dict[str, tuple[tuple[str, ...], dict]] = {}  # marks of an analysis, for the findings they were made for
_REVIEWS: dict[str, dict] = {}  # AI reviews that are running: where each one stands (see llm_progress)
_PAGES_KEPT = 240  # analyses whose pages stay at hand: several projects of thirty trade LVs
_DRAWN_ORDER: OrderedDict[str, None] = OrderedDict()  # analyses in the order they were made


def _parse(path: Path, name: str) -> BoQ:
    try:
        boq = parse_file(str(path))
    except Exception as exc:  # malformed upload: report it, do not crash the server
        # the parser names the temporary file; the user knows the file by the name they uploaded
        raise HTTPException(422, f"Could not read {name}: {str(exc).replace(str(path), name)}") from exc
    boq.file = name
    if boq.name == path.stem:  # a PDF without a title is named after its file: use the uploaded name,
        boq.name = Path(name).stem  # not the temporary one, so repeated uploads hit the LLM cache
    if not boq.items:
        raise HTTPException(422, f"No LV items found in {name}. PDFs need a text layer and a printed "
                                 f"item list (item number, description, quantity, unit).")
    return boq


def _parse_bytes(data: bytes, name: str) -> BoQ:
    """Parse file contents (an upload, or a document from the database); the parsers read from a path."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{Path(name).suffix.lower()}"
        path.write_bytes(data)
        return _parse(path, name)


def _parse_doc(doc: dict) -> BoQ:
    return _parse_bytes(catalog.file_bytes(doc["id"]), doc["name"])


def _remember(analysis_id: str, boq: BoQ, findings: list[Finding]) -> None:
    _RECENT[analysis_id] = (boq, findings)
    _RECENT.move_to_end(analysis_id)
    while len(_RECENT) > _RECENT_SIZE:
        _RECENT.popitem(last=False)


def _doc_path(doc: dict) -> Path:
    """A project document as a file on disk. Documents live in the database; the PDF view and the search
    for a print-out read pages from a path, so the bytes are written out once, beside the drawn pages."""
    data = catalog.file_bytes(doc["id"])
    path = PAGES / "docs" / f"{doc['id']}{Path(doc['name']).suffix.lower()}"
    if not path.is_file() or path.stat().st_size != len(data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return path


def _is_pdf(doc: dict) -> bool:
    return Path(doc["name"]).suffix.lower() == ".pdf"


def _store(boq: BoQ, source: Path | None = None) -> tuple[str, list[Finding]]:
    """`source`: the file the LV was read from, if it stays on disk. A PDF is kept for the PDF view."""
    findings = run_checks(boq)
    analysis_id = uuid.uuid4().hex
    with db.engine().begin() as conn:
        conn.execute(insert(db.analyses).values(
            id=analysis_id, created=db.now(), boq=boq.model_dump(mode="json"),
            findings=[f.model_dump(mode="json") for f in findings]))
        oldest = select(db.analyses.c.created).order_by(db.analyses.c.created.desc()).offset(_KEEP).limit(1)
        cutoff = conn.execute(oldest).scalar()
        if cutoff is not None:
            conn.execute(delete(db.analyses).where(db.analyses.c.created <= cutoff))
    _remember(analysis_id, boq, findings)
    if source is not None and Path(source).suffix.lower() == ".pdf":
        _SOURCES[analysis_id] = Path(source)
    _DRAWN_ORDER[analysis_id] = None
    while len(_DRAWN_ORDER) > _PAGES_KEPT:  # the oldest analyses give up their pages, not their findings
        dropped = _DRAWN_ORDER.popitem(last=False)[0]
        _SOURCES.pop(dropped, None)
        _MARKS.pop(dropped, None)
        _PRINT_OUT.pop(dropped, None)
        _PROJECT_OF.pop(dropped, None)
        if dropped in _DRAWN:
            _DRAWN.pop(dropped)[0].unlink(missing_ok=True)
    return analysis_id, findings


def _set_project(analysis_id: str, project_id: str) -> None:
    """The project a file was opened from: in memory for the chat and the print-out, and kept with the
    analysis, so the mail about the file is found again after a restart."""
    _PROJECT_OF[analysis_id] = project_id
    with db.engine().begin() as conn:
        conn.execute(update(db.analyses).where(db.analyses.c.id == analysis_id).values(project_id=project_id))


def _project_id(analysis_id: str) -> str | None:
    if analysis_id not in _PROJECT_OF:
        with db.engine().connect() as conn:
            kept = conn.execute(select(db.analyses.c.project_id).where(db.analyses.c.id == analysis_id)).scalar()
        if kept is None:
            return None
        _PROJECT_OF[analysis_id] = kept
    return _PROJECT_OF[analysis_id]


def _llm_findings(analysis_id: str) -> list[Finding]:
    return _reviewed(analysis_id) or []


def _reviewed(analysis_id: str) -> list[Finding] | None:
    """The AI findings of an analysis; None if no review has run on it."""
    with db.engine().connect() as conn:
        raw = conn.execute(select(db.analyses.c.llm_findings).where(db.analyses.c.id == analysis_id)).scalar()
    return None if raw is None else [Finding.model_validate(f) for f in raw]


def _from_run(analysis_id: str, project_id: str, doc_id: int) -> list[Finding] | None:
    """What the project's pipeline run found in this document with the AI review, put onto the analysis the
    file was just opened as; None if no run has reviewed it (yet)."""
    found = runs.llm_findings(project_id, doc_id)
    changed = runs.version_findings(project_id, doc_id)  # what this version changed against its tender
    if found is not None or changed:
        _keep_llm_findings(analysis_id, (found or []) + changed)
    return found if not changed else (found or []) + changed if found is not None else None


def _keep_llm_findings(analysis_id: str, findings: list[Finding]) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.analyses).where(db.analyses.c.id == analysis_id)
                     .values(llm_findings=[f.model_dump(mode="json") for f in findings]))


_SIBLING: dict[int, dict[str, Decimal]] = {}  # per priced document of a project: unit price by item number


def _item_values(analysis_id: str, boq: BoQ) -> dict[str, tuple[Decimal, str]]:
    """What each item of the LV is worth, and where that price is from: the file itself, the bid in
    progress, a priced version of the same LV in the project (the bid or the award), else the suggestion
    from past bids. An item nobody has a price for is not in it: "not quantified" is a valid answer."""
    out: dict[str, tuple[Decimal, str]] = {}
    qty = {i.oz: i.qty for i in boq.items if i.qty is not None}

    def take(oz: str, unit_price, basis: str) -> None:
        if oz in qty and oz not in out and unit_price is not None:
            out[oz] = ((Decimal(str(unit_price)) * qty[oz]).quantize(Decimal("0.01")), basis)

    for i in boq.items:
        if i.total is not None and i.oz not in out:
            out[i.oz] = (i.total, "the price in this file")
    project_id = _project_id(analysis_id)
    for oz, kept in bid.entered(project_id, boq.file).items():
        take(oz, kept["unit_price"], "your price in the bid")
    if project_id and len(out) < len(qty):
        docs = (catalog.find(project_id) or {"files": []})["files"]
        for doc in sorted(docs, key=lambda d: d["format"] == "PDF"):  # a GAEB file is read in a moment, a PDF is not
            if doc["name"] == boq.file or doc["role"] not in ("bid", "award", "offer", "submitted bid"):
                continue
            if len(out) >= len(qty):
                break
            if doc["id"] not in _SIBLING:
                try:
                    _SIBLING[doc["id"]] = {i.oz: i.up for i in _parse_doc(doc).items if i.up is not None}
                except HTTPException:
                    _SIBLING[doc["id"]] = {}
            for oz, up in _SIBLING[doc["id"]].items():
                take(oz, up, f"the {doc['role']} of this LV ({doc['name']})")
    if len(out) < len(qty):
        try:
            for s in (_prices(boq, _project_id(analysis_id)) or {"suggestions": []})["suggestions"]:
                take(s["item_oz"], s["unit_price"], "a partner's quote in another tender (a suggestion)"
                     if s.get("basis") == "partners" else "past bids (a suggestion)")
        except Exception:  # the suggestions are a help here, never a reason to fail
            pass
    return out


def _with_stakes(analysis_id: str, boq: BoQ, findings: list[Finding]) -> list[Finding]:
    """Every finding with the money it is about, and the list in the order of the money: within a severity
    the finding on the most expensive item first (CLAUDE.md: rank by money at stake). A finding that brings
    its own amount keeps it; the others get the value of their item, with where the price is from."""
    values = _item_values(analysis_id, boq)
    out = []
    for f in findings:
        if f.money_at_stake is None and f.item_oz in values:
            f = f.model_copy(update={"money_at_stake": values[f.item_oz][0], "money_basis": values[f.item_oz][1]})
        out.append(f)
    return sort_findings(out)


def _dump(analysis_id: str, boq: BoQ, findings: list[Finding], reviewed: bool = False) -> dict:
    return {"id": analysis_id, "boq": boq.model_dump(mode="json"),
            "findings": [f.model_dump(mode="json") for f in _with_stakes(analysis_id, boq, findings)],
            "reviewed": reviewed,  # the AI review has run on it: its findings are among these
            # pages can be shown (GET …/source.pdf, …/marks): the PDF itself if it is kept, pages drawn by
            # the app for a file that has none. A PDF from a temporary upload is gone, so it has neither.
            "pdf": analysis_id in _SOURCES or boq.format != "pdf",
            "pdf_generated": analysis_id not in _SOURCES and boq.format != "pdf",
            # set when the pages are another file's: the client's print-out of this LV, found in the project
            "pdf_file": _PRINT_OUT[analysis_id][0] if analysis_id in _PRINT_OUT else None}


def _analyze(path: Path, name: str, keep: bool = False) -> dict:
    """`keep`: the file stays on disk after this request (not a temporary upload)."""
    boq = _parse(path, name)
    analysis_id, findings = _store(boq, path if keep else None)
    return _dump(analysis_id, boq, findings)


def _parsed(path: Path, name: str | None = None) -> BoQ | None:
    """A project file read once per version of the file; None if it cannot be read."""
    key = (str(path), path.stat().st_mtime)
    if key not in _PARSED:
        try:
            boq = parse_file(str(path))
        except Exception:
            return None
        boq.file = name or path.name
        _PARSED[key] = boq
    return _PARSED[key]


def _print_out(boq: BoQ, others: list[dict]) -> tuple[Path, str, dict[str, tuple[int, float]]] | None:
    """The client's print-out of this LV among the other files of its project: a PDF that has at least
    70 % of the LV's items (number, unit and quantity; an excerpt does not count). Of several, one that
    carries prices if this file does (a bid on the submitted bid, not on the empty tender), then the one
    sharing most. Returns its path, name and where it prints each item."""
    best = None
    priced = any(i.total is not None for i in boq.items)
    for f in others:
        if not _is_pdf(f):
            continue
        pdf = _parsed(_doc_path(f), f["name"])
        if pdf is None:  # an unreadable PDF is simply no print-out
            continue
        path = _doc_path(f)
        share = _shared(boq, pdf) / len(boq.items)
        if share < 0.7:
            continue
        rank = (any(i.total is not None for i in pdf.items) == priced, share)
        if best is None or rank > best[0]:
            positions = {}
            for i in pdf.items:
                if i.source.page and i.source.y is not None:
                    positions.setdefault(i.oz, (i.source.page, i.source.y))
            best = (rank, path, f["name"], positions)
    return best[1:] if best else None


def _parse_kept(files: list[tuple[Path, str]]) -> tuple[list[BoQ], dict[int, Path]]:
    """Files that stay on disk, parsed; and which file each LV came from, by `id()` of its BoQ."""
    boqs = [_parse(path, name) for path, name in files]
    return boqs, {id(boq): Path(path) for boq, (path, _) in zip(boqs, files)}


def _project(name: str, boqs: list[BoQ], sources: dict[int, Path] | None = None,
             project_id: str | None = None, docs: dict[int, int] | None = None) -> dict:
    """Analyse each LV on its own, then what the LVs expect from each other. `docs`: the document each LV
    is, by `id()` of its BoQ, so what the project's pipeline run found in it with the AI review is added."""
    lvs, rows = {}, []
    for boq in boqs:
        label = lv_name(boq)
        while label in lvs:  # two files of the same name
            label += " (2)"
        analysis_id, findings = _store(boq, (sources or {}).get(id(boq)))
        if project_id:
            _set_project(analysis_id, project_id)
            if docs and id(boq) in docs:
                _from_run(analysis_id, project_id, docs[id(boq)])
                findings = findings + _llm_findings(analysis_id)
        lvs[label] = boq
        rows.append({"name": label, "file": boq.file, "analysis_id": analysis_id, "items": len(boq.items),
                     "counts": {s: sum(f.severity == s for f in findings) for s in ("high", "warn", "info")}})
    return {"name": name, "lvs": rows, **analyse_project(lvs)}


def _samples() -> dict[str, Path]:
    if not DATASET.is_dir():
        return {}
    # dataset/en is the English reading copy (D-022), never app input: the checks key on German wording
    files = (p for p in DATASET.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED
             and "en" not in p.relative_to(DATASET).parts[:1])
    return {p.relative_to(DATASET).as_posix(): p for p in sorted(files)}


@app.post("/api/analyze")
async def analyze_upload(file: UploadFile):
    name = Path(file.filename or "upload").name
    suffix = Path(name).suffix.lower()
    if suffix not in SUPPORTED:
        raise HTTPException(415, f"{suffix or 'This file type'} is not supported. "
                                 f"Upload a GAEB file, a PDF or an Excel file: {', '.join(sorted(SUPPORTED))}.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 30 MB.")
    boq = _parse_bytes(data, name)
    analysis_id, findings = _store(boq)
    return _dump(analysis_id, boq, findings)


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str):
    """An LV analysed earlier, e.g. one LV of a project."""
    boq, findings = _analysis(analysis_id)
    reviewed = _reviewed(analysis_id)
    return _dump(analysis_id, boq, sort_findings(findings + (reviewed or [])), reviewed is not None)


async def _read_uploads(files: list[UploadFile]) -> tuple[list[tuple[int, str, bytes, BoQ]], list[dict], list[dict]]:
    """The uploaded files that are LVs, parsed, each with its place among the uploads; the ones left
    out, each with the reason; and the tender's dates as every file states them (boq.dates). A tender
    package holds plans, forms and letters next to the LV: a file that is not an LV must not stop the
    others, and its dates count all the same (the deadline often stands in the cover letter)."""
    read, left_out, found = [], [], []
    for n, file in enumerate(files):
        filename = Path(file.filename or f"upload{n}").name
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED | tender_dates.READABLE:
            left_out.append({"name": filename, "reason": f"{suffix or 'this file type'} is not an LV format"})
            continue
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            left_out.append({"name": filename, "reason": "larger than 30 MB"})
            continue
        found += tender_dates.read(data, filename)
        if suffix not in SUPPORTED:
            left_out.append({"name": filename, "reason": f"{suffix} is not an LV format"})
            continue
        try:
            read.append((n, filename, data, _parse_bytes(data, filename)))
        except HTTPException as exc:
            reason = "no LV items found" if "No LV items" in str(exc.detail) else "could not be read"
            left_out.append({"name": filename, "reason": reason})
    if not read:
        raise HTTPException(422, "None of these files is an LV: " + "; ".join(
            f"{f['name']} ({f['reason']})" for f in left_out) + f". Use GAEB, PDF or Excel: {', '.join(sorted(SUPPORTED))}.")
    return read, left_out, tender_dates.merge(found)


_shared, _versions, _same_lv = intake_rules.shared, intake_rules.versions, intake_rules.same_lv


_one_per_lv = intake_rules.one_per_lv


@app.post("/api/intake")
async def intake(files: list[UploadFile], project: str | None = Form(None)):
    """What a set of dropped files is, before anything is kept: the tender they belong to (number, name,
    client, read from the files), which files are the same LV, the step of each file with its evidence,
    the project they probably belong to, the files that are not LVs, and the tender's dates as the files
    state them (`dates`, each with the label and line it was read from; `plan`: the ones to plan by).
    `project`: the project they were dropped on, whose files then count as evidence too."""
    uploads, left_out, dates = await _read_uploads(files)
    boqs = [boq for _, _, _, boq in uploads]
    existing = catalog.all_projects()
    target = next((p for p in existing if p["id"] == project), None)
    groups = _same_lv(boqs)
    found = intake_rules.identity(boqs)
    suggested = None if target else intake_rules.suggest(found, existing)
    # the files already kept for this tender say what a new one is too (a PDF with the prices of its D84);
    # also when the project was not dropped on but is the one the files name
    home = target or next((p for p in existing if suggested and p["id"] == suggested["id"]), None)
    known = [_parse_doc(f) for f in home["files"]] if home else []
    return {**found,
            "lvs": len(set(groups)),
            "suggested": suggested,
            "files": [{"index": n, "name": name, "format": boq.format, "title": lv_name(boq),
                       "items": len(boq.items), "lv": g, **intake_rules.classify(boq, boqs + known)}
                      for (n, name, _, boq), g in zip(uploads, groups)],
            "left_out": left_out, "dates": dates, "plan": tender_dates.plan_of(dates)}


@app.post("/api/projects")
async def create_project(files: list[UploadFile], name: str | None = Form(None), project: str | None = Form(None),
                         roles: str | None = Form(None), due: str | None = Form(None),
                         questions_due: str | None = Form(None), dates: str | None = Form(None),
                         found: str | None = Form(None)):
    """Keep files as a new project, or add them to an existing one.

    One LV in several versions and several trade LVs are both projects; which it is follows from the
    item numbers of the files. Several LVs are also analysed against each other, as before. What each
    file is (tender, bid, award) is read from the files as in the intake; `roles`, a JSON list with one
    entry per uploaded file (null = as read), is what the user corrected there. `due` and `questions_due`
    (YYYY-MM-DD) are the tender's dates. Left out, they are taken from the files where these state them
    (boq.dates). `dates`, a JSON object, says all of a new tender's dates at once (any of PLAN_DATES): what
    it names is kept as said, "" meaning none, also where the files state a day. Files added to a project
    fill only the dates it does not have yet, unless `dates` says otherwise.

    `found`, a JSON object, is for the agent that reads the mailbox: where it found this tender (`via`, e.g.
    "mail"; `sender`, `subject`, `received` as YYYY-MM-DD, all optional). A new project with `found` stands
    in the intake: its files are kept and read, but no check runs until the estimator takes it on
    (PATCH with stage "check") or passes (outcome "passed").
    """
    where = None
    if found:
        try:
            where = json.loads(found)
        except ValueError:
            where = None
        if not isinstance(where, dict) or any(k not in FOUND_KEYS or not isinstance(v, str) for k, v in where.items()):
            raise HTTPException(422, f"found is an object of strings with any of: {', '.join(FOUND_KEYS)}.")
        if project:
            raise HTTPException(422, "found is for a new project: files for a project that exists are added to it.")
        where = {k: v.strip()[:200] for k, v in where.items() if v.strip()} or {"via": "mail"}
    try:
        said_dates = json.loads(dates) if dates else {}
    except ValueError:
        raise HTTPException(422, "dates must be a JSON object.") from None
    if not isinstance(said_dates, dict) or any(k not in PLAN_DATES or not isinstance(v, str | None)
                                               for k, v in said_dates.items()):
        raise HTTPException(422, f"dates is an object with any of: {', '.join(PLAN_DATES)}.")
    said_dates |= {k: v for k, v in (("due", due), ("questions_due", questions_due)) if v}
    uploads, _, dates = await _read_uploads(files)
    plan = {k: v for k, v in {**tender_dates.plan_of(dates), **_plan(said_dates)}.items() if v}
    new = [boq for _, _, _, boq in uploads]
    try:
        said = json.loads(roles) if roles else []
    except ValueError:
        raise HTTPException(422, "roles must be a JSON list.") from None
    if not isinstance(said, list) or any(r is not None and r not in intake_rules.ROLES for r in said):
        raise HTTPException(422, f"A role is one of: {', '.join(intake_rules.ROLES)}.")
    existing = _catalog(project) if project else None
    boqs = ([_parse_doc(f) for f in existing["files"]] if existing else []) + new
    stored = [(filename, data, (said[n] if n < len(said) else None) or intake_rules.classify(boq, boqs)["role"])
              for n, filename, data, boq in uploads]
    kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
    if existing:
        catalog.add_files(project, stored, kind)
        project_id, title = project, existing["name"]
        # the files fill the dates the project lacks; what the dialog says is kept as said
        missing = {k: v for k, v in tender_dates.plan_of(dates).items() if not existing["plan"].get(k)}
        if changes := {**missing, **_plan(said_dates)}:
            catalog.set_plan(project, changes)
    else:
        found = intake_rules.identity(new)
        title = (name or "").strip()[:80] or found["name"] or f"{len(boqs)} LVs, {datetime.now():%d.%m.%Y %H:%M}"
        if where is not None:
            plan |= {"stage": "intake", "found": where}
        project_id = catalog.save_project(title, stored, kind, number=found["number"], plan=plan)
        if where is not None:
            return {"id": project_id, "kind": kind, "name": title}
    # Nothing is analysed here: the pipeline runs on the project in the background (boq.runs) and the pages
    # show how far it is.
    if existing and existing["plan"].get("stage") == "intake":  # not taken on yet: more files, still no check
        return {"id": project_id, "kind": kind, "name": title}
    runs.autostart(project_id, "files added" if existing else "project created")
    return {"id": project_id, "kind": kind, "name": title}


# ---------------------------------------------------------------- projects page

def _catalog(project_id: str) -> dict:
    project = catalog.find(project_id)
    if project is None:
        raise HTTPException(404, f"No project {project_id}.")
    return project


@app.get("/api/catalog")
def list_catalog():
    """Every project: uploaded ones newest first, then the demo projects."""
    return catalog.all_projects()


@app.get("/api/catalog/{project_id}/summary")
def catalog_summary(project_id: str):
    """Items and rule findings of a project and of each of its documents, for the projects page.
    Parses every file, so it is asked for per project and kept with the project until its files change."""
    project = _catalog(project_id)
    kept = catalog.summary(project_id)
    # A tender in the intake is read and nothing else: no check runs on it before the estimator takes it on,
    # the rules neither, so that a card never shows half an analysis (D-042). Its summary is not kept.
    unchecked = project["plan"].get("stage") == "intake"
    # v: summaries kept by an earlier version are worked out again
    if kept is None or kept.get("v") != 4 or unchecked or not kept.get("checked", True):
        rank = {"info": 1, "warn": 2, "high": 3}
        docs, net, net_from, dates = [], None, None, []
        for index, f in enumerate(project["files"]):
            data = catalog.file_bytes(f["id"])
            dates += tender_dates.read(data, f["name"])
            try:
                boq = _parse_bytes(data, f["name"])
            except HTTPException as exc:  # one unreadable document must not hide the others
                docs.append({"index": index, "name": f["name"], "role": f["role"], "format": f["format"],
                             "title": "", "items": 0, "counts": None, "marks": "", "error": str(exc.detail),
                             "questions": 0, "priced": 0})
                continue
            counts, worst, ask = {"high": 0, "warn": 0, "info": 0}, {}, set()
            # the rules, and what the project's pipeline run added to this file (AI review, changes against
            # the tender): the same findings the file shows when it is opened
            from_run = (runs.llm_findings(project_id, f["id"]) or []) + runs.version_findings(project_id, f["id"])
            for finding in [] if unchecked else run_checks(boq) + from_run:
                counts[finding.severity] += 1
                if finding.action == "ask_client":
                    ask.add(finding.item_oz)
                if finding.item_oz:
                    worst[finding.item_oz] = max(worst.get(finding.item_oz, 0), rank[finding.severity])
            docs.append({"index": index, "name": f["name"], "role": f["role"], "format": f["format"],
                         "title": lv_name(boq), "items": len(boq.items), "counts": counts,
                         # the document's fingerprint: one digit per item in LV order, 0 none .. 3 stop
                         "marks": "".join(str(worst.get(i.oz, 0)) for i in boq.items), "error": None})
            totals = [i.total for i in boq.items if i.total is not None]
            # what is open on it: points to raise with the client, and how much of it carries a price
            docs[-1] |= {"questions": len(ask), "priced": len(totals)}
            if totals and f["role"] in ("bid", "award", "offer") and f["format"].startswith("GAEB"):
                net, net_from = float(sum(totals)), f["role"]  # a priced GAEB version gives the net total
        # The project's own numbers: one LV in several versions counts once (the document it opens with),
        # trade LVs all count.
        counted = [d for d in docs if d["counts"]]
        counted = counted if project["kind"] == "trades" else counted[:1]
        kept = {"v": 4, "checked": not unchecked, "lvs": len(counted), "items": sum(d["items"] for d in counted),
                "counts": {s: sum(d["counts"][s] for d in counted) for s in rank},
                "net": net, "net_from": net_from, "docs": docs,
                # the tender's dates as its files state them, each with where it was read (boq.dates)
                "dates": tender_dates.merge(dates)}
        if not unchecked:
            catalog.keep_summary(project_id, kept)
    return kept


@app.get("/api/catalog/{project_id}/files/{index}")
def open_project_file(project_id: str, index: int):
    """One file of a project as an analysed LV."""
    files = _catalog(project_id)["files"]
    if not 0 <= index < len(files):
        raise HTTPException(404, f"Project {project_id} has no file {index}.")
    doc = files[index]
    boq = _parse_doc(doc)
    # a GAEB or Excel file is shown on the client's print-out of the same LV if the project has one
    shown = None if boq.format == "pdf" else _print_out(boq, files[:index] + files[index + 1:])
    analysis_id, findings = _store(boq, shown[0] if shown else _doc_path(doc) if _is_pdf(doc) else None)
    if shown:
        _PRINT_OUT[analysis_id] = shown[1:]
    _set_project(analysis_id, project_id)
    reviewed = runs.llm_findings(project_id, doc["id"]) is not None
    _from_run(analysis_id, project_id, doc["id"])
    return _dump(analysis_id, boq, sort_findings(findings + _llm_findings(analysis_id)), reviewed)


@app.delete("/api/catalog/{project_id}/files/{index}")
def remove_project_file(project_id: str, index: int):
    """Take one file out of a project. The last file cannot go: delete the project instead."""
    files = _catalog(project_id)["files"]
    if not 0 <= index < len(files):
        raise HTTPException(404, f"Project {project_id} has no file {index}.")
    if len(files) == 1:
        raise HTTPException(409, "This is the project's only file; delete the project instead.")
    catalog.remove_file(project_id, files[index]["id"])
    rest = [_parse_doc(f) for i, f in enumerate(files) if i != index]
    catalog.set_kind(project_id, "trades" if len(set(_same_lv(rest))) > 1 else "versions")
    return _catalog(project_id)


class FileRole(BaseModel):
    step: str


@app.patch("/api/catalog/{project_id}/files/{index}")
def set_file_step(project_id: str, index: int, body: FileRole):
    """Say that a file belongs to another step of the tender (tender, bid, award) than was read from it."""
    files = _catalog(project_id)["files"]
    if not 0 <= index < len(files):
        raise HTTPException(404, f"Project {project_id} has no file {index}.")
    if body.step not in intake_rules.STEPS:
        raise HTTPException(422, f"A step is one of: {', '.join(intake_rules.STEPS)}.")
    catalog.set_role(project_id, files[index]["id"], intake_rules.with_step(files[index]["role"], body.step))
    return _catalog(project_id)


@app.delete("/api/catalog/{project_id}", status_code=204)
def remove_project(project_id: str):
    if not catalog.remove_project(project_id):
        raise HTTPException(404, f"No project {project_id}.")


@app.get("/api/catalog/{project_id}/project")
def open_project(project_id: str):
    """A project of several trade LVs: each LV analysed, then what they expect from each other."""
    project = _catalog(project_id)
    if project["kind"] != "trades":
        raise HTTPException(409, f"{project['name']} is one LV in several versions; open one of its files.")
    boqs = [_parse_doc(f) for f in project["files"]]
    sources = {id(b): _doc_path(f) for b, f in zip(boqs, project["files"]) if _is_pdf(f)}
    docs = {id(b): f["id"] for b, f in zip(boqs, project["files"])}
    return {"id": project_id, **_project(project["name"], _one_per_lv(boqs), sources, project_id, docs)}


# ---------------------------------------------------------------- the pipeline and its runs

@app.get("/api/pipeline")
def pipeline_steps():
    """Every check the pipeline runs, in order (boq.pipeline): id, title, deterministic or agentic, per
    document or per project, and what it looks for."""
    return pipeline.describe()


@app.get("/api/runs")
def list_runs(project: str | None = None):
    """Pipeline runs, newest first. Of one project: its latest runs. Without: the latest run of every
    project, i.e. where each one stands. A run has its status, its six stations and one row per step and
    document with what it found. Asked again and again by the pages while a run is going."""
    return runs.list_runs(project) if project else runs.latest()


@app.post("/api/catalog/{project_id}/runs")
def start_run(project_id: str):
    """Run the pipeline on a project again, in the background."""
    _catalog(project_id)
    return runs.start(project_id, "started by hand")


@app.get("/api/spend")
def spend_audit(project: str | None = None):
    """The audit of the requests to Claude (boq.spend), of one project or of all: the sum in USD (an
    estimate at list prices), per purpose, and the latest requests with their token counts."""
    return spend.audit(project)


def _run(found: dict | None) -> dict:
    if found is None:
        raise HTTPException(404, "This run is no longer kept.")
    return found


@app.post("/api/runs/{run_id}/go-on")
def run_go_on(run_id: str):
    """The bidder questions a run waits for are closed without the client's answers; the run is done."""
    return _run(runs.go_on(run_id))


@app.post("/api/runs/{run_id}/retry")
def run_retry(run_id: str):
    """Try the failed steps of a run again."""
    return _run(runs.retry(run_id))


@app.post("/api/runs/{run_id}/cancel")
def run_cancel(run_id: str):
    """Stop a run after the step it is on."""
    if not runs.cancel(run_id):
        raise HTTPException(409, "This run is not going.")
    return _run(runs.find(run_id))


PLAN_DATES = ("questions_due", "due", "opening", "sent", "binding_until", "exec_start", "exec_end")
# intake: found for the estimator (in the mail), not taken on yet. Submitted follows from the files.
PLAN_STAGES = ("intake", "check", "pricing")
# how a tender ended; an award among the files is "won" without being said. passed: no bid was made.
PLAN_OUTCOMES = ("won", "lost", "passed", "cancelled")
FOUND_KEYS = ("via", "sender", "subject", "received")


def _plan(values: dict) -> dict:
    """The dates and the stage of a tender as they are kept: ISO days, "" or null to take one out."""
    plan = {}
    for key, value in values.items():
        value = (value or "").strip() or None
        if key == "stage":
            if value is not None and value not in PLAN_STAGES:
                raise HTTPException(422, f"A stage is one of: {', '.join(PLAN_STAGES)}.")
        elif key == "outcome":
            if value is not None and value not in PLAN_OUTCOMES:
                raise HTTPException(422, f"An outcome is one of: {', '.join(PLAN_OUTCOMES)}.")
        elif value is not None:
            try:
                value = date.fromisoformat(value).isoformat()
            except ValueError:
                raise HTTPException(422, f"{key} must be a day as YYYY-MM-DD.") from None
        plan[key] = value
    return plan


class ProjectChange(BaseModel):
    """What can be changed on a project: its name, the stage of the tender, its dates. Only what is sent."""
    name: str | None = None
    stage: str | None = None
    outcome: str | None = None  # how it ended: won, lost, passed (no bid), cancelled by the client; "" = open again
    due: str | None = None  # submission deadline (Angebotsfrist)
    questions_due: str | None = None  # last day for bidder questions
    sent: str | None = None  # the day the bid went out
    binding_until: str | None = None  # end of the binding period (Bindefrist)
    opening: str | None = None  # the bids are opened (Eröffnungstermin)
    exec_start: str | None = None  # the work starts
    exec_end: str | None = None  # the work has to be finished


@app.patch("/api/catalog/{project_id}")
def change_project(project_id: str, body: ProjectChange):
    sent = body.model_dump(exclude_unset=True)
    before = _catalog(project_id)
    if "name" in sent:
        name = (sent.pop("name") or "").strip()[:80]
        if not name:
            raise HTTPException(422, "A project needs a name.")
        catalog.rename(project_id, name)
    if sent:
        catalog.set_plan(project_id, _plan(sent))
        # a tender found in the mail is only read; the checks start when the estimator takes it on
        if before["plan"].get("stage") == "intake" and sent.get("stage") in ("check", "pricing"):
            runs.autostart(project_id, "taken on")
    return _catalog(project_id)


def _sample_projects() -> dict[str, list[Path]]:
    """Dataset folders that hold the trade LVs of one building (files named LV_<nr>_<trade>)."""
    folders: dict[str, list[Path]] = {}
    for rel, path in _samples().items():
        if path.name.startswith("LV_"):
            folders.setdefault(rel.split("/")[0], []).append(path)
    return {folder: files for folder, files in folders.items() if len(files) >= 2}


@app.get("/api/projects/samples")
def list_sample_projects():
    return [{"folder": folder, "files": len(files)} for folder, files in _sample_projects().items()]


@app.get("/api/projects/sample")
def open_sample_project(folder: str):
    files = _sample_projects().get(folder)
    if files is None:
        raise HTTPException(404, f"No project folder {folder} in the dataset.")
    boqs, sources = _parse_kept([(p, p.name) for p in files])
    return _project(folder.split("_", 1)[-1].replace("_", " "), boqs, sources)


@app.get("/api/samples")
def list_samples():
    return [{"path": rel, "name": p.name, "bytes": p.stat().st_size} for rel, p in _samples().items()]


@app.get("/api/samples/analyze")
def analyze_sample(path: str):
    sample = _samples().get(path)  # only files from the listing, never an arbitrary path
    if sample is None:
        raise HTTPException(404, f"No sample file {path}.")
    return _analyze(sample, sample.name, keep=True)


class Question(BaseModel):
    question: str
    history: list[dict] = []  # earlier turns of this conversation: {"role": "user" | "assistant", "content": …}
    reading: bool = True  # the question is asked beside this LV; false on a project's overview page
    scope: str = "search"  # "search": read the passages a local search finds; "all": read every document


def _chat_documents(analysis_id: str, boq: BoQ) -> tuple[list[BoQ], list[dict]]:
    """What the chat may read from the project of an analysis: one file per LV text, in the project's
    file order whichever file is open (so the model's cached copy serves every question about the
    project). Of several versions of one LV the tender is read, a GAEB file before its print-out. The
    open file is read in addition by `chat.answer` if it is not among them, e.g. a bid without texts.
    Returns the documents and the project's files."""
    project = catalog.find(_project_id(analysis_id) or "")
    if project is None:
        return [boq], []
    files = project["files"]
    others = [b for f in files if (b := _parsed(_doc_path(f), f["name"])) is not None and b.items]
    whole = project["kind"] == "trades"  # there an LV that repeats part of another is still its own LV
    best: dict[int, BoQ] = {}
    for other, group in zip(others, _same_lv(others, whole)):
        rank = (other.phase == "83", other.format != "pdf")
        if group not in best or rank > (best[group].phase == "83", best[group].format != "pdf"):
            best[group] = other
    return list(best.values()), files


@app.post("/api/analyses/{analysis_id}/chat")
async def ask_project(analysis_id: str, body: Question):
    """A question about the project, answered only from its documents, with the passages it rests on."""
    boq, _ = _analysis(analysis_id)
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "Ask a question.")
    documents, files = _chat_documents(analysis_id, boq)
    reading = boq if body.reading else None
    read = documents + ([boq] if reading is not None and all(d.file != boq.file for d in documents) else [])
    key = tuple((d.file, len(d.items), id(d)) for d in read)
    if key not in _INDEXES:  # built once per set of documents: a second or so for a building of 27 LVs
        if len(_INDEXES) > 8:
            _INDEXES.clear()
        _INDEXES[key] = (retrieve.Index(read), chat.whole_project(read))
    index, whole = _INDEXES[key]
    scope = "all" if body.scope == "all" else "search"
    try:
        with spend.scope(project_id=_project_id(analysis_id), file=reading.file if reading else None):
            out = await chat.answer(question[:2000], body.history, documents, reading=reading, scope=scope, index=index)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The question could not be answered: {exc}") from exc
    by_name = {f["name"]: n for n, f in reversed(list(enumerate(files)))}
    for c in out["citations"]:
        c["index"] = by_name.get(c["file"])  # which file of the project, to open it from the answer
        c["here"] = c["file"] == boq.file
    names = [d.file for d in documents]  # the open file first in what is shown
    if body.reading:
        names = [boq.file] + [f for f in names if f != boq.file]
    # `whole`: what the same question would cost with every document read, for the "read everything" offer
    return {**out, "documents": names, "whole": whole}


_STAGE = {"intake": "Intake (found for the estimator, not taken on yet)", "check": "Check", "pricing": "Pricing"}
_OUTCOME = {"won": "won", "lost": "lost", "passed": "no bid was made", "cancelled": "cancelled by the client"}
_DATE = {"sent_out": "tender sent out", "questions_due": "bidder questions until", "due": "submission deadline",
         "opening": "bid opening", "binding_until": "bid binding until", "exec_start": "work starts",
         "exec_end": "work done by"}


def _count(n: int, one: str) -> str:
    return f"{n} {one}" if n == 1 else f"{n} {one}s"


def _overview() -> list[dict]:
    """Every project as the lines of fact the projects page shows about it, for questions about all
    tenders at once (`chat.overview_answer`): stage, dates with their source, findings, net total, files."""
    out = []
    for p in catalog.all_projects():
        try:
            summary = catalog_summary(p["id"])
        except Exception:  # a project that cannot be read is still listed, with what is known without it
            summary = None
        roles = {f["role"] for f in p["files"]}
        plan = p.get("plan") or {}
        stage = (f"Result: {_OUTCOME[plan['outcome']]}" if plan.get("outcome") in _OUTCOME
                 else "Result: won (an award is among the files)" if "award" in roles
                 else "Submitted (a bid is among the files)" if roles & {"bid", "submitted bid", "offer"}
                 else _STAGE.get(plan.get("stage") or "check", "Check"))
        lines = [f"stage: {stage}"]
        if p.get("trade"):
            lines.append(f"trade: {p['trade']}")
        lines.append("kind: " + ("one building, " + _count(len(p["files"]), "trade LV") if p["kind"] == "trades"
                                 else "one LV in " + _count(len(p["files"]), "file")))
        stated = (summary or {}).get("dates") or []
        for kind, label in _DATE.items():
            if plan.get(kind):
                lines.append(f"{label}: {plan[kind]} (the date the project is planned by)")
            for d in stated:
                if d["kind"] == kind and d["date"] != plan.get(kind):
                    where = "; ".join(f"{s['file']}, {s['where']}" for s in d["sources"])
                    lines.append(f"{label}: {d['date']}{' ' + d['time'] if d['time'] else ''}"
                                 f"{' (approximate)' if d['approx'] else ''}, stated in the files as "
                                 f"„{d['label']} {d['text']}“ ({where})")
        if plan.get("sent"):
            lines.append(f"bid sent: {plan['sent']}")
        if not any(plan.get(k) for k in ("due", "opening")) and not any(d["kind"] in ("due", "opening") for d in stated):
            lines.append("submission deadline: not stated in the files and not set")
        if summary and not summary.get("checked", True):
            lines.append(f"not checked yet: {_count(summary['items'], 'item')} read, no check has run (it is in the intake)")
            lines += [f"file: {f['name']} — {f['role']}, {f['format']}" for f in p["files"]]
        elif summary:
            c = summary["counts"]
            lines.append(f"rule findings: {_count(c['high'], 'stop')}, {_count(c['warn'], 'caution')}, "
                         f"{_count(c['info'], 'note')} on {_count(summary['items'], 'item')} in "
                         f"{_count(summary['lvs'], 'LV')}")
            lines.append(f"net total: {summary['net']:,.2f} EUR, from the {summary['net_from']}" if summary["net"] is not None
                         else "net total: none, no priced bid or award in GAEB format among the files")
            for d in summary["docs"]:
                if d["counts"] is None:
                    lines.append(f"file: {d['name']} — {d['role']}, {d['format']}, could not be read")
                    continue
                k = d["counts"]
                lines.append(f"file: {d['name']} — {d['role']}, {d['format']}, {_count(d['items'], 'item')}, "
                             f"{_count(k['high'], 'stop')}, {_count(k['warn'], 'caution')}, {_count(k['info'], 'note')}, "
                             f"{_count(d['questions'], 'point')} to ask the client, {_count(d['priced'], 'item')} priced")
        else:
            lines += [f"file: {f['name']} — {f['role']}, {f['format']}" for f in p["files"]]
        out.append({"id": p["id"], "number": p.get("number") or "", "name": p["name"], "lines": lines})
    return out


@app.post("/api/catalog/chat")
async def ask_all_projects(body: Question):
    """A question about all projects at once, answered from the overview of the projects page only
    (stage, dates, files, rule findings, net totals); what stands in an LV is asked inside its project."""
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "Ask a question.")
    projects = _overview()
    try:
        out = await chat.overview_answer(question[:2000], body.history, projects, date.today().isoformat())
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The question could not be answered: {exc}") from exc
    return {**out, "scope": "overview", "documents": [p["name"] for p in projects], "files": len(projects),
            "passages": sum(len(p["lines"]) for p in projects),
            "whole": {"tokens": 0, "first_usd": None, "then_usd": None}}


class Passage(BaseModel):
    oz: str = ""  # "" = a passage from the preliminary remarks
    quote: str


@app.post("/api/analyses/{analysis_id}/locate")
def locate_passage(analysis_id: str, body: Passage):
    """Where a passage stands on the pages of this LV, e.g. one an answer of the chat rests on:
    {"page", "rects", "located"} as for a finding (the quote, else the item's line, else no place)."""
    path, positions = _pages(analysis_id)
    boq, _ = _analysis(analysis_id)
    passage = Finding(item_oz=body.oz.strip() or None, category="unclear_scope", check_id="PASSAGE",
                      severity="info", evidence=body.quote[:600], explanation="", action="ask_client")
    mark = locate(path, boq, [passage], positions)["marks"][0]
    return {k: mark[k] for k in ("oz", "page", "rects", "located")}


def _pages(analysis_id: str) -> tuple[Path, dict[str, tuple[int, float]] | None]:
    """The PDF to show for an analysis, and the item positions if the app drew it itself."""
    boq, _ = _analysis(analysis_id)  # 404 for an analysis this server does not know
    path = _SOURCES.get(analysis_id)
    if path is not None and path.is_file():  # the LV's own PDF, or the client's print-out of it
        return path, _PRINT_OUT[analysis_id][1] if analysis_id in _PRINT_OUT else None
    if boq.format == "pdf":
        raise HTTPException(404, "This LV was read from a PDF that was not kept in a project, "
                                 "so there are no pages to show.")
    if analysis_id not in _DRAWN or not _DRAWN[analysis_id][0].is_file():
        data, positions = render(boq)
        PAGES.mkdir(parents=True, exist_ok=True)
        if not _DRAWN:  # the first pages of this server process: those of earlier runs belong to no analysis
            for old in PAGES.glob("*.pdf"):
                old.unlink(missing_ok=True)
        path = PAGES / f"{analysis_id}.pdf"
        path.write_bytes(data)
        _DRAWN[analysis_id] = (path, positions)
    return _DRAWN[analysis_id]


@app.get("/api/analyses/{analysis_id}/source.pdf")
def source_pdf(analysis_id: str):
    """The pages of the LV for the PDF view: the PDF it was read from, or pages drawn from the LV."""
    return FileResponse(_pages(analysis_id)[0], media_type="application/pdf")


@app.get("/api/analyses/{analysis_id}/marks")
def marks(analysis_id: str):
    """Where each finding stands on the pages: one mark per finding, in the order of the findings
    list the analysis returns (rule findings and the AI findings run so far)."""
    path, positions = _pages(analysis_id)
    boq, findings = _analysis(analysis_id)
    findings = sort_findings(findings + _llm_findings(analysis_id))
    made_for = tuple(f"{f.check_id}|{f.item_oz}|{f.evidence}" for f in findings)
    if _MARKS.get(analysis_id, (None,))[0] != made_for:  # a quote that is not on the page costs many searches
        _MARKS[analysis_id] = (made_for, locate(path, boq, findings, positions))
    return _MARKS[analysis_id][1]


@app.post("/api/analyses/{analysis_id}/llm")
async def llm_review(analysis_id: str):
    """Run the LLM checks on an analysed LV. Takes from seconds (cached) to a few minutes."""
    boq, rule_findings = _analysis(analysis_id)
    _REVIEWS[analysis_id] = {"running": True}
    try:
        with spend.scope(project_id=_project_id(analysis_id), file=boq.file):
            findings, stats = await run_llm_checks(
                boq, rule_findings, progress=lambda state: _REVIEWS.update({analysis_id: {"running": True, **state}}))
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The LLM review failed: {exc}") from exc
    finally:
        _REVIEWS.pop(analysis_id, None)
    _keep_llm_findings(analysis_id, findings)  # the report and the marks of this analysis now include them
    return {"findings": [f.model_dump(mode="json") for f in _with_stakes(analysis_id, boq, findings)], "stats": stats}


@app.get("/api/analyses/{analysis_id}/llm/progress")
def llm_progress(analysis_id: str):
    """What a running AI review is doing right now, for the page that waits for it: sections in all,
    sections read, the sections being read, findings so far per check. `running` false: none is running."""
    return _REVIEWS.get(analysis_id, {"running": False})


def _analysis(analysis_id: str) -> tuple[BoQ, list[Finding]]:
    if analysis_id in _RECENT:
        return _RECENT[analysis_id]
    with db.engine().connect() as conn:
        row = conn.execute(select(db.analyses.c.boq, db.analyses.c.findings)
                           .where(db.analyses.c.id == analysis_id)).first()
    if row is None:
        raise HTTPException(404, "This analysis is no longer kept. Open the file again.")
    boq, findings = BoQ.model_validate(row.boq), [Finding.model_validate(f) for f in row.findings]
    _remember(analysis_id, boq, findings)
    return boq, findings


def _prices(boq: BoQ, project_id: str | None = None) -> dict | None:
    """What a price can be suggested from, per item; None for an LV that has prices already. The order
    (D-049): a quote for this tender is the price and is not a suggestion (boq.supply.item_prices); until it
    is in, and where none comes, the price book — what partners quoted for the same thing in other tenders
    (supply.book) — and only then what past bids paid for similar items (boq.prices). A subcontractor's
    earlier price is a whole unit price and takes the place of the past-bids figure, which stays beside it
    (`past`); a supplier's is the material part only and is given apart (`material`)."""
    if any(i.total is not None for i in boq.items):
        return None
    out = suggest_prices(boq, load_history(DATASET))
    known, qty = supply.book(boq, project_id), {i.oz: i.qty for i in boq.items}
    for s in out["suggestions"]:
        entry = known.get(s["item_oz"]) or {}
        s |= {"basis": "past bids" if s["unit_price"] is not None else None, "stale": False,
              "material": entry.get("material"), "past": None}
        whole = entry.get("whole")
        if whole:
            if s["unit_price"] is not None:
                s["past"] = {k: s[k] for k in ("unit_price", "low", "high", "confidence", "reason")}
            n = qty.get(s["item_oz"])
            s |= {k: whole[k] for k in ("unit_price", "low", "high", "confidence", "reason", "stale")}
            s |= {"basis": "partners", "matches": whole["matches"] + s["matches"],
                  "value": float(n) * whole["unit_price"] if n is not None else None}
    priced = [s for s in out["suggestions"] if s["unit_price"] is not None and qty.get(s["item_oz"]) is not None]
    total = lambda key: sum(float(qty[s["item_oz"]]) * s[key] for s in priced)  # noqa: E731
    out |= {"with_price": len(priced), "from_partners": sum(1 for s in priced if s["basis"] == "partners"),
            "estimate": {"mid": total("unit_price"), "low": total("low"), "high": total("high")} if priced else None}
    return out


def _report(analysis_id: str) -> dict:
    boq, rule_findings = _analysis(analysis_id)
    return build_report(boq, _with_stakes(analysis_id, boq, rule_findings + _llm_findings(analysis_id)), _prices(boq, _project_id(analysis_id)))


@app.get("/api/analyses/{analysis_id}/prices")
def prices(analysis_id: str):
    """Unit-price suggestions from past bids, with sources; `null` when the LV is priced."""
    return _prices(_analysis(analysis_id)[0], _project_id(analysis_id))


@app.post("/api/analyses/{analysis_id}/whatif")
def whatif(analysis_id: str, scenario: Scenario):
    """Total of the bid as it stands (the prices entered, or the file's own) under changed unit prices,
    changed quantities, the client's corrected quantities or dropped optional items."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    # no suggestions needed: a suggested price is not in the bid until the estimator takes it
    state = bid.sheet(boq, None, amendments.about(project_id, boq.file), bid.entered(project_id, boq.file))
    return what_if(boq, scenario, state)


@app.get("/api/analyses/{analysis_id}/report")
def report_json(analysis_id: str):
    return _report(analysis_id)


@app.get("/api/analyses/{analysis_id}/report.html", response_class=HTMLResponse)
def report_html(analysis_id: str):
    """Printable risk report: findings so far, including the AI review if it has run."""
    return render_html(_report(analysis_id))


@app.get("/api/analyses/{analysis_id}/handover.html", response_class=HTMLResponse)
def handover_html(analysis_id: str):
    """The hand-over sheet for the site: where a change order can arise and what to do there, what the
    client was asked and answered, what the answers changed, the prices that rest on an assumption."""
    boq, rule_findings = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    findings = _with_stakes(analysis_id, boq, rule_findings + _llm_findings(analysis_id))
    questions = mail.standing(_report(analysis_id)["questions"], mail.about(mail.BIDDER_QUESTIONS, project_id, boq.file))
    soft = []
    try:
        planned = supply.find_plan(project_id, boq.file) is not None
        got = risk.assess(_bid(analysis_id)["rows"], _supply_state(analysis_id)["prices"] if planned else {}, None)
        soft = [{"item_oz": t["oz"], "label": t["label"], "why": f"{t['why']} (may be off by {t['band']:g} %)"}
                for t in got["top"] if t["basis"] in ("history", "open_question", "quote_soft", "quote_other")]
    except Exception:  # the sheet is about the findings; the bid's price sources are an extra
        pass
    name = ((catalog.find(project_id) if project_id else None) or {}).get("name", "")
    return render_handover(boq, findings, questions, amendments.about(project_id, boq.file), soft, name)


@app.get("/api/analyses/{analysis_id}/bieterfragen.txt", response_class=PlainTextResponse)
def bidder_questions(analysis_id: str):
    return PlainTextResponse(render_questions(_report(analysis_id)), media_type="text/plain; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="bieterfragen.txt"'})


# ---------------------------------------------------------------- bidder questions by e-mail

def _questions_state(analysis_id: str) -> dict:
    """The bidder questions of an LV with where each stands, the messages about it, and what is needed to
    write the next one."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    project = catalog.find(project_id) if project_id else None
    mails = mail.about(mail.BIDDER_QUESTIONS, project_id, boq.file)
    account = mail.account()
    return {
        "lv": {"name": (project or {}).get("name") or boq.project or boq.name or boq.file, "file": boq.file,
               "number": (project or {}).get("number") or boq.project_no, "client": boq.client,
               # the client's address as the file gives it; an anonymised file has a token there, no address
               "email": boq.client_email},
        "questions_due": ((project or {}).get("plan") or {}).get("questions_due"),
        "questions": mail.standing(_report(analysis_id)["questions"], mails),
        "mails": mails,
        # the account the app can send from; None: the message is opened in the user's mail program
        "account": account["from"] if account else None,
        # the mailbox the app can look into for replies; None: replies are pasted in
        "inbox": (mail.inbox() or {}).get("user") or None,
        # what the answers change on our side: proposed by the app, decided by the estimator
        "amendments": amendments.about(project_id, boq.file),
    }


def _picked(analysis_id: str, keys: list[str]) -> list[dict]:
    """The questions with these keys, in LV order."""
    questions = [q for q in _questions_state(analysis_id)["questions"] if q["key"] in set(keys)]
    questions = [{k: v for k, v in q.items() if k not in ("status", "mail_id", "sent_at", "answer")} for q in questions]
    if not questions:
        raise HTTPException(422, "Pick at least one question.")
    return questions


@app.get("/api/analyses/{analysis_id}/questions")
def questions(analysis_id: str):
    return _questions_state(analysis_id)


class Draft(BaseModel):
    keys: list[str]  # the questions to ask, by key
    sender: str = ""  # the closing lines: name, company


@app.post("/api/analyses/{analysis_id}/questions/compose")
def compose_questions(analysis_id: str, body: Draft):
    """The German message with these questions, for the estimator to read and change before it goes out."""
    state = _questions_state(analysis_id)
    subject, text = mail.compose(state["lv"], _picked(analysis_id, body.keys), body.sender)
    return {"subject": subject, "body": text}


class Outgoing(BaseModel):
    keys: list[str]
    to: str
    subject: str
    body: str
    via: str = "draft"  # "draft": the user sends it from their own mail program; "smtp": the app sends it now


@app.post("/api/analyses/{analysis_id}/questions/mails")
def mail_questions(analysis_id: str, body: Outgoing):
    """Keep a message with bidder questions, and send it if asked to. A draft counts as sent only once the
    user says so (PATCH /api/mails/{id}): the app cannot see what the mail program did with it."""
    boq, _ = _analysis(analysis_id)
    to, subject, text = body.to.strip(), body.subject.strip(), body.body.strip()
    if "@" not in to or " " in to:
        raise HTTPException(422, "Enter the e-mail address the questions go to.")
    if not subject or not text:
        raise HTTPException(422, "The message needs a subject and a text.")
    if body.via not in ("draft", "smtp"):
        raise HTTPException(422, "via is draft or smtp.")
    asked = _picked(analysis_id, body.keys)
    message_id = None
    if body.via == "smtp":
        try:
            message_id = mail.send(to, subject, text + "\n")
        except mail.MailUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
    # the questions as they stand now, whole: a question that was asked stays on the list even when a later
    # analysis of the file no longer raises it (the AI review has not been run again, a rule has changed)
    items = [{**q, "no": no} for no, q in enumerate(asked, 1)]
    mail.keep(mail.BIDDER_QUESTIONS, _project_id(analysis_id), boq.file, to, subject, text, body.via, items,
              sent=body.via == "smtp", message_id=message_id)
    runs.nudge(_project_id(analysis_id))  # the run waiting for the questions looks again
    return _questions_state(analysis_id)


def _mail(mail_id: str) -> dict:
    found = mail.find(mail_id)
    if found is None:
        raise HTTPException(404, "This message is no longer kept.")
    return found


@app.get("/api/mails/{mail_id}/message.eml")
def mail_file(mail_id: str):
    """A kept message as a file to open in the mail program (Outlook): for messages too long for a link."""
    found = _mail(mail_id)
    return Response(mail.as_file(found["to"], found["subject"], found["body"] + "\n"), media_type="message/rfc822",
                    headers={"Content-Disposition":
                             f'attachment; filename="{mail.file_name(found["subject"], found["created"])}"'})


class MailChange(BaseModel):
    sent: bool


@app.patch("/api/mails/{mail_id}")
def change_mail(mail_id: str, body: MailChange):
    """A draft opened in the mail program was sent (or was not, after all)."""
    if _mail(mail_id)["via"] == "smtp":
        raise HTTPException(422, "This message was sent by the app.")
    mail.set_sent(mail_id, body.sent)
    runs.nudge(_mail(mail_id)["project_id"])
    return _mail(mail_id)


@app.delete("/api/mails/{mail_id}", status_code=204)
def discard_mail(mail_id: str):
    """Take a message out of the list, with the reply read into it and what that reply changed on our
    side. Nothing is recalled: a message that went out stays in the recipient's mailbox. The page asks
    twice before it removes one that was sent or answered."""
    found = _mail(mail_id)
    amendments.discard_for(mail_id)
    mail.discard(mail_id)
    runs.nudge(found["project_id"])


class Reply(BaseModel):
    text: str


@app.post("/api/mails/{mail_id}/reply")
async def read_mail_reply(mail_id: str, body: Reply):
    """The client's answer, pasted in: read against the questions of the message. A question counts as
    answered only with the passage of the reply that answers it."""
    found = _mail(mail_id)
    reply = body.text.strip()
    if len(reply) < 10:
        raise HTTPException(422, "Paste the text of the client's reply.")
    dropped = await _take_reply(found, reply, "pasted")
    return {**_mail(mail_id), "dropped": dropped}


async def _take_reply(found: dict, reply: str, via: str) -> int:
    """Read a reply against the questions of its message, keep it, and put up what it changes on our side.
    Returns how many passages the reading gave that are not in the reply."""
    try:
        with spend.scope(project_id=found["project_id"]):
            read = await mail.read_reply(found["items"], reply)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"Reading the reply failed: {exc}") from exc
    mail.keep_reply(found["id"], reply, read["answers"], via)
    if not found["sent_at"]:  # an answer came, so the questions went out
        mail.set_sent(found["id"], True)
    amendments.propose(_mail(found["id"]))
    runs.nudge(found["project_id"])  # all answered: the run goes on to the prices
    told = [a for a in read["answers"].values() if a["status"] in ("answered", "partly")]
    changed = sum(1 for a in told if a.get("change"))
    events.record(found["project_id"], "answer",
                  f"The client's reply was read{' from the inbox' if via == 'imap' else ''}: {len(told)} of {len(found['items'])} questions answered"
                  + (f", {changed} of them change{'s' if changed == 1 else ''} the LV (a quantity, a unit or the wording)" if changed else "")
                  + (". What it changes on your side waits for your decision." if told else "."), "you" if told else "client")
    return read["dropped"]


@app.post("/api/analyses/{analysis_id}/questions/replies")
async def check_replies(analysis_id: str):
    """Look into the inbox for replies to the messages of this LV that have none yet, and read each one
    found. `found` says how many came in."""
    state = _questions_state(analysis_id)
    try:
        replies = mail.find_replies(state["mails"])
    except mail.MailUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    for found, text in replies:
        await _take_reply(found, text[:mail.MAX_REPLY_CHARS], "imap")
    return {**_questions_state(analysis_id), "found": len(replies)}


class Decision(BaseModel):
    status: str  # "accepted", "rejected", or "proposed" to take a decision back
    value: dict | None = None  # the amendment as the estimator changed it


@app.patch("/api/amendments/{amendment_id}")
def decide_amendment(amendment_id: str, body: Decision):
    """Accept, change or reject what an answer of the client changes on our side."""
    try:
        return amendments.decide(amendment_id, body.status, body.value)
    except LookupError:
        raise HTTPException(404, "This amendment is no longer kept.") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# ---------------------------------------------------------------- the bid

def _bid(analysis_id: str) -> dict:
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    state = bid.sheet(boq, _prices(boq, project_id), amendments.about(project_id, boq.file), bid.entered(project_id, boq.file))
    return {**state, "file": boq.file, "format": boq.format,
            # the bid can go back as GAEB XML where the LV came as GAEB XML and its file is kept
            "x84": boq.format == "gaeb_xml" and _source_bytes(analysis_id) is not None}


def _source_bytes(analysis_id: str) -> bytes | None:
    """The file an analysis was read from, where it is kept: a document of its project."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    if project_id is None:
        return None
    doc = next((d for d in _catalog(project_id)["files"] if d["name"] == boq.file), None)
    return catalog.file_bytes(doc["id"]) if doc else None


@app.get("/api/analyses/{analysis_id}/bid")
def bid_sheet(analysis_id: str):
    """The bid in progress: per item the suggested price, the price entered, allowance, total; and the sums."""
    return _bid(analysis_id)


@app.get("/api/analyses/{analysis_id}/bid/risk")
def bid_risk(analysis_id: str):
    """How sure the prices of the bid are: the total as a range, the risk allowance that covers it in four
    cases out of five, and the items that cause most of it (boq.risk)."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    planned = supply.find_plan(project_id, boq.file) is not None
    return risk.assess(_bid(analysis_id)["rows"], _supply_state(analysis_id)["prices"] if planned else {},
                       ((catalog.find(project_id) if project_id else None) or {}).get("plan", {}).get("binding_until"))


class BidPrices(BaseModel):
    prices: dict[str, str | None] = {}  # item number -> unit price as typed; empty or null clears it
    take_suggestions: bool = False  # put the suggested price into every item that has none


@app.put("/api/analyses/{analysis_id}/bid")
def set_bid_prices(analysis_id: str, body: BidPrices):
    boq, _ = _analysis(analysis_id)
    known = {i.oz for i in boq.items}
    changes: dict[str, tuple] = {}
    for oz, text in body.prices.items():
        if oz not in known:
            raise HTTPException(422, f"The LV has no item {oz}.")
        try:
            changes[oz] = (bid.price_of(text), "own")
        except ValueError as exc:
            raise HTTPException(422, f"Item {oz}: {exc}") from exc
    if body.take_suggestions:
        for row in _bid(analysis_id)["rows"]:
            if row["unit_price"] is None and row["suggestion"] and row["item_oz"] not in changes:
                changes[row["item_oz"]] = (bid.price_of(f"{row['suggestion']['unit_price']:.2f}"), "suggestion")
    bid.keep(_project_id(analysis_id), boq.file, changes)
    return _bid(analysis_id)


@app.get("/api/analyses/{analysis_id}/bid.csv")
def bid_csv(analysis_id: str):
    boq, _ = _analysis(analysis_id)
    name = mail.file_name(f"Angebot {Path(boq.file).stem}", db.now().isoformat())[:-4] + ".csv"
    return Response(bid.as_csv(boq, _bid(analysis_id)), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/analyses/{analysis_id}/bid.x84")
def bid_x84(analysis_id: str):
    """The bid as GAEB XML phase 84: the client's file with the unit prices in it."""
    boq, _ = _analysis(analysis_id)
    source = _source_bytes(analysis_id)
    if source is None or boq.format != "gaeb_xml":
        raise HTTPException(422, "The bid can be written as X84 only for a GAEB XML file kept in a project.")
    try:
        data = bid.as_x84(source, _bid(analysis_id))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    name = mail.file_name(f"Angebot {Path(boq.file).stem}", db.now().isoformat())[:-4] + ".x84"
    return Response(data, media_type="application/xml",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- price inquiries (boq.supply)

class Company(BaseModel):
    name: str | None = None
    contact: str | None = None
    email: str | None = None
    phone: str | None = None
    place: str | None = None
    own_trades: str | None = None
    nu_surcharge: float | None = None


@app.get("/api/company")
def get_company():
    """The firm's own particulars, which every inquiry carries: a supplier asks who is asking first."""
    return supply.company()


@app.put("/api/company")
def put_company(body: Company):
    if body.nu_surcharge is not None and not 0 <= body.nu_surcharge <= 50:
        raise HTTPException(422, "The surcharge on subcontractors is a percentage between 0 and 50.")
    return supply.set_company(body.model_dump(exclude_unset=True))


class SupplierEntry(BaseModel):
    name: str | None = None
    kind: str | None = None
    email: str | None = None
    contact: str | None = None
    phone: str | None = None
    place: str | None = None
    groups: list[str] | None = None
    products: list[dict] | None = None
    note: str | None = None
    source: str | None = None
    more: dict | None = None  # website, customer number, contacts, flags, documents (supply.MORE)


def _entry(body: SupplierEntry, new: bool) -> dict:
    values = body.model_dump(exclude_unset=True)
    if new and not (values.get("name") or "").strip():
        raise HTTPException(422, "A supplier needs a name.")
    if "name" in values and not (values["name"] or "").strip():
        raise HTTPException(422, "A supplier needs a name.")
    if values.get("kind") is not None and values["kind"] not in supply.KINDS:
        raise HTTPException(422, f"kind is one of: {', '.join(supply.KINDS)}.")
    if values.get("email") and ("@" not in values["email"] or " " in values["email"].strip()):
        raise HTTPException(422, "That is no e-mail address.")
    if values.get("source") is not None and values["source"] not in ("user", "web"):
        raise HTTPException(422, "source is user or web.")
    return {k: v.strip() if isinstance(v, str) else v for k, v in values.items()}


@app.get("/api/suppliers")
def list_suppliers():
    """The directory: who sells what (suppliers of material) and who does which trade (subcontractors)."""
    return supply.suppliers()


@app.post("/api/suppliers")
def add_supplier(body: SupplierEntry):
    return supply.save_supplier(_entry(body, new=True))


@app.patch("/api/suppliers/{supplier_id}")
def change_supplier(supplier_id: str, body: SupplierEntry):
    if supply.supplier(supplier_id) is None:
        raise HTTPException(404, "This supplier is no longer in the directory.")
    return supply.save_supplier(_entry(body, new=False), supplier_id)


@app.delete("/api/suppliers/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: str):
    """Take an entry out of the directory. Its quotes stay: they are prices with a date."""
    supply.remove_supplier(supplier_id)


def _asked(boq: BoQ, ozs: list[str]) -> list[dict]:
    """Items as an inquiry carries them."""
    by_oz = {i.oz: i for i in boq.items}
    return [{"oz": oz, "label": by_oz[oz].label, "qty": float(by_oz[oz].qty) if by_oz[oz].qty is not None else None,
             "unit": by_oz[oz].unit_raw or by_oz[oz].unit} for oz in ozs if oz in by_oz]


def _supply_state(analysis_id: str) -> dict:
    """The price inquiries of an LV as they stand: the packages with who is asked and what came back, the
    comparison per package, the items that wait for the client, and where every item's price comes from."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    project = catalog.find(project_id) if project_id else None
    dates = (project or {}).get("plan") or {}
    questions = mail.standing(_report(analysis_id)["questions"], mail.about(mail.BIDDER_QUESTIONS, project_id, boq.file))
    wait, assume = supply.held(questions)
    hand = supply.book(boq, project_id)
    kept = supply.find_plan(project_id, boq.file)
    directory = supply.suppliers()
    names = {s["id"]: s["name"] for s in directory}
    account = mail.account()
    base = {"lv": {"name": (project or {}).get("name") or boq.project or boq.name or boq.file, "file": boq.file,
                   "number": (project or {}).get("number") or boq.project_no},
            "due": dates.get("due"), "binding_until": dates.get("binding_until"), "reply_by": supply.reply_by(dates),
            "account": account["from"] if account else None, "inbox": (mail.inbox() or {}).get("user") or None,
            "company": supply.company(), "suppliers": directory,
            "voice": voice.available(),  # the voice agent can phone a supplier (an ElevenLabs key is set)
            "priced_file": any(i.total is not None for i in boq.items)}
    if kept is None:
        return {**base, "plan": None, "packages": [], "waits": [{"oz": oz, "question": q} for oz, q in wait.items()],
                "released": [], "prices": {}, "counts": {}}
    plan_, chosen = kept["plan"], kept["chosen"]
    items = {i.oz: i for i in boq.items}
    mails = mail.about(supply.PRICE_INQUIRY, project_id, boq.file)
    quotes = supply.quotes_for(project_id, boq.file)
    comparisons, packages = {}, []
    for p in plan_["packages"]:
        mine = [q for q in quotes if q["package"] == p["id"]]
        comparisons[p["id"]] = supply.compare(p, items, mine, names, dates)
        ask = []
        for sid in p["ask"]:
            sent = [m for m in mails if (m["meta"] or {}).get("package") == p["id"] and (m["meta"] or {}).get("supplier_id") == sid]
            latest = sent[-1] if sent else None
            quote = next((q for q in mine if q["supplier_id"] == sid), None)
            # the conversation: every message of ours with the reply read into it, oldest first
            thread = [{"id": m["id"], "kind": (m["meta"] or {}).get("kind") or "inquiry", "subject": m["subject"],
                       "body": m["body"], "created": m["created"], "sent_at": m["sent_at"], "via": m["via"],
                       "reply": m["reply"] and {"text": m["reply"], "at": m["reply_at"], "via": m["reply_via"],
                                                "kind": (m["answers"] or {}).get("kind") or "quote",
                                                "summary": (m["answers"] or {}).get("summary") or "",
                                                "asks": (m["answers"] or {}).get("asks") or [],
                                                "unmatched": (m["answers"] or {}).get("unmatched") or []}}
                      for m in sent]
            said = latest and thread[-1]["reply"]
            # whose move it is: a question back is the estimator's, whatever else has come in
            status = ("new" if not latest else "question" if said and (said["asks"] or said["kind"] == "question")
                      else "answered" if quote else "declined" if said and said["kind"] == "decline"
                      else "later" if said and said["kind"] == "later" else "sent" if latest["sent_at"] else "drafted")
            ask.append({"supplier_id": sid, "supplier": names.get(sid, "(removed from the directory)"),
                        "email": next((s["email"] for s in directory if s["id"] == sid), ""),
                        "mail": latest and {"id": latest["id"], "to": latest["to"], "sent_at": latest["sent_at"],
                                            "created": latest["created"], "via": latest["via"], "subject": latest["subject"],
                                            "reminders": sum(1 for t in thread if t["kind"] == "reminder")},
                        "quote": quote and quote["id"], "thread": thread, "status": status})
        packages.append({**p, "items": [{**row, "provisional": assume.get(row["oz"])} for row in _asked(boq, p["items"])],
                         "ask": ask, "comparison": comparisons[p["id"]], "chosen": chosen.get(p["id"])})
    # past bids alone: the price book goes before them and is `hand`
    suggestions = None if base["priced_file"] else suggest_prices(boq, load_history(DATASET))
    assumed = {s["item_oz"]: s for s in (suggestions or {}).get("suggestions", [])}
    prices = supply.item_prices(plan_, chosen, comparisons, items, wait, hand, assumed)
    # the client has answered since the plan was made: these items can be asked for now
    released = [oz for oz in plan_.get("held") or {} if oz not in wait and oz in items]
    for oz in released:
        if prices[oz]["status"] in ("own", "assumed"):
            prices[oz] = {**prices[oz], "released": True}
    counts: dict[str, int] = {}
    for p in prices.values():
        counts[p["status"]] = counts.get(p["status"], 0) + 1
    return {**base, "plan": {"id": kept["id"], "created": kept["created"]}, "packages": packages,
            "waits": [{"oz": oz, "label": items[oz].label, "question": q} for oz, q in wait.items() if oz in items],
            "released": released, "prices": prices, "counts": counts}


@app.get("/api/analyses/{analysis_id}/supply")
def supply_state(analysis_id: str):
    return _supply_state(analysis_id)


@app.post("/api/analyses/{analysis_id}/supply/plan")
async def plan_supply(analysis_id: str):
    """Work out the packages of this LV (again): which items are asked for, of whom. Items that wait for
    the client and items a quote at hand prices are left out."""
    boq, _ = _analysis(analysis_id)
    project_id = _project_id(analysis_id)
    questions = mail.standing(_report(analysis_id)["questions"], mail.about(mail.BIDDER_QUESTIONS, project_id, boq.file))
    wait, _ = supply.held(questions)
    hand = supply.book(boq, project_id)  # an earlier price stands in; the item is asked for all the same
    try:
        with spend.scope(project_id=project_id, file=boq.file):
            packages = await supply.plan(boq, set(wait))
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Planning the price inquiries failed: {exc}") from exc
    supply.keep_plan(project_id, boq.file, {"hash": supply.lv_hash(boq), "packages": packages, "held": wait,
                                            "at_hand": sorted(hand)}, supply.find_plan(project_id, boq.file))
    return _supply_state(analysis_id)


def _package(analysis_id: str, package_id: str) -> tuple[dict, dict]:
    boq, _ = _analysis(analysis_id)
    kept = supply.find_plan(_project_id(analysis_id), boq.file)
    package = next((p for p in (kept or {"plan": {"packages": []}})["plan"]["packages"] if p["id"] == package_id), None)
    if package is None:
        raise HTTPException(404, "This package is not in the plan any more.")
    return kept, package


class Asked(BaseModel):
    ask: list[str]  # directory ids, in the order they are asked


@app.put("/api/analyses/{analysis_id}/supply/packages/{package_id}")
def set_package_suppliers(analysis_id: str, package_id: str, body: Asked):
    """Who is asked about a package: the estimator's choice over the agent's."""
    kept, package = _package(analysis_id, package_id)
    known = {s["id"] for s in supply.suppliers()}
    ask = [s for s in dict.fromkeys(body.ask) if s in known]
    if len(ask) > supply.MAX_ASKED:
        raise HTTPException(422, f"At most {supply.MAX_ASKED} per package: a supplier who is one of many asked stops answering.")
    package["ask"] = ask
    supply.change_plan(kept["id"], plan_=kept["plan"])
    return _supply_state(analysis_id)


class InquiryDraft(BaseModel):
    package: str
    supplier_id: str
    remind: bool = False  # a reminder about the inquiry already sent to this supplier
    answer: bool = False  # the answer to what the supplier asked back, written from the LV (asks Claude)
    styled: bool = True  # write the inquiry the way this partner is written to, where that is on record


def _dates(analysis_id: str) -> dict:
    project_id = _project_id(analysis_id)
    return ((catalog.find(project_id) if project_id else None) or {}).get("plan") or {}


@app.post("/api/analyses/{analysis_id}/supply/compose")
async def compose_inquiry(analysis_id: str, body: InquiryDraft):
    """The German message about a package to one supplier, for the estimator to read and change: the
    inquiry, a reminder, or the answer to what the supplier asked back. The answer is written from the
    items of the LV; `points` says per question what it rests on, and which the LV does not settle."""
    state = _supply_state(analysis_id)
    boq, _ = _analysis(analysis_id)
    _, package = _package(analysis_id, body.package)
    to = supply.supplier(body.supplier_id)
    if to is None:
        raise HTTPException(404, "This supplier is no longer in the directory.")
    mine = next((a for p in state["packages"] if p["id"] == body.package for a in p["ask"]
                 if a["supplier_id"] == body.supplier_id), None)
    if body.answer:
        said = mine and mine["thread"] and mine["thread"][-1]["reply"]
        if not said:
            raise HTTPException(422, "There is no reply to answer.")
        talk = []
        for t in mine["thread"]:
            talk.append({"who": "us", "at": t["sent_at"] or t["created"], "text": t["body"]})
            if t["reply"]:
                talk.append({"who": "supplier", "at": t["reply"]["at"] or t["created"], "text": t["reply"]["text"]})
        by_oz = {i.oz: i for i in boq.items}
        try:
            with spend.scope(project_id=_project_id(analysis_id), file=boq.file):
                drafted = await supply.answer([by_oz[oz] for oz in package["items"] if oz in by_oz], talk, said["asks"],
                                              _dates(analysis_id),
                                              # the tone this supplier is written in, where it is on record
                                              **({"style": tone} if (tone := partners.style_note(to["more"].get("style"))) else {}))
        except LLMUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, f"Writing the answer failed: {exc}") from exc
        first = mine["thread"][0]["subject"]
        return {"subject": first if first.lower().startswith(("aw:", "re:")) else f"AW: {first}",
                "body": drafted["body"], "to": mine["mail"]["to"] or to["email"], "points": drafted["points"]}
    if body.remind:
        asked = mine and mine["mail"]
        if asked is None:
            raise HTTPException(422, "There is no inquiry to remind of.")
        subject, text = supply.remind(_mail(asked["id"]), _dates(analysis_id))
    else:
        by_oz = {i.oz: i for i in boq.items}
        subject, text = supply.compose(state["lv"], package, [by_oz[oz] for oz in package["items"] if oz in by_oz],
                                       to, _dates(analysis_id))
        # A partner whose way of writing is on record gets the inquiry written that way: the opening and
        # the closing only, the items stay (boq.partners.restyle). If that fails, the template goes out.
        style = to["more"].get("style")
        if style and body.styled:
            try:
                with spend.scope(project_id=_project_id(analysis_id), file=boq.file):
                    fitted = await partners.restyle(text, style, to)
            except Exception:
                fitted = None
            if fitted:
                return {"subject": subject, "body": fitted["body"], "to": to["email"], "points": [],
                        "styled": {"changed": fitted["changed"], "summary": style.get("summary", ""), "plain": text}}
    return {"subject": subject, "body": text, "to": to["email"], "points": [], "styled": None}


class Inquiry(BaseModel):
    package: str
    supplier_id: str
    to: str
    subject: str
    body: str
    via: str = "draft"
    kind: str = "inquiry"  # "inquiry", "reminder", or "answer" to what the supplier asked back


@app.post("/api/analyses/{analysis_id}/supply/mails")
def mail_inquiry(analysis_id: str, body: Inquiry):
    """Keep an inquiry, and send it if asked to, with the items as an Excel sheet to fill in. Nothing goes
    out that the estimator has not read: this is called from the message they see."""
    boq, _ = _analysis(analysis_id)
    _, package = _package(analysis_id, body.package)
    if supply.supplier(body.supplier_id) is None:
        raise HTTPException(404, "This supplier is no longer in the directory.")
    to, subject, text = body.to.strip(), body.subject.strip(), body.body.strip()
    if "@" not in to or " " in to:
        raise HTTPException(422, "Enter the e-mail address the inquiry goes to.")
    if not subject or not text:
        raise HTTPException(422, "The message needs a subject and a text.")
    if body.via not in ("draft", "smtp"):
        raise HTTPException(422, "via is draft or smtp.")
    if body.kind not in ("inquiry", "reminder", "answer"):
        raise HTTPException(422, "kind is inquiry, reminder or answer.")
    asked, message_id = _asked(boq, package["items"]), None
    # a follow-up goes into the same conversation: it names the message before it
    before = [m for m in mail.about(supply.PRICE_INQUIRY, _project_id(analysis_id), boq.file)
              if (m["meta"] or {}).get("package") == body.package and (m["meta"] or {}).get("supplier_id") == body.supplier_id]
    if body.via == "smtp":
        try:
            message_id = mail.send(to, subject, text + "\n",
                                   [(f"Preisanfrage_{package['id']}.xlsx", supply.sheet(asked))] if body.kind == "inquiry" else None,
                                   references=next((m["message_id"] for m in reversed(before) if m["message_id"]), None))
        except mail.MailUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
    mail.keep(supply.PRICE_INQUIRY, _project_id(analysis_id), boq.file, to, subject, text, body.via, asked,
              sent=body.via == "smtp", message_id=message_id,
              meta={"package": body.package, "supplier_id": body.supplier_id, "kind": body.kind})
    return _supply_state(analysis_id)


@app.get("/api/mails/{mail_id}/items.xlsx")
def inquiry_sheet(mail_id: str):
    """The items of an inquiry as the Excel sheet the supplier fills in (attached by the app when it sends;
    downloaded here to attach by hand)."""
    found = _mail(mail_id)
    return Response(supply.sheet(found["items"]),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="Preisanfrage_{mail_id[:6]}.xlsx"'})


async def _take_quote(found: dict, text: str, sheet: bytes | None, via: str = "pasted") -> dict:
    """Read a supplier's reply (the filled-in sheet, else its text) against the items of the inquiry and
    keep it as a quote."""
    try:
        if sheet is not None:
            read = supply.read_sheet(sheet, found["items"])
        else:
            with spend.scope(project_id=found["project_id"], file=found["file"]):
                read = await supply.read_quote(found["items"], text)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Reading the quote failed: {exc}") from exc
    # A reply without a price is still a reply: a question back, a refusal, a promise. Only one that says
    # nothing at all (a sheet handed back empty) is refused.
    if not read["lines"] and read["kind"] in ("quote", "other") and not read["asks"] and not read["summary"]:
        raise HTTPException(422, "No price for an asked item was found in this reply"
                            + (f" ({len(read['unmatched'])} lines could not be matched to an item)." if read["unmatched"] else "."))
    mail.keep_reply(found["id"], text or "(Excel sheet)",
                    {"kind": read["kind"], "summary": read["summary"], "asks": read["asks"],
                     "unmatched": read["unmatched"], "dropped": read["dropped"]}, via)
    if not found["sent_at"]:
        mail.set_sent(found["id"], True)
    if read["lines"]:
        supply.keep_quote(found, found["file"], read, text)
    who = (supply.supplier((found["meta"] or {}).get("supplier_id") or "") or {}).get("name") or found["to"]
    where = " from the inbox" if via == "imap" else ""
    if read["lines"]:
        other = sum(1 for line in read["lines"] if line["alternative"])
        events.record(found["project_id"], "quote",
                      f"{who} quoted{where}: {len(read['lines'])} of {len(found['items'])} items priced"
                      + (f", {other} with another product than tendered" if other else "")
                      + (f", and asks {len(read['asks'])} question{'' if len(read['asks']) == 1 else 's'} back" if read["asks"] else "")
                      + ". The comparison is updated.", "you")
    elif read["kind"] == "decline":
        events.record(found["project_id"], "decline", f"{who} declines to quote{where}. {read['summary']}", "you")
    else:
        events.record(found["project_id"], "asks", f"{who} wrote back without prices{where}. {read['summary']}",
                      "you" if read["asks"] else "supplier")
    return read


@app.post("/api/mails/{mail_id}/quote")
async def read_quote(mail_id: str, text: str = Form(""), file: UploadFile | None = None):
    """A supplier's reply to an inquiry: the filled-in Excel sheet, a quote as PDF, or the text of the
    e-mail pasted in. Read into one line per item; a line that fits no asked item is kept apart."""
    found = _mail(mail_id)
    if found["kind"] != supply.PRICE_INQUIRY:
        raise HTTPException(422, "This message is no price inquiry.")
    sheet, text = None, text.strip()
    if file is not None:
        data = await file.read()
        name = (file.filename or "").lower()
        if name.endswith((".xlsx", ".xlsm")):
            sheet = data
        elif name.endswith(".pdf"):
            import pymupdf

            with pymupdf.open(stream=data, filetype="pdf") as doc:
                text = "\n".join(page.get_text() for page in doc).strip()
        else:
            text = data.decode("utf-8", "replace").strip()
    if sheet is None and len(text) < 10:
        raise HTTPException(422, "Paste the supplier's reply, or upload the filled-in sheet or the quote as PDF.")
    read = await _take_quote(found, text, sheet)
    return {"unmatched": read["unmatched"], "dropped": read["dropped"], "lines": len(read["lines"]),
            "kind": read["kind"], "summary": read["summary"], "asks": read["asks"]}


@app.post("/api/analyses/{analysis_id}/supply/replies")
async def check_quote_replies(analysis_id: str):
    """Look into the inbox for replies to the inquiries of this LV that have none yet, and read each one."""
    boq, _ = _analysis(analysis_id)
    try:
        replies = mail.find_replies(mail.about(supply.PRICE_INQUIRY, _project_id(analysis_id), boq.file))
    except mail.MailUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    read = 0
    for found, text in replies:
        try:
            read += bool((await _take_quote(found, text[:supply.MAX_REPLY_CHARS], None, "imap"))["lines"])
        except HTTPException as exc:
            if exc.status_code != 422:  # a reply that says nothing is left where it is
                raise
    return {**_supply_state(analysis_id), "found": len(replies), "read": read}


class Choice(BaseModel):
    package: str
    mode: str | None  # "single", "split", "assume" (take no quote: past bids), or null to take the choice back
    quote: str | None = None


@app.post("/api/analyses/{analysis_id}/supply/choose")
def choose_quote(analysis_id: str, body: Choice):
    """What the estimator takes for a package: one supplier's quote, the cheapest line per item, or none."""
    kept, _ = _package(analysis_id, body.package)
    chosen = dict(kept["chosen"])
    if body.mode is None:
        chosen.pop(body.package, None)
    elif body.mode not in ("single", "split", "assume") or (body.mode == "single" and not body.quote):
        raise HTTPException(422, "mode is single (with a quote), split or assume.")
    else:
        chosen[body.package] = {"mode": body.mode, "quote": body.quote if body.mode == "single" else None}
    supply.change_plan(kept["id"], chosen=chosen)
    return _supply_state(analysis_id)


@app.post("/api/analyses/{analysis_id}/supply/to-bid")
def quotes_to_bid(analysis_id: str):
    """Put the prices of the quotes the estimator took into the bid, where a quote is a whole unit price:
    subcontractors' prices with the firm's surcharge. A supplier's price is the material part only and is
    not a unit price; those stay beside the bid for the estimator to build on."""
    boq, _ = _analysis(analysis_id)
    state = _supply_state(analysis_id)
    kinds = {row["oz"]: p["kind"] for p in state["packages"] for row in p["items"]}
    have = bid.entered(_project_id(analysis_id), boq.file)
    changes = {oz: (bid.price_of(f"{p['unit_price']:.2f}"), "quote") for oz, p in state["prices"].items()
               if p["status"] == "quoted" and p.get("taken") and kinds.get(oz) == "subcontract" and oz not in have}
    bid.keep(_project_id(analysis_id), boq.file, changes)
    return {**_supply_state(analysis_id), "taken": len(changes)}



# ---------------------------------------------------------------- the supplier phoned (boq.voice)

class CallStart(BaseModel):
    package: str
    supplier_id: str


@app.post("/api/analyses/{analysis_id}/supply/call")
def start_call(analysis_id: str, body: CallStart):
    """Start a call to a supplier about a package, from the browser: a token for the voice agent, what it
    is told (who asks, the job, the items), and the record the prices of the call are kept under."""
    boq, _ = _analysis(analysis_id)
    state = _supply_state(analysis_id)
    _, package = _package(analysis_id, body.package)
    to = supply.supplier(body.supplier_id)
    if to is None:
        raise HTTPException(404, "This supplier is no longer in the directory.")
    if to["more"].get("no_call"):
        raise HTTPException(422, f"{to['name']} is marked \"do not phone\" in the directory.")
    try:
        session = voice.token()
    except voice.VoiceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    asked, firm = _asked(boq, package["items"]), state["company"]
    listed = "\n".join(f"{i['oz']} | {i['qty'] if i['qty'] is not None else '-'} {i['unit']} | {i['label']}" for i in asked)
    kept = mail.keep(supply.PRICE_INQUIRY, _project_id(analysis_id), boq.file, to["phone"] or to["email"] or to["name"],
                     f"Telefonat – {package['name']} – {state['lv']['name']}", f"Call by the voice agent about:\n{listed}", "phone",
                     asked, sent=True, meta={"package": body.package, "supplier_id": body.supplier_id, "kind": "call",
                                             "conversation_id": session["conversation_id"]})
    day = state["reply_by"]
    return {"mail_id": kept["id"], "token": session["token"], "conversation_id": session["conversation_id"],
            "variables": {"company_name": firm["name"] or "unser Unternehmen", "supplier_name": to["name"],
                          "project_name": state["lv"]["name"], "contact_name": firm["contact"] or "unsere Kalkulation",
                          "reply_by": f"{date.fromisoformat(day):%d.%m.%Y}" if day else "Ende der Woche", "items_text": listed},
            "items": asked}


class CallPrice(BaseModel):
    pos: str
    unit_price: float
    unit: str = ""
    product: str = ""
    alternative: bool = False
    note: str = ""


@app.post("/api/mails/{mail_id}/call-price")
def call_price(mail_id: str, body: CallPrice):
    """A price the supplier gave on the phone, handed over by the voice agent while the call is going. It
    joins the prices of this call; a price by phone is indicative, so the quote is marked not binding."""
    found = _mail(mail_id)
    if (found["meta"] or {}).get("kind") != "call":
        raise HTTPException(422, "This record is no call.")
    before = next((q for q in supply.quotes_for(found["project_id"], found["file"]) if q["mail_id"] == mail_id), None)
    lines = [{**line, "pos": line["oz"]} for line in (before or {"lines": []})["lines"] if line["oz"] != body.pos.strip()]
    lines.append({"pos": body.pos, "unit_price": body.unit_price, "unit": body.unit, "product": body.product,
                  "alternative": body.alternative, "note": body.note, "quote": None})
    read = supply.match_lines(found["items"], None, lines, {"basis": "unknown", "binding": "non_binding",
                                                           "note": "By phone, indicative: ask for the written quote."})
    if not any(line["oz"] == body.pos.strip().lstrip("0") or line["oz"] == body.pos.strip() for line in read["lines"]):
        return {"ok": False, "say": f"Position {body.pos} is not in the inquiry. Use the item number exactly as listed."}
    supply.keep_quote(found, found["file"], read, "")
    return {"ok": True, "say": f"Noted: item {body.pos}, {body.unit_price:.2f} EUR per {body.unit or 'unit'}.", "priced": len(read["lines"])}


class CallEnd(BaseModel):
    transcript: str = ""


@app.post("/api/mails/{mail_id}/call-end")
def call_end(mail_id: str, body: CallEnd):
    """The call is over: what was said is kept with it, as the reply of this turn of the conversation."""
    found = _mail(mail_id)
    quoted = any(q["mail_id"] == mail_id for q in supply.quotes_for(found["project_id"], found["file"]))
    mail.keep_reply(mail_id, body.transcript.strip()[:60000] or "(nothing was said)",
                    {"kind": "quote" if quoted else "other", "asks": [], "unmatched": [],
                     "summary": "Prices given by phone: indicative, the written quote is still to come." if quoted
                     else "The call ended without a price."}, "phone")
    return {"ok": True}



# ---------------------------------------------------------------- partners: suppliers and subcontractors (boq.partners)

@app.get("/api/partners")
def partners_page():
    """Every supplier and subcontractor with how it behaves, what waits across all tenders, the price book,
    who covers which group, and the packages nobody can be asked for."""
    return partners.overview()


@app.get("/api/partners/searches")
def partner_searches():
    """Every look into the web for partners, newest first, with what it found."""
    return partners.searches_kept()


class Lookup(BaseModel):
    what: str  # the material group or trade, in German
    kind: str = "supplier"
    region: str = ""
    project_id: str | None = None


@app.post("/api/partners/discover")
async def discover_partners(body: Lookup):
    """Look into the web for firms to ask about a material group or trade (Claude with web search: half a
    minute, a few cents). What is found are candidates; nobody is written to."""
    if len(body.what.strip()) < 3:
        raise HTTPException(422, "Say what to look for: a material group or a trade.")
    if body.kind not in supply.KINDS:
        raise HTTPException(422, f"kind is one of: {', '.join(supply.KINDS)}.")
    try:
        with spend.scope(project_id=body.project_id):
            return await partners.discover(body.what, body.kind, body.region, project_id=body.project_id)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"The search failed: {exc}") from exc


class Decision(BaseModel):
    take: bool  # into the directory; false: pass it over (again: take that back)


@app.post("/api/partners/searches/{search_id}/{n}")
def decide_candidate(search_id: str, n: int, body: Decision):
    found = partners.decide(search_id, n, body.take)
    if found is None:
        raise HTTPException(404, "This search result is not there any more.")
    return found


class Discovery(BaseModel):
    auto: bool | None = None  # Polier looks on its own for packages with nobody to ask
    every_days: int | None = None
    region: str | None = None


@app.put("/api/partners/discovery")
def put_discovery(body: Discovery):
    if body.every_days is not None and not 1 <= body.every_days <= 90:
        raise HTTPException(422, "Between 1 and 90 days.")
    return partners.set_discovery(body.model_dump(exclude_unset=True))


@app.post("/api/partners/history")
def partner_history():
    """Look into the mailbox for the mail exchanged with every partner that has an address (read-only)."""
    try:
        return partners.mailbox_history()
    except mail.MailUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/partners/messages")
async def partner_messages(files: list[UploadFile]):
    """The same for messages handed over as .eml files: each goes to the partner it is from or to."""
    raws = []
    for file in files:
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES or not (file.filename or "").lower().endswith(".eml"):
            raise HTTPException(422, "Hand over e-mails as .eml files of at most 30 MB.")
        raws.append(data)
    return partners.take_messages(raws)


@app.post("/api/partners/examples")
def put_examples():
    """Put the example history in: six made-up firms with mail, quotes and prices, all marked as examples."""
    return {"firms": partners_demo.put()}


@app.delete("/api/partners/examples", status_code=204)
def remove_examples():
    partners_demo.remove()


@app.get("/api/partners/{supplier_id}")
def partner_profile(supplier_id: str):
    """One partner: its prices with their dates, its usual terms, how it behaves, and every message and call."""
    found = partners.profile(supplier_id)
class FollowUp(BaseModel):
    project_id: str
    file: str  # the file's name, as the conversation carries it
    package: str
    supplier_id: str
    kind: str = "reminder"  # or "answer": what the firm asked back, answered from the LV (asks Claude)


@app.post("/api/partners/follow-up")
async def partner_follow_up(body: FollowUp):
    """The next message in an open conversation, written from the partners page: a reminder, or the answer
    to what the firm asked back. It is the message the price inquiries of the tender would write
    (`compose_inquiry`); with it comes the analysis it belongs to, which is where it is sent from. Nothing
    goes out here: the estimator reads the text first."""
    if body.kind not in ("reminder", "answer"):
        raise HTTPException(422, "kind is reminder or answer.")
    with db.engine().connect() as conn:
        kept = [r.id for r in conn.execute(select(db.analyses.c.id).where(db.analyses.c.project_id == body.project_id)
                                           .order_by(db.analyses.c.created.desc()))]
    analysis_id = next((a for a in kept if _analysis(a)[0].file == body.file), None)
    if analysis_id is None:
        raise HTTPException(404, "The analysis of this tender's file is no longer kept. Open the file once.")
    draft = await compose_inquiry(analysis_id, InquiryDraft(package=body.package, supplier_id=body.supplier_id,
                                                            remind=body.kind == "reminder", answer=body.kind == "answer"))
    return {**draft, "analysis_id": analysis_id}


    if found is None:
        raise HTTPException(404, "This partner is no longer in the directory.")
    return found


@app.post("/api/partners/{supplier_id}/style")
async def partner_style(supplier_id: str):
    """Read how a partner writes from its own messages (asks Claude) and keep it; inquiries to it are then
    written that way. Every trait carries its passage."""
    if supply.supplier(supplier_id) is None:
        raise HTTPException(404, "This partner is no longer in the directory.")
    try:
        with spend.scope():
            return await partners.read_style(supplier_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Reading the style failed: {exc}") from exc


@app.get("/api/mails/{mail_id}/call-audio")
def call_audio(mail_id: str):
    """The recording of a call the voice agent made, as ElevenLabs keeps it."""
    found = _mail(mail_id)
    conversation = (found["meta"] or {}).get("conversation_id")
    if not conversation:
        raise HTTPException(404, "No recording is kept for this call.")
    try:
        return Response(voice.audio(conversation), media_type="audio/mpeg")
    except voice.VoiceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/mails/{mail_id}/call-record")
def call_record(mail_id: str):
    """Fetch what ElevenLabs kept of a call (who said what) and keep it as the call's transcript."""
    found = _mail(mail_id)
    conversation = (found["meta"] or {}).get("conversation_id")
    if not conversation:
        raise HTTPException(404, "This record is no call with a recording.")
    try:
        kept = voice.record(conversation)
    except voice.VoiceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    if kept["transcript"]:
        mail.keep_reply(mail_id, kept["transcript"][:60000], {**(found["answers"] or {"kind": "other", "asks": [], "unmatched": [], "summary": ""})}, "phone")
    return kept
@app.post("/api/partners/{supplier_id}/read")
async def partner_read(supplier_id: str):
    """What an estimator should know about a partner in a few sentences (asks Claude), kept with it. Every
    sentence names the facts of the record or the passage of a message it rests on; one that does not is
    dropped."""
    if supply.supplier(supplier_id) is None:
        raise HTTPException(404, "This partner is no longer in the directory.")
    try:
        with spend.scope():
            return await partners.read_firm(supplier_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Reading the record failed: {exc}") from exc




# ---------------------------------------------------------------- tenders found in the mailbox (boq.inbox)

async def _take_message(message: dict, ours: set[str]) -> dict:
    """One message of the mailbox: a project in the intake if it invites the firm to bid on an LV attached
    to it; else why it was passed over. Either way it is not looked at again."""
    passed = lambda why: {"taken": None, "subject": message["subject"], "sender": message["sender"], "why": why}  # noqa: E731
    if any(m in message["answers"] for m in ours if m):
        return passed("answers a message of ours: it belongs to that conversation")
    read, dates = [], []
    for name, data in message["files"]:
        suffix = Path(name).suffix.lower()
        if suffix in tender_dates.READABLE and len(data) <= MAX_BYTES:
            dates += tender_dates.read(data, name)
        if suffix in SUPPORTED and len(data) <= MAX_BYTES:
            try:
                read.append((name, data, await asyncio.to_thread(_parse_bytes, data, name)))
            except HTTPException:
                pass
    if not read:
        return passed("no attachment that is an LV")
    lvs = [{"name": name, "items": len(boq.items), "sample": [f"{i.oz} | {i.label[:90]}" for i in boq.items[:: max(1, len(boq.items) // 25)][:25]]}
           for name, _, boq in read]
    said = await inbox.read_invitation(message, lvs)
    if not said["tender"]:
        return passed(said["summary"] or "not an invitation to bid")
    boqs = [boq for _, _, boq in read]
    identity = intake_rules.identity(boqs)
    title = identity["name"] or message["subject"][:80] or f"{len(boqs)} LVs, {datetime.now():%d.%m.%Y %H:%M}"
    stored = [(name, data, intake_rules.classify(boq, boqs)["role"]) for name, data, boq in read]
    plan = {k: v for k, v in tender_dates.plan_of(tender_dates.merge(dates)).items() if v}
    # the invitation is newer than the files it carries: a date its text states goes before theirs
    stated = tender_dates.plan_of(tender_dates.merge(tender_dates.read(message["text"].encode(), "E-Mail.txt")))
    plan |= {k: v for k, v in stated.items() if v}
    if said["due"] and not stated.get("due"):
        plan["due"] = said["due"]
    if plan.get("binding_until") and plan.get("due") and plan["binding_until"] < plan["due"]:
        del plan["binding_until"]  # a binding period that ends before the bid is due is an old file's
    plan |= {"stage": "intake", "found": {"via": "mail", "sender": message["sender"], "subject": message["subject"],
                                           "received": message["received"], "summary": said["summary"],
                                           "client": said["client"], "fit": said["fit"], "why": said["why"],
                                           "message_id": message["message_id"]}}
    kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
    project_id = catalog.save_project(title, stored, kind, number=identity["number"], plan=plan)
    events.record(project_id, "tender", f"A tender was found in the mail: {said['summary']} "
                  + {"yes": "It fits your own work.", "partly": "It fits your work in part.", "no": "It is not your trade."}[said["fit"]], "you")
    return {"taken": {"id": project_id, "name": title}, "subject": message["subject"], "sender": message["sender"],
            "why": said["summary"]}


async def _sort_mail(messages: list[dict]) -> dict:
    with db.engine().connect() as conn:
        ours = {row.message_id for row in conn.execute(select(db.mails.c.message_id).where(db.mails.c.message_id.isnot(None)))}
    known = inbox.seen() | {(p["plan"].get("found") or {}).get("message_id") for p in catalog.all_projects()}
    results = []
    for message in messages:
        if message["message_id"] and message["message_id"] in known:
            continue
        try:
            with spend.scope():
                results.append(await _take_message(message, ours))
        except LLMUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except Exception as exc:  # one message that cannot be read must not stop the others; it is tried again
            results.append({"taken": None, "subject": message["subject"], "sender": message["sender"],
                            "why": f"could not be read: {type(exc).__name__}: {exc}"[:200]})
            continue
        inbox.mark_seen([message["message_id"]])
    return {"looked": len(results), "taken": [r["taken"] for r in results if r["taken"]],
            "passed": [{"subject": r["subject"], "sender": r["sender"], "why": r["why"]} for r in results if not r["taken"]]}


@app.get("/api/inbox")
def inbox_state():
    """The mailbox the app looks into for tenders and replies; `user` is null where none is set."""
    return {"user": (mail.inbox() or {}).get("user") or None}


_SCAN = asyncio.Lock()


@app.post("/api/inbox/scan")
async def scan_inbox():
    """Look into the mailbox for tenders: every message of the last two weeks with an LV attached that was
    not looked at yet. An invitation to bid becomes a project in the intake; nothing in the mailbox is
    changed. `taken` are the projects made, `passed` the messages left, each with the reason."""
    if _SCAN.locked():  # another page asked a moment ago: one look at a time
        return {"looked": 0, "taken": [], "passed": []}
    async with _SCAN:
        try:
            # in a thread: the mailbox answers slowly, and on the event loop every other request waited for it
            messages = await asyncio.to_thread(inbox.recent, inbox.seen())
        except mail.MailUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        return await _sort_mail(messages)


@app.post("/api/inbox/messages")
async def sort_messages(files: list[UploadFile]):
    """The same for messages handed over as files (.eml, as a mail program saves them): for a mailbox the
    app cannot look into."""
    messages = []
    for file in files:
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES or not (file.filename or "").lower().endswith(".eml"):
            raise HTTPException(422, "Hand over e-mails as .eml files of at most 30 MB.")
        messages.append(inbox.from_eml(data))
    return await _sort_mail(messages)



# ---------------------------------------------------------------- the mailbox watched, and what Polier did

_sweeping = asyncio.Lock()


async def sweep_inbox() -> dict:
    """One look into the mailbox for everything the app waits for: answers of clients to bidder questions,
    replies of suppliers to price inquiries (both for every project), and new tenders. What is found is
    read and applied as if the estimator had pasted it; each thing is noted (boq.events). Nothing is sent
    and nothing in the mailbox is changed. Raises MailUnavailable where no inbox is set."""
    if mail.inbox() is None:
        raise mail.MailUnavailable("No inbox is set. Put IMAP_HOST (and IMAP_USER, IMAP_PASSWORD) into .env and restart the server.")
    async with _sweeping:  # the page and the server's own clock may ask at the same moment
        out = {"answers": 0, "quotes": 0, "tenders": []}
        for kind, take in ((mail.BIDDER_QUESTIONS, "answers"), (supply.PRICE_INQUIRY, "quotes")):
            waiting = mail.unanswered(kind)
            for found, text in (await asyncio.to_thread(mail.find_replies, waiting)) if waiting else []:
                try:
                    if kind == mail.BIDDER_QUESTIONS:
                        await _take_reply(found, text[:mail.MAX_REPLY_CHARS], "imap")
                    else:
                        await _take_quote(found, text[:supply.MAX_REPLY_CHARS], None, "imap")
                    out[take] += 1
                except HTTPException as exc:
                    if exc.status_code not in (422,):  # a reply that says nothing stays where it is
                        raise
        sorted_ = await _sort_mail(await asyncio.to_thread(inbox.recent, inbox.seen()))
        out["tenders"] = sorted_["taken"]
        return out


async def _keep_sweeping(every_s: int = 180) -> None:
    """The server's own clock: the mailbox is looked into every few minutes, also with no page open."""
    while True:
        await asyncio.sleep(every_s)
        try:
            if mail.inbox() is not None:
                await sweep_inbox()
        except Exception:  # a mailbox that does not answer now is asked again next time
            pass


@app.post("/api/inbox/sweep")
async def sweep():
    """Look into the mailbox now: `answers` and `quotes` read, `tenders` put into the intake."""
    try:
        return await sweep_inbox()
    except mail.MailUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/events")
def list_events(project: str | None = None, after: int = 0, limit: int = 40):
    """What Polier did, newest first: of one project, or of all. `after`: only what is newer than this id."""
    names = {p["id"]: p["name"] for p in catalog.all_projects()}
    return [{**e, "project": names.get(e["project_id"] or "", "")} for e in events.latest(project, min(limit, 200), after)]



class _WebApp(StaticFiles):
    """The built frontend. Its pages have addresses of their own (/projects/A/files/0, see web/src/router.ts)
    that are not files: those get index.html, and the page reads the address. Unknown /api paths and missing
    assets stay 404."""

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404:
                raise
            response = None
        if response is not None and response.status_code != 404:
            return response
        if path.split("/")[0] in ("api", "assets") or scope["method"] not in ("GET", "HEAD"):
            raise StarletteHTTPException(404)
        return await super().get_response("index.html", scope)


if WEB_DIST.is_dir():  # production build of the frontend, if present
    app.mount("/", _WebApp(directory=WEB_DIST, html=True), name="web")
