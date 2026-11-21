"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import os
import tempfile
import uuid
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from boq.checks import run_checks, sort_findings
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.env import load_env
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file
from boq.prices import load_history, suggest_prices
from boq.project import analyse_project, lv_name
from boq.report import build_report, render_html, render_questions
from boq.whatif import Scenario, what_if

load_env()

ROOT = Path(__file__).resolve().parents[2]
DATASET = Path(os.environ.get("BOQ_DATASET_DIR", ROOT / "dataset"))
WEB_DIST = ROOT / "web" / "dist"
MAX_BYTES = 30 * 1024 * 1024

app = FastAPI(title="BoQ analysis")

# Parsed LVs of this server process, so the LLM review does not need the file again. No database:
# a restart forgets them and the user uploads again.
_ANALYSES: OrderedDict[str, tuple[BoQ, list[Finding]]] = OrderedDict()
_LLM_FINDINGS: dict[str, list[Finding]] = {}  # AI findings of an analysis, once the review has run
_KEEP = 120  # a project of thirty trade LVs must stay openable LV by LV


def _parse(path: Path, name: str) -> BoQ:
    try:
        boq = parse_file(str(path))
    except Exception as exc:  # malformed upload: report it, do not crash the server
        raise HTTPException(422, f"Could not read {name}: {exc}") from exc
    boq.file = name
    if boq.name == path.stem:  # a PDF without a title is named after its file: use the uploaded name,
        boq.name = Path(name).stem  # not the temporary one, so repeated uploads hit the LLM cache
    if not boq.items:
        raise HTTPException(422, f"No LV items found in {name}. PDFs need a text layer and a printed "
                                 f"item list (item number, description, quantity, unit).")
    return boq


def _store(boq: BoQ) -> tuple[str, list[Finding]]:
    findings = run_checks(boq)
    analysis_id = uuid.uuid4().hex
    _ANALYSES[analysis_id] = (boq, findings)
    while len(_ANALYSES) > _KEEP:
        _LLM_FINDINGS.pop(_ANALYSES.popitem(last=False)[0], None)
    return analysis_id, findings


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
    files = (p for p in DATASET.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED)
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


@app.post("/api/projects")
async def create_project(files: list[UploadFile]):
    """Several LVs of one building: each is analysed, then the interfaces between them."""
    if len(files) < 2:
        raise HTTPException(422, "A project needs at least two LV files.")
    boqs = []
    with tempfile.TemporaryDirectory() as tmp:
        for n, file in enumerate(files):
            name = Path(file.filename or f"upload{n}").name
            suffix = Path(name).suffix.lower()
            if suffix not in SUPPORTED:
                raise HTTPException(415, f"{name}: {suffix or 'this file type'} is not supported.")
            path = Path(tmp) / f"upload{n}{suffix}"
            path.write_bytes(await file.read(MAX_BYTES + 1))
            boqs.append(_parse(path, name))
    return _project(f"{len(boqs)} LVs", boqs)


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
