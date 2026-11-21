"""What Polier did, in the order it did it: the record the estimator reads after being away.

One line per thing the app did on its own or read from outside: a tender found in the mail, a client's
answer read, a supplier's quote read, items that can be asked for now, a run that ended. Each line names
the project, says what happened in words, and whose move it leaves ("you", "client", "supplier", or
nobody). Kept in table `events`; the pages show the newest (boq.api).
"""
from sqlalchemy import insert, select

from boq import db

KINDS = ("tender", "answer", "quote", "asks", "decline", "released", "run", "call")


def record(project_id: str | None, kind: str, text: str, move: str = "") -> None:
    """Note one thing that happened. Never raises: the record must not break what it records."""
    try:
        with db.engine().begin() as conn:
            conn.execute(insert(db.events).values(created=db.now(), project_id=project_id, kind=kind,
                                                  text=text[:400], move=move))
    except Exception:
        pass


def latest(project_id: str | None = None, limit: int = 40, after: int = 0) -> list[dict]:
    """The newest events, newest first; of one project, or of all. `after`: only those with a higher id."""
    query = select(db.events).where(db.events.c.id > after).order_by(db.events.c.id.desc()).limit(limit)
    if project_id:
        query = query.where(db.events.c.project_id == project_id)
    with db.engine().connect() as conn:
        return [{"id": r.id, "at": r.created.isoformat(timespec="seconds"), "project_id": r.project_id,
                 "kind": r.kind, "text": r.text, "move": r.move} for r in conn.execute(query)]
