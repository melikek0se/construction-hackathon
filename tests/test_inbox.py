"""Tenders found in the mailbox: an invitation with an LV attached becomes a project in the intake."""
from email.message import EmailMessage
from pathlib import Path

from fastapi.testclient import TestClient

from boq import catalog, inbox
from boq.api import app

DATASET = Path(__file__).parent.parent / "dataset"
client = TestClient(app)


def _eml(subject: str, text: str, attach: Path | None, message_id: str, answers: str = "") -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = "Vergabestelle <vergabe@stadt.example>", "kalkulation@firma.example", subject
    m["Date"], m["Message-ID"] = "Fri, 20 Nov 2026 09:12:00 +0100", message_id
    if answers:
        m["In-Reply-To"] = answers
    m.set_content(text)
    if attach:
        m.add_attachment(attach.read_bytes(), maintype="application", subtype="octet-stream", filename=attach.name)
    return m.as_bytes()


def test_an_invitation_to_bid_becomes_an_intake_project_once_and_other_mail_is_passed_over(monkeypatch):
    lv = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    asked = []

    async def sorted_(message, lvs, client=None):
        asked.append(message["subject"])
        assert lvs[0]["items"] == 50 and message["sender"] == "vergabe@stadt.example"
        return {"tender": "Ausschreibung" in message["subject"], "summary": "The town asks for a bid on a culvert by 04.12.",
                "client": "Stadt Beispiel", "due": "2099-12-04", "fit": "yes", "why": "Earthworks and pipe laying."}

    monkeypatch.setattr(inbox, "read_invitation", sorted_)
    files = [("files", ("a.eml", _eml("Ausschreibung Bachdurchlass", "Bitte um Angebot bis 04.12.2099.", lv, "<a@x>"))),
             ("files", ("b.eml", _eml("Unser Angebot", "Anbei unser Angebot.", lv, "<b@x>"))),
             ("files", ("c.eml", _eml("Newsletter", "Neuigkeiten", None, "<c@x>")))]
    got = client.post("/api/inbox/messages", files=files).json()
    assert len(got["taken"]) == 1 and [p["why"] for p in got["passed"]][1] == "no attachment that is an LV"
    assert asked == ["Ausschreibung Bachdurchlass", "Unser Angebot"]  # a message without an LV is not put to the model
    pid = got["taken"][0]["id"]
    try:
        plan = catalog.find(pid)["plan"]
        assert plan["stage"] == "intake" and plan["due"] == "2099-12-04"  # the deadline from the mail: the file states none
        assert plan["found"]["fit"] == "yes" and plan["found"]["sender"] == "vergabe@stadt.example" and plan["found"]["message_id"] == "<a@x>"
        assert not client.get(f"/api/catalog/{pid}/summary").json()["checked"]  # in the intake nothing is checked
        # the same messages again: each was looked at once
        again = client.post("/api/inbox/messages", files=files).json()
        assert again == {"looked": 0, "taken": [], "passed": []}
    finally:
        catalog.remove_project(pid)
    assert client.post("/api/inbox/messages", files=[("files", ("x.txt", b"no mail"))]).status_code == 422
    assert client.get("/api/inbox").json() == {"user": None}
