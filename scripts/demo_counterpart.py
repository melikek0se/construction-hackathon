"""Plays the other side of the demo mail: the client's tender office and the suppliers and subcontractors.

The mock world (mock/mail) holds the mail that arrives by itself; what comes back to a message the estimator
sends from the app cannot be written beforehand, because it depends on what was asked. This script answers
every message of ours on the demo mail server that has no reply yet, in the role of the one it went to:
bidder questions as the client (in German, most answered, at most one put off, a quantity changed where
the question is about one), price inquiries as the firm asked (an offer with a net price per position and
its terms; a second firm on the same package prices differently and leaves one position out, so that there
is something to compare). Claude writes the texts; they go out through the demo mail server from the
recipient's own address, as a reply to our message. The app then finds them like any other mail.

Everything here is made up, like the rest of the mock world; it is for the demo server only (.test addresses).

    docker compose exec -T api python - [questions|quotes|all] [PROJECT_ID] [--dry] < scripts/demo_counterpart.py

Without a project: every project. --dry prints the replies and sends nothing.
"""
import smtplib
import sys
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

import anthropic

from boq import demomail, engines, mail, supply
from boq.checks.llm import MODEL

CLIENT = """\
You are the tender office (Vergabestelle) of a German public client. A bidder has sent bidder questions \
(Bieterfragen) about your bill of quantities. Write your reply e-mail in German, formal and short, as such \
offices write. Rules:
- Answer every question under "Zu Frage n:" with its number.
- Answer most questions clearly, with a concrete decision or figure that fits what the question quotes \
from the LV. Do not invent facts that contradict the quoted text.
- Where a question points out a wrong or contradictory quantity, correct it explicitly in the form \
"Die Menge der Position <OZ> wird auf <Zahl> <Einheit> geändert." (at most two such corrections).
- Put off at most one question ("wird mit dem Bauablaufplan nachgereicht" or similar), if there are three or more.
- End with "Mit freundlichen Grüßen" and the office's name as it appears in the bidder's message, if it does.
- Plain text only, no markdown, no subject line."""

FIRM = """\
You are {name}, a German {what} in northern Germany. A contractor asks you for prices. Write your offer \
as a reply e-mail in German, short, as such firms write. Rules:
- One line per position, exactly in this form: "Pos. <OZ>  <Kurztext>  <Preis> EUR/<Einheit>" with a \
net unit price in German number format (12,50). Realistic 2026 prices for the region.
- {variant}
- Then the terms on lines of their own: Zahlungsziel, Angebot gültig bis <a date about three months ahead \
as TT.MM.JJJJ>{freight}.
- End with "Mit freundlichen Grüßen" and a name and the firm.
- Plain text only, no markdown, no subject line, no table characters."""


def write(system: str, text: str) -> str:
    response = anthropic.Anthropic().messages.create(
        model=engines.of("reply", MODEL), max_tokens=12000, system=system,
        messages=[{"role": "user", "content": text}])
    return "".join(b.text for b in response.content if b.type == "text").strip()


def send(ours: dict, text: str) -> None:
    acc = mail.account()
    reply = EmailMessage()
    reply["From"], reply["To"] = ours["to"], acc["from"]
    reply["Subject"] = "AW: " + ours["subject"]
    reply["Date"], reply["Message-ID"] = formatdate(localtime=True), make_msgid()
    if ours.get("message_id"):
        reply["In-Reply-To"] = reply["References"] = ours["message_id"]
    reply.set_content(text + "\n")
    demomail.ensure_quietly(ours["to"])
    with smtplib.SMTP(acc["host"], acc["port"], timeout=30) as server:
        server.ehlo()
        try:
            server.login(ours["to"], "demo")
        except smtplib.SMTPException:
            pass  # the demo server takes mail from its own addresses without it
        server.send_message(reply)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    what = args[0] if args and args[0] in ("questions", "quotes", "all") else "all"
    project = next((a for a in args if a not in ("questions", "quotes", "all")), None)
    dry = "--dry" in sys.argv
    if demomail.url() is None or mail.account() is None:
        sys.exit("This is for the demo mail server only (docker compose): no demo server is set here.")
    done = 0
    if what in ("questions", "all"):
        for ours in mail.unanswered(mail.BIDDER_QUESTIONS):
            if project and ours["project_id"] != project:
                continue
            text = write(CLIENT, ours["body"])
            print(f"\n--- the client answers {len(ours['items'])} questions ({ours['to']}) ---\n{text}")
            if not dry:
                send(ours, text)
            done += 1
    if what in ("quotes", "all"):
        seen: dict[tuple, int] = {}  # per package: how many firms have answered, here and before
        for ours in mail.unanswered(supply.PRICE_INQUIRY):
            if project and ours["project_id"] != project:
                continue
            meta = ours["meta"] or {}
            if meta.get("kind") not in (None, "inquiry"):  # a reminder or an answer of ours: nothing to quote on
                continue
            key = (ours["project_id"], ours["file"], meta.get("package"))
            n = seen[key] = seen.get(key, len([q for q in supply.quotes_for(ours["project_id"], ours["file"]) if q["package"] == meta.get("package")])) + 1
            firm = supply.supplier(meta.get("supplier_id") or "") or {}
            sub = "Nachunternehmer" in ours["body"] or firm.get("kind") == "subcontractor"
            variant = ("Price every position asked for." if n == 1 else
                       "You are a competitor of the firm that usually gets this: some of your prices are 5 to 15 per cent lower, "
                       "some higher, and one position you do not offer; say so in one sentence under the prices.")
            text = write(FIRM.format(name=firm.get("name") or ours["to"], what="subcontractor (whole work: material, labour, equipment)" if sub else "supplier (material only, delivered)",
                                     variant=variant, freight="" if sub else ", Fracht (a lump sum in EUR, or 'frei Baustelle')"), ours["body"])
            print(f"\n--- {firm.get('name') or ours['to']} quotes ({'subcontractor' if sub else 'supplier'}, firm {n} on the package) ---\n{text}")
            if not dry:
                send(ours, text)
            done += 1
    print(f"\n{done} repl{'y' if done == 1 else 'ies'} {'written (not sent: --dry)' if dry else 'sent'}. "
          f"The app finds them at its next look into the inbox (every three minutes, or \"Check the inbox\").")


main()
