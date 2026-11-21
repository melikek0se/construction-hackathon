"""API smoke tests: upload, sample listing, error messages."""
from pathlib import Path

from fastapi.testclient import TestClient

from boq.api import app

client = TestClient(app)
D = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"


def test_upload_returns_items_and_findings():
    with open(D, "rb") as fh:
        r = client.post("/api/analyze", files={"file": (D.name, fh)})
    assert r.status_code == 200
    body = r.json()
    assert body["boq"]["file"] == D.name and len(body["boq"]["items"]) == 50
    assert any(f["check_id"] == "C-TRENCH-SHORING" for f in body["findings"])


def test_samples_are_listed_and_analysed():
    samples = client.get("/api/samples").json()
    assert len(samples) == 43  # 9 GAEB files and 34 PDFs
    priced = next(s for s in samples if s["name"] == "Angebot AN24-0305.D84")
    body = client.get("/api/samples/analyze", params={"path": priced["path"]}).json()
    assert len(body["boq"]["items"]) == 274


def test_uploaded_pdf_keeps_its_name():
    pdf = D.parent.parent / "04_pdf_tiefbau_sonstige" / "LV-Schachtbauwerk.pdf"
    with open(pdf, "rb") as fh:
        body = client.post("/api/analyze", files={"file": (pdf.name, fh)}).json()
    assert body["boq"]["name"] == "LV-Schachtbauwerk"  # not "upload": the name is part of the LLM cache key


def test_errors_say_what_to_do():
    r = client.post("/api/analyze", files={"file": ("lv.docx", b"PK")})
    assert r.status_code == 415 and "GAEB" in r.json()["detail"]
    r = client.post("/api/analyze", files={"file": ("lv.pdf", b"%PDF-1.4 broken")})
    assert r.status_code == 422
    r = client.post("/api/analyze", files={"file": ("lv.x83", b"not xml")})
    assert r.status_code == 422
    assert client.get("/api/samples/analyze", params={"path": "../pyproject.toml"}).status_code == 404


def test_pdf_sample_serves_its_source_and_marks():
    path = "04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf"
    body = client.get("/api/samples/analyze", params={"path": path}).json()
    assert body["pdf"] is True
    src = client.get(f"/api/analyses/{body['id']}/source.pdf")
    assert src.status_code == 200 and src.content[:5] == b"%PDF-"
    assert src.headers["content-type"] == "application/pdf"
    marks = client.get(f"/api/analyses/{body['id']}/marks").json()
    assert [m["finding"] for m in marks["marks"]] == list(range(len(body["findings"])))
    for f, m in zip(body["findings"], marks["marks"]):
        assert f["item_oz"] == m["oz"]
        # the browser matches marks to its findings by this key: after an AI review its list is in
        # another order than the server's (AI findings appended, not sorted in)
        assert m["key"] == f'{f["check_id"]}|{f["item_oz"] or ""}|{f["evidence"]}'
    assert client.get(f"/api/analyses/{body['id']}").json()["pdf"] is True


def test_no_pdf_view_for_a_pdf_that_was_not_kept():
    pdf = D.parent.parent / "04_pdf_tiefbau_sonstige" / "LV-Schachtbauwerk.pdf"
    with open(pdf, "rb") as fh:  # a temporary upload: the file is gone after the request
        body = client.post("/api/analyze", files={"file": (pdf.name, fh)}).json()
    assert body["pdf"] is False and body["pdf_generated"] is False
    for tail in ("source.pdf", "marks"):
        r = client.get(f"/api/analyses/{body['id']}/{tail}")
        assert r.status_code == 404 and "PDF" in r.json()["detail"]
    assert client.get("/api/analyses/nope/marks").status_code == 404


def test_an_lv_without_a_pdf_gets_pages_drawn_from_it():
    """GAEB and Excel files have no pages: the app draws them, and marks the findings on those."""
    sample = client.get("/api/samples/analyze", params={"path": "01_gaeb_xml/" + D.name}).json()
    with open(D, "rb") as fh:  # also for a temporary upload: the pages come from the parsed LV, not the file
        upload = client.post("/api/analyze", files={"file": (D.name, fh)}).json()
    for body in (sample, upload):
        assert body["pdf"] is True and body["pdf_generated"] is True
        src = client.get(f"/api/analyses/{body['id']}/source.pdf")
        assert src.status_code == 200 and src.content[:5] == b"%PDF-"
        marks = client.get(f"/api/analyses/{body['id']}/marks").json()
        assert set(marks["items"]) == {i["oz"] for i in body["boq"]["items"]}
        assert len(marks["marks"]) == len(body["findings"])
        assert all(m["located"] != "none" for f, m in zip(body["findings"], marks["marks"]) if f["item_oz"])
        assert client.get(f"/api/analyses/{body['id']}/source.pdf").content == src.content  # drawn once


def test_a_kept_pdf_is_shown_as_it_is():
    body = client.get("/api/samples/analyze", params={"path": "04_pdf_tiefbau_sonstige/LV-Schachtbauwerk.pdf"}).json()
    assert body["pdf"] is True and body["pdf_generated"] is False
    original = (D.parent.parent / "04_pdf_tiefbau_sonstige" / "LV-Schachtbauwerk.pdf").read_bytes()
    assert client.get(f"/api/analyses/{body['id']}/source.pdf").content == original


def test_marks_include_ai_findings_once_the_review_has_run():
    from boq import api
    from boq.model import Finding
    body = client.get("/api/samples/analyze", params={"path": "04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf"}).json()
    oz = body["boq"]["items"][0]["oz"]
    api._LLM_FINDINGS[body["id"]] = [Finding(  # what POST …/llm stores, without calling the model
        item_oz=oz, category="unclear_scope", check_id="L-UNCLEAR", severity="high", origin="llm",
        evidence="Baustelleneinrichtung herstellen", explanation="x", action="ask_client")]
    marks = client.get(f"/api/analyses/{body['id']}/marks").json()["marks"]
    assert len(marks) == len(body["findings"]) + 1
    ai = next(m for m in marks if m["key"] == f"L-UNCLEAR|{oz}|Baustelleneinrichtung herstellen")
    assert ai["located"] == "quote" and ai["page"] == 1


def test_marks_are_worked_out_once_per_set_of_findings(monkeypatch):
    from boq import api
    body = client.get("/api/samples/analyze", params={"path": "04_pdf_tiefbau_sonstige/LV-Schachtbauwerk.pdf"}).json()
    calls = []
    real = api.locate
    monkeypatch.setattr(api, "locate", lambda *a: calls.append(1) or real(*a))
    first = client.get(f"/api/analyses/{body['id']}/marks").json()
    assert client.get(f"/api/analyses/{body['id']}/marks").json() == first and len(calls) == 1
    api._LLM_FINDINGS[body["id"]] = []  # a review that added nothing: same findings, no new search
    client.get(f"/api/analyses/{body['id']}/marks")
    assert len(calls) == 1
