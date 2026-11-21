"""What the client's answers change on our side.

The LV is the client's document: a bidder prices it and does not rewrite it. What an answer changes is the
estimator's own picture of it — a finding is settled, a quantity the client corrected is the one to price,
a point left open needs an allowance in the price. The app proposes these from the reply (boq.mail); the
estimator accepts, changes or rejects each. Accepted amendments are laid over the LV where the app shows
and prices it; the file itself stays as it came, and every amendment keeps the passage it rests on.

Kinds:
- settle: the answer closes the question. value: note (what is settled, English), findings (the findings
  it closes, as "check|oz|evidence").
- note: the answer settles part of it. value: note. The findings stay open.
- quantity / unit / text: the client changed the item. value: to (as the reply writes it), and for
  quantity `number` (plain decimal).
- allowance: the point stays open and is priced as a risk. value: percent (set by the estimator, the app
  proposes none: it has no basis for a figure), note.
"""
import uuid

from sqlalchemy import delete, insert, select, update

from boq import db
from boq.mail import german_number

KINDS = ("settle", "note", "quantity", "unit", "text", "allowance")


def _row(row) -> dict:
    return {"id": row.id, "item_oz": row.item_oz, "kind": row.kind, "value": row.value, "quote": row.quote,
            "mail_id": row.mail_id, "key": row.key, "status": row.status,
            "created": row.created.isoformat(timespec="seconds"),
            "decided": row.decided.isoformat(timespec="seconds") if row.decided else None}


def from_answers(items: list[dict], answers: dict) -> list[dict]:
    """The amendments a read reply suggests, per question in the order asked."""
    out = []
    for q in items:
        a = answers.get(q["key"]) or {"status": "not_answered"}
        base = {"item_oz": q["item_oz"], "key": q["key"], "quote": a.get("quote", "")}
        if a["status"] == "answered":
            out.append({**base, "kind": "settle", "value": {"note": a["meaning"], "findings": q.get("findings", [])}})
        elif a["status"] == "partly":
            out.append({**base, "kind": "note", "value": {"note": a["meaning"]}})
        change = a.get("change")
        if change:
            value = {"to": change["value"]}
            if change["field"] == "quantity":
                value["number"] = german_number(change["value"])
            out.append({**base, "kind": change["field"], "value": value})
        if a["status"] != "answered":
            out.append({**base, "kind": "allowance", "value": {
                "percent": None,
                "note": "Left open by the client's reply." if a["status"] == "partly" else "Not answered by the client."}})
    return out


def propose(mail: dict) -> None:
    """Put the amendments the reply of this message suggests up for decision. What the estimator already
    decided for a question stays; proposals not yet decided are replaced (the reply was read again)."""
    with db.engine().begin() as conn:
        conn.execute(delete(db.amendments).where(db.amendments.c.mail_id == mail["id"],
                                                 db.amendments.c.status == "proposed"))
        decided = {(r.key, r.kind) for r in conn.execute(
            select(db.amendments.c.key, db.amendments.c.kind).where(db.amendments.c.mail_id == mail["id"]))}
        for a in from_answers(mail["items"], mail["answers"] or {}):
            if (a["key"], a["kind"]) not in decided:
                conn.execute(insert(db.amendments).values(
                    id=uuid.uuid4().hex, project_id=mail.get("project_id"), file=mail["file"], mail_id=mail["id"],
                    status="proposed", created=db.now(), **a))


def about(project_id: str | None, file: str) -> list[dict]:
    same_project = db.amendments.c.project_id.is_(None) if project_id is None else db.amendments.c.project_id == project_id
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.amendments).where(same_project, db.amendments.c.file == file)
                            .order_by(db.amendments.c.created, db.amendments.c.id)).all()
    return [_row(r) for r in rows]


def tally(project_id: str) -> dict | None:
    """How the changes from the client's answers stand on a project, for its card: those still to decide
    (the estimator's move), and of the accepted ones the quantities the client corrected and the allowances;
    None while no answer has proposed anything."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.amendments.c.kind, db.amendments.c.status)
                            .where(db.amendments.c.project_id == project_id)).all()
    if not rows:
        return None
    accepted = [r.kind for r in rows if r.status == "accepted"]
    return {"proposed": sum(1 for r in rows if r.status == "proposed"), "accepted": len(accepted),
            "quantities": accepted.count("quantity"), "allowances": accepted.count("allowance")}


def find(amendment_id: str) -> dict | None:
    with db.engine().connect() as conn:
        row = conn.execute(select(db.amendments).where(db.amendments.c.id == amendment_id)).first()
    return _row(row) if row else None


def decide(amendment_id: str, status: str, value: dict | None = None) -> dict:
    """Accept, reject or reopen an amendment; `value` replaces what it does (the estimator changed it).
    Raises ValueError where the amendment cannot be accepted as it stands."""
    found = find(amendment_id)
    if found is None:
        raise LookupError(amendment_id)
    if status not in ("proposed", "accepted", "rejected"):
        raise ValueError("status is proposed, accepted or rejected.")
    value = {**found["value"], **(value or {})}
    if status == "accepted":
        if found["kind"] == "quantity":
            number = german_number(str(value.get("to", ""))) or german_number(str(value.get("to", "")).replace(".", ","))
            if number is None:
                raise ValueError("Give the new quantity as a number.")
            value["number"] = number
        if found["kind"] == "allowance":
            try:
                value["percent"] = float(str(value.get("percent")).replace(",", "."))
            except (TypeError, ValueError):
                raise ValueError("Give the allowance in percent of the item's price.") from None
            if not 0 < value["percent"] <= 100:
                raise ValueError("The allowance is between 0 and 100 percent.")
        if found["kind"] in ("unit", "text", "note", "settle") and not str(value.get("to" if found["kind"] in ("unit", "text") else "note", "")).strip():
            raise ValueError("The amendment is empty.")
    with db.engine().begin() as conn:
        conn.execute(update(db.amendments).where(db.amendments.c.id == amendment_id).values(
            status=status, value=value, decided=None if status == "proposed" else db.now()))
    return find(amendment_id)


def discard_for(mail_id: str) -> None:
    with db.engine().begin() as conn:
        conn.execute(delete(db.amendments).where(db.amendments.c.mail_id == mail_id))
