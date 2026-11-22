"""Mail the estimator sends from the app, and the answer that comes back.

Bidder questions (Bieterfragen) go to the client by e-mail, one message with all questions of an LV. The
app writes the German message; the estimator sends it from their own mail program (a draft) or, where an
account is set in .env (SMTP_HOST ...), the app sends it. What was asked, to whom and when is kept, so each
question shows where it stands. When the client answers, the reply is pasted in and read against the
questions: a question counts as answered only with the passage of the reply that answers it, found word for
word in the reply — the same rule as for the AI findings.

Nothing here is specific to bidder questions except the wording of the message and of the reading
instructions: a row of `db.mails` is a message of some `kind` about some items. Price inquiries to
suppliers are meant to be the second kind, with their own `compose` and their own schema for the reply.
"""
import email
import email.policy
import html
import imaplib
import json
import os
import re
import smtplib
import ssl
import time
import uuid
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formatdate, getaddresses, make_msgid, parseaddr, parsedate_to_datetime

import anthropic
from sqlalchemy import delete, insert, select, update

from boq import db, demomail, spend
from boq.checks.llm import _NO_CREDENTIALS, MODEL, REQUEST_TIMEOUT_S, LLMUnavailable, _squash
from boq.report import _positions

BIDDER_QUESTIONS = "bidder_questions"
REPLY_EFFORT = os.environ.get("BOQ_REPLY_EFFORT", "low")  # someone is waiting, and the task is a matching
MAX_REPLY_CHARS = 60_000


class MailUnavailable(RuntimeError):
    """The app cannot send: no account is set, or the mail server refused."""


# ------------------------------------------------------------------ writing

def compose(lv: dict, questions: list[dict], sender: str = "") -> tuple[str, str]:
    """Subject and text of the message with these bidder questions, numbered as they stand in it.

    `lv`: name, file and number of the tender as the file gives them. The text is German, formal and
    neutral; it states nothing the questions do not state."""
    name = lv.get("name") or lv.get("file") or ""
    number = (lv.get("number") or "").strip()
    subject = f"Bieterfragen – {name}" + (f" ({number})" if number and number not in name else "")
    lines = ["Sehr geehrte Damen und Herren,", "",
             f"zur Ausschreibung „{name}“" + (f" (Vergabenummer {number})" if number and number not in name else "")
             + (" haben wir folgende Bieterfrage" if len(questions) == 1 else " haben wir folgende Bieterfragen")
             + f" zum Leistungsverzeichnis ({lv.get('file', '')}):", ""]
    for no, q in enumerate(questions, 1):
        where = f"Position {q['item_oz']}" + (f" (Seite {q['page']})" if q.get("page") else "")
        lines += [f"Frage {no} – {where}: {q.get('item_label', '')}".rstrip(": "), q["question"]]
        if q.get("related_oz"):
            lines.append(f"Betrifft auch: {_positions(q['related_oz'])}")
        if q.get("evidence"):
            lines.append(f"Bezug im LV: {q['evidence']}")
        lines.append("")
    lines += ["Wir bitten um schriftliche Beantwortung und bedanken uns im Voraus.", "",
              "Mit freundlichen Grüßen"]
    if sender.strip():
        lines.append(sender.strip())
    return subject, "\n".join(lines) + "\n"


# ------------------------------------------------------------------ sending

def account() -> dict | None:
    """The mail account the app may send from, as set in .env; None means drafts only."""
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        return None
    user = os.environ.get("SMTP_USER", "").strip()
    return {"host": host, "port": int(os.environ.get("SMTP_PORT", "").strip() or "587"), "user": user,
            "password": os.environ.get("SMTP_PASSWORD", ""),
            "from": os.environ.get("SMTP_FROM", "").strip() or user}


def send(to: str, subject: str, body: str, attachments: list[tuple[str, bytes]] | None = None,
         references: str | None = None) -> str:
    """Send one plain-text message through the account in .env, with files (name, bytes) if any, and return
    its Message-ID, by which a reply is recognised. `references`: the Message-ID of the message of ours this
    one follows in a conversation, so that mail programs keep the thread together. Raises MailUnavailable
    with the reason."""
    acc = account()
    if acc is None or not acc["from"]:
        raise MailUnavailable("No mail account is set. Put SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM "
                              "into .env (see .env.example) and restart the server, or open the message in "
                              "your mail program.")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = acc["from"], to, subject
    message["Date"], message["Message-ID"] = formatdate(localtime=True), make_msgid()
    if references:
        message["In-Reply-To"] = message["References"] = references
    message.set_content(body)
    for name, data in attachments or []:
        message.add_attachment(data, maintype="application", subtype="octet-stream", filename=name)
    demomail.ensure_quietly(acc["from"], *(address for _, address in getaddresses([to])))  # demo server only
    try:
        if acc["port"] == 465:  # TLS from the first byte; every other port starts plain and upgrades
            server = smtplib.SMTP_SSL(acc["host"], acc["port"], timeout=30, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(acc["host"], acc["port"], timeout=30)
        with server:
            server.ehlo()  # the server says what it offers only once greeted: without this, no STARTTLS
            if acc["port"] != 465 and server.has_extn("starttls"):
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if acc["user"]:
                server.login(acc["user"], acc["password"])
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise MailUnavailable(f"The mail server did not take the message: {exc}") from exc
    _keep_sent(message)
    return message["Message-ID"]


def _keep_sent(message: EmailMessage) -> None:
    """On the demo server, put what was sent into the folder of sent mail, as a mail program would and as
    the big providers do by themselves: the history with a partner is read from there. Never fails."""
    box = inbox()
    if demomail.url() is None or box is None:
        return
    try:
        server = open_inbox(box)
        try:
            server.login(box["user"], box["password"])
            server.append('"Sent Items"', "(\\Seen)", imaplib.Time2Internaldate(time.time()), message.as_bytes(policy=email.policy.SMTP))
        finally:
            server.logout()
    except (imaplib.IMAP4.error, OSError):
        pass


def as_file(to: str, subject: str, body: str) -> bytes:
    """The message as an .eml file for the estimator's own mail program. No length limit, unlike a mailto:
    link, which Outlook on Windows is said to cut at about 2,000 characters. `X-Unsent: 1` asks Outlook to
    open the file as a message still to be sent; there is no sender, the mail program puts in its account."""
    message = EmailMessage()
    message["To"], message["Subject"], message["X-Unsent"] = to, subject, "1"
    message.set_content(body, cte="quoted-printable")
    return message.as_bytes(policy=message.policy.clone(linesep="\r\n"))


def file_name(subject: str, created: str) -> str:
    """What the .eml file is called on the estimator's disk: the subject and the day, in plain letters,
    e.g. Bieterfragen_Bachdurchlass_152516_2026-11-21.eml."""
    plain = subject.translate(str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}))
    words = re.findall(r"[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*", plain)
    return "_".join(words)[:80].rstrip("_.-") + f"_{created[:10]}.eml"


# ------------------------------------------------------------------ keeping

def _row(row) -> dict:
    return {"id": row.id, "kind": row.kind, "project_id": row.project_id, "to": row.to, "subject": row.subject, "body": row.body,
            "via": row.via, "created": row.created.isoformat(timespec="seconds"),
            "sent_at": row.sent_at.isoformat(timespec="seconds") if row.sent_at else None,
            "items": row.items, "reply": row.reply,
            "reply_at": row.reply_at.isoformat(timespec="seconds") if row.reply_at else None,
            "answers": row.answers, "message_id": row.message_id, "reply_via": row.reply_via,
            "project_id": row.project_id, "file": row.file, "meta": row.meta}


def keep(kind: str, project_id: str | None, file: str, to: str, subject: str, body: str, via: str,
         items: list[dict], sent: bool, message_id: str | None = None, meta: dict | None = None) -> dict:
    mail_id = uuid.uuid4().hex
    with db.engine().begin() as conn:
        conn.execute(insert(db.mails).values(
            id=mail_id, kind=kind, project_id=project_id, file=file, created=db.now(), to=to, subject=subject,
            body=body, via=via, sent_at=db.now() if sent else None, items=items, message_id=message_id,
            meta=meta))
    return find(mail_id)


def find(mail_id: str) -> dict | None:
    with db.engine().connect() as conn:
        row = conn.execute(select(db.mails).where(db.mails.c.id == mail_id)).first()
    return _row(row) if row else None


def about(kind: str, project_id: str | None, file: str) -> list[dict]:
    """The messages of one kind about one LV file, oldest first. A file opened outside a project has no
    project; its messages are found by the file name alone."""
    same_project = db.mails.c.project_id.is_(None) if project_id is None else db.mails.c.project_id == project_id
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.mails).where(db.mails.c.kind == kind, same_project, db.mails.c.file == file)
                            .order_by(db.mails.c.created)).all()
    return [_row(r) for r in rows]


def unanswered(kind: str) -> list[dict]:
    """Every message of one kind, of all projects, that went out and has no reply read into it yet."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.mails).where(db.mails.c.kind == kind, db.mails.c.sent_at.isnot(None),
                                                   db.mails.c.reply.is_(None)).order_by(db.mails.c.created)).all()
    return [_row(r) for r in rows]


def set_sent(mail_id: str, sent: bool) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.mails).where(db.mails.c.id == mail_id).values(sent_at=db.now() if sent else None))


def discard(mail_id: str) -> None:
    with db.engine().begin() as conn:
        conn.execute(delete(db.mails).where(db.mails.c.id == mail_id))


def keep_reply(mail_id: str, reply: str, answers: dict, via: str = "pasted") -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.mails).where(db.mails.c.id == mail_id)
                     .values(reply=reply, reply_at=db.now(), answers=answers, reply_via=via))


def standing(questions: list[dict], mails: list[dict]) -> list[dict]:
    """Each question with where it stands: "new" (in no message), "drafted" (in a message not yet sent),
    "sent", "partly" or "answered", and for the last two the passage of the reply. The newest message a
    question is in decides, so a question asked again counts as open again."""
    out = []
    known = {q["key"] for q in questions}
    earlier = {item["key"]: item for mail in mails for item in mail["items"] if item["key"] not in known}
    # asked before, not raised by this analysis of the file: kept, after the questions of today
    asked_before = [{"related_oz": [], "item_label": "", "page": None, "severity": "warn", "origin": "llm",
                     "findings": [], **item} for item in earlier.values()]
    for no, q in enumerate([*questions, *asked_before], 1):
        q = {**q, "no": no}
        state = {"status": "new", "mail_id": None, "sent_at": None, "answer": None}
        for mail in mails:  # oldest first: a later message overrides
            if not any(item["key"] == q["key"] for item in mail["items"]):
                continue
            answer = (mail["answers"] or {}).get(q["key"])
            state = {"status": "drafted" if not mail["sent_at"] else "sent", "mail_id": mail["id"],
                     "sent_at": mail["sent_at"], "answer": None}
            if answer and answer["status"] in ("answered", "partly"):
                state |= {"status": answer["status"], "answer": answer}
        out.append({**q, **state})
    return out


# ------------------------------------------------------------------ the inbox

def inbox() -> dict | None:
    """The mailbox the app may look into for replies, as set in .env; None: replies are pasted in. User and
    password default to those of the sending account, which is the usual case (one mailbox for both)."""
    host = os.environ.get("IMAP_HOST", "").strip()
    if not host:
        return None
    return {"host": host, "port": int(os.environ.get("IMAP_PORT", "").strip() or "993"),
            "user": os.environ.get("IMAP_USER", "").strip() or os.environ.get("SMTP_USER", "").strip(),
            "password": os.environ.get("IMAP_PASSWORD", "") or os.environ.get("SMTP_PASSWORD", ""),
            "folder": os.environ.get("IMAP_FOLDER", "").strip() or "INBOX",
            "tls": os.environ.get("IMAP_TLS", "1").strip().lower() not in ("0", "no", "false", "off")}


def open_inbox(box: dict):
    """A connection to the mailbox, not yet logged in. Over TLS, as every real provider wants it; plain only
    where .env says IMAP_TLS=0, which is for the mail server of the demo (GreenMail in docker-compose.yml)."""
    if box.get("tls", True):
        return imaplib.IMAP4_SSL(box["host"], box["port"], ssl_context=ssl.create_default_context(), timeout=30)
    return imaplib.IMAP4(box["host"], box["port"], timeout=30)


_REPLY_PREFIX = re.compile(r"^\s*((re|aw|antwort|wg|fwd?)\s*(\[\d+\])?\s*:\s*)+", re.I)
_HEADERS = "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO REFERENCES SUBJECT FROM DATE)])"
# Where the history a mail program puts under a reply begins.
_HISTORY = re.compile(
    r"^(>.*|-{2,}\s*(Ursprüngliche Nachricht|Original Message|Weitergeleitete Nachricht)\s*-{2,}.*|"
    r"(Am|On)\b.{5,200}\b(schrieb|wrote)\b.*:?|(Von|From):\s.+|_{10,})$", re.I)


def _plain_subject(subject: str) -> str:
    return _squash(_REPLY_PREFIX.sub("", subject or "")).casefold()


def reply_to(mail: dict, headers) -> str | None:
    """How a message with these headers answers this message of ours: "named" — it names ours
    (In-Reply-To, References); "subject" — it comes from the address we wrote to and carries our subject
    behind a reply prefix; None — it does not. Our own message, which a mailbox shows too when we wrote
    to ourselves, is not a reply."""
    ours = (mail.get("message_id") or "").strip()
    if ours and (headers.get("Message-ID") or "").strip() == ours:
        return None
    if ours and ours in f"{headers.get('In-Reply-To') or ''} {headers.get('References') or ''}":
        return "named"
    subject = str(headers.get("Subject") or "")
    if (_REPLY_PREFIX.match(subject) and _plain_subject(subject) == _plain_subject(mail["subject"])
            and parseaddr(str(headers.get("From") or ""))[1].casefold() == mail["to"].casefold()):
        return "subject"
    return None


def answered_by(waiting: list[dict], headers) -> dict | None:
    """The one message of ours a message in the inbox answers. A reply that names a message answers that
    one. Several messages to the same address share a subject, so by subject alone a reply goes to one
    only: the newest written before it, among those it could not have named (sent from the user's own
    mail program, so their Message-ID is not on record) — unless it names nothing at all."""
    how = [(m, reply_to(m, headers)) for m in waiting]
    named = [m for m, h in how if h == "named"]
    if named:  # the one it answers directly, before one that is only further up the thread
        direct = str(headers.get("In-Reply-To") or "")
        return next((m for m in named if m["message_id"] in direct), named[0])
    names_something = bool(str(headers.get("In-Reply-To") or "").strip())
    by_subject = [m for m, h in how if h == "subject" and not (m.get("message_id") and names_something)]
    try:
        when = parsedate_to_datetime(str(headers.get("Date")))
        earlier = [m for m in by_subject if datetime.fromisoformat(m["created"]) <= when]
    except (TypeError, ValueError):
        earlier = by_subject
    return max(earlier, key=lambda m: m["created"]) if earlier else None


def reply_text(message) -> str:
    """What the client wrote: the plain text of the message (or its HTML, stripped) without the history
    of the thread below it."""
    part = message.get_body(preferencelist=("plain", "html"))
    if part is None:
        return ""
    text = part.get_content()
    if part.get_content_type() == "text/html":
        text = re.sub(r"(?is)<(style|script)\b.*?</\1>", "", text)
        text = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", text)
        text = html.unescape(re.sub(r"<[^>]+>", "", text))
    lines = text.replace("\r\n", "\n").split("\n")
    cut = next((i for i, line in enumerate(lines) if _HISTORY.match(line.strip())), len(lines))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(line.rstrip() for line in lines[:cut])).strip()


def find_replies(mails: list[dict]) -> list[tuple[dict, str]]:
    """Look into the inbox for replies to these messages of ours: (message, the reply's text) for each
    that has one, the newest reply where there are several. Nothing in the mailbox is changed or marked
    read. Raises MailUnavailable where no inbox is set or the server refuses."""
    box = inbox()
    if box is None:
        raise MailUnavailable("No inbox is set. Put IMAP_HOST (and IMAP_USER, IMAP_PASSWORD if they differ "
                              "from the sending account) into .env and restart the server, or paste the reply.")
    waiting = [m for m in mails if not m["reply"]]
    if not waiting:
        return []
    since = min(datetime.fromisoformat(m["created"]) for m in waiting) - timedelta(days=1)
    found: dict[str, str] = {}
    try:
        server = open_inbox(box)
        try:
            server.login(box["user"], box["password"])
            server.select(box["folder"], readonly=True)
            _, data = server.uid("SEARCH", None, "SINCE", since.strftime("%d-%b-%Y"))
            for uid in reversed((data[0] or b"").split()[-500:]):  # newest first
                _, got = server.uid("FETCH", uid, _HEADERS)
                raw = next((part[1] for part in got if isinstance(part, tuple)), None)
                if raw is None:
                    continue
                headers = email.message_from_bytes(raw, policy=email.policy.default)
                m = answered_by([m for m in waiting if m["id"] not in found], headers)
                if m is None:
                    continue
                _, got = server.uid("FETCH", uid, "(BODY.PEEK[])")
                whole = next((part[1] for part in got if isinstance(part, tuple)), None)
                text = reply_text(email.message_from_bytes(whole, policy=email.policy.default)) if whole else ""
                if text:
                    found[m["id"]] = text
        finally:
            try:
                server.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    except (imaplib.IMAP4.error, OSError) as exc:
        raise MailUnavailable(f"The inbox could not be read: {exc}") from exc
    return [(m, found[m["id"]]) for m in waiting if m["id"] in found]


# ------------------------------------------------------------------ reading the reply

REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "no": {"type": "integer"},
                    "status": {"type": "string", "enum": ["answered", "partly", "not_answered"]},
                    "quote": {"type": "string"},
                    "meaning": {"type": "string"},
                    "change_field": {"type": "string", "enum": ["none", "quantity", "unit", "text"]},
                    "change_value": {"type": "string"},
                },
                "required": ["no", "status", "quote", "meaning", "change_field", "change_value"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["answers"],
    "additionalProperties": False,
}

REPLY_SYSTEM = """\
You work for a contractor's estimator who is pricing a German construction tender. The estimator sent \
bidder questions (Bieterfragen) to the client about items of the bill of quantities (Leistungsverzeichnis). \
The client has answered by e-mail. You are given the questions as they were sent, numbered, and the \
client's reply as it arrived.

For every question, say whether the reply answers it:

- answered: the reply gives the decision, figure or clarification the question asked for.
- partly: the reply addresses the question but leaves part of it open, defers it ("wird nachgereicht", \
"siehe Pläne") or answers something slightly different.
- not_answered: the reply does not address the question.

Rules:

- quote is the passage of the reply that answers the question, copied character for character from the \
reply, at most 400 characters, in the reply's language, without ellipses or words of your own. For \
not_answered it is empty. A quote that cannot be found in the reply is discarded automatically and the \
question then counts as not answered.
- meaning is one or two sentences in English for the estimator: what the answer settles for pricing this \
item, and for partly what is still open. Say only what the reply says; do not add what is usual, likely \
or required by VOB. For not_answered it is empty.
- change_field and change_value: only where the reply itself changes the bill of quantities for the \
item — it states a new quantity ("Die Menge wird auf 150 m geändert"), another unit, or wording that is \
added to or replaces the item's text. change_value is the new value exactly as the reply writes it and \
must stand inside your quote: for quantity the number alone ("150", "1.250,5"), for unit the unit, for \
text the new wording. A clarification of what is meant, an announcement that a corrected LV will follow, \
or a figure that is not the item's quantity is no change: change_field none, change_value empty.
- A reply often answers by number ("Zu Frage 2:"), by item ("Pos. 2.12") or in one running text. A general \
sentence such as "die übrigen Fragen ergeben sich aus den Unterlagen" answers none of them.
- Give one entry per question, in the order of the questions, with its number.
- The files are anonymised: tokens such as [FIRMA_044], [ORT_024] or PER000115 replace names. They are \
not errors.
"""


async def read_reply(items: list[dict], reply: str, client: anthropic.AsyncAnthropic | None = None) -> dict:
    """The reply read against the questions of a message: per question key a status, the passage of the
    reply and what it means. A passage that is not in the reply word for word makes the question not
    answered (`dropped` counts those)."""
    if len(reply) > MAX_REPLY_CHARS:
        raise ValueError(f"The reply is longer than {MAX_REPLY_CHARS:,} characters. Paste the text of the "
                         f"e-mail without its attachments and quoted history.")
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    asked = "\n\n".join(
        f"<question no=\"{no}\" item=\"{q['item_oz']}\">\n{q['question']}\n"
        + (f"Quoted from the LV: {q['evidence']}\n" if q.get("evidence") else "") + "</question>"
        for no, q in enumerate(items, 1))
    started = time.monotonic()
    try:
        response = await client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # a declined request is re-run on Anthropic's recommended fallback model
            thinking={"type": "adaptive"},
            output_config={"effort": REPLY_EFFORT, "format": {"type": "json_schema", "schema": REPLY_SCHEMA}},
            system=REPLY_SYSTEM,
            messages=[{"role": "user", "content":
                       f"<questions>\n{asked}\n</questions>\n\n<reply>\n{reply}\n</reply>"}],
        )
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable(
            "No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
            "root (see .env.example) and restart the server.") from exc
    spend.answered("reply read", response, MODEL, ms=round((time.monotonic() - started) * 1000))
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Reading the reply stopped with {response.stop_reason}")
    raw = json.loads(next(b.text for b in response.content if b.type == "text"))["answers"]
    return match_answers(items, reply, raw)


def match_answers(items: list[dict], reply: str, raw: list[dict]) -> dict:
    """The model's reading checked against the reply: `answers` per question key, and how many passages
    were not in the reply."""
    text, answers, dropped = _squash(reply), {}, 0
    by_no = {a.get("no"): a for a in raw}
    for no, q in enumerate(items, 1):
        a = by_no.get(no) or {}
        status = a.get("status") if a.get("status") in ("answered", "partly") else "not_answered"
        quote = _squash(a.get("quote", "")).strip("…\"„“' ")
        if status != "not_answered" and (len(quote) < 4 or quote not in text):
            status, dropped = "not_answered", dropped + 1
        field, value = a.get("change_field"), _squash(a.get("change_value", "")).strip("\"„“' ")
        if status == "not_answered" or field not in ("quantity", "unit", "text") or not value or not _stands_in(value, quote):
            field, value = None, ""  # a change the passage does not state is none
        if field == "quantity" and german_number(value) is None:
            field, value = None, ""
        answers[q["key"]] = {"status": status, "quote": quote if status != "not_answered" else "",
                             "meaning": a.get("meaning", "").strip() if status != "not_answered" else "",
                             "change": {"field": field, "value": value} if field else None}
    return {"answers": answers, "dropped": dropped}


def _stands_in(value: str, quote: str) -> bool:
    """The value as a word of its own in the passage: "t" is not in "nachgereicht", "150" not in "1.150"."""
    return re.search(rf"(?<![\w.,]){re.escape(value)}(?![\w]|[.,]\d)", quote) is not None


def german_number(text: str) -> str | None:
    """"1.250,5" or "150" as a plain decimal ("1250.5"), None if it is no number."""
    m = re.fullmatch(r"\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*", text)
    return (m.group(1).replace(".", "") + (f".{m.group(2)}" if m.group(2) else "")) if m else None
