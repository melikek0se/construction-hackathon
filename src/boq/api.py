"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import base64
import json
import os
import secrets
import tempfile
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from pydantic import BaseModel
from sqlalchemy import delete, insert, select, update

from boq import catalog, chat, db, mail, pipeline, retrieve, runs
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
from boq.report import build_report, render_html, render_questions
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
    yield


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
    if found is not None:
        _keep_llm_findings(analysis_id, found)
    return found


def _keep_llm_findings(analysis_id: str, findings: list[Finding]) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.analyses).where(db.analyses.c.id == analysis_id)
                     .values(llm_findings=[f.model_dump(mode="json") for f in findings]))


def _dump(analysis_id: str, boq: BoQ, findings: list[Finding], reviewed: bool = False) -> dict:
    return {"id": analysis_id, "boq": boq.model_dump(mode="json"),
            "findings": [f.model_dump(mode="json") for f in findings],
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
                findings = findings + (_from_run(analysis_id, project_id, docs[id(boq)]) or [])
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
                         questions_due: str | None = Form(None), dates: str | None = Form(None)):
    """Keep files as a new project, or add them to an existing one.

    One LV in several versions and several trade LVs are both projects; which it is follows from the
    item numbers of the files. Several LVs are also analysed against each other, as before. What each
    file is (tender, bid, award) is read from the files as in the intake; `roles`, a JSON list with one
    entry per uploaded file (null = as read), is what the user corrected there. `due` and `questions_due`
    (YYYY-MM-DD) are the tender's dates. Left out, they are taken from the files where these state them
    (boq.dates). `dates`, a JSON object, says all of a new tender's dates at once (any of PLAN_DATES): what
    it names is kept as said, "" meaning none, also where the files state a day. Files added to a project
    fill only the dates it does not have yet, unless `dates` says otherwise.
    """
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
        project_id = catalog.save_project(title, stored, kind, number=found["number"], plan=plan)
    # Nothing is analysed here: the pipeline runs on the project in the background (boq.runs) and the pages
    # show how far it is.
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
    if kept is None or kept.get("v") != 3:  # v: summaries kept by an earlier version are worked out again
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
            for finding in run_checks(boq):
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
        kept = {"v": 3, "lvs": len(counted), "items": sum(d["items"] for d in counted),
                "counts": {s: sum(d["counts"][s] for d in counted) for s in rank},
                "net": net, "net_from": net_from, "docs": docs,
                # the tender's dates as its files state them, each with where it was read (boq.dates)
                "dates": tender_dates.merge(dates)}
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
    reviewed = _from_run(analysis_id, project_id, doc["id"])
    return _dump(analysis_id, boq, sort_findings(findings + (reviewed or [])), reviewed is not None)


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
    """The latest pipeline runs, newest first, of one project or of all: status, and one row per step and
    document with what it found. Asked again and again by the pages while a run is going."""
    return runs.list_runs(project)


@app.post("/api/catalog/{project_id}/runs")
def start_run(project_id: str):
    """Run the pipeline on a project again, in the background."""
    _catalog(project_id)
    return runs.start(project_id, "started by hand")


PLAN_DATES = ("questions_due", "due", "opening", "sent", "binding_until", "exec_start", "exec_end")
PLAN_STAGES = ("check", "questions", "pricing")  # submitted and award follow from the files


def _plan(values: dict) -> dict:
    """The dates and the stage of a tender as they are kept: ISO days, "" or null to take one out."""
    plan = {}
    for key, value in values.items():
        value = (value or "").strip() or None
        if key == "stage":
            if value is not None and value not in PLAN_STAGES:
                raise HTTPException(422, f"A stage is one of: {', '.join(PLAN_STAGES)}.")
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
    _catalog(project_id)
    if "name" in sent:
        name = (sent.pop("name") or "").strip()[:80]
        if not name:
            raise HTTPException(422, "A project needs a name.")
        catalog.rename(project_id, name)
    if sent:
        catalog.set_plan(project_id, _plan(sent))
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


_STAGE = {"check": "Check", "questions": "Questions (bidder questions are out)", "pricing": "Pricing"}
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
        stage = ("Award (an award is among the files)" if "award" in roles
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
        if summary:
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
        findings, stats = await run_llm_checks(
            boq, rule_findings, progress=lambda state: _REVIEWS.update({analysis_id: {"running": True, **state}}))
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The LLM review failed: {exc}") from exc
    finally:
        _REVIEWS.pop(analysis_id, None)
    _keep_llm_findings(analysis_id, findings)  # the report and the marks of this analysis now include them
    return {"findings": [f.model_dump(mode="json") for f in findings], "stats": stats}


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


def _prices(boq: BoQ) -> dict | None:
    """Price suggestions from the priced bids in dataset/; None for an LV that has prices already."""
    if any(i.total is not None for i in boq.items):
        return None
    return suggest_prices(boq, load_history(DATASET))


def _report(analysis_id: str) -> dict:
    boq, rule_findings = _analysis(analysis_id)
    return build_report(boq, sort_findings(rule_findings + _llm_findings(analysis_id)), _prices(boq))


@app.get("/api/analyses/{analysis_id}/prices")
def prices(analysis_id: str):
    """Unit-price suggestions from past bids, with sources; `null` when the LV is priced."""
    return _prices(_analysis(analysis_id)[0])


@app.post("/api/analyses/{analysis_id}/whatif")
def whatif(analysis_id: str, scenario: Scenario):
    """Total of a priced LV under changed unit prices, changed quantities or dropped optional items."""
    return what_if(_analysis(analysis_id)[0], scenario)


@app.get("/api/analyses/{analysis_id}/report")
def report_json(analysis_id: str):
    return _report(analysis_id)


@app.get("/api/analyses/{analysis_id}/report.html", response_class=HTMLResponse)
def report_html(analysis_id: str):
    """Printable risk report: findings so far, including the AI review if it has run."""
    return render_html(_report(analysis_id))


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
               "number": (project or {}).get("number") or boq.project_no, "client": boq.client},
        "questions_due": ((project or {}).get("plan") or {}).get("questions_due"),
        "questions": mail.standing(_report(analysis_id)["questions"], mails),
        "mails": mails,
        # the account the app can send from; None: the message is opened in the user's mail program
        "account": account["from"] if account else None,
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
    if body.via == "smtp":
        try:
            mail.send(to, subject, text + "\n")
        except mail.MailUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
    # the questions as they stand now, whole: a question that was asked stays on the list even when a later
    # analysis of the file no longer raises it (the AI review has not been run again, a rule has changed)
    items = [{**q, "no": no} for no, q in enumerate(asked, 1)]
    mail.keep(mail.BIDDER_QUESTIONS, _project_id(analysis_id), boq.file, to, subject, text, body.via, items,
              sent=body.via == "smtp")
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
    return _mail(mail_id)


@app.delete("/api/mails/{mail_id}", status_code=204)
def discard_mail(mail_id: str):
    """Take a message out again. One that was sent, or that has a reply, stays: it is the record."""
    found = _mail(mail_id)
    if found["via"] == "smtp" or found["reply"]:
        raise HTTPException(422, "A message that was sent by the app or has a reply is kept.")
    mail.discard(mail_id)


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
    try:
        read = await mail.read_reply(found["items"], reply)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"Reading the reply failed: {exc}") from exc
    mail.keep_reply(mail_id, reply, read["answers"])
    if not found["sent_at"]:  # an answer came, so the questions went out
        mail.set_sent(mail_id, True)
    return {**_mail(mail_id), "dropped": read["dropped"]}


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
