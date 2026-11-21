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
import json
import os
import re
import smtplib
import ssl
import time
import uuid
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

import anthropic
from sqlalchemy import delete, insert, select, update

from boq import db, spend
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
    return {"host": host, "port": int(os.environ.get("SMTP_PORT", "587")), "user": user,
            "password": os.environ.get("SMTP_PASSWORD", ""),
            "from": os.environ.get("SMTP_FROM", "").strip() or user}


def send(to: str, subject: str, body: str) -> None:
    """Send one plain-text message through the account in .env. Raises MailUnavailable with the reason."""
    acc = account()
    if acc is None or not acc["from"]:
        raise MailUnavailable("No mail account is set. Put SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM "
                              "into .env (see .env.example) and restart the server, or open the message in "
                              "your mail program.")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = acc["from"], to, subject
    message["Date"], message["Message-ID"] = formatdate(localtime=True), make_msgid()
    message.set_content(body)
    try:
        if acc["port"] == 465:  # TLS from the first byte; every other port starts plain and upgrades
            server = smtplib.SMTP_SSL(acc["host"], acc["port"], timeout=30, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(acc["host"], acc["port"], timeout=30)
        with server:
            if acc["port"] != 465 and server.has_extn("starttls"):
                server.starttls(context=ssl.create_default_context())
            if acc["user"]:
                server.login(acc["user"], acc["password"])
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise MailUnavailable(f"The mail server did not take the message: {exc}") from exc


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
            "answers": row.answers}


def keep(kind: str, project_id: str | None, file: str, to: str, subject: str, body: str, via: str,
         items: list[dict], sent: bool) -> dict:
    mail_id = uuid.uuid4().hex
    with db.engine().begin() as conn:
        conn.execute(insert(db.mails).values(
            id=mail_id, kind=kind, project_id=project_id, file=file, created=db.now(), to=to, subject=subject,
            body=body, via=via, sent_at=db.now() if sent else None, items=items))
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


def set_sent(mail_id: str, sent: bool) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.mails).where(db.mails.c.id == mail_id).values(sent_at=db.now() if sent else None))


def discard(mail_id: str) -> None:
    with db.engine().begin() as conn:
        conn.execute(delete(db.mails).where(db.mails.c.id == mail_id))


def keep_reply(mail_id: str, reply: str, answers: dict) -> None:
    with db.engine().begin() as conn:
        conn.execute(update(db.mails).where(db.mails.c.id == mail_id)
                     .values(reply=reply, reply_at=db.now(), answers=answers))


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
                },
                "required": ["no", "status", "quote", "meaning"],
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
        answers[q["key"]] = {"status": status, "quote": quote if status != "not_answered" else "",
                             "meaning": a.get("meaning", "").strip() if status != "not_answered" else ""}
    return {"answers": answers, "dropped": dropped}
