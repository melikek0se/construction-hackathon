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

        def has_extn(self, name):
            return True

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
    assert sent[:3] == [("smtp.example.org", 587), "tls", ("kalkulation@example.org", "secret")]
    assert sent[3]["To"] == "vergabe@example.org" and sent[3]["From"] == "kalkulation@example.org"
    assert sent[3].get_content().strip() == "Text"
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
                                        "meaning": "Excavation to 2.50 m."}
    assert read["answers"][keys[1]] == {"status": "not_answered", "quote": "", "meaning": ""}

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
