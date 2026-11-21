"""Questions about a project, answered from its documents only (src/boq/chat.py). No network."""
import asyncio
from decimal import Decimal

from fastapi.testclient import TestClient

from boq import api, chat
from boq.model import BoQ, Item, Remark, SourceRef

client = TestClient(api.app)


def lv(file, items, remarks=()):
    return BoQ(file=file, format="gaeb_xml", name=file, remarks=[Remark(text=t) for t in remarks], items=[
        Item(oz=oz, short_text=short, long_text=long, qty=Decimal(1), unit_raw="St", unit="St",
             source=SourceRef(file=file)) for oz, short, long in items])


ROOF = lv("LV_12_Dach.pdf", [("6.1.180", "Dachabläufe einbauen", "Bauseitig gelieferte Dachabläufe einbauen und anschließen.")],
          remarks=["Gerüste werden bauseits gestellt."])
DRAIN = lv("LV_14b_Entwaesserung.pdf", [("7.1.10", "Anschluss Dachablauf", "Anschluss an bauseitigen Dachablauf DN 100.")])


def ask(raw, monkeypatch, documents=(ROOF, DRAIN), history=()):
    seen = {}

    async def fake_ask(client, documents_text, history, question, open_text=""):
        seen.update(documents=documents_text, history=history, question=question, open=open_text)
        return raw

    monkeypatch.setattr(chat, "_ask", fake_ask)
    out = asyncio.run(chat.answer("Wer liefert die Dachabläufe?", list(history), list(documents), client=object()))
    return out, seen


def test_the_model_reads_every_document_of_the_project(monkeypatch):
    _, seen = ask({"answer": "x", "found": False, "citations": []}, monkeypatch)
    for part in ("LV_12_Dach.pdf", "LV_14b_Entwaesserung.pdf", "6.1.180", "7.1.10",
                 "Bauseitig gelieferte Dachabläufe einbauen und anschließen.", "Gerüste werden bauseits gestellt."):
        assert part in seen["documents"]
    assert seen["question"] == "Wer liefert die Dachabläufe?"


def test_a_citation_is_kept_only_if_its_quote_stands_in_that_item(monkeypatch):
    out, _ = ask({"answer": "Beide LVs erwarten sie bauseits.", "found": True, "citations": [
        {"file": "LV_12_Dach.pdf", "oz": "6.1.180", "quote": "Bauseitig gelieferte  Dachabläufe einbauen"},  # spacing differs
        {"file": "LV_14b_Entwaesserung.pdf", "oz": "7.1.10", "quote": "Anschluss an bauseitigen Dachablauf DN 100"},
        {"file": "LV_14b_Entwaesserung.pdf", "oz": "7.1.10", "quote": "Der Dachdecker liefert die Abläufe"},  # not in the LV
        {"file": "LV_12_Dach.pdf", "oz": "7.1.10", "quote": "Anschluss an bauseitigen Dachablauf DN 100"},  # wrong file
        {"file": "LV_99.pdf", "oz": "1.1", "quote": "Bauseitig gelieferte Dachabläufe"},  # no such document
        {"file": "LV_12_Dach.pdf", "oz": "", "quote": "Gerüste werden bauseits gestellt"},  # from the remarks
    ]}, monkeypatch)
    assert [(c["file"], c["oz"]) for c in out["citations"]] == [
        ("LV_12_Dach.pdf", "6.1.180"), ("LV_14b_Entwaesserung.pdf", "7.1.10"), ("LV_12_Dach.pdf", "")]
    assert out["citations"][0]["quote"] == "Bauseitig gelieferte Dachabläufe einbauen"
    assert out["found"] is True and out["grounded"] is True and out["dropped"] == 3


def test_an_answer_without_a_confirmed_passage_says_so(monkeypatch):
    out, _ = ask({"answer": "Der Rohbauer.", "found": True, "citations": [
        {"file": "LV_12_Dach.pdf", "oz": "6.1.180", "quote": "liefert der Rohbauer"}]}, monkeypatch)
    assert out["citations"] == [] and out["grounded"] is False


def test_not_in_the_documents_is_a_valid_answer(monkeypatch):
    out, _ = ask({"answer": "Not in the project documents.", "found": False, "citations": []}, monkeypatch)
    assert out["found"] is False and out["grounded"] is True and out["citations"] == []


def test_earlier_turns_go_along_and_the_documents_stay_first(monkeypatch):
    history = [{"role": "user", "content": "Was ist bauseits?"}, {"role": "assistant", "content": "Die Gerüste."}]
    messages = chat._messages("DOCS", history, "Und die Abläufe?")
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    first = messages[0]["content"]
    assert first[0]["text"] == "DOCS" and first[0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert first[1]["text"] == "Was ist bauseits?" and messages[-1]["content"] == "Und die Abläufe?"
    assert chat._messages("DOCS", [], "Erste Frage")[0]["content"][1]["text"] == "Erste Frage"
    two = chat._messages("DOCS", [], "Frage", open_text="OPEN")[0]["content"]
    assert [b["text"] for b in two] == ["DOCS", "OPEN", "Frage"] and "cache_control" in two[1] and "cache_control" not in two[2]


def test_api_answers_from_the_other_files_of_the_project(monkeypatch):
    """Project C: the offer (D84) carries no texts; the answer comes from the tender in the same project."""
    seen = {}

    async def fake_ask(client, documents_text, history, question, open_text=""):
        seen.update(documents=documents_text, open=open_text, question=question)
        return {"answer": "Yes, item 1.1.10.", "found": True, "citations": [
            {"file": "Leistungsverzeichnis.pdf", "oz": "1.1.10", "quote": "Baustelleneinrichtung herstellen"}]}

    monkeypatch.setattr(chat, "_ask", fake_ask)
    offer = client.get("/api/catalog/C/files/2").json()
    r = client.post(f"/api/analyses/{offer['id']}/chat", json={"question": "Is site set-up an item?", "history": []})
    assert r.status_code == 200
    body = r.json()
    # the tender stands for the LV in the shared, cacheable block; the open bid follows on its own
    assert "Leistungsverzeichnis.pdf" in seen["documents"] and "Angebot AN24-0305.D84" not in seen["documents"]
    assert 'file="Angebot AN24-0305.D84"' in seen["open"] and 'file "Angebot AN24-0305.D84" open' in seen["question"]
    tender = client.get("/api/catalog/C/files/0").json()  # another file of the project: the same shared block
    before = seen["documents"]
    client.post(f"/api/analyses/{tender['id']}/chat", json={"question": "Is site set-up an item?", "history": []})
    assert seen["documents"] == before and seen["open"] == ""
    assert body["documents"] == ["Angebot AN24-0305.D84", "Leistungsverzeichnis.pdf"]  # the open file first; one per LV text
    cite = body["citations"][0]
    assert cite["file"] == "Leistungsverzeichnis.pdf" and cite["index"] == 0 and cite["here"] is False


def test_api_chat_without_a_project_reads_the_open_lv(monkeypatch):
    async def fake_ask(client, documents_text, history, question, open_text=""):
        return {"answer": "x", "found": False, "citations": []}

    monkeypatch.setattr(chat, "_ask", fake_ask)
    body = client.get("/api/samples/analyze", params={"path": "01_gaeb_xml/GAEB-[PROJEKT_004].X83"}).json()
    r = client.post(f"/api/analyses/{body['id']}/chat", json={"question": "Wo?", "history": []}).json()
    assert r["documents"] == ["GAEB-[PROJEKT_004].X83"] and r["found"] is False
    assert client.post(f"/api/analyses/{body['id']}/chat", json={"question": "  ", "history": []}).status_code == 422
    assert client.post("/api/analyses/nope/chat", json={"question": "Wo?", "history": []}).status_code == 404


def test_a_passage_of_an_answer_is_found_on_the_pages():
    """A click on a passage shows it on the page: the same search as for findings, inside the item."""
    tender = client.get("/api/catalog/C/files/0").json()
    url = f"/api/analyses/{tender['id']}/locate"
    hit = client.post(url, json={"oz": "1.1.10", "quote": "Baustelleneinrichtung herstellen, einschließlich Beschaffen"}).json()
    assert hit["located"] == "quote" and hit["page"] == 1 and hit["rects"]
    line = client.post(url, json={"oz": "1.1.10", "quote": "steht nirgends im Text dieser Position"}).json()
    assert line["located"] == "item" and line["page"] == 1
    assert client.post(url, json={"oz": "9.9.9", "quote": "steht nirgends"}).json()["located"] == "none"
    drawn = client.get("/api/catalog/E/files/0").json()  # pages drawn by the app: remarks are on them too
    remark = drawn["boq"]["remarks"][0]["text"].split("\n")[0][:60]
    found = client.post(f"/api/analyses/{drawn['id']}/locate", json={"oz": "", "quote": remark}).json()
    assert found["located"] == "quote" and found["page"] == 1
    assert client.post("/api/analyses/nope/locate", json={"oz": "", "quote": "x"}).status_code == 404


def test_placeholders_are_to_be_kept_as_written():
    assert "keep the placeholder exactly as written" in chat.SYSTEM


def test_on_the_project_overview_no_file_is_open(monkeypatch):
    seen = {}

    async def fake_ask(client, documents_text, history, question, open_text=""):
        seen.update(question=question, open=open_text)
        return {"answer": "x", "found": False, "citations": []}

    monkeypatch.setattr(chat, "_ask", fake_ask)
    tender = client.get("/api/catalog/C/files/0").json()
    r = client.post(f"/api/analyses/{tender['id']}/chat", json={"question": "Wo?", "history": [], "reading": False}).json()
    assert seen["question"] == "Wo?" and seen["open"] == "" and r["documents"] == ["Leistungsverzeichnis.pdf"]
