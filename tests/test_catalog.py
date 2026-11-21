"""Projects page: the demo projects seeded from the dataset, the summaries, and projects created by upload."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from boq import api, catalog

client = TestClient(api.app)
DATASET = Path(__file__).parent.parent / "dataset"


def test_every_mapped_dataset_file_exists():
    for project in catalog.DATASET_PROJECTS:
        for rel, _role in project.get("files", []):
            assert (DATASET / rel).is_file(), rel


def test_catalog_lists_the_six_dataset_projects():
    projects = client.get("/api/catalog").json()
    assert [p["id"] for p in projects] == list("ABCDEF")
    by_id = {p["id"]: p for p in projects}
    assert by_id["F"]["kind"] == "trades" and len(by_id["F"]["files"]) == 27
    assert [f["role"] for f in by_id["B"]["files"]] == ["tender", "tender", "bid", "award", "submitted bid"]
    assert all(p["source"] == "demo" for p in projects)
    assert all("data" not in f for p in projects for f in p["files"])  # file bytes are not listed


def test_summary_counts_one_version_and_finds_the_net_total():
    a = client.get("/api/catalog/A/summary").json()
    assert a["lvs"] == 1 and a["items"] == 159 and a["counts"]["high"] == 2
    assert a["net"] == pytest.approx(536991.65) and a["net_from"] == "award"
    tender, award = a["docs"][0], a["docs"][2]  # every document has its own numbers and fingerprint
    assert len(a["docs"]) == 4 and [d["role"] for d in a["docs"]][:3] == ["tender", "tender", "award"]
    assert len(tender["marks"]) == 159 and tender["marks"].count("3") == 2 and tender["counts"]["high"] == 2
    assert award["items"] == 197 and award["counts"]["warn"] > tender["counts"]["warn"]
    assert client.get("/api/catalog/E/summary").json()["net"] is None


def test_a_file_of_a_project_opens_as_an_lv():
    body = client.get("/api/catalog/A/files/2").json()
    assert body["boq"]["phase"] == "86" and len(body["boq"]["items"]) == 197
    assert client.get("/api/catalog/A/files/9").status_code == 404
    assert client.get("/api/catalog/Z/summary").status_code == 404
    assert client.get("/api/catalog/A/project").status_code == 409  # versions, not trades


def test_uploaded_project_is_kept_listed_and_renamed():
    folder = DATASET / "03_pdf_hochbau_projekt"
    picked = [folder / "LV_18_Estrich.pdf", folder / "LV_07_Teppichboden.pdf"]
    files = [("files", (p.name, p.read_bytes())) for p in picked]
    created = client.post("/api/projects", files=files, data={"name": "Test building"}).json()
    assert created["name"] == "Test building" and len(created["lvs"]) == 2
    listed = client.get("/api/catalog").json()
    assert listed[0]["id"] == created["id"] and listed[0]["source"] == "upload"
    assert [f["name"] for f in listed[0]["files"]] == [p.name for p in picked]
    reopened = client.get(f"/api/catalog/{created['id']}/project").json()
    assert len(reopened["lvs"]) == 2
    assert client.patch(f"/api/catalog/{created['id']}", json={"name": "Renamed"}).json()["name"] == "Renamed"
    assert client.patch("/api/catalog/A", json={"name": "Renamed demo"}).json()["name"] == "Renamed demo"
    assert client.patch("/api/catalog/Z", json={"name": "x"}).status_code == 404


def test_intake_says_what_the_files_are():
    files = [("files", (p.name, p.read_bytes())) for p in (
        DATASET / "01_gaeb_xml" / "8209.003_Leistungsverzeichnis_leer.X83",
        DATASET / "02_gaeb_90" / "[ORT_024] LV24069.D86",
        DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83")]
    body = client.post("/api/intake", files=files).json()
    assert [f["role"] for f in body["files"]] == ["tender", "award", "tender"]
    assert [f["lv"] for f in body["files"]] == [0, 0, 1] and body["lvs"] == 2  # tender and award are one LV
    assert body["name"] == "Maschinentechnik - Anlagenbau"
    assert client.get("/api/catalog").json()[0]["source"] == "demo"  # an intake keeps nothing


def test_one_file_is_a_project_and_takes_a_later_version():
    tender = DATASET / "01_gaeb_xml" / "8209.003_Leistungsverzeichnis_leer.X83"
    award = DATASET / "02_gaeb_90" / "[ORT_024] LV24069.D86"
    created = client.post("/api/projects", files=[("files", (tender.name, tender.read_bytes()))]).json()
    assert created["kind"] == "versions" and created["name"] == "Maschinentechnik - Anlagenbau"
    added = client.post("/api/projects", files=[("files", (award.name, award.read_bytes()))],
                        data={"project": created["id"]}).json()
    assert added["id"] == created["id"] and added["kind"] == "versions"
    saved = client.get("/api/catalog").json()[0]
    assert [f["role"] for f in saved["files"]] == ["tender", "award"]
    assert client.get(f"/api/catalog/{saved['id']}/summary").json()["net"] == pytest.approx(536991.65)


def test_files_are_added_to_and_removed_from_any_project_and_projects_deleted():
    pdf = DATASET / "04_pdf_tiefbau_sonstige" / "LV-Ausdruck-[PROJEKT_004].pdf"
    added = client.post("/api/projects", files=[("files", (pdf.name, pdf.read_bytes()))], data={"project": "D"})
    assert added.json()["kind"] == "versions"  # the print-out of D's tender is a version, not another LV
    d = next(p for p in client.get("/api/catalog").json() if p["id"] == "D")
    assert [f["name"] for f in d["files"]][-1] == pdf.name and len(d["files"]) == 3
    assert len(client.get("/api/catalog/D/summary").json()["docs"]) == 3  # the kept summary was cleared
    left = client.delete("/api/catalog/D/files/2").json()
    assert len(left["files"]) == 2
    assert client.delete("/api/catalog/E/files/0").status_code == 409  # E's only file
    assert client.delete("/api/catalog/D").status_code == 204
    assert client.get("/api/catalog/D/summary").status_code == 404
    assert "D" not in [p["id"] for p in client.get("/api/catalog").json()]


def test_analyses_survive_a_restart():
    body = client.get("/api/catalog/D/files/0").json()
    api._RECENT.clear()  # what a restart forgets
    assert client.get(f"/api/analyses/{body['id']}").json()["findings"] == body["findings"]


def test_versions_of_one_lv_are_not_two_trades():
    d = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    d_pdf = DATASET / "04_pdf_tiefbau_sonstige" / "LV-Ausdruck-[PROJEKT_004].pdf"
    e = DATASET / "01_gaeb_xml" / "501-24-01_GAEB-XML_sas.x83"
    files = [("files", (p.name, p.read_bytes())) for p in (d_pdf, d, e)]
    created = client.post("/api/projects", files=files).json()
    assert created["kind"] == "trades" and len(created["lvs"]) == 2  # D once, E once
    assert created["lvs"][0]["file"] == d.name  # the tender stands for the LV, not its print-out
    assert len(client.get(f"/api/catalog/{created['id']}/project").json()["lvs"]) == 2



def test_trade_lvs_that_restart_their_numbering_are_not_versions():
    """Project F: most trade LVs number from 1.1.10 again. Grouping by item numbers alone made 8 of 27 LVs
    "versions" of another and dropped them, the roof-drain Stop with them (14b fell in with 14a / 14c)."""
    project = client.get("/api/catalog/F/project").json()
    assert len(project["lvs"]) == 27
    assert any(f["check_id"] == "P-BOTH-EXPECT-OTHERS" and "14b Dachentwaesserung" in f["lvs"]
               for f in project["findings"])
    assert any(f["check_id"] == "P-SAME-SCOPE" and f["lvs"] == ["01 Fertigteiltreppen", "00 Roh und Erdauarbeiten"]
               for f in project["findings"])
