"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import os
import tempfile
import uuid
from datetime import datetime
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel

from boq import catalog, chat
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

app = FastAPI(title="BoQ analysis")

# Parsed LVs of this server process, so the LLM review does not need the file again. No database:
# a restart forgets them and the user uploads again.
_ANALYSES: OrderedDict[str, tuple[BoQ, list[Finding]]] = OrderedDict()
_LLM_FINDINGS: dict[str, list[Finding]] = {}  # AI findings of an analysis, once the review has run
_SOURCES: dict[str, Path] = {}  # the PDF behind an analysis, for files that stay on disk (dataset, projects)
# an LV without a PDF (GAEB, Excel): the pages the app drew for it and where each item stands on them
_DRAWN: dict[str, tuple[Path, dict[str, tuple[int, float]]]] = {}
# an LV shown on another file's pages (a GAEB file on the client's print-out of the same LV): that file's
# name and where the print-out has each item
_PRINT_OUT: dict[str, tuple[str, dict[str, tuple[int, float]]]] = {}
_PARSED: dict[tuple[str, float], BoQ] = {}  # project files read for a print-out or the chat, by path and mtime
_PROJECT_OF: dict[str, str] = {}  # the catalog project an analysis was opened from
_MARKS: dict[str, tuple[tuple[str, ...], dict]] = {}  # marks of an analysis, for the findings they were made for
_KEEP = 120  # a project of thirty trade LVs must stay openable LV by LV


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


def _store(boq: BoQ, source: Path | None = None) -> tuple[str, list[Finding]]:
    """`source`: the file the LV was read from, if it stays on disk. A PDF is kept for the PDF view."""
    findings = run_checks(boq)
    analysis_id = uuid.uuid4().hex
    _ANALYSES[analysis_id] = (boq, findings)
    if source is not None and Path(source).suffix.lower() == ".pdf":
        _SOURCES[analysis_id] = Path(source)
    while len(_ANALYSES) > _KEEP:
        dropped = _ANALYSES.popitem(last=False)[0]
        _LLM_FINDINGS.pop(dropped, None)
        _SOURCES.pop(dropped, None)
        _MARKS.pop(dropped, None)
        _PRINT_OUT.pop(dropped, None)
        _PROJECT_OF.pop(dropped, None)
        if dropped in _DRAWN:
            _DRAWN.pop(dropped)[0].unlink(missing_ok=True)
    return analysis_id, findings


def _dump(analysis_id: str, boq: BoQ, findings: list[Finding]) -> dict:
    return {"id": analysis_id, "boq": boq.model_dump(mode="json"),
            "findings": [f.model_dump(mode="json") for f in findings],
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
        path = Path(f["path"])
        if path.suffix.lower() != ".pdf" or not path.is_file():
            continue
        pdf = _parsed(path, f["name"])
        if pdf is None:  # an unreadable PDF is simply no print-out
            continue
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
             project_id: str | None = None) -> dict:
    """Analyse each LV on its own, then what the LVs expect from each other."""
    lvs, rows = {}, []
    for boq in boqs:
        label = lv_name(boq)
        while label in lvs:  # two files of the same name
            label += " (2)"
        analysis_id, findings = _store(boq, (sources or {}).get(id(boq)))
        if project_id:
            _PROJECT_OF[analysis_id] = project_id
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
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{suffix}"
        path.write_bytes(data)
        return _analyze(path, name)


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str):
    """An LV analysed earlier in this server process, e.g. one LV of a project."""
    boq, findings = _analysis(analysis_id)
    return _dump(analysis_id, boq, sort_findings(findings + _LLM_FINDINGS.get(analysis_id, [])))


ROLE = {"83": "tender", "84": "bid", "86": "award"}  # GAEB exchange phase -> what the file is in a tender


async def _read_uploads(files: list[UploadFile]) -> list[tuple[str, bytes, BoQ]]:
    """Every uploaded file parsed. Nothing is kept unless all of them can be read."""
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for n, file in enumerate(files):
            filename = Path(file.filename or f"upload{n}").name
            suffix = Path(filename).suffix.lower()
            if suffix not in SUPPORTED:
                raise HTTPException(415, f"{filename}: {suffix or 'this file type'} is not supported. "
                                         f"Use GAEB, PDF or Excel: {', '.join(sorted(SUPPORTED))}.")
            data = await file.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise HTTPException(413, f"{filename} is larger than 30 MB.")
            path = Path(tmp) / f"upload{n}{suffix}"
            path.write_bytes(data)
            out.append((filename, data, _parse(path, filename)))
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
    """Keep files as a project (data/projects/<id>/), or add them to a project created earlier.

    One LV in several versions and several trade LVs are both projects; which it is follows from the
    item numbers of the files. Several LVs are also analysed against each other, as before.
    """
    uploads = await _read_uploads(files)
    stored = [(filename, data, ROLE.get(boq.phase, "LV")) for filename, data, boq in uploads]
    boqs = [boq for _, _, boq in uploads]
    if project:
        existing = _catalog(project)
        if existing["source"] != "saved":
            raise HTTPException(409, f"{existing['name']} is a dataset project; files cannot be added to it.")
        boqs = [_parse(f["path"], f["name"]) for f in existing["files"]] + boqs
        kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
        catalog.add_files(project, stored, kind)
        project_id, title = project, existing["name"]
    else:
        kind = "trades" if len(set(_same_lv(boqs))) > 1 else "versions"
        named = [b.name for b in boqs if b.name and b.name != Path(b.file).stem]
        title = (name or "").strip()[:80] or (named[0][:80] if named else f"{len(boqs)} LVs, {datetime.now():%d.%m.%Y %H:%M}")
        project_id = catalog.save_project(title, stored, kind)
    _SUMMARIES.pop(project_id, None)
    if kind == "trades":
        # where the uploads are now; by position, not by name: trade LVs often share a file name
        sources = {id(b): Path(f["path"]) for b, f in zip(boqs, _catalog(project_id)["files"])}
        return {"id": project_id, "kind": kind, **_project(title, _one_per_lv(boqs), sources, project_id)}
    return {"id": project_id, "kind": kind, "name": title}


# ---------------------------------------------------------------- projects page

_SUMMARIES: dict[str, dict] = {}  # per project: items and findings, worked out once per server process


def _catalog(project_id: str) -> dict:
    project = catalog.find(DATASET, project_id)
    if project is None:
        raise HTTPException(404, f"No project {project_id}.")
    return project


@app.get("/api/catalog")
def list_catalog():
    """Every project the app knows: created ones first, then the six of the dataset."""
    return [catalog.public(p) for p in catalog.all_projects(DATASET)]


@app.get("/api/catalog/{project_id}/summary")
def catalog_summary(project_id: str):
    """Items and rule findings of a project and of each of its documents, for the projects page.
    Parses every file, so it is asked for per project and remembered."""
    project = _catalog(project_id)
    if project_id not in _SUMMARIES:
        rank = {"info": 1, "warn": 2, "high": 3}
        docs, net, net_from = [], None, None
        for index, f in enumerate(project["files"]):
            try:
                boq = _parse(f["path"], f["name"])
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
        _SUMMARIES[project_id] = {
            "lvs": len(counted), "items": sum(d["items"] for d in counted),
            "counts": {s: sum(d["counts"][s] for d in counted) for s in rank},
            "net": net, "net_from": net_from, "docs": docs}
    return _SUMMARIES[project_id]


@app.get("/api/catalog/{project_id}/files/{index}")
def open_project_file(project_id: str, index: int):
    """One file of a project as an analysed LV."""
    files = _catalog(project_id)["files"]
    if not 0 <= index < len(files):
        raise HTTPException(404, f"Project {project_id} has no file {index}.")
    boq = _parse(files[index]["path"], files[index]["name"])
    shown = None if boq.format == "pdf" else _print_out(boq, files[:index] + files[index + 1:])
    analysis_id, findings = _store(boq, shown[0] if shown else files[index]["path"])
    if shown:
        _PRINT_OUT[analysis_id] = shown[1:]
    _PROJECT_OF[analysis_id] = project_id
    return _dump(analysis_id, boq, findings)


@app.get("/api/catalog/{project_id}/project")
def open_project(project_id: str):
    """A project of several trade LVs: each LV analysed, then what they expect from each other."""
    project = _catalog(project_id)
    if project["kind"] != "trades":
        raise HTTPException(409, f"{project['name']} is one LV in several versions; open one of its files.")
    boqs, sources = _parse_kept([(f["path"], f["name"]) for f in project["files"]])
    return {"id": project_id, **_project(project["name"], _one_per_lv(boqs), sources, project_id)}


class Rename(BaseModel):
    name: str


@app.patch("/api/catalog/{project_id}")
def rename_project(project_id: str, body: Rename):
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(422, "A project needs a name.")
    if not catalog.rename(project_id, name):
        raise HTTPException(409, "Only projects created here can be renamed; dataset projects keep their names.")
    return catalog.public(_catalog(project_id))


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


def _chat_documents(analysis_id: str, boq: BoQ) -> tuple[list[BoQ], list[dict]]:
    """What the chat may read: the open LV, and from its project one file per other LV text. Of several
    versions of one LV the tender is read (a GAEB file before its print-out); the open file is always
    read as it is, also when it is a bid without texts. Returns the documents and the project's files."""
    project = catalog.find(DATASET, _PROJECT_OF.get(analysis_id, ""))
    if project is None:
        return [boq], []
    files = project["files"]
    others = [b for f in files if (b := _parsed(Path(f["path"]), f["name"])) is not None and b.items]
    whole = project["kind"] == "trades"  # there an LV that repeats part of another is still its own LV
    best: dict[int, BoQ] = {}
    for other, group in zip(others, _same_lv(others, whole)):
        rank = (other.phase == "83", other.format != "pdf")
        if group not in best or rank > (best[group].phase == "83", best[group].format != "pdf"):
            best[group] = other
    return [boq] + [b for b in best.values() if b.file != boq.file], files


@app.post("/api/analyses/{analysis_id}/chat")
async def ask_project(analysis_id: str, body: Question):
    """A question about the project, answered only from its documents, with the passages it rests on."""
    boq, _ = _analysis(analysis_id)
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "Ask a question.")
    documents, files = _chat_documents(analysis_id, boq)
    try:
        out = await chat.answer(question[:2000], body.history, documents)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The question could not be answered: {exc}") from exc
    index = {f["name"]: n for n, f in reversed(list(enumerate(files)))}
    for c in out["citations"]:
        c["index"] = index.get(c["file"])  # which file of the project, to open it from the answer
        c["here"] = c["file"] == boq.file
    return {**out, "documents": [d.file for d in documents]}


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
    findings = sort_findings(findings + _LLM_FINDINGS.get(analysis_id, []))
    made_for = tuple(f"{f.check_id}|{f.item_oz}|{f.evidence}" for f in findings)
    if _MARKS.get(analysis_id, (None,))[0] != made_for:  # a quote that is not on the page costs many searches
        _MARKS[analysis_id] = (made_for, locate(path, boq, findings, positions))
    return _MARKS[analysis_id][1]


@app.post("/api/analyses/{analysis_id}/llm")
async def llm_review(analysis_id: str):
    """Run the LLM checks on an analysed LV. Takes from seconds (cached) to a few minutes."""
    if analysis_id not in _ANALYSES:
        raise HTTPException(404, "This analysis is no longer in memory. Upload the file again.")
    boq, rule_findings = _ANALYSES[analysis_id]
    try:
        findings, stats = await run_llm_checks(boq, rule_findings)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # API or network failure: say so instead of a bare 500
        raise HTTPException(502, f"The LLM review failed: {exc}") from exc
    _LLM_FINDINGS[analysis_id] = findings  # the report of this analysis now includes them
    return {"findings": [f.model_dump(mode="json") for f in findings], "stats": stats}


def _analysis(analysis_id: str) -> tuple[BoQ, list[Finding]]:
    if analysis_id not in _ANALYSES:
        raise HTTPException(404, "This analysis is no longer in memory. Upload the file again.")
    return _ANALYSES[analysis_id]


def _prices(boq: BoQ) -> dict | None:
    """Price suggestions from the priced bids in dataset/; None for an LV that has prices already."""
    if any(i.total is not None for i in boq.items):
        return None
    return suggest_prices(boq, load_history(DATASET))


def _report(analysis_id: str) -> dict:
    boq, rule_findings = _analysis(analysis_id)
    return build_report(boq, sort_findings(rule_findings + _LLM_FINDINGS.get(analysis_id, [])), _prices(boq))


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
