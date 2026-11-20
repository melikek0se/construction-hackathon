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
    assert len(samples) == 9
    priced = next(s for s in samples if s["name"] == "Angebot AN24-0305.D84")
    body = client.get("/api/samples/analyze", params={"path": priced["path"]}).json()
    assert len(body["boq"]["items"]) == 274


def test_errors_say_what_to_do():
    r = client.post("/api/analyze", files={"file": ("lv.pdf", b"%PDF-1.4")})
    assert r.status_code == 415 and "GAEB" in r.json()["detail"]
    r = client.post("/api/analyze", files={"file": ("lv.x83", b"not xml")})
    assert r.status_code == 422
    assert client.get("/api/samples/analyze", params={"path": "../pyproject.toml"}).status_code == 404
