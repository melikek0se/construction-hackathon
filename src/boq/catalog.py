"""The projects the app knows: the six of the dataset, mapped by hand, and the ones users create.

A project is either one LV in several versions (tender, bid, award, PDF print-out) or several trade LVs of
one building. The dataset mapping follows docs/02-dataset.md; it is a fixed list because file names do not
say which project a file belongs to. Created projects keep their files in data/projects/<id>/ with a
meta.json beside them: no database, a folder per project.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STORE = Path(os.environ.get("BOQ_PROJECTS_DIR", ROOT / "data" / "projects"))

# role: what this file is within the project. The first file is the one a project opens with.
DATASET_PROJECTS = [
    {"id": "A", "number": "8209.003", "name": "Maschinentechnik – Anlagenbau", "trade": "Mechanical / plant",
     "note": "Water utility plant engineering, tender of 28.02.2024.", "kind": "versions",
     "files": [("01_gaeb_xml/8209.003_Leistungsverzeichnis_leer.X83", "tender"),
               ("02_gaeb_90/8209.003_Leistungsverzeichnis_leer.D83", "tender"),
               ("02_gaeb_90/[ORT_024] LV24069.D86", "award"),
               ("04_pdf_tiefbau_sonstige/HEM2301-2_Gesamt-LV.pdf", "tender package")]},
    {"id": "B", "number": "", "name": "Ringschluss Brunnenwasser", "trade": "Civil / pipeline",
     "note": "Public client, 03/2023. Bid and award carry the same prices.", "kind": "versions",
     "files": [("01_gaeb_xml/[NUMMER_001]_leer.X83", "tender"),
               ("04_pdf_tiefbau_sonstige/Leistungsverzeichnis_leer.pdf", "tender"),
               ("02_gaeb_90/StBALV23040.D84", "bid"),
               ("02_gaeb_90/StBALV23040.D86", "award"),
               ("04_pdf_tiefbau_sonstige/Abgabe LV.pdf", "submitted bid")]},
    {"id": "C", "number": "2024-001", "name": "Fernleitung", "trade": "Civil / pipeline",
     "note": "Long-distance water pipeline, contractor offer of 25.11.2024.", "kind": "versions",
     "files": [("04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf", "tender"),
               ("04_pdf_tiefbau_sonstige/LV-Schachtbauwerk.pdf", "excerpt"),
               ("02_gaeb_90/Angebot AN24-0305.D84", "offer"),
               ("04_pdf_tiefbau_sonstige/Angebot AN24-0305.pdf", "offer")]},
    {"id": "D", "number": "152516", "name": "Bachdurchlass", "trade": "Civil",
     "note": "Culvert replacement for a small municipality, 05/2025.", "kind": "versions",
     "files": [("01_gaeb_xml/GAEB-[PROJEKT_004].X83", "tender"),
               ("04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf", "tender")]},
    {"id": "E", "number": "501-24-01", "name": "Tiefbau und Verlegung", "trade": "Civil / pipeline",
     "note": "296 items, 27 of them hourly rates.", "kind": "versions",
     "files": [("01_gaeb_xml/501-24-01_GAEB-XML_sas.x83", "tender")]},
    {"id": "F", "number": "79-222", "name": "Ausbildungszentrum und Bürogebäude", "trade": "Building, 27 trades",
     "note": "Subcontractor inquiries of a general contractor, one LV per trade.", "kind": "trades",
     "folder": "03_pdf_hochbau_projekt"},
]


def _file(path: Path, role: str) -> dict:
    ext = path.suffix.lower()
    fmt = "PDF" if ext == ".pdf" else "Excel" if ext in (".xlsx", ".xls") else \
        "GAEB XML" if ext.startswith(".x") else "GAEB 90"
    return {"name": path.name, "role": role, "format": fmt, "path": path}


def dataset_projects(dataset: Path) -> list[dict]:
    out = []
    for p in DATASET_PROJECTS:
        if "folder" in p:
            paths = sorted(q for q in (dataset / p["folder"]).glob("LV_*") if q.is_file())
            files = [_file(q, "trade LV") for q in paths]
        else:
            files = [_file(dataset / rel, role) for rel, role in p["files"] if (dataset / rel).is_file()]
        if files:
            out.append({**{k: p[k] for k in ("id", "number", "name", "trade", "note", "kind")},
                        "source": "dataset", "created": None, "files": files})
    return out


def saved_projects() -> list[dict]:
    out = []
    for meta in sorted(STORE.glob("*/meta.json")):
        try:
            m = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue  # a half-written folder must not take the list down
        files = [_file(meta.parent / "files" / f["stored"], f["role"]) | {"name": f["name"]} for f in m["files"]]
        files = [f for f in files if f["path"].is_file()]
        if files:
            out.append({"id": m["id"], "number": "", "name": m["name"], "trade": "", "note": "",
                        "kind": m["kind"], "source": "saved", "created": m["created"], "files": files})
    return sorted(out, key=lambda p: p["created"], reverse=True)


def all_projects(dataset: Path) -> list[dict]:
    return saved_projects() + dataset_projects(dataset)


def find(dataset: Path, project_id: str) -> dict | None:
    return next((p for p in all_projects(dataset) if p["id"] == project_id), None)


def _store_files(folder: Path, start: int, uploads: list[tuple[str, bytes, str]]) -> list[dict]:
    files = []
    for n, (original, data, role) in enumerate(uploads, start):
        stored = f"{n:02d}{Path(original).suffix.lower()}"  # never trust an uploaded name as a path
        (folder / stored).write_bytes(data)
        files.append({"name": original, "stored": stored, "role": role})
    return files


def save_project(name: str, uploads: list[tuple[str, bytes, str]], kind: str) -> str:
    """Keep the files of a new project: (file name, bytes, role) each. Returns its id."""
    project_id = uuid.uuid4().hex[:12]
    folder = STORE / project_id / "files"
    folder.mkdir(parents=True)
    meta = {"id": project_id, "name": name, "kind": kind,
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "files": _store_files(folder, 0, uploads)}
    (STORE / project_id / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return project_id


def _meta(project_id: str) -> Path | None:
    if not re.fullmatch(r"[0-9a-f]{12}", project_id):
        return None
    meta = STORE / project_id / "meta.json"
    return meta if meta.is_file() else None


def add_files(project_id: str, uploads: list[tuple[str, bytes, str]], kind: str) -> bool:
    """Add files to a created project. Dataset projects are a fixed mapping and take none."""
    meta = _meta(project_id)
    if meta is None:
        return False
    m = json.loads(meta.read_text(encoding="utf-8"))
    m["files"] += _store_files(meta.parent / "files", len(m["files"]), uploads)
    m["kind"] = kind
    meta.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def rename(project_id: str, name: str) -> bool:
    """Rename a created project. Dataset projects keep their names."""
    meta = _meta(project_id)
    if meta is None:
        return False
    m = json.loads(meta.read_text(encoding="utf-8"))
    m["name"] = name
    meta.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def public(project: dict) -> dict:
    """A project as the API returns it: no file-system paths."""
    return {**project, "files": [{k: v for k, v in f.items() if k != "path"} for f in project["files"]]}
