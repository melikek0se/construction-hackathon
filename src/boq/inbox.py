"""Tenders found in the mailbox: the agent that fills the intake.

An estimator's tenders arrive by e-mail: a client or a contracting authority sends the tender package, a
general contractor sends a trade LV to its subcontractors. This module reads the mailbox the app may look
into (`mail.inbox`, IMAP, read-only) or a message handed to it as a file (.eml), and says for each message
with an LV attached whether it invites the firm to bid, what is asked for by when, and how it fits what the
firm's own people do. Such a message becomes a project in the intake (boq.api): its files are kept and
read, nothing is checked, and the estimator takes it on or passes (D-042).

Not a tender for the intake: a message that answers one of ours (a supplier's quote, the client's reply to
bidder questions — those belong to their conversations), and a message without an attachment the parsers
read as an LV. What the model decides is only whether a message with an LV is an invitation to bid; a
message is looked at once (its Message-ID is remembered).
"""
import email
import email.policy
import imaplib
import json
import re
import time
from datetime import datetime, timedelta
from email.utils import parseaddr, parsedate_to_datetime

import anthropic
from sqlalchemy import delete, insert, select

from boq import db, engines, mail, spend, supply
from boq.checks.llm import _NO_CREDENTIALS, MODEL, REQUEST_TIMEOUT_S, LLMUnavailable

LOOK_BACK_DAYS = 14
MAX_MESSAGES = 40  # per look into the mailbox
_SEEN_KEPT = 3000


def from_eml(data: bytes) -> dict:
    """A message as this module works with it: who sent it, its subject and day, its text, the files
    attached, its Message-ID and the one it answers."""
    message = email.message_from_bytes(data, policy=email.policy.default)
    try:
        received = parsedate_to_datetime(str(message.get("Date"))).date().isoformat()
    except (TypeError, ValueError):
        received = ""
    files = []
    for part in message.iter_attachments():
        name = part.get_filename()
        payload = part.get_payload(decode=True)
        if name and payload:
            files.append((name, payload))
    sender = " ".join(str(message.get("From") or "").split())
    name, address = parseaddr(sender)
    if "@" not in address:  # a display name with a comma in it, not quoted: take what stands in the brackets
        found = re.search(r"<([^<>\s]+@[^<>\s]+)>", sender)
        name, address = (sender[:found.start()].strip(' ",'), found.group(1)) if found else (sender, "")
    return {"message_id": str(message.get("Message-ID") or "").strip(), "sender": address or name, "sender_name": name,
            "subject": " ".join(str(message.get("Subject") or "").split()), "received": received,
            "text": mail.reply_text(message), "files": files,
            "answers": f"{message.get('In-Reply-To') or ''} {message.get('References') or ''}".strip()}


def seen() -> set[str]:
    with db.engine().connect() as conn:
        kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == "inbox_seen")).scalar()
    return set(kept or [])


def mark_seen(ids: list[str]) -> None:
    ids = [i for i in ids if i]
    if not ids:
        return
    with db.engine().begin() as conn:
        kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == "inbox_seen")).scalar() or []
        conn.execute(delete(db.settings).where(db.settings.c.key == "inbox_seen"))
        conn.execute(insert(db.settings).values(key="inbox_seen", value=(kept + [i for i in ids if i not in kept])[-_SEEN_KEPT:]))


def recent(known: set[str]) -> list[dict]:
    """The messages of the last LOOK_BACK_DAYS in the inbox that carry an attachment and were not looked at
    yet, newest first, at most MAX_MESSAGES. Nothing in the mailbox is changed or marked read. Raises
    MailUnavailable where no inbox is set or the server refuses."""
    box = mail.inbox()
    if box is None:
        raise mail.MailUnavailable("No inbox is set. Put IMAP_HOST (and IMAP_USER, IMAP_PASSWORD if they differ from "
                                   "the sending account) into .env and restart the server, or hand the message over as a file.")
    since, out = datetime.now() - timedelta(days=LOOK_BACK_DAYS), []
    try:
        server = mail.open_inbox(box)
        try:
            server.login(box["user"], box["password"])
            server.select(box["folder"], readonly=True)
            _, data = server.uid("SEARCH", None, "SINCE", since.strftime("%d-%b-%Y"))
            uids = (data[0] or b"").split()[-300:]
            # the heads of all of them in one request: one round trip per message made a look into a busy
            # mailbox take a minute and more
            heads: dict[bytes, bytes] = {}
            if uids:
                _, got = server.uid("FETCH", b",".join(uids).decode(), "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID CONTENT-TYPE)])")
                for part in got:
                    found = isinstance(part, tuple) and re.search(rb"UID (\d+)", part[0])
                    if found:
                        heads[found.group(1)] = part[1]
            for uid in reversed(uids):
                if len(out) >= MAX_MESSAGES:
                    break
                raw = heads.get(uid)
                if raw is None:
                    continue
                head = email.message_from_bytes(raw, policy=email.policy.default)
                # a message with a file is multipart/mixed (or carries the file as its only part)
                if str(head.get("Message-ID") or "").strip() in known or head.get_content_type() in ("text/plain", "text/html", "multipart/alternative"):
                    continue
                _, got = server.uid("FETCH", uid, "(BODY.PEEK[])")
                whole = next((part[1] for part in got if isinstance(part, tuple)), None)
                if whole:
                    out.append(from_eml(whole))
        finally:
            try:
                server.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    except (imaplib.IMAP4.error, OSError) as exc:
        raise mail.MailUnavailable(f"The inbox could not be read: {exc}") from exc
    return out


INVITATION_SCHEMA = {
    "type": "object",
    "properties": {
        "tender": {"type": "boolean"},
        "summary": {"type": "string"},
        "client": {"type": "string"},
        "due": {"type": "string"},
        "fit": {"type": "string", "enum": ["yes", "partly", "no"]},
        "why": {"type": "string"},
    },
    "required": ["tender", "summary", "client", "due", "fit", "why"],
    "additionalProperties": False,
}

INVITATION_SYSTEM = """\
You sort the incoming mail of a German construction contractor's estimating office. You are given one \
e-mail (sender, subject, text) and what its attached bills of quantities (Leistungsverzeichnisse, LV) \
contain, and what the firm does with its own people. Decide whether this e-mail invites the firm to \
submit a bid, and if so, how well the job fits the firm.

- tender is true when somebody asks the firm for a priced offer on the attached LV: a client or \
contracting authority sending tender documents ("Ausschreibung", "Aufforderung zur Angebotsabgabe", \
"Angebotsanfrage"), an architect or engineer on a client's behalf, or a general contractor asking for a \
subcontractor's price on a trade. It is false for everything else with an LV attached: a supplier's or \
subcontractor's quote TO the firm, an award or order, the firm's own bid coming back, a forwarded file \
without a request, a newsletter. When in doubt it is false: a tender that is missed is found again, a \
wrong card on the board costs trust.
- summary: one English sentence for the estimator: who asks, for what work, and by when if the mail says.
- client: who is asking, as the mail names them (a firm or authority, not a person's e-mail address); \
empty if it does not say.
- due: the day the bid has to be in, as YYYY-MM-DD, only if the mail's text states it; else empty. Do not \
take it from the LV.
- fit: yes if the work of the LV is what the firm's own people do; partly if a notable part of it is and \
the rest would be subcontracted; no if it is another trade altogether. Judge by the items, not the subject.
- why: one English sentence giving the reason for fit, naming the kind of work in the LV.

For a message that is no tender, summary says in one sentence what it is instead, and due, client are \
empty, fit is no and why is empty. The files are anonymised: tokens such as [FIRMA_044] or [ORT_024] \
replace names; use them as they stand.
"""


async def read_invitation(message: dict, lvs: list[dict], client: anthropic.AsyncAnthropic | None = None) -> dict:
    """Whether a message with LVs attached invites the firm to bid, and how the job fits. `lvs`: per
    attached LV its file name, the number of items and a sample of item texts."""
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    listed = "\n\n".join(f"<lv file=\"{lv['name']}\" items=\"{lv['items']}\">\n" + "\n".join(lv["sample"]) + "\n</lv>" for lv in lvs)
    started = time.monotonic()
    try:
        response = await client.beta.messages.create(
            model=engines.of("inbox", MODEL),
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": engines.effort("inbox"), "format": {"type": "json_schema", "schema": INVITATION_SCHEMA}},
            system=INVITATION_SYSTEM,
            messages=[{"role": "user", "content":
                       f"<firm>\nDoes itself: {supply.company()['own_trades']}\n</firm>\n\n"
                       f"<mail from=\"{message['sender_name']} <{message['sender']}>\" date=\"{message['received']}\">\n"
                       f"Subject: {message['subject']}\n\n{message['text'][:6000]}\n</mail>\n\n{listed}"}],
        )
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable(
            "No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
            "root (see .env.example) and restart the server.") from exc
    spend.answered("mail sorted", response, engines.of("inbox", MODEL), ms=round((time.monotonic() - started) * 1000))
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Sorting the mail stopped with {response.stop_reason}")
    raw = json.loads(next(b.text for b in response.content if b.type == "text"))
    due = raw.get("due") or ""
    try:
        due = datetime.strptime(due, "%Y-%m-%d").date().isoformat()
    except ValueError:
        due = ""
    return {"tender": bool(raw.get("tender")), "summary": str(raw.get("summary") or "").strip()[:300],
            "client": str(raw.get("client") or "").strip()[:120], "due": due,
            "fit": raw.get("fit") if raw.get("fit") in ("yes", "partly", "no") else "partly",
            "why": str(raw.get("why") or "").strip()[:300]}
