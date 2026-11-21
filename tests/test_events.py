"""The mailbox is watched for every project at once, and what was read is noted."""
from pathlib import Path

from fastapi.testclient import TestClient

from boq import catalog, events, mail, supply
from boq import api
from boq.api import app

DATASET = Path(__file__).parent.parent / "dataset"
client = TestClient(app)


def test_one_sweep_reads_a_supplier_s_reply_found_in_the_inbox_and_notes_what_happened(monkeypatch):
    path = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    pid = client.post("/api/projects", files=[("files", (path.name, path.read_bytes()))], data={"name": "Swept"}).json()["id"]
    opened = client.get(f"/api/catalog/{pid}/files/0").json()
    aid, ozs = opened["id"], [i["oz"] for i in opened["boq"]["items"] if i["qty"]][:2]
    sid = client.post("/api/suppliers", json={"name": "Rohrhandel Nord", "email": "nord@example.org"}).json()["id"]
    try:
        assert client.post("/api/inbox/sweep").status_code == 503  # no inbox set: said, not an error page

        async def planned(boq, skip, client=None):
            return supply.check_plan([{"name": "Rohre", "kind": "material", "why": "", "items": ozs, "ask": [sid]}], boq.items, supply.suppliers())

        async def read(asked, reply, client=None):
            raw = [{"pos": ozs[0], "unit_price": 12.5, "unit": asked[0]["unit"], "product": "", "alternative": False, "quote": "12,50", "note": ""}]
            return {**supply.match_lines(asked, reply, raw, {}), "kind": "quote", "summary": "", "asks": []}

        async def no_tenders(messages):
            return {"looked": 0, "taken": [], "passed": []}

        monkeypatch.setattr(supply, "plan", planned)
        monkeypatch.setattr(supply, "read_quote", read)
        client.post(f"/api/analyses/{aid}/supply/plan")
        draft = client.post(f"/api/analyses/{aid}/supply/compose", json={"package": "p1", "supplier_id": sid}).json()
        state = client.post(f"/api/analyses/{aid}/supply/mails", json={"package": "p1", "supplier_id": sid, "to": draft["to"],
                                                                      "subject": draft["subject"], "body": draft["body"]}).json()
        mail.set_sent(state["packages"][0]["ask"][0]["mail"]["id"], True)
        monkeypatch.setattr(mail, "inbox", lambda: {"user": "me@example.org"})
        monkeypatch.setattr(mail, "find_replies", lambda mails: [(m, "Pos 1: 12,50 EUR") for m in mails if m["kind"] == supply.PRICE_INQUIRY])
        monkeypatch.setattr(api.inbox, "recent", lambda known: [])
        got = client.post("/api/inbox/sweep").json()
        assert got == {"answers": 0, "quotes": 1, "tenders": []}
        assert client.get(f"/api/analyses/{aid}/supply").json()["packages"][0]["ask"][0]["status"] == "answered"
        said = client.get("/api/events", params={"project": pid}).json()
        assert said[0]["kind"] == "quote" and "Rohrhandel Nord quoted from the inbox: 1 of 2 items priced" in said[0]["text"]
        assert said[0]["move"] == "you" and said[0]["project"] == "Swept"
        assert client.post("/api/inbox/sweep").json()["quotes"] == 0  # read once
        assert client.get("/api/events", params={"after": said[0]["id"]}).json() == []
    finally:
        catalog.remove_project(pid)
        supply.remove_supplier(sid)
    assert events.KINDS


def test_the_hand_over_sheet_orders_the_findings_for_the_site():
    opened = client.get("/api/catalog/B/files/0").json()
    page = client.get(f"/api/analyses/{opened['id']}/handover.html")
    assert page.status_code == 200 and "Hand-over to the site" in page.text
    assert "Where a change order can arise" in page.text and "On site:" in page.text and "§2 Abs." in page.text
    assert "No bidder question was sent for this LV." in page.text
