"""Partners: everything the firm knows about the suppliers and subcontractors it asks for prices.

boq.supply holds the directory and the inquiries of one LV. This module looks across all tenders, per firm:

- the prices a partner gave, each with its day, its validity and the tender it was for (`profile`, `book`),
- how it behaves: how often it answers, how fast, how often it is taken (`_card`),
- every message with it, the inquiries of the app and the older mail found in the mailbox or
  handed over as .eml (`timeline`, `take_messages`, `mailbox_history`),
- how it writes, read by Claude from its own messages with the passage for every claim (`read_style`), and
  an inquiry written that way (`restyle`): only the opening and the closing change, the items never,
- what is open with it across all tenders (`waiting`),
- firms found on the web for a material group or trade nobody in the directory covers (`discover`). A firm
  found is a candidate with the page it was found on; the estimator takes it into the directory or not,
  and the app writes to nobody on its own (D-044, D-047).

Rule of the house: no claim without its passage. A style trait whose quote is not in the partner's own
messages is dropped, a firm whose page was not among the search results is dropped.
"""
import asyncio
import email
import email.policy
import imaplib
import json
import re
import statistics
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from email.utils import getaddresses, parseaddr, parsedate_to_datetime
from urllib.parse import urlparse

import anthropic
from sqlalchemy import delete, insert, select, update

from boq import catalog, db, engines, mail, spend, supply
from boq.checks.llm import _NO_CREDENTIALS, MODEL, REQUEST_TIMEOUT_S, LLMUnavailable

STALE_DAYS = supply.QUOTE_FRESH_DAYS
SEARCH_USD = 0.01  # one web search, at list price
FREEMAIL = {"gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de", "t-online.de", "outlook.com", "hotmail.com",
            "yahoo.com", "yahoo.de", "icloud.com", "freenet.de", "posteo.de", "mailbox.org"}


def _at(iso: str | None) -> datetime | None:
    try:
        when = datetime.fromisoformat(iso or "")
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _iso(when: datetime | None) -> str | None:
    return when.isoformat(timespec="seconds") if when else None


def _squash(text: str) -> str:
    return " ".join((text or "").split())


# ------------------------------------------------------------------ what is on record

def _records() -> dict:
    """Everything the pages are worked out from, read once: inquiries, quotes, older mail, plans, projects."""
    with db.engine().connect() as conn:
        mails = [mail._row(r) for r in conn.execute(select(db.mails).where(db.mails.c.kind == supply.PRICE_INQUIRY)
                                                    .order_by(db.mails.c.created))]
        older = [{"id": r.id, "supplier_id": r.supplier_id, "at": _iso(r.at), "direction": r.direction,
                  "subject": r.subject, "text": r.text, "via": r.via}
                 for r in conn.execute(select(db.partner_messages).order_by(db.partner_messages.c.at))]
        plans = [supply._plan_row(r) for r in conn.execute(select(db.supply_plans))]
    quotes = supply.all_quotes()
    projects = {p["id"]: p for p in catalog.all_projects()}
    threads: dict[tuple, list[dict]] = {}
    for m in mails:
        meta = m["meta"] or {}
        threads.setdefault((meta.get("supplier_id"), m["project_id"], m["file"], meta.get("package")), []).append(m)
    return {"mails": {m["id"]: m for m in mails}, "threads": threads, "quotes": quotes, "older": older,
            "plans": {(p["project_id"], p["file"]): p for p in plans}, "projects": projects,
            "quoted": {q["mail_id"] for q in quotes}}


def _where(rec: dict, project_id: str | None, file: str, package: str | None) -> dict:
    """The tender and the package a message or a quote belongs to, as the pages name and link it."""
    project = rec["projects"].get(project_id or "")
    plan = rec["plans"].get((project_id, file))
    name = next((p["name"] for p in (plan or {"plan": {"packages": []}})["plan"]["packages"] if p["id"] == package), "")
    index = next((n for n, f in enumerate((project or {}).get("files") or []) if f["name"] == file), None)
    return {"project_id": project["id"] if project else None, "project": project["name"] if project else file,
            "file": index, "package": name, "due": ((project or {}).get("plan") or {}).get("due")}


def _thread(rec: dict, key: tuple, ms: list[dict]) -> dict:
    """One conversation (a package of one tender with one partner) and whose move it is."""
    last = ms[-1]
    said = (last["answers"] or {}) if last["reply"] else None
    sent = next((m for m in ms if m["sent_at"]), None)
    status = ("question" if said is not None and (said.get("asks") or said.get("kind") == "question")
              else "answered" if any(m["id"] in rec["quoted"] for m in ms)
              else "declined" if said is not None and said.get("kind") == "decline"
              else "later" if said is not None else "sent" if last["sent_at"] else "drafted")
    since = _at(last["reply_at"] if last["reply"] else last["sent_at"] or last["created"])
    return {**_where(rec, key[1], key[2], key[3]), "supplier_id": key[0], "status": status,
            "subject": ms[0]["subject"], "since": _iso(since),
            "days": (datetime.now(timezone.utc) - since).days if since else None,
            "reminders": sum(1 for m in ms if (m["meta"] or {}).get("kind") == "reminder"),
            "first_sent": sent and sent["sent_at"], "summary": (said or {}).get("summary") or "",
            "asks": len((said or {}).get("asks") or []), "example": bool((ms[0]["meta"] or {}).get("example")),
            "questions": [str(a.get("question") or "").strip() for a in (said or {}).get("asks") or [] if a.get("question")],
            # what the follow-up from the partners page needs to find the conversation again
            "package_id": key[3], "file_name": key[2]}


def _via(m: dict | None) -> str:
    if m is None:
        return ""
    return "sheet" if (m["reply"] or "").startswith("(Excel") else "e-mail" if m["reply_via"] == "imap" else "reply pasted"


def _prices(rec: dict, supplier_id: str | None = None) -> list[dict]:
    """Every price on record, one row per quoted line, newest first; each with what it rests on. A row
    knows the price the same partner gave for the same thing before (`before`), so a change shows."""
    today, rows = date.today(), []
    for q in rec["quotes"]:
        if supplier_id is not None and q["supplier_id"] != supplier_id:
            continue
        terms, m = q["terms"] or {}, rec["mails"].get(q["mail_id"])
        where = _where(rec, q["project_id"], q["file"], q["package"])
        for line in q["lines"]:
            rows.append({"supplier_id": q["supplier_id"], "label": line.get("label") or line.get("product") or line.get("oz", ""),
                         "oz": line.get("oz", ""), "unit": line.get("unit", ""), "unit_price": line["unit_price"],
                         "net": round(supply._net(line, terms), 4), "product": line.get("product", ""),
                         "alternative": bool(line.get("alternative")), "note": line.get("note", ""),
                         "date": q["created"][:10], "valid_until": terms.get("valid_until") or None,
                         "fresh": supply._fresh(q, today), "binding": terms.get("binding") or "unknown",
                         "basis": terms.get("basis") or "unknown", "via": _via(m), "quote": q["id"],
                         "example": bool(terms.get("example")), **{k: where[k] for k in ("project_id", "project", "file", "package")},
                         # what "ask again" needs to write the inquiry for the same package once more
                         "package_id": q["package"], "file_name": q["file"]})
    rows.sort(key=lambda r: r["date"])
    last: dict[tuple, dict] = {}
    for r in rows:
        key = (r["supplier_id"], supply._same(r["label"]), supply._unit(r["unit"]) if r["unit"] else "")
        before = last.get(key)
        r["before"] = before and {"net": before["net"], "date": before["date"],
                                  "change_pct": round((r["net"] / before["net"] - 1) * 100, 1) if before["net"] else None}
        last[key] = r
    return rows[::-1]


def _card(rec: dict, s: dict, prices: list[dict]) -> dict:
    """How a partner behaves, counted from what is on record: nothing here is an opinion."""
    threads = [_thread(rec, key, ms) for key, ms in rec["threads"].items() if key[0] == s["id"]]
    asked = [t for t in threads if t["first_sent"]]
    hours = []
    for key, ms in rec["threads"].items():
        if key[0] != s["id"]:
            continue
        first = next((m for m in ms if m["reply"] and m["sent_at"]), None)
        a, b = first and _at(ms[0]["sent_at"] or first["sent_at"]), first and _at(first["reply_at"])
        if a and b and b > a:
            hours.append((b - a).total_seconds() / 3600)
    mine = {q["id"] for q in rec["quotes"] if q["supplier_id"] == s["id"]}
    taken = sum(1 for p in rec["plans"].values() for c in (p["chosen"] or {}).values()
                if c and c.get("mode") == "single" and c.get("quote") in mine)
    older = [o for o in rec["older"] if o["supplier_id"] == s["id"]]
    days = [x for x in [*(t["since"] for t in threads), *(o["at"] for o in older), *(p["date"] for p in prices)] if x]
    answered = sum(1 for t in asked if t["status"] in ("answered", "question", "declined", "later"))
    return {"asked": len(asked), "answered": answered,
            "answer_rate": round(answered / len(asked) * 100) if asked else None,
            "reply_hours": round(statistics.median(hours), 1) if hours else None,
            "quotes": len(mine), "prices": len(prices), "stale": sum(1 for p in prices if not p["fresh"]),
            "latest_price": max((p["date"] for p in prices), default=None),
            "alternatives": sum(1 for p in prices if p["alternative"]),
            "declined": sum(1 for t in threads if t["status"] == "declined"),
            "reminders": sum(t["reminders"] for t in threads),
            "taken": taken, "messages": len(older) + sum(len(ms) for k, ms in rec["threads"].items() if k[0] == s["id"]),
            "last_contact": max(days)[:10] if days else None,
            "open": [t for t in threads if t["status"] in ("sent", "question", "later", "drafted")]}


def notes() -> dict[str, str]:
    """Per firm, what the plan of an inquiry should know about it, in a few words: preferred, how often it
    answered and how fast. Only what is on record; a firm never asked gets no note."""
    rec, out = _records(), {}
    for s in supply.suppliers():
        c = _card(rec, s, [])
        said = ["preferred"] if s["more"].get("preferred") else []
        if c["asked"]:
            said.append(f"answered {c['answered']} of {c['asked']} inquiries"
                        + (f", first reply after {round(c['reply_hours'])} h" if c["reply_hours"] is not None else ""))
        if said:
            out[s["id"]] = "; ".join(said)
    return out


def _usual(rec: dict, supplier_id: str) -> dict | None:
    """The terms a partner usually quotes on, from its quotes: said only where a quote says it."""
    quotes = [q for q in rec["quotes"] if q["supplier_id"] == supplier_id]
    if not quotes:
        return None
    terms = [q["terms"] or {} for q in quotes]
    most = lambda values: max(set(values), key=values.count) if values else None  # noqa: E731
    valid = []
    for q in quotes:
        try:
            valid.append((date.fromisoformat((q["terms"] or {}).get("valid_until") or "") - date.fromisoformat(q["created"][:10])).days)
        except ValueError:
            pass
    discounts = [t["discount_pct"] for t in terms if t.get("discount_pct")]
    freights = [t["freight"] for t in terms if t.get("freight")]
    return {"quotes": len(quotes), "basis": most([t.get("basis") for t in terms if t.get("basis") in ("free_to_site", "ex_works")]),
            "discount_pct": round(statistics.median(discounts), 1) if discounts else None,
            "freight": round(statistics.median(freights), 2) if freights else None,
            "skonto": most([t["skonto"] for t in terms if t.get("skonto")]),
            "valid_days": round(statistics.median(valid)) if valid else None,
            "binding": most([t.get("binding") for t in terms if t.get("binding") in ("binding", "non_binding")])}


def timeline(rec: dict, supplier_id: str) -> list[dict]:
    """Every message with a partner, newest first: what the app sent with what came back on it,
    and the older mail found in the mailbox."""
    out = []
    for key, ms in rec["threads"].items():
        if key[0] != supplier_id:
            continue
        where = _where(rec, key[1], key[2], key[3])
        for m in ms:
            meta = m["meta"] or {}
            kind = meta.get("kind") or "inquiry"
            if kind == "call":  # a call kept from before the voice agent was taken out (D-059)
                continue
            base = {"mail_id": m["id"], "subject": m["subject"], "example": bool(meta.get("example")),
                    **{k: where[k] for k in ("project_id", "project", "file", "package")}}
            out.append({**base, "id": m["id"], "kind": kind, "direction": "out", "at": m["sent_at"] or m["created"],
                        "draft": not m["sent_at"], "via": m["via"],
                        "text": m["body"]})
            if m["reply"]:
                said = m["answers"] or {}
                out.append({**base, "id": m["id"] + "r", "kind": "reply",
                            "direction": "in", "at": m["reply_at"] or m["created"], "draft": False,
                            "via": m["reply_via"] or "", "text": m["reply"], "reply_kind": said.get("kind") or "quote",
                            "summary": said.get("summary") or "", "priced": m["id"] in rec["quoted"]})
    for o in rec["older"]:
        if o["supplier_id"] == supplier_id:
            out.append({"id": o["id"], "mail_id": None, "kind": "mail", "direction": o["direction"], "at": o["at"],
                        "draft": False, "via": o["via"], "subject": o["subject"], "text": o["text"],
                        "example": o["via"] == "demo", "project_id": None, "project": "", "file": None, "package": ""})
    return sorted(out, key=lambda e: e["at"] or "", reverse=True)


def overview() -> dict:
    """The page: every partner with its card, what waits across all tenders, the price book, the groups
    and who covers them, and the gaps (a package of a plan with nobody to ask)."""
    rec = _records()
    directory = supply.suppliers()
    names = {s["id"]: s["name"] for s in directory}
    prices = _prices(rec)
    partners = []
    for s in directory:
        mine = [p for p in prices if p["supplier_id"] == s["id"]]
        read = s["more"].get("read") or {}
        partners.append({**s, "more": {**s["more"], "style": bool(s["more"].get("style")), "read": bool(read)},
                         # the first sentence of Polier's read, for the register
                         "gist": next((p["text"] for p in read.get("points") or []), ""),
                         "card": _card(rec, s, mine)})
    waiting = sorted((t | {"supplier": names.get(t["supplier_id"], "(removed)")} for p in partners for t in p["card"]["open"]),
                     key=lambda t: (t["status"] not in ("question", "drafted"), t["due"] or "9999", -(t["days"] or 0)))
    book: dict[tuple, dict] = {}
    for p in prices:
        key = (supply._same(p["label"]), supply._unit(p["unit"]) if p["unit"] else "")
        entry = book.setdefault(key, {"label": p["label"], "unit": p["unit"], "offers": []})
        entry["offers"].append({**p, "supplier": names.get(p["supplier_id"], "(removed)")})
    rows = []
    for entry in book.values():
        fresh = [o["net"] for o in entry["offers"] if o["fresh"]]
        rows.append({**entry, "low": min(fresh) if fresh else None, "latest": entry["offers"][0]["date"],
                     "suppliers": len({o["supplier_id"] for o in entry["offers"]})})
    rows.sort(key=lambda r: r["label"].lower())
    cover: dict[str, dict] = {}
    for s in directory:
        for g in s["groups"]:
            entry = cover.setdefault(g.lower(), {"group": g, "kind": s["kind"], "partners": []})
            entry["partners"].append({"id": s["id"], "name": s["name"]})
    return {"partners": partners, "waiting": waiting, "book": rows,
            "coverage": sorted(cover.values(), key=lambda c: (len(c["partners"]), c["group"].lower())),
            "gaps": gaps(rec), "needs": needs(rec), "inbox": (mail.inbox() or {}).get("user") or None,
            "discovery": discovery(), "company": supply.company()}


def profile(supplier_id: str) -> dict | None:
    s = supply.supplier(supplier_id)
    if s is None:
        return None
    rec = _records()
    prices = _prices(rec, supplier_id)
    return {**s, "card": _card(rec, s, prices), "prices": prices, "usual": _usual(rec, supplier_id),
            "timeline": timeline(rec, supplier_id)}


def gaps(rec: dict | None = None) -> list[dict]:
    """Packages of the plans with nobody in the directory to ask: what a web search is for."""
    rec = rec or _records()
    out, seen = [], set()
    for (project_id, file), plan in rec["plans"].items():
        for p in plan["plan"]["packages"]:
            key = supply._same(p["name"])
            if p["ask"] or key in seen:
                continue
            seen.add(key)
            where = _where(rec, project_id, file, p["id"])
            out.append({"what": p["name"], "kind": "subcontractor" if p["kind"] == "subcontract" else "supplier",
                        "project_id": where["project_id"], "project": where["project"], "items": len(p["items"])})
    return out


def needs(rec: dict | None = None) -> list[dict]:
    """What the tenders need bought or subcontracted, package by package, and who can be asked for each:
    every firm on the package with where the conversation with it stands ("unasked" before the first
    message). `active` marks the tenders an inquiry has gone out for."""
    rec = rec or _records()
    out = []
    for (project_id, file), plan in rec["plans"].items():
        active = any(k[1] == project_id and k[2] == file for k in rec["threads"])
        for p in plan["plan"]["packages"]:
            firms = []
            for sid in p["ask"]:
                key = (sid, project_id, file, p["id"])
                ms = rec["threads"].get(key)
                firms.append({"id": sid, "status": _thread(rec, key, ms)["status"] if ms else "unasked"})
            out.append({**_where(rec, project_id, file, p["id"]), "package_id": p["id"], "file_name": file,
                        "kind": "subcontractor" if p["kind"] == "subcontract" else "supplier",
                        "why": p.get("why") or "", "items": len(p["items"]), "active": active, "firms": firms,
                        "chosen": bool((plan["chosen"] or {}).get(p["id"]))})
    return out


# ------------------------------------------------------------------ Claude

async def _json(purpose: str, system: str, content: str, schema: dict, client: anthropic.AsyncAnthropic | None = None) -> dict:
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    started = time.monotonic()
    try:
        response = await client.beta.messages.create(
            model=engines.of("partners", MODEL), max_tokens=12000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": engines.effort("partners"), "format": {"type": "json_schema", "schema": schema}},
            system=system, messages=[{"role": "user", "content": content}])
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable("No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
                             "root (see .env.example) and restart the server.") from exc
    spend.answered(purpose, response, engines.of("partners", MODEL), ms=round((time.monotonic() - started) * 1000))
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"{purpose} stopped with {response.stop_reason}")
    return {"data": json.loads(next(b.text for b in response.content if b.type == "text")), "response": response}


def _usd(response) -> float:
    u = getattr(response, "usage", None)
    return spend.usd(getattr(response, "model", None) or MODEL, {
        "input_tokens": getattr(u, "input_tokens", 0) or 0, "output_tokens": getattr(u, "output_tokens", 0) or 0,
        "cache_read_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
        "cache_write_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0}) or 0.0


# ------------------------------------------------------------------ how a partner writes

_QUOTED = {"type": "object", "properties": {"text": {"type": "string"}, "quote": {"type": "string"}},
           "required": ["text", "quote"], "additionalProperties": False}
STYLE_SCHEMA = {
    "type": "object",
    "properties": {
        "address": {"type": "string", "enum": ["Sie", "Du", "unknown"]},
        "address_quote": {"type": "string"},
        "salutation": {"type": "string"},
        "closing": {"type": "string"},
        "register": {"type": "string", "enum": ["formal", "neutral", "casual"]},
        "length": {"type": "string", "enum": ["short", "medium", "long"]},
        "answers_with": {"type": "string", "enum": ["filled sheet", "prices in the mail", "quote as a document", "unknown"]},
        "person": {"type": "string"},
        "habits": {"type": "array", "items": _QUOTED},
        "summary": {"type": "string"},
        "write_like": {"type": "string"},
    },
    "required": ["address", "address_quote", "salutation", "closing", "register", "length", "answers_with", "person",
                 "habits", "summary", "write_like"],
    "additionalProperties": False,
}

STYLE_SYSTEM = """\
You work for the estimator of a German construction contractor. You are given the messages exchanged with \
one supplier or subcontractor: theirs (<them>) and the firm's own (<us>). Describe how THEY write, so that \
the next price inquiry to them can be written in a way that fits: people answer a message that sounds like \
the way they work together sooner than a form letter.

Judge only from their own messages. Every claim needs its passage:

- address: whether they address the firm with "Sie" or "Du"; address_quote is the passage of one of their \
messages that shows it, copied character for character. unknown and an empty quote if no message shows it.
- salutation: the opening line they use, as written ("Moin Herr Kaya,", "Sehr geehrte Damen und Herren,"). \
closing: their closing formula as written ("Viele Grüße", "Mit freundlichen Grüßen"). Both must stand in \
one of their messages word for word; empty if they use none.
- register: formal, neutral or casual. length: how long their messages are.
- answers_with: how their prices arrive, if the messages show it: the filled-in sheet, prices typed into \
the mail, a quote as a document (PDF); else unknown.
- person: the name of the person who writes, as signed; empty if no message is signed by a person.
- habits: up to six things an estimator should know before writing to them or reading their quote, each \
with its passage (quote, character for character, at most 200 characters) from THEIR messages: e.g. always \
quotes ex works, asks for the delivery date first, answers only after a reminder, offers their house brand \
as an alternative. text is one English sentence. A habit needs to \
show in the messages; do not generalise from what is usual in the trade.
- summary: two English sentences for the estimator on how this partner communicates.
- write_like: one to three sentences of guidance, in English, for writing the next inquiry to them: how to \
address them, how long, what to put first. Only what the messages support.

The messages may be anonymised: tokens such as [FIRMA_044] replace names; use them as they stand.
"""


# ------------------------------------------------------------------ Polier's read of a partner

READ_SCHEMA = {
    "type": "object",
    "properties": {"points": {"type": "array", "items": {
        "type": "object",
        "properties": {"topic": {"type": "string", "enum": ["terms", "questions", "reliability", "products", "prices", "other"]},
                       "text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "string"}},
                       "quote": {"type": "string"}},
        "required": ["topic", "text", "sources", "quote"], "additionalProperties": False}}},
    "required": ["points"], "additionalProperties": False,
}
READ_SYSTEM = """\
You work for the estimator of a German construction contractor. You are given what is on record about one \
supplier or subcontractor: facts counted from the record (<fact id="F1">) and the messages exchanged with it \
(<message id="M1" from="them" or "us">). Write what the estimator should know about this firm before asking \
it for a price or reading its quote: how reliably and how fast it answers, what it asks back before it \
quotes, on which terms it prices, whether it offers other products than specified, how its prices have moved.

Rules:
- Three to five points, each one plain English sentence of at most 30 words. The most useful first.
- Every point has a topic, and no two points share one: terms (on which terms it prices: ex works, freight, \
payment, validity, binding), questions (what it asks back before it quotes), reliability (whether and how fast \
it answers), products (other products than specified, what it does not supply), prices (how its prices have \
moved), other.
- Every point names its sources: the ids of the facts and messages it rests on. A point without a source is \
not written. Do not use what is usual in the trade; only what stands in the facts and messages.
- A point that rests on a message carries in quote the passage of that message that shows it, copied \
character for character, at most 200 characters. A point that rests only on facts has an empty quote.
- Every figure in a point must stand in one of its sources as written there (a count, a percentage, a price, \
a number of days). Do not convert or round figures yourself.
- Say nothing about what the record does not show. If the record is thin, write fewer points.

The record may be anonymised: tokens such as [FIRMA_044] replace names; use them as they stand.
"""
_FIGURE = re.compile(r"\d+(?:[.,]\d+)*")


def _figures(text: str) -> set[str]:
    """The figures of a text worth checking (two digits or more, or with a decimal), written one way."""
    return {f.replace(".", "").replace(",", ".").rstrip("0").rstrip(".") if ("," in f or "." in f) else f
            for f in _FIGURE.findall(text) if len(f) > 1}


async def read_firm(supplier_id: str, client: anthropic.AsyncAnthropic | None = None) -> dict:
    """What an estimator should know about a partner, in a few sentences, each resting on facts of the record
    or passages of its messages, and kept with it. A sentence whose source, passage or figure does not stand
    is dropped. Raises ValueError when nothing is on record."""
    p = profile(supplier_id)
    if p is None:
        raise ValueError("This partner is no longer in the directory.")
    c, usual, facts = p["card"], p["usual"], {}

    def fact(text: str) -> None:
        facts[f"F{len(facts) + 1}"] = text

    if c["asked"]:
        fact(f"Inquiries sent to this firm: {c['asked']}. Answered: {c['answered']} ({c['answer_rate']} %). "
             f"Declined: {c['declined']}. Quotes received: {c['quotes']}. Reminders that had to be sent: {c['reminders']}. "
             f"Times its quote was taken into a bid: {c['taken']}.")
    if c["reply_hours"] is not None:
        h = c["reply_hours"]
        fact(f"Median time to its first reply: {h:.0f} hours" + (f" (about {h / 24:.0f} days)." if h >= 36 else "."))
    if usual:
        fact(f"Usual terms over its {usual['quotes']} quotes: prices {(usual['basis'] or 'not stated').replace('_', ' ')}"
             + (f", freight about {usual['freight']:.0f} EUR on top" if usual["freight"] is not None else "")
             + (f"; discount {usual['discount_pct']:g} % on all items" if usual["discount_pct"] is not None else "")
             + (f"; payment: {usual['skonto']}" if usual["skonto"] else "")
             + (f"; valid for about {usual['valid_days']} days" if usual["valid_days"] is not None else "")
             + f"; {(usual['binding'] or 'not stated').replace('_', ' ')}.")
    if c["prices"]:
        fact(f"Prices on record: {c['prices']}, of which out of date: {c['stale']}; the latest is of {c['latest_price']}. "
             f"Lines where it offered another product than the one specified: {c['alternatives']}.")
    for r in [r for r in p["prices"] if r["before"] and r["before"]["change_pct"] is not None][:8]:
        fact(f"Its price for {r['label']}: {r['before']['net']:.2f} EUR per {r['unit']} on {r['before']['date']}, "
             f"{r['net']:.2f} EUR on {r['date']}: {r['before']['change_pct']:+.1f} %.")
    for t in c["open"]:
        fact(f"Open now: {t['status']} for {t['days']} days, about {t['package'] or t['subject']}"
             + (f", reminded {t['reminders']} times" if t["reminders"] else "") + ".")
    talk = sorted((e for e in p["timeline"] if e["text"] and not e["draft"]), key=lambda e: e["at"] or "")[-30:]
    messages = {f"M{n}": e for n, e in enumerate(talk, 1)}
    if not facts and not messages:
        raise ValueError("Nothing is on record about this partner yet: no inquiry, no quote, no message.")
    listed = "\n".join(f'<fact id="{k}">{v}</fact>' for k, v in facts.items()) + "\n\n" + "\n\n".join(
        f'<message id="{k}" from="{"them" if e["direction"] == "in" else "us"}" date="{(e["at"] or "")[:10]}">\n{e["text"][:2500]}\n</message>'
        for k, e in messages.items())
    raw = (await _json("partner read", READ_SYSTEM, f"<record>\n{listed}\n</record>", READ_SCHEMA, client))["data"]
    points = []
    for point in raw["points"][:6]:
        ids = [i for i in dict.fromkeys(point["sources"]) if i in facts or i in messages]
        said = [messages[i] for i in ids if i in messages]
        quote = _squash(point["quote"]).strip("…\"„“' ")
        if not ids or (said and not (len(quote) >= 8 and any(quote in _squash(m["text"]) for m in said))):
            continue
        ground = " ".join([facts[i] for i in ids if i in facts] + [m["text"] for m in said])
        if not _figures(point["text"]) <= _figures(ground):
            continue
        points.append({"topic": point["topic"], "text": str(point["text"]).strip()[:300], "quote": quote[:240] if said else "",
                       "sources": [{"id": i, "kind": "fact", "text": facts[i]} if i in facts else
                                   {"id": i, "kind": "message", "event": messages[i]["id"], "at": messages[i]["at"],
                                    "who": "them" if messages[i]["direction"] == "in" else "us",
                                    "text": messages[i]["subject"] or ""} for i in ids]})
    read = {"points": points[:5], "dropped": len(raw["points"]) - len(points), "at": _iso(db.now()),
            "basis": {"inquiries": c["asked"], "quotes": c["quotes"], "messages": len(messages)}}
    supply.save_supplier({"more": {"read": read}}, supplier_id)
    return read


def _talk(supplier_id: str, rec: dict | None = None, limit: int = 40) -> list[dict]:
    """What was written and said between the firm and a partner, oldest first: who, when, the text."""
    rec = rec or _records()
    out = [{"who": "them" if e["direction"] == "in" else "us", "at": e["at"] or "", "text": e["text"], "kind": e["kind"]}
           for e in timeline(rec, supplier_id) if e["text"] and not e["draft"]]
    return sorted(out, key=lambda e: e["at"])[-limit:]


async def read_style(supplier_id: str, client: anthropic.AsyncAnthropic | None = None) -> dict:
    """How a partner writes, read from its own messages and kept with it. Raises ValueError when there is
    no message of theirs to read."""
    talk = _talk(supplier_id)
    theirs = [t for t in talk if t["who"] == "them" and t["kind"] != "transcript"]
    if not theirs:
        raise ValueError("There is no message from this partner to read a style from yet.")
    listed = "\n\n".join(f"<{t['who']} date=\"{t['at'][:10]}\">\n{t['text'][:4000]}\n</{t['who']}>" for t in talk)
    raw = (await _json("partner's style read", STYLE_SYSTEM, f"<messages>\n{listed}\n</messages>", STYLE_SCHEMA, client))["data"]
    said = _squash(" \n ".join(t["text"] for t in theirs))
    stands = lambda q: len(_squash(q)) >= 2 and _squash(q).strip("…\"„“' ") in said  # noqa: E731
    address = raw["address"] if raw["address"] in ("Sie", "Du") and stands(raw["address_quote"]) else "unknown"
    habits = [{"text": str(h["text"]).strip()[:300], "quote": _squash(h["quote"])[:240]} for h in raw["habits"] if stands(h["quote"])]
    style = {"address": address, "address_quote": _squash(raw["address_quote"])[:240] if address != "unknown" else "",
             "salutation": raw["salutation"].strip() if stands(raw["salutation"]) else "",
             "closing": raw["closing"].strip() if stands(raw["closing"]) else "",
             "register": raw["register"], "length": raw["length"], "answers_with": raw["answers_with"],
             "person": raw["person"].strip() if stands(raw["person"]) else "",
             "habits": habits[:6], "dropped": len(raw["habits"]) - len(habits),
             "summary": str(raw["summary"]).strip()[:500], "write_like": str(raw["write_like"]).strip()[:500],
             "messages": len(theirs), "at": _iso(db.now())}
    supply.save_supplier({"more": {"style": style}}, supplier_id)
    return style


RESTYLE_SCHEMA = {
    "type": "object",
    "properties": {"opening": {"type": "string"}, "closing": {"type": "string"},
                   "changed": {"type": "array", "items": {"type": "string"}}},
    "required": ["opening", "closing", "changed"],
    "additionalProperties": False,
}

RESTYLE_SYSTEM = """\
You work for the estimator of a German construction contractor. A price inquiry to a supplier or \
subcontractor has been written from a template. You are given how this recipient writes (read from the \
earlier messages with them), and the opening and the closing of the inquiry; the list of items between \
them is not shown and is not yours to change. Rewrite the opening and the closing in German so that they \
fit the way the firm and this recipient talk to each other.

- Follow the recipient's style: the form of address (Sie or Du) throughout, a salutation that matches \
theirs (to the person named, if one is), their register and length. A recipient who writes three lines \
gets a short message; a formal one gets a formal one.
- Keep every fact: who asks, the job and its number, what is asked for per item (price, make and type, \
an alternative to be marked, delivery time or execution period, discount, cash discount, validity), every \
date exactly as written (TT.MM.JJJJ), the note that the quantities are those of the bill of quantities, \
the note on the Excel file, and any sentence on VOB/B or the client's conditions. You may shorten how it \
is said, never what is asked.
- The opening ends where the list of items begins, so it must lead into a list. The closing begins after \
the list.
- The signature lines after the closing formula stay exactly as given, each on its own line.
- Add nothing the template does not say: no promise of an order, no negotiation, no reference to earlier \
jobs or prices, no small talk about things you do not know.

changed: up to four short English notes on what you changed and which trait of the recipient it follows.
"""

_DATE = re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b")


def _split(body: str) -> tuple[str, str, str] | None:
    """An inquiry as opening, items, closing: the items are the lines from the first "Pos." to the last
    one with the indented description under it."""
    lines = body.rstrip("\n").split("\n")
    at = [n for n, line in enumerate(lines) if line.startswith("Pos. ")]
    if not at:
        return None
    end = at[-1] + 1
    while end < len(lines) and lines[end].startswith("    "):
        end += 1
    return "\n".join(lines[:at[0]]).rstrip(), "\n".join(lines[at[0]:end]), "\n".join(lines[end:]).strip("\n")


async def restyle(body: str, style: dict, to: dict, client: anthropic.AsyncAnthropic | None = None) -> dict | None:
    """The inquiry with its opening and closing written the way this partner is written to; the items stay
    as they are. None when the result lost a date or a line of the signature: then the template goes out."""
    parts = _split(body)
    if parts is None:
        return None
    opening, items, closing = parts
    trait = "\n".join(x for x in (
        f"addresses us with: {style['address']}" if style.get("address") in ("Sie", "Du") else "",
        f"their salutation: {style['salutation']}" if style.get("salutation") else "",
        f"their closing: {style['closing']}" if style.get("closing") else "",
        f"register: {style.get('register')}, length of their messages: {style.get('length')}",
        f"the person who writes: {style['person']}" if style.get("person") else "",
        f"our contact there: {to['contact']}" if to.get("contact") else "",
        f"guidance: {style['write_like']}" if style.get("write_like") else "") if x)
    raw = (await _json("inquiry written in the partner's style", RESTYLE_SYSTEM,
                       f"<recipient>\n{trait}\n</recipient>\n\n<opening>\n{opening}\n</opening>\n\n"
                       f"<closing>\n{closing}\n</closing>", RESTYLE_SCHEMA, client))["data"]
    new_open, new_close = raw["opening"].strip(), raw["closing"].strip()
    signature = closing.split("freundliche Grüße")[-1].split("\n")[1:] if "freundliche Grüße" in closing else []
    kept = (set(_DATE.findall(opening + closing)) <= set(_DATE.findall(new_open + new_close))
            and all(line.strip() in new_close for line in signature if line.strip()) and new_open and new_close)
    if not kept:
        return None
    return {"body": f"{new_open}\n\n{items}\n\n{new_close}\n", "changed": [str(c).strip()[:200] for c in raw["changed"]][:4]}


def style_note(style: dict | None) -> str:
    """A partner's style as a line for another prompt (the answer to what a supplier asked back)."""
    if not style:
        return ""
    return "; ".join(x for x in (
        f"address them with {style['address']}" if style.get("address") in ("Sie", "Du") else "",
        f"their own salutation is „{style['salutation']}“" if style.get("salutation") else "",
        f"register {style.get('register')}, their messages are {style.get('length')}",
        style.get("write_like") or "") if x)


# ------------------------------------------------------------------ older mail: the mailbox, .eml files

def _addresses(directory: list[dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Who an address belongs to: by the address itself (also of the further contacts), and by its domain
    where the domain is the firm's own."""
    exact, domain = {}, {}
    for s in directory:
        for address in [s["email"], *(c.get("email", "") for c in s["more"].get("contacts") or [])]:
            address = (address or "").strip().lower()
            if "@" in address:
                exact[address] = s["id"]
                host = address.split("@")[1]
                if host not in FREEMAIL:
                    domain.setdefault(host, s["id"])
    return exact, domain


def _whose(address: str, exact: dict, domain: dict) -> str | None:
    address = address.strip().lower()
    return exact.get(address) or domain.get(address.split("@")[-1]) if "@" in address else None


def _ours() -> set[str]:
    with db.engine().connect() as conn:
        return {r.message_id for r in conn.execute(select(db.mails.c.message_id).where(db.mails.c.message_id.isnot(None)))}


def take_messages(raws: list[bytes], via: str = "eml") -> dict:
    """Messages as a mail program saves them, put to the partner they are from or to. A message the app
    sent itself, or one that answers such a message, is left out: it is in the conversation already. What
    belongs to nobody in the directory is counted by sender (`unknown`), so the estimator can add the firm."""
    exact, domain = _addresses(supply.suppliers())
    ours, kept, unknown, known = _ours(), 0, {}, 0
    with db.engine().begin() as conn:
        have = {r.message_id for r in conn.execute(select(db.partner_messages.c.message_id)) if r.message_id}
        for raw in raws:
            message = email.message_from_bytes(raw, policy=email.policy.default)
            mid = str(message.get("Message-ID") or "").strip()
            names = f"{message.get('In-Reply-To') or ''} {message.get('References') or ''}"
            if (mid and (mid in ours or mid in have)) or any(o in names for o in ours if o):
                known += 1
                continue
            sender_name, sender = parseaddr(str(message.get("From") or ""))
            to = [a for _, a in getaddresses([str(message.get("To") or ""), str(message.get("Cc") or "")])]
            whose, direction = _whose(sender, exact, domain), "in"
            if whose is None:
                whose, direction = next((w for w in (_whose(a, exact, domain) for a in to) if w), None), "out"
            text = mail.reply_text(message)
            if whose is None or not text:
                if "@" in sender and text:
                    entry = unknown.setdefault(sender.lower(), {"email": sender.lower(), "name": sender_name or sender, "messages": 0})
                    entry["messages"] += 1
                continue
            try:
                at = parsedate_to_datetime(str(message.get("Date")))
                at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                at = db.now()
            conn.execute(insert(db.partner_messages).values(
                id=uuid.uuid4().hex, supplier_id=whose, at=at, direction=direction, via=via,
                subject=" ".join(str(message.get("Subject") or "").split())[:300], text=text[:20000], message_id=mid or None))
            have.add(mid)
            kept += 1
    return {"kept": kept, "known": known, "unknown": sorted(unknown.values(), key=lambda u: -u["messages"])[:20]}


_SENT_FOLDERS = ("[Gmail]/Sent Mail", "[Gmail]/Gesendet", "Sent", "Gesendet", "Sent Items", "INBOX.Sent", "Sent Messages")


def mailbox_history(years: int = 2, per_partner: int = 60) -> dict:
    """Look into the mailbox for the mail exchanged with every partner that has an address: what they sent
    (inbox) and what was sent to them (the folder of sent mail, where one is found). Read-only."""
    box = mail.inbox()
    if box is None:
        raise mail.MailUnavailable("No inbox is set. Put IMAP_HOST (and IMAP_USER, IMAP_PASSWORD) into .env and restart "
                                   "the server, or hand over the messages as .eml files.")
    partners = [s for s in supply.suppliers() if "@" in s["email"]]
    since, raws = (date.today() - timedelta(days=365 * years)).strftime("%d-%b-%Y"), []
    try:
        server = mail.open_inbox(box)
        try:
            server.login(box["user"], box["password"])
            folders = [(box["folder"], "FROM")]
            for name in _SENT_FOLDERS:
                if server.select(f'"{name}"', readonly=True)[0] == "OK":
                    folders.append((f'"{name}"', "TO"))
                    break
            for folder, field in folders:
                if server.select(folder, readonly=True)[0] != "OK":
                    continue
                for s in partners:
                    _, data = server.uid("SEARCH", None, "SINCE", since, field, f'"{s["email"]}"')
                    for uid in (data[0] or b"").split()[-per_partner:]:
                        _, got = server.uid("FETCH", uid, "(BODY.PEEK[])")
                        raw = next((part[1] for part in got if isinstance(part, tuple)), None)
                        if raw:
                            raws.append(raw)
        finally:
            try:
                server.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    except (imaplib.IMAP4.error, OSError) as exc:
        raise mail.MailUnavailable(f"The mailbox could not be read: {exc}") from exc
    return {**take_messages(raws, "imap"), "looked": len(partners)}


# ------------------------------------------------------------------ firms found on the web

DISCOVERY = {"auto": False, "every_days": 7, "region": ""}


def discovery() -> dict:
    with db.engine().connect() as conn:
        kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == "discovery")).scalar()
    return {**DISCOVERY, **(kept or {})}


def set_discovery(values: dict) -> dict:
    new = {**discovery(), **{k: v for k, v in values.items() if k in DISCOVERY and v is not None}}
    with db.engine().begin() as conn:
        conn.execute(delete(db.settings).where(db.settings.c.key == "discovery"))
        conn.execute(insert(db.settings).values(key="discovery", value=new))
    return new


SEARCH_SYSTEM = """\
You work for the estimator of a German construction contractor who needs prices for a tender and has \
nobody to ask for one material group or trade. Search the web for firms that could be asked: for a \
material group, merchants or manufacturers who sell it to contractors; for a trade, firms that carry it \
out as subcontractors. Prefer firms in or near the region given, firms with a web page of their own that \
states what they sell or do, and a published contact for inquiries. Skip marketplaces, tender portals, \
job boards, directories that only list names, and firms far outside the region unless the material is \
shipped nationwide by its makers anyway. Use German search queries. Run a few different searches (by \
material and place, by trade and region, by association or maker), then report what you found: per firm \
its name, place, web address, what it sells or does as its page says, the e-mail address or phone number \
for inquiries if the page or the search result shows one, and the address of the page you found it on. \
Report only what the pages say; where a contact is not shown, say that it is not shown.
"""

FOUND_SCHEMA = {
    "type": "object",
    "properties": {
        "firms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"}, "place": {"type": "string"}, "website": {"type": "string"},
                    "email": {"type": "string"}, "phone": {"type": "string"},
                    "sells": {"type": "array", "items": {"type": "string"}},
                    "why": {"type": "string"}, "source_url": {"type": "string"},
                },
                "required": ["name", "place", "website", "email", "phone", "sells", "why", "source_url"],
                "additionalProperties": False,
            },
        },
        "note": {"type": "string"},
    },
    "required": ["firms", "note"],
    "additionalProperties": False,
}

FOUND_SYSTEM = """\
You are given the report of a web search for suppliers or subcontractors of a German construction \
contractor, and the list of pages the search returned. Put the firms of the report into a list.

- One entry per firm that could be asked for a price for what was looked for. At most eight, the best fit \
first. Leave out portals, directories and firms the report itself calls unsuitable.
- source_url is the address of the page the firm was found on, copied exactly from the list of pages. A \
firm without a page in that list is left out.
- website: the firm's own web address if the report or the list shows it, else empty. email and phone: \
only as the report states them; never made up from the firm's name or domain; else empty.
- sells: up to five German words for what the firm sells or does, as an estimator would write them in a \
directory ("PE-Rohre", "Schachtbauwerke", "Asphaltarbeiten").
- why: one English sentence on why this firm fits what was looked for, from what its page says.
- note: one English sentence on the search as a whole (what was hard to find, what the region lacks), or empty.
"""


def _host(url: str) -> str:
    host = urlparse(url if "//" in url else f"//{url}").netloc.lower()
    return host.removeprefix("www.")


async def discover(what: str, kind: str, region: str = "", reason: str = "asked for", by: str = "you",
                   project_id: str | None = None, client: anthropic.AsyncAnthropic | None = None) -> dict:
    """Look into the web for firms to ask about a material group or a trade, and keep the search with
    what it found. Two requests: one that searches (Claude's web search tool) and reports, one that puts
    the report into a list. A firm counts only if its page was among the search results."""
    what, region = what.strip(), (region or discovery()["region"] or supply.company()["place"]).strip()
    directory = supply.suppliers()
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    ask = (f"Looked for: {'subcontractors for the trade' if kind == 'subcontractor' else 'suppliers of'} „{what}“.\n"
           f"Region: {region or 'Germany (no place given)'}.\n"
           f"Already in the firm's directory, not to be reported again: {', '.join(s['name'] for s in directory) or 'nobody'}.")
    messages, queries, pages, report, usd, searches = [{"role": "user", "content": ask}], [], {}, [], 0.0, 0
    started = time.monotonic()
    for _ in range(4):  # a long search may pause its turn: it goes on from where it stood
        try:
            response = await client.messages.create(
                model=engines.of("search", MODEL), max_tokens=8000, system=SEARCH_SYSTEM, messages=messages,
                thinking={"type": "adaptive"}, output_config={"effort": engines.effort("search")},
                tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 6,
                        "user_location": {"type": "approximate", "country": "DE"}}])
        except _NO_CREDENTIALS as exc:
            raise LLMUnavailable("No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
                                 "root (see .env.example) and restart the server.") from exc
        spend.answered("partners looked for on the web", response, engines.of("search", MODEL), ms=round((time.monotonic() - started) * 1000))
        usd += _usd(response)
        for block in response.content:
            if block.type == "server_tool_use" and isinstance(block.input, dict) and block.input.get("query"):
                queries.append(str(block.input["query"]))
                searches += 1
            elif block.type == "web_search_tool_result" and isinstance(block.content, list):
                for result in block.content:
                    if getattr(result, "url", None):
                        pages.setdefault(result.url, getattr(result, "title", "") or "")
            elif block.type == "text":
                report.append(block.text)
        if response.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": response.content})
    usd += searches * SEARCH_USD
    candidates, note = [], ""
    if pages and "".join(report).strip():
        listed = "\n".join(f"{url} | {title}" for url, title in pages.items())
        made = await _json("partners found put into a list", FOUND_SYSTEM,
                           f"<looked_for>\n{ask}\n</looked_for>\n\n<report>\n{''.join(report)}\n</report>\n\n<pages>\n{listed}\n</pages>",
                           FOUND_SCHEMA, client)
        usd += _usd(made["response"])
        hosts = {_host(url): url for url in pages}
        have = {supply._same(s["name"]) for s in directory} | {_host(s["more"].get("website") or "") for s in directory}
        for f in made["data"]["firms"]:
            source = f["source_url"].strip()
            if source not in pages:  # the page, else another page of the same site that the search returned
                source = hosts.get(_host(source), "")
            name = f["name"].strip()
            if not source or not name or supply._same(name) in have or (f["website"] and _host(f["website"]) in have):
                continue
            have.add(supply._same(name))
            address = f["email"].strip() if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", f["email"].strip(), re.I) else ""
            candidates.append({"name": name[:120], "kind": kind, "place": f["place"].strip()[:80],
                               "website": f["website"].strip()[:200], "email": address, "phone": f["phone"].strip()[:40],
                               "sells": [str(w).strip()[:40] for w in f["sells"] if str(w).strip()][:5],
                               "why": f["why"].strip()[:300], "source_url": source, "source_title": pages.get(source, "")[:160],
                               "status": "new", "supplier_id": None})
        note = made["data"]["note"].strip()[:300]
    search_id = uuid.uuid4().hex[:12]
    with db.engine().begin() as conn:
        conn.execute(insert(db.partner_searches).values(
            id=search_id, created=db.now(), what=what, kind=kind, region=region, reason=reason, by=by,
            project_id=project_id, queries=queries, candidates=candidates[:8], usd=round(usd, 4),
            note=note or ("" if candidates else "The search returned no firm with a page of its own.")))
    return next(s for s in searches_kept() if s["id"] == search_id)


def searches_kept() -> list[dict]:
    """Every look into the web, newest first, with what it found and what became of each firm."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.partner_searches).order_by(db.partner_searches.c.created.desc())).all()
    return [{"id": r.id, "created": _iso(r.created), "what": r.what, "kind": r.kind, "region": r.region,
             "reason": r.reason, "by": r.by, "project_id": r.project_id, "queries": r.queries,
             "candidates": r.candidates, "note": r.note, "usd": r.usd} for r in rows]


def decide(search_id: str, n: int, take: bool) -> dict | None:
    """Take a firm a search found into the directory (as found on the web, with the page it was found on),
    or pass it over. Returns the search as it stands; None if it is not there."""
    with db.engine().connect() as conn:
        row = conn.execute(select(db.partner_searches).where(db.partner_searches.c.id == search_id)).first()
    if row is None or not 0 <= n < len(row.candidates):
        return None
    candidates = [dict(c) for c in row.candidates]
    c = candidates[n]
    if take and c["status"] != "added":
        made = supply.save_supplier({"name": c["name"], "kind": c["kind"], "email": c["email"], "phone": c["phone"],
                                     "place": c["place"], "groups": c["sells"] or [row.what], "source": "web",
                                     "more": {"website": c["website"],
                                              "found": {"search": search_id, "url": c["source_url"], "title": c["source_title"],
                                                        "why": c["why"], "at": _iso(row.created), "what": row.what}}})
        c |= {"status": "added", "supplier_id": made["id"]}
    elif not take:
        c |= {"status": "new" if c["status"] == "dismissed" else "dismissed"}
    with db.engine().begin() as conn:
        conn.execute(update(db.partner_searches).where(db.partner_searches.c.id == search_id).values(candidates=candidates))
    return next(s for s in searches_kept() if s["id"] == search_id)


def due() -> list[dict]:
    """The gaps Polier would look into the web for on its own: nobody to ask, and not looked for within
    the days set."""
    every = max(1, int(discovery()["every_days"] or 7))
    recent = {supply._same(s["what"]) for s in searches_kept()
              if (_at(s["created"]) or db.now()) > db.now() - timedelta(days=every)}
    return [g for g in gaps() if supply._same(g["what"]) not in recent]


async def look_on_its_own(limit: int = 2) -> int:
    """One pass of the agent's own search: the gaps that are due, a few at a time. Does nothing unless the
    estimator switched it on."""
    if not discovery()["auto"]:
        return 0
    done = 0
    for gap in due()[:limit]:
        try:
            with spend.scope(project_id=gap["project_id"]):
                await discover(gap["what"], gap["kind"], reason=f"nobody to ask for „{gap['what']}“ in {gap['project']}",
                               by="polier", project_id=gap["project_id"])
            done += 1
        except Exception:  # a search that fails is tried again on the next pass
            break
    return done


async def keep_looking(every_s: int = 1800) -> None:
    """The agent's own search, for as long as the server runs: a pass now and then."""
    await asyncio.sleep(90)
    while True:
        try:
            await look_on_its_own()
        except Exception:
            pass
        await asyncio.sleep(every_s)
