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


def test_an_invitation_to_bid_becomes_an_intake_project_once_and_other_mail_is_passed_over(monkeypatch, tmp_path):
    # a tender the app does not have yet: project D's LV under another number (its own would join project D)
    lv = tmp_path / "GAEB-Neu.X83"
    lv.write_bytes((DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83").read_bytes().replace(b"152516", b"990017"))
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
    # neither a message without an LV is put to the model, nor one whose LV is the tender just taken in
    assert asked == ["Ausschreibung Bachdurchlass"] and "already" in got["passed"][0]["why"]
    pid = got["taken"][0]["id"]
    try:
        plan = catalog.find(pid)["plan"]
        assert plan["stage"] == "intake" and plan["due"] == "2099-12-04"  # the deadline from the mail: the file states none
        assert plan["found"]["fit"] == "yes" and plan["found"]["sender"] == "vergabe@stadt.example" and plan["found"]["message_id"] == "<a@x>"
        assert client.get(f"/api/catalog/{pid}/summary").json()["checked"]  # an intake tender is checked as it arrives (D-065)
        # the same messages again: each was looked at once
        again = client.post("/api/inbox/messages", files=files).json()
        assert again == {"looked": 0, "taken": [], "passed": []}
    finally:
        catalog.remove_project(pid)
    assert client.post("/api/inbox/messages", files=[("files", ("x.txt", b"no mail"))]).status_code == 422
    assert client.get("/api/inbox").json() == {"user": None}


def test_an_lv_of_a_tender_that_is_a_project_joins_it_and_no_model_is_asked(monkeypatch):
    """A new document of a tender the app has (a second issue, the bid, the award) is added to that project
    by the tender's number; the same file a second time is not kept twice."""
    async def never(message, lvs, client=None):
        raise AssertionError("a file of a known tender must not be put to the model")

    monkeypatch.setattr(inbox, "read_invitation", never)
    held = len(catalog.find("D")["files"])
    lv = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"  # project D holds it: nothing to add
    got = client.post("/api/inbox/messages", files=[("files", ("a.eml", _eml("Bieterinformation", "Anbei.", lv, "<known-1@x>")))]).json()
    assert got["taken"] == [] and "already" in got["passed"][0]["why"] and len(catalog.find("D")["files"]) == held
    changed = lv.read_bytes() + b"\n"  # the same LV as another file
    m = EmailMessage()
    m["From"], m["To"], m["Subject"], m["Message-ID"] = "vergabe@stadt.example", "k@firma.example", "LV Stand 2", "<known-2@x>"
    m["Date"] = "Fri, 20 Nov 2026 09:12:00 +0100"
    m.set_content("Anbei das geaenderte LV.")
    m.add_attachment(changed, maintype="application", subtype="octet-stream", filename="LV_Stand2.X83")
    try:
        got = client.post("/api/inbox/messages", files=[("files", ("b.eml", m.as_bytes()))]).json()
        assert got["taken"] == [{"id": "D", "name": catalog.find("D")["name"]}]
        files = catalog.find("D")["files"]
        assert len(files) == held + 1 and files[-1]["name"] == "LV_Stand2.X83" and files[-1]["role"] == "tender"
        lv_view = client.get("/api/catalog/D/tender").json()["lvs"][0]
        assert len(lv_view["issues"]) == 2 and lv_view["carrier"] == held and not any(i["change"] for i in lv_view["items"])
    finally:
        files = catalog.find("D")["files"]
        if len(files) > held:
            catalog.remove_file("D", files[-1]["id"])
