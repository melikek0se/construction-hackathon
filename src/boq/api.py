"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import base64
import os
import secrets
import tempfile
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel
from sqlalchemy import delete, insert, select, update

from boq import catalog, db
from boq.checks import run_checks, sort_findings
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.env import load_env
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file
from boq.prices import load_history, suggest_prices
from boq.project import analyse_project, lv_name
from boq.report import build_report, render_html, render_questions
from boq.seed import seed
from boq.whatif import Scenario, what_if

load_env()

ROOT = Path(__file__).resolve().parents[2]
DATASET = Path(os.environ.get("BOQ_DATASET_DIR", ROOT / "dataset"))
WEB_DIST = ROOT / "web" / "dist"
MAX_BYTES = 30 * 1024 * 1024



@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.engine()  # create the tables, and fail at start rather than on the first request
    if os.environ.get("BOQ_SEED_DEMO") and not catalog.all_projects():
        seed(DATASET)  # a fresh database on a host without a shell: put the demo projects in
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


def _store(boq: BoQ) -> tuple[str, list[Finding]]:
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
    return analysis_id, findings


def _llm_findings(analysis_id: str) -> list[Finding]:
    with db.engine().connect() as conn:
        raw = conn.execute(select(db.analyses.c.llm_findings).where(db.analyses.c.id == analysis_id)).scalar()
    return [Finding.model_validate(f) for f in raw or []]


def _dump(analysis_id: str, boq: BoQ, findings: list[Finding]) -> dict:
    return {"id": analysis_id, "boq": boq.model_dump(mode="json"),
            "findings": [f.model_dump(mode="json") for f in findings]}


def _analyze(path: Path, name: str) -> dict:
    boq = _parse(path, name)
    analysis_id, findings = _store(boq)
    return _dump(analysis_id, boq, findings)


def _project(name: str, boqs: list[BoQ]) -> dict:
    """Analyse each LV on its own, then what the LVs expect from each other."""
    lvs, rows = {}, []
    for boq in boqs:
        label = lv_name(boq)
        while label in lvs:  # two files of the same name
            label += " (2)"
        analysis_id, findings = _store(boq)
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
    return _dump(analysis_id, boq, sort_findings(findings + _llm_findings(analysis_id)))


ROLE = {"83": "tender", "84": "bid", "86": "award"}  # GAEB exchange phase -> what the file is in a tender


async def _read_uploads(files: list[UploadFile]) -> list[tuple[str, bytes, BoQ]]:
    """Every uploaded file parsed. Nothing is kept unless all of them can be read."""
    out = []
    for n, file in enumerate(files):
        filename = Path(file.filename or f"upload{n}").name
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED:
            raise HTTPException(415, f"{filename}: {suffix or 'this file type'} is not supported. "
                                     f"Use GAEB, PDF or Excel: {', '.join(sorted(SUPPORTED))}.")
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{filename} is larger than 30 MB.")
        out.append((filename, data, _parse_bytes(data, filename)))
    return out


def _shared(a: BoQ, b: BoQ) -> int:
    """Items of `a` that `b` has under the same number with the same unit and quantity. A field one file
    lacks does not count against it: a GAEB 84 bid carries prices only, no units or quantities."""
    other = {i.oz: i for i in b.items}
    return sum(1 for i in a.items if (o := other.get(i.oz)) is not None
               and (i.qty is None or o.qty is None or i.qty == o.qty)
               and (not i.unit or not o.unit or i.unit == o.unit))


def _same_lv(boqs: list[BoQ], whole: bool = False) -> list[int]:
    """Which files are the same LV: files that share most items (number, unit and quantity) are versions
    of one LV (tender, print-out, bid, award); others are other LVs (trades, lots).

    Item numbers alone are not enough: the trade LVs of one building restart at 1.1.10 each (project F
    has 8 of 27 that would pair up). Each file is compared with every file of a group, not with the
    group's union, so pairs cannot chain. `whole` asks for most of BOTH files: an LV that repeats part
    of another (F: 01 Fertigteiltreppen inside 00 Rohbau) is then a separate LV, which the comparison
    between LVs must see; otherwise an excerpt (C: LV-Schachtbauwerk) belongs to its LV."""
    groups: list[list[BoQ]] = []
    index = []
    for boq in boqs:
        for g, members in enumerate(groups):
            if any(_versions(boq, m, whole) for m in members):
                members.append(boq)
                index.append(g)
                break
        else:
            groups.append([boq])
            index.append(len(groups) - 1)
    return index


def _versions(a: BoQ, b: BoQ, whole: bool) -> bool:
    n, m = len(a.items), len(b.items)
    if not n or not m:
        return False
    shared = _shared(a, b) if n <= m else _shared(b, a)
    return shared >= 0.7 * (max(n, m) if whole else min(n, m))


def _one_per_lv(boqs: list[BoQ]) -> list[BoQ]:
    """One file per LV for the comparison between LVs: the GAEB tender where there is one. A tender and
    its own print-out are not two trades; an LV that repeats part of another is (see _same_lv)."""
    def rank(boq: BoQ) -> tuple[bool, bool]:  # a tender before a bid, a GAEB file before its print-out
        return boq.phase == "83", boq.format != "pdf"

    picked: dict[int, BoQ] = {}
    for boq, group in zip(boqs, _same_lv(boqs, whole=True)):
        if group not in picked or rank(boq) > rank(picked[group]):
            picked[group] = boq
    return list(picked.values())


@app.post("/api/intake")
async def intake(files: list[UploadFile]):
    """What a set of dropped files is, before anything is kept: each file's role, which files are the
    same LV, and the project name the LV itself carries."""
    uploads = await _read_uploads(files)
    boqs = [boq for _, _, boq in uploads]
    groups = _same_lv(boqs)
    names = [b.name for b in boqs if b.name and b.name != Path(b.file).stem]
    return {"name": max(set(names), key=names.count) if names else "",
            "lvs": len(set(groups)),
            "files": [{"name": name, "format": boq.format, "role": ROLE.get(boq.phase, "LV"), "title": lv_name(boq),
                       "items": len(boq.items), "lv": g}
                      for (name, _, boq), g in zip(uploads, groups)]}


@app.post("/api/projects")
async def create_project(files: list[UploadFile], name: str | None = Form(None), project: str | None = Form(None)):
    """Keep files as a new project, or add them to an existing one.

    One LV in several versions and several trade LVs are both projects; which it is follows from the
    item numbers of the files. Several LVs are also analysed against each other, as before.
    """
    uploads = await _read_uploads(files)
    stored = [(filename, data, ROLE.get(boq.phase, "LV")) for filename, data, boq in uploads]
    boqs = [boq for _, _, boq in uploads]
    if project:
        existing = _catalog(project)
        boqs = [_parse_doc(f) for f in existing["files"]] + boqs
        kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
        catalog.add_files(project, stored, kind)
        project_id, title = project, existing["name"]
    else:
        kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
        named = [b.name for b in boqs if b.name and b.name != Path(b.file).stem]
        title = (name or "").strip()[:80] or (named[0][:80] if named else f"{len(boqs)} LVs, {datetime.now():%d.%m.%Y %H:%M}")
        project_id = catalog.save_project(title, stored, kind)
    if kind == "trades":
        return {"id": project_id, "kind": kind, **_project(title, _one_per_lv(boqs))}
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
    if kept is None:
        rank = {"info": 1, "warn": 2, "high": 3}
        docs, net, net_from = [], None, None
        for index, f in enumerate(project["files"]):
            try:
                boq = _parse_doc(f)
            except HTTPException as exc:  # one unreadable document must not hide the others
                docs.append({"index": index, "name": f["name"], "role": f["role"], "format": f["format"],
                             "title": "", "items": 0, "counts": None, "marks": "", "error": str(exc.detail)})
                continue
            counts, worst = {"high": 0, "warn": 0, "info": 0}, {}
            for finding in run_checks(boq):
                counts[finding.severity] += 1
                if finding.item_oz:
                    worst[finding.item_oz] = max(worst.get(finding.item_oz, 0), rank[finding.severity])
            docs.append({"index": index, "name": f["name"], "role": f["role"], "format": f["format"],
                         "title": lv_name(boq), "items": len(boq.items), "counts": counts,
                         # the document's fingerprint: one digit per item in LV order, 0 none .. 3 stop
                         "marks": "".join(str(worst.get(i.oz, 0)) for i in boq.items), "error": None})
            totals = [i.total for i in boq.items if i.total is not None]
            if totals and f["role"] in ("bid", "award", "offer") and f["format"].startswith("GAEB"):
                net, net_from = float(sum(totals)), f["role"]  # a priced GAEB version gives the net total
        # The project's own numbers: one LV in several versions counts once (the document it opens with),
        # trade LVs all count.
        counted = [d for d in docs if d["counts"]]
        counted = counted if project["kind"] == "trades" else counted[:1]
        kept = {"lvs": len(counted), "items": sum(d["items"] for d in counted),
                "counts": {s: sum(d["counts"][s] for d in counted) for s in rank},
                "net": net, "net_from": net_from, "docs": docs}
        catalog.keep_summary(project_id, kept)
    return kept


@app.get("/api/catalog/{project_id}/files/{index}")
def open_project_file(project_id: str, index: int):
    """One file of a project as an analysed LV."""
    files = _catalog(project_id)["files"]
    if not 0 <= index < len(files):
        raise HTTPException(404, f"Project {project_id} has no file {index}.")
    boq = _parse_doc(files[index])
    analysis_id, findings = _store(boq)
    return _dump(analysis_id, boq, findings)


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
    return {"id": project_id, **_project(project["name"], _one_per_lv(boqs))}


class Rename(BaseModel):
    name: str


@app.patch("/api/catalog/{project_id}")
def rename_project(project_id: str, body: Rename):
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(422, "A project needs a name.")
    if not catalog.rename(project_id, name):
        raise HTTPException(404, f"No project {project_id}.")
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
    return _project(folder.split("_", 1)[-1].replace("_", " "), [_parse(p, p.name) for p in files])


@app.get("/api/samples")
def list_samples():
    return [{"path": rel, "name": p.name, "bytes": p.stat().st_size} for rel, p in _samples().items()]


@app.get("/api/samples/analyze")
def analyze_sample(path: str):
    sample = _samples().get(path)  # only files from the listing, never an arbitrary path
    if sample is None:
        raise HTTPException(404, f"No sample file {path}.")
    return _analyze(sample, sample.name)


@app.post("/api/analyses/{analysis_id}/llm")
async def llm_review(analysis_id: str):
    """Run the LLM checks on an analysed LV. Takes from seconds (cached) to a few minutes."""
    boq, rule_findings = _analysis(analysis_id)
    try:
        findings, stats = await run_llm_checks(boq, rule_findings)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The LLM review failed: {exc}") from exc
    with db.engine().begin() as conn:  # the report of this analysis now includes them
        conn.execute(update(db.analyses).where(db.analyses.c.id == analysis_id)
                     .values(llm_findings=[f.model_dump(mode="json") for f in findings]))
    return {"findings": [f.model_dump(mode="json") for f in findings], "stats": stats}


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


if WEB_DIST.is_dir():  # production build of the frontend, if present
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
