"""HTTP API: upload an LV, get items and findings.

    uv run uvicorn boq.api:app --reload --port 8000
"""
import os
import tempfile
import uuid
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from boq.checks import run_checks
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.env import load_env
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file

load_env()

ROOT = Path(__file__).resolve().parents[2]
DATASET = Path(os.environ.get("BOQ_DATASET_DIR", ROOT / "dataset"))
WEB_DIST = ROOT / "web" / "dist"
MAX_BYTES = 30 * 1024 * 1024

app = FastAPI(title="BoQ analysis")

# Parsed LVs of this server process, so the LLM review does not need the file again. No database:
# a restart forgets them and the user uploads again.
_ANALYSES: OrderedDict[str, tuple[BoQ, list[Finding]]] = OrderedDict()
_KEEP = 20


def _analyze(path: Path, name: str) -> dict:
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
    findings = run_checks(boq)
    analysis_id = uuid.uuid4().hex
    _ANALYSES[analysis_id] = (boq, findings)
    while len(_ANALYSES) > _KEEP:
        _ANALYSES.popitem(last=False)
    return {"id": analysis_id, "boq": boq.model_dump(mode="json"),
            "findings": [f.model_dump(mode="json") for f in findings]}


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
                                 f"Upload a GAEB file or a PDF: {', '.join(sorted(SUPPORTED))}.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 30 MB.")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{suffix}"
        path.write_bytes(data)
        return _analyze(path, name)


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
    return {"findings": [f.model_dump(mode="json") for f in findings], "stats": stats}


if WEB_DIST.is_dir():  # production build of the frontend, if present
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
