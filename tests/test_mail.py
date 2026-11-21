"""Bidder questions by e-mail: the message, keeping what was asked, sending, and reading the reply."""
import asyncio
import socketserver
import threading
from email import message_from_string
from email.policy import default as email_policy
from pathlib import Path

from fastapi.testclient import TestClient

from boq import api, mail
from boq.model import Finding

D = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"


def opened(client, monkeypatch) -> str:
    """Project D's tender, with two AI findings that need the client."""
    analysis_id = client.get("/api/catalog/D/files/0").json()["id"]

    async def review(boq, findings, progress=None):
        ask = dict(category="unclear_scope", check_id="L-UNCLEAR-SCOPE", severity="warn", explanation="x",
                   action="ask_client", origin="llm")
        return [Finding(item_oz="2.12", title="Grading undefined", evidence="„Körnung 0/X“",
                        question_de="Welche Körnung ist für den Grubenkies vorgesehen?", **ask),
                Finding(item_oz="2.5", title="Depth undefined", evidence="„nach Erfordernis“",
                        question_de="Bis zu welcher Tiefe ist der Aushub vorgesehen?", **ask)], {}

    monkeypatch.setattr(api, "run_llm_checks", review)
    assert client.post(f"/api/analyses/{analysis_id}/llm").status_code == 200
    return analysis_id


def test_the_message_is_german_numbers_its_questions_and_states_nothing_else():
    lv = {"name": "Bachdurchlass", "file": "LV.X83", "number": "152516"}
    q = [{"item_oz": "2.12", "page": 5, "item_label": "Grubenkies", "question": "Welche Körnung?",
          "related_oz": ["2.13"], "evidence": "„Körnung 0/X“"},
         {"item_oz": "3.1", "page": None, "item_label": "Rohr", "question": "Welche Nennweite?", "related_oz": [],
          "evidence": ""}]
    subject, body = mail.compose(lv, q, "Erika Muster\nMuster Bau GmbH")
    assert subject == "Bieterfragen – Bachdurchlass (152516)"
    assert "Frage 1 – Position 2.12 (Seite 5): Grubenkies\nWelche Körnung?\nBetrifft auch: Position 2.13\n" in body
    assert "Frage 2 – Position 3.1: Rohr\nWelche Nennweite?\n\n" in body
    assert body.startswith("Sehr geehrte Damen und Herren,") and body.endswith("Erika Muster\nMuster Bau GmbH\n")
    assert "folgende Bieterfragen" in body and "folgende Bieterfrage " in mail.compose(lv, q[:1])[1]


def test_a_draft_is_kept_per_question_and_counts_as_sent_once_the_user_says_so(database, monkeypatch):
    client = TestClient(api.app)
    analysis_id = opened(client, monkeypatch)
    state = client.get(f"/api/analyses/{analysis_id}/questions").json()
    assert state["account"] is None and state["lv"]["file"] == D.name
    assert [q["status"] for q in state["questions"]] == ["new", "new"]
    first, second = (q["key"] for q in state["questions"])  # LV order: 2.5 before 2.12

    draft = client.post(f"/api/analyses/{analysis_id}/questions/compose", json={"keys": [second]}).json()
    assert "Frage 1 – Position 2.12" in draft["body"] and "Position 2.5" not in draft["body"]
    assert client.post(f"/api/analyses/{analysis_id}/questions/mails",
                       json={"keys": [second], "to": "nobody", **draft}).status_code == 422
    state = client.post(f"/api/analyses/{analysis_id}/questions/mails",
                        json={"keys": [second], "to": "vergabe@example.org", **draft}).json()
    assert [q["status"] for q in state["questions"]] == ["new", "drafted"]
    mail_id = state["mails"][0]["id"]
    # the same message as a file for the mail program: unsent, whole, without a sender
    file = client.get(f"/api/mails/{mail_id}/message.eml")
    assert file.headers["content-type"] == "message/rfc822"
    day = state["mails"][0]["created"][:10]
    assert file.headers["content-disposition"] == f'attachment; filename="Bieterfragen_Bachdurchlass_152516_{day}.eml"'
    assert mail.file_name("Bieterfragen – Straße & Brücke „Süd“ (79-222)", "2026-11-21T10:00:00") == \
        "Bieterfragen_Strasse_Bruecke_Sued_79-222_2026-11-21.eml"
    message = message_from_string(file.content.decode(), policy=email_policy)
    assert message["X-Unsent"] == "1" and message["To"] == "vergabe@example.org" and message["From"] is None
    assert message["Subject"] == draft["subject"]
    assert message.get_content().replace("\r\n", "\n").strip() == draft["body"].strip() and "Körnung" in draft["body"]
    assert client.patch(f"/api/mails/{mail_id}", json={"sent": True}).json()["sent_at"]

    # the same file opened again is a new analysis: what was asked is still known
    again = client.get("/api/catalog/D/files/0").json()["id"]
    monkeypatch.setattr(api, "_PROJECT_OF", {})  # as after a restart of the server
    # before the AI review has run again the question that was asked is still there, from the message
    kept = client.get(f"/api/analyses/{again}/questions").json()["questions"]
    assert [(q["item_oz"], q["status"]) for q in kept] == [("2.12", "sent")] and kept[0]["item_label"]
    assert client.post(f"/api/analyses/{again}/llm").status_code == 200
    assert [q["status"] for q in client.get(f"/api/analyses/{again}/questions").json()["questions"]] == ["new", "sent"]

    assert client.delete(f"/api/mails/{mail_id}").status_code == 204
    assert client.get(f"/api/analyses/{again}/questions").json()["mails"] == []


def test_the_app_sends_only_with_an_account_and_says_why_not(database, monkeypatch):
    client = TestClient(api.app)
    analysis_id = opened(client, monkeypatch)
    keys = [q["key"] for q in client.get(f"/api/analyses/{analysis_id}/questions").json()["questions"]]
    out = {"keys": keys, "to": "vergabe@example.org", "subject": "Bieterfragen", "body": "Text", "via": "smtp"}
    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_PORT"):
        monkeypatch.delenv(name, raising=False)
    refused = client.post(f"/api/analyses/{analysis_id}/questions/mails", json=out)
    assert refused.status_code == 503 and "SMTP_HOST" in refused.json()["detail"]
    assert client.get(f"/api/analyses/{analysis_id}/questions").json()["mails"] == []  # nothing kept as sent

    sent = []

    class Server:
        def __init__(self, host, port, timeout=None):
            sent.append((host, port))

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def ehlo(self):
            sent.append("ehlo") if "ehlo" not in sent else None

        def has_extn(self, name):
            return "ehlo" in sent  # a server names its extensions only after the greeting

        def starttls(self, context=None):
            sent.append("tls")

        def login(self, user, password):
            sent.append((user, password))

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr(mail.smtplib, "SMTP", Server)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_USER", "kalkulation@example.org")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    state = client.post(f"/api/analyses/{analysis_id}/questions/mails", json=out).json()
    assert state["account"] == "kalkulation@example.org"
    assert sent[:4] == [("smtp.example.org", 587), "ehlo", "tls", ("kalkulation@example.org", "secret")]
    assert sent[4]["To"] == "vergabe@example.org" and sent[4]["From"] == "kalkulation@example.org"
    assert sent[4].get_content().strip() == "Text"
    assert [q["status"] for q in state["questions"]] == ["sent", "sent"]
    assert client.delete(f"/api/mails/{state['mails'][0]['id']}").status_code == 422  # it went out: it stays


def test_a_reply_answers_a_question_only_with_a_passage_that_is_in_it(database, monkeypatch):
    client = TestClient(api.app)
    analysis_id = opened(client, monkeypatch)
    state = client.get(f"/api/analyses/{analysis_id}/questions").json()
    keys = [q["key"] for q in state["questions"]]
    state = client.post(f"/api/analyses/{analysis_id}/questions/mails",
                        json={"keys": keys, "to": "vergabe@example.org", "subject": "s", "body": "b"}).json()
    mail_id = state["mails"][0]["id"]
    reply = "Zu Frage 1: Der Aushub ist bis 2,50 m\nTiefe vorgesehen.\nZu Frage 2 folgt eine Antwort."

    class Messages:
        async def create(self, **request):
            assert "<reply>" in request["messages"][0]["content"] and "Bis zu welcher Tiefe" in request["messages"][0]["content"]
            text = ('{"answers": [{"no": 1, "status": "answered", "quote": "Der Aushub ist bis 2,50 m Tiefe vorgesehen.",'
                    ' "meaning": "Excavation to 2.50 m."}, {"no": 2, "status": "answered", "quote": "Körnung 0/32",'
                    ' "meaning": "Grading 0/32."}]}')
            block = type("Block", (), {"type": "text", "text": text})
            return type("Response", (), {"stop_reason": "end_turn", "content": [block]})

    fake = type("Client", (), {"beta": type("Beta", (), {"messages": Messages()})})
    read = asyncio.run(mail.read_reply(state["mails"][0]["items"], reply, client=fake))
    assert read["dropped"] == 1  # "Körnung 0/32" is not in the reply
    assert read["answers"][keys[0]] == {"status": "answered", "quote": "Der Aushub ist bis 2,50 m Tiefe vorgesehen.",
                                        "meaning": "Excavation to 2.50 m.", "change": None}
    assert read["answers"][keys[1]] == {"status": "not_answered", "quote": "", "meaning": "", "change": None}

    async def reading(items, text, client=None):
        return read

    monkeypatch.setattr(mail, "read_reply", reading)
    kept = client.post(f"/api/mails/{mail_id}/reply", json={"text": reply}).json()
    assert kept["sent_at"] and kept["dropped"] == 1  # an answer came, so the draft went out
    after = client.get(f"/api/analyses/{analysis_id}/questions").json()["questions"]
    assert [q["status"] for q in after] == ["answered", "sent"]
    assert after[0]["answer"]["quote"].startswith("Der Aushub") and after[0]["findings"] == ["L-UNCLEAR-SCOPE|2.5|„nach Erfordernis“"]
    assert client.post(f"/api/mails/{mail_id}/reply", json={"text": "kurz"}).status_code == 422


def test_a_message_goes_through_a_real_smtp_conversation_whole(monkeypatch):
    """Not a stand-in for smtplib: a server on a loopback socket that speaks SMTP and keeps what it is
    given. The German text arrives as written: umlauts, quotes, long lines, a line starting with a dot."""
    received = {}

    class Session(socketserver.StreamRequestHandler):
        def handle(self):
            say = lambda line: self.wfile.write(line.encode() + b"\r\n")
            say("220 test ESMTP")
            while (line := self.rfile.readline()):
                verb = line.decode().strip().upper()
                if verb.startswith("EHLO"):
                    self.wfile.write(b"250-test\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n")
                elif verb.startswith("MAIL FROM"):
                    received["from"] = line.decode().strip()
                    say("250 ok")
                elif verb.startswith("RCPT TO"):
                    received["to"] = line.decode().strip()
                    say("250 ok")
                elif verb == "DATA":
                    say("354 go on")
                    data = b""
                    while not data.endswith(b"\r\n.\r\n"):
                        data += self.rfile.readline()
                    # undo the dot-stuffing of the transfer, as a mail server does
                    received["data"] = b"\r\n".join(l[1:] if l.startswith(b"..") else l
                                                     for l in data[:-5].split(b"\r\n"))
                    say("250 queued")
                elif verb == "QUIT":
                    say("221 bye")
                    return
                else:
                    say("250 ok")

    lv = {"name": "Bachdurchlass", "file": "GAEB-[PROJEKT_004].X83", "number": "152516"}
    questions = [{"item_oz": f"2.{n}", "page": None, "item_label": "Rohrgrabenaushub, bis 2 m, seitlich lagern",
                  "question": "Wir bitten um Mitteilung, ob die Straßenquerung unter Vollsperrung auszuführen ist. " * 4,
                  "related_oz": [], "evidence": "„Größe nach Erfordernis“"} for n in range(1, 41)]
    subject, body = mail.compose(lv, questions, "Erika Muster\n.Muster Tiefbau GmbH")  # a line that starts with a dot
    with socketserver.TCPServer(("127.0.0.1", 0), Session) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        monkeypatch.setenv("SMTP_HOST", "127.0.0.1")
        monkeypatch.setenv("SMTP_PORT", str(server.server_address[1]))
        monkeypatch.setenv("SMTP_FROM", "kalkulation@example.org")
        monkeypatch.delenv("SMTP_USER", raising=False)
        mail.send("vergabestelle@example.org", subject, body)
        server.shutdown()
    assert "kalkulation@example.org" in received["from"] and "vergabestelle@example.org" in received["to"]
    message = message_from_string(received["data"].decode("utf-8"), policy=email_policy)
    assert message["Subject"] == subject and message["To"] == "vergabestelle@example.org"
    # the transfer ends lines with CR LF; apart from that the text is the one that was written
    assert message.get_content().replace("\r\n", "\n").strip() == body.strip()
    assert len(body) > 15_000 and body.count("Frage ") == 40 and "\n.Muster Tiefbau GmbH" in body


def test_the_clients_address_is_read_from_the_file(tmp_path):
    """Where the questions go: the owner's address of a GAEB file, the letterhead or the cover of a PDF.
    The dataset has tokens in place of addresses; a file with a real one gives the address."""
    from pathlib import Path

    from boq.parsers.gaeb_xml import parse_gaeb_xml
    from boq.parsers.pdf import parse_pdf

    dataset = Path(__file__).parent.parent / "dataset"
    x83 = dataset / "01_gaeb_xml" / "[NUMMER_001]_leer.X83"
    assert parse_gaeb_xml(str(x83)).client_email == "[EMAIL_004]"
    real = tmp_path / "lv.x83"
    real.write_text(x83.read_text(encoding="utf-8").replace("[EMAIL_004]", "vergabe@bauamt-musterstadt.de"), encoding="utf-8")
    assert parse_gaeb_xml(str(real)).client_email == "vergabe@bauamt-musterstadt.de"
    # every page of the inquiry carries the sender's letterhead
    assert parse_pdf(str(dataset / "03_pdf_hochbau_projekt" / "LV_03_Malerarbeiten.pdf")).client_email == "[EMAIL_009]"
    # a bid is the contractor's own paper: its letterhead is not the client's
    assert parse_pdf(str(dataset / "04_pdf_tiefbau_sonstige" / "Angebot AN24-0305.pdf")).client_email == ""


def test_a_reply_in_the_inbox_is_found_read_and_put_up_as_amendments(database, monkeypatch):
    """The app sends, the client answers by e-mail, the app finds the answer in the inbox by the message it
    names, reads it, and proposes what it changes on our side; the estimator decides each."""
    from email.message import EmailMessage

    client = TestClient(api.app)
    analysis_id = opened(client, monkeypatch)
    keys = [q["key"] for q in client.get(f"/api/analyses/{analysis_id}/questions").json()["questions"]]

    class Smtp:
        def __init__(self, *_, **__): pass
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def ehlo(self): pass
        def has_extn(self, name): return False
        def send_message(self, message): pass

    monkeypatch.setattr(mail.smtplib, "SMTP", Smtp)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_FROM", "kalkulation@example.org")
    for name in ("SMTP_USER", "SMTP_PASSWORD", "IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"):
        monkeypatch.setenv(name, "")  # empty, not unset: the developer's own .env must not fill them in
    assert client.post(f"/api/analyses/{analysis_id}/questions/replies").status_code == 503  # no inbox set
    state = client.post(f"/api/analyses/{analysis_id}/questions/mails", json={
        "keys": keys, "to": "vergabe@example.org", "subject": "Bieterfragen – Bachdurchlass", "body": "Text",
        "via": "smtp"}).json()
    ours = state["mails"][0]["message_id"]
    assert ours and state["inbox"] is None

    def message(subject, sender, text, **headers):
        m = EmailMessage()
        m["Subject"], m["From"] = subject, sender
        headers.setdefault("Message_ID", f"<{len(text)}@client.example>")
        for name, value in headers.items():
            m[name.replace("_", "-")] = value
        m.set_content(text)
        return m.as_bytes()

    answer = ("Sehr geehrte Damen und Herren,\n\nzu Frage 1: Die Menge wird auf 150 m3 geändert, Aushubtiefe bis 2,50 m.\n"
              "Zu Frage 2: Die Körnung wird nachgereicht.\n\nMit freundlichen Grüßen\n\n"
              "Am 21.11.2026 um 18:00 schrieb kalkulation@example.org:\n> Frage 1 – Position 2.5\n> Körnung 0/32\n")
    box = {b"1": message("Newsletter", "news@example.org", "Körnung 0/32 im Angebot"),
           # our own message, as a mailbox shows it when the address written to is our own
           b"2": message("AW: Bieterfragen – Bachdurchlass", "vergabe@example.org", "Text", Message_ID=ours),
           b"3": message("AW: Bieterfragen – Bachdurchlass", "Vergabe <vergabe@example.org>", answer, In_Reply_To=ours)}
    asked = []

    class Imap:
        error = mail.imaplib.IMAP4.error

        def __init__(self, host, port, ssl_context=None, timeout=None): asked.append((host, port))
        def login(self, user, password): asked.append((user, password))
        def select(self, folder, readonly=False): asked.append((folder, readonly))
        def logout(self): pass

        def uid(self, command, *args):
            if command == "SEARCH":
                return "OK", [b" ".join(box)]
            uid, what = args
            raw = box[uid]
            if "HEADER" in what:
                raw = raw.split(b"\n\n", 1)[0] + b"\n\n"
            return "OK", [(b"x", raw), b")"]

    monkeypatch.setattr(mail.imaplib, "IMAP4_SSL", Imap)
    monkeypatch.setenv("IMAP_HOST", "imap.example.org")
    monkeypatch.setenv("IMAP_USER", "kalkulation@example.org")
    monkeypatch.setenv("IMAP_PASSWORD", "secret")
    read_texts = []

    async def reading(items, text, client=None):
        read_texts.append(text)
        return mail.match_answers(items, text, [
            {"no": 1, "status": "answered", "quote": "Die Menge wird auf 150 m3 geändert, Aushubtiefe bis 2,50 m.",
             "meaning": "Excavate to 2.50 m; the quantity is now 150 m3.", "change_field": "quantity", "change_value": "150"},
            {"no": 2, "status": "partly", "quote": "Die Körnung wird nachgereicht.", "meaning": "Grading follows later.",
             "change_field": "unit", "change_value": "t"}])  # a change the passage does not state

    monkeypatch.setattr(mail, "read_reply", reading)
    state = client.post(f"/api/analyses/{analysis_id}/questions/replies").json()
    assert state["found"] == 1 and state["inbox"] == "kalkulation@example.org"
    assert asked == [("imap.example.org", 993), ("kalkulation@example.org", "secret"), ("INBOX", True)]
    assert read_texts[0].startswith("Sehr geehrte") and "schrieb" not in read_texts[0] and "0/32" not in read_texts[0]
    assert state["mails"][0]["reply_via"] == "imap"
    assert [q["status"] for q in state["questions"]] == ["answered", "partly"]
    proposed = [(a["item_oz"], a["kind"], a["status"]) for a in state["amendments"]]
    assert proposed == [("2.5", "settle", "proposed"), ("2.5", "quantity", "proposed"),
                        ("2.12", "note", "proposed"), ("2.12", "allowance", "proposed")]
    settle, quantity, _, allowance = state["amendments"]
    assert settle["value"]["findings"] == ["L-UNCLEAR-SCOPE|2.5|„nach Erfordernis“"] and quantity["value"] == {"to": "150", "number": "150"}
    assert client.post(f"/api/analyses/{analysis_id}/questions/replies").json()["found"] == 0  # read once

    def decide(amendment, **body):
        return client.patch(f"/api/amendments/{amendment['id']}", json=body)

    assert decide(settle, status="accepted").json()["status"] == "accepted"
    assert decide(quantity, status="accepted", value={"to": "1.250,5"}).json()["value"]["number"] == "1250.5"
    assert decide(quantity, status="accepted", value={"to": "viel"}).status_code == 422
    assert decide(allowance, status="accepted").status_code == 422  # the app proposes no figure
    assert decide(allowance, status="accepted", value={"percent": "7,5"}).json()["value"]["percent"] == 7.5
    kept = {a["kind"]: a["status"] for a in client.get(f"/api/analyses/{analysis_id}/questions").json()["amendments"]}
    assert kept == {"settle": "accepted", "quantity": "accepted", "note": "proposed", "allowance": "accepted"}
