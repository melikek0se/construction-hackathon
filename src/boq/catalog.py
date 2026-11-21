"""Projects and their documents, kept in the database (boq.db).

A project is either one LV in several versions (tender, bid, award, PDF print-out) or several trade LVs of
one building. Every project is uploaded the same way; the six projects of the challenge dataset are put in by
`seed_demo` (uv run boq-seed), from the hand-made mapping below, since file names do not say which project a
file belongs to (docs/02-dataset.md). After seeding they are ordinary projects: files can be added and removed.
"""
import hashlib
import uuid
from pathlib import Path

from sqlalchemy import delete, func, insert, select, update

from boq import db

# The dataset projects for seeding. role: what the file is within the project; the first file opens it.
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


def file_format(name: str) -> str:
    ext = Path(name).suffix.lower()
    return "PDF" if ext == ".pdf" else "Excel" if ext in (".xlsx", ".xls") else \
        "GAEB XML" if ext.startswith(".x") else "GAEB 90"


def _project(row, files: list) -> dict:
    return {"id": row.id, "number": row.number, "name": row.name, "trade": row.trade, "note": row.note,
            "kind": row.kind, "source": row.source, "created": row.created.isoformat(timespec="seconds"),
            "files": [{"id": f.id, "name": f.name, "role": f.role, "format": f.format} for f in files]}


_DOC_COLUMNS = (db.documents.c.id, db.documents.c.project_id, db.documents.c.name, db.documents.c.role,
                db.documents.c.format)


def all_projects() -> list[dict]:
    """Uploaded projects newest first, then the demo projects in dataset order (A..F)."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.projects).order_by(db.projects.c.created.desc())).all()
        docs = conn.execute(select(*_DOC_COLUMNS).order_by(db.documents.c.position)).all()
    by_project: dict[str, list] = {}
    for d in docs:
        by_project.setdefault(d.project_id, []).append(d)
    rows.sort(key=lambda r: (r.source == "demo", r.id if r.source == "demo" else ""))
    return [_project(r, by_project.get(r.id, [])) for r in rows]


def find(project_id: str) -> dict | None:
    with db.engine().connect() as conn:
        row = conn.execute(select(db.projects).where(db.projects.c.id == project_id)).first()
        if row is None:
            return None
        docs = conn.execute(select(*_DOC_COLUMNS).where(db.documents.c.project_id == project_id)
                            .order_by(db.documents.c.position)).all()
    return _project(row, docs)


def file_bytes(doc_id: int) -> bytes:
    with db.engine().connect() as conn:
        return conn.execute(select(db.documents.c.data).where(db.documents.c.id == doc_id)).scalar_one()


def _add_documents(conn, project_id: str, uploads: list[tuple[str, bytes, str]]) -> None:
    start = conn.execute(select(func.coalesce(func.max(db.documents.c.position) + 1, 0))
                         .where(db.documents.c.project_id == project_id)).scalar_one()
    for n, (name, data, role) in enumerate(uploads, start):
        conn.execute(insert(db.documents).values(
            project_id=project_id, position=n, name=Path(name).name, role=role, format=file_format(name),
            data=data, size=len(data), sha256=hashlib.sha256(data).hexdigest(), created=db.now()))


def save_project(name: str, uploads: list[tuple[str, bytes, str]], kind: str, *, project_id: str | None = None,
                 source: str = "upload", number: str = "", trade: str = "", note: str = "") -> str:
    """Keep a new project with its files: (file name, bytes, role) each. Returns its id."""
    project_id = project_id or uuid.uuid4().hex[:12]
    with db.engine().begin() as conn:
        conn.execute(insert(db.projects).values(id=project_id, name=name, number=number, trade=trade, note=note,
                                                kind=kind, source=source, created=db.now()))
        _add_documents(conn, project_id, uploads)
    return project_id


def add_files(project_id: str, uploads: list[tuple[str, bytes, str]], kind: str) -> bool:
    with db.engine().begin() as conn:
        done = conn.execute(update(db.projects).where(db.projects.c.id == project_id)
                            .values(kind=kind, summary=None)).rowcount
        if done:
            _add_documents(conn, project_id, uploads)
    return bool(done)


def remove_file(project_id: str, doc_id: int) -> bool:
    with db.engine().begin() as conn:
        done = conn.execute(delete(db.documents).where(db.documents.c.id == doc_id,
                                                       db.documents.c.project_id == project_id)).rowcount
        if done:
            conn.execute(update(db.projects).where(db.projects.c.id == project_id).values(summary=None))
    return bool(done)


def set_role(project_id: str, doc_id: int, role: str) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.documents).where(db.documents.c.id == doc_id,
                                                db.documents.c.project_id == project_id).values(role=role))
        conn.execute(update(db.projects).where(db.projects.c.id == project_id).values(summary=None))


def set_kind(project_id: str, kind: str) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.projects).where(db.projects.c.id == project_id).values(kind=kind))


def remove_project(project_id: str) -> bool:
    with db.engine().begin() as conn:
        conn.execute(delete(db.documents).where(db.documents.c.project_id == project_id))
        return bool(conn.execute(delete(db.projects).where(db.projects.c.id == project_id)).rowcount)


def rename(project_id: str, name: str) -> bool:
    with db.engine().begin() as conn:
        return bool(conn.execute(update(db.projects).where(db.projects.c.id == project_id)
                                 .values(name=name)).rowcount)


def summary(project_id: str) -> dict | None:
    with db.engine().connect() as conn:
        return conn.execute(select(db.projects.c.summary).where(db.projects.c.id == project_id)).scalar()


def keep_summary(project_id: str, value: dict) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.projects).where(db.projects.c.id == project_id).values(summary=value))


def seed_demo(dataset: Path) -> list[str]:
    """Put the dataset projects that are not there yet into the database. Returns the ids added."""
    known = {p["id"] for p in all_projects()}
    added = []
    for p in DATASET_PROJECTS:
        if p["id"] in known:
            continue
        if "folder" in p:
            paths = [(q, "trade LV") for q in sorted((dataset / p["folder"]).glob("LV_*")) if q.is_file()]
        else:
            paths = [(dataset / rel, role) for rel, role in p["files"] if (dataset / rel).is_file()]
        if not paths:
            continue
        save_project(p["name"], [(q.name, q.read_bytes(), role) for q, role in paths], p["kind"],
                     project_id=p["id"], source="demo", number=p["number"], trade=p["trade"], note=p["note"])
        added.append(p["id"])
    return added
