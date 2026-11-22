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
    assert created["name"] == "Test building" and created["kind"] == "trades"
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
    assert body["name"] == "8209.003 [PROJEKT_002]" and body["number"] == "8209.003"  # two LVs: no LV title
    assert body["files"][1]["evidence"] == ["GAEB phase 86"] and body["files"][1]["certain"]
    assert body["suggested"] == {"id": "A", "reason": "same project number 8209.003"}
    assert client.get("/api/catalog").json()[0]["source"] == "demo"  # an intake keeps nothing


def test_one_file_is_a_project_and_takes_a_later_version():
    tender = DATASET / "01_gaeb_xml" / "8209.003_Leistungsverzeichnis_leer.X83"
    award = DATASET / "02_gaeb_90" / "[ORT_024] LV24069.D86"
    created = client.post("/api/projects", files=[("files", (tender.name, tender.read_bytes()))]).json()
    assert created["kind"] == "versions" and created["name"] == "8209.003 Maschinentechnik - Anlagenbau"
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
    assert created["kind"] == "trades"
    opened = client.get(f"/api/catalog/{created['id']}/project").json()
    assert len(opened["lvs"]) == 2  # D once, E once
    assert opened["lvs"][0]["file"] == d.name  # the tender stands for the LV, not its print-out



def test_trade_lvs_that_restart_their_numbering_are_not_versions():
    """Project F: most trade LVs number from 1.1.10 again. Grouping by item numbers alone made 8 of 27 LVs
    "versions" of another and dropped them, the roof-drain Stop with them (14b fell in with 14a / 14c)."""
    project = client.get("/api/catalog/F/project").json()
    assert len(project["lvs"]) == 27
    assert any(f["check_id"] == "P-BOTH-EXPECT-OTHERS" and "14b Dachentwaesserung" in f["lvs"]
               for f in project["findings"])
    assert any(f["check_id"] == "P-SAME-SCOPE" and f["lvs"] == ["01 Fertigteiltreppen", "00 Roh und Erdauarbeiten"]
               for f in project["findings"])


def test_lvs_of_a_created_project_keep_their_pdf():
    """The PDF view needs the file behind an LV: both when the project is created and when it is reopened."""
    folder = DATASET / "03_pdf_hochbau_projekt"
    files = [("files", (p.name, p.read_bytes())) for p in (folder / "LV_18_Estrich.pdf", folder / "LV_07_Teppichboden.pdf")]
    created = client.post("/api/projects", files=files).json()
    reopened = client.get(f"/api/catalog/{created['id']}/project").json()
    for project in (reopened,):  # creating a project analyses nothing itself: the pipeline run does
        for lv in project["lvs"]:
            assert client.get(f"/api/analyses/{lv['analysis_id']}").json()["pdf"] is True
            assert client.get(f"/api/analyses/{lv['analysis_id']}/source.pdf").content[:5] == b"%PDF-"
    one = client.get(f"/api/catalog/{created['id']}/files/0").json()
    assert one["pdf"] is True


def test_two_uploaded_lvs_of_the_same_file_name_keep_their_own_pdf():
    """Trade LVs are often all called Leistungsverzeichnis.pdf: each must show its own pages."""
    folder = DATASET / "03_pdf_hochbau_projekt"
    originals = [(folder / "LV_18_Estrich.pdf").read_bytes(), (folder / "LV_07_Teppichboden.pdf").read_bytes()]
    created = client.post("/api/projects", files=[("files", ("LV.pdf", data)) for data in originals]).json()
    reopened = client.get(f"/api/catalog/{created['id']}/project").json()
    for project in (reopened,):  # creating a project analyses nothing itself: the pipeline run does
        served = [client.get(f"/api/analyses/{lv['analysis_id']}/source.pdf").content for lv in project["lvs"]]
        assert sorted(served, key=len) == sorted(originals, key=len)


def test_a_gaeb_file_is_shown_on_the_clients_print_out_when_the_project_has_one():
    """Project A: the X83 tender and its PDF package. Findings of the X83 are marked on the client's pages."""
    body = client.get("/api/catalog/A/files/0").json()
    assert body["boq"]["format"] == "gaeb_xml"
    assert body["pdf"] is True and body["pdf_generated"] is False and body["pdf_file"] == "HEM2301-2_Gesamt-LV.pdf"
    original = (DATASET / "04_pdf_tiefbau_sonstige" / "HEM2301-2_Gesamt-LV.pdf").read_bytes()
    assert client.get(f"/api/analyses/{body['id']}/source.pdf").content == original
    marks = client.get(f"/api/analyses/{body['id']}/marks").json()
    assert set(marks["items"]) == {i["oz"] for i in body["boq"]["items"]}
    placed = [m for f, m in zip(body["findings"], marks["marks"]) if f["item_oz"]]
    assert placed and all(m["located"] != "none" for m in placed)
    dn = next(m for m in marks["marks"] if m["oz"] == "5.1.46" and m["key"].startswith("R-DIM-MISMATCH"))
    assert dn["located"] == "quote"


def test_a_priced_file_prefers_the_priced_print_out_and_an_excerpt_is_no_print_out():
    bid = client.get("/api/catalog/C/files/2").json()  # D84 offer: tender PDF, an excerpt, and the offer PDF
    assert bid["pdf_file"] == "Angebot AN24-0305.pdf" and bid["pdf_generated"] is False
    award = client.get("/api/catalog/B/files/3").json()  # D86 award: the submitted bid carries prices too
    assert award["pdf_file"] == "Abgabe LV.pdf"
    tender = client.get("/api/catalog/B/files/0").json()
    assert tender["pdf_file"] == "Leistungsverzeichnis_leer.pdf"


def test_without_a_print_out_the_pages_are_drawn_and_a_pdf_shows_itself():
    alone = client.get("/api/catalog/E/files/0").json()
    assert alone["pdf"] is True and alone["pdf_generated"] is True and alone["pdf_file"] is None
    itself = client.get("/api/catalog/C/files/0").json()
    assert itself["pdf"] is True and itself["pdf_generated"] is False and itself["pdf_file"] is None


def test_intake_reads_pdfs_and_leaves_out_what_is_no_lv():
    """A PDF says what it is in its page header; a file that is not an LV does not stop the others."""
    folder = DATASET / "04_pdf_tiefbau_sonstige"
    files = [("files", (p.name, p.read_bytes())) for p in (
        folder / "Leistungsverzeichnis.pdf", folder / "LV-Schachtbauwerk.pdf", folder / "Angebot AN24-0305.pdf")]
    files.append(("files", ("Lageplan.dwg", b"not an LV")))
    body = client.post("/api/intake", files=files).json()
    assert body["name"] == "2024-001 Fernleitung" and body["source"]["where"] == "project name, page header"
    assert [(f["role"], f["certain"]) for f in body["files"]] == [("tender", True), ("excerpt", True), ("bid", True)]
    assert body["files"][2]["evidence"][0] == 'headed "Angebot"'
    assert body["left_out"] == [{"name": "Lageplan.dwg", "reason": ".dwg is not an LV format"}]
    assert client.post("/api/intake", files=files[3:]).status_code == 422  # nothing readable at all


def test_a_priced_pdf_that_says_nothing_is_a_bid_to_check_and_the_user_can_correct_it():
    bid = DATASET / "04_pdf_tiefbau_sonstige" / "Abgabe LV.pdf"
    files = [("files", (bid.name, bid.read_bytes()))]
    read = client.post("/api/intake", files=files).json()["files"][0]
    assert (read["role"], read["certain"]) == ("submitted bid", False)
    onto_b = client.post("/api/intake", files=files, data={"project": "B"}).json()["files"][0]
    assert onto_b["certain"] and onto_b["evidence"][0] == "same prices as StBALV23040.D84"
    created = client.post("/api/projects", files=files, data={"roles": '["award"]'}).json()
    saved = client.get("/api/catalog").json()[0]
    assert saved["id"] == created["id"] and saved["files"][0]["role"] == "award"
    changed = client.patch(f"/api/catalog/{created['id']}/files/0", json={"step": "bid"}).json()
    assert changed["files"][0]["role"] == "bid"
    assert client.patch(f"/api/catalog/{created['id']}/files/0", json={"step": "draft"}).status_code == 422


def test_a_tender_keeps_its_dates_and_stage():
    """The dates of a tender stand in no LV file: they are given at creation or set later, one at a time."""
    x83 = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    created = client.post("/api/projects", files=[("files", (x83.name, x83.read_bytes()))],
                          data={"name": "Dated", "due": "2026-12-03"}).json()
    url = f"/api/catalog/{created['id']}"
    assert next(p for p in client.get("/api/catalog").json() if p["id"] == created["id"])["plan"] == {"stage": "intake", "due": "2026-12-03", "exec_end": "2025-11-28"}  # the file states when the work is done
    changed = client.patch(url, json={"questions_due": "2026-11-23", "stage": "pricing"}).json()
    assert changed["plan"] == {"due": "2026-12-03", "exec_end": "2025-11-28", "questions_due": "2026-11-23", "stage": "pricing"}
    assert changed["name"] == "Dated"  # a change of dates leaves the name alone
    assert client.patch(url, json={"due": None, "exec_end": None}).json()["plan"] == {"questions_due": "2026-11-23", "stage": "pricing"}
    assert client.patch(url, json={"due": "3.12.2026"}).status_code == 422
    assert client.patch(url, json={"stage": "questions"}).status_code == 422  # the questions are no stage (D-042)
    client.delete(url)


def test_summary_says_what_is_open_on_each_document():
    docs = client.get("/api/catalog/A/summary").json()["docs"]
    assert docs[0]["questions"] == 2 and docs[0]["priced"] == 0  # the tender: two points for the client, no price
    assert docs[2]["priced"] == 197  # the award is priced throughout


def test_a_priced_pdf_says_bid_or_award_by_its_heading():
    """A PDF has no GAEB phase: the word it is headed with decides between bid and award."""
    from boq import intake
    from boq.parsers import parse_file, pdf

    for line, word in [("Angebot AN24-0305", "Angebot"), ("Auftrag Nr. 4711", "Auftrag"),
                       ("Auftragsbestätigung Nr.: 2024/17", "Auftragsbestätigung"), ("Bestellung 4500123456", "Bestellung")]:
        assert pdf._HEADING.match(line).group(1) == word
    for line in ["Auftraggeber: Stadt", "Angebotsfrist: 12.03.", "Auftrag: Fernleitung", "Angebot ist bis zum 3.12. einzureichen"]:
        assert pdf._HEADING.match(line) is None  # a label or a sentence is not a heading
    offer = parse_file(DATASET / "04_pdf_tiefbau_sonstige" / "Angebot AN24-0305.pdf")
    assert intake.classify(offer, [offer])["step"] == "bid"
    offer.heading = "Auftragsbestätigung"
    as_award = intake.classify(offer, [offer])
    assert as_award["step"] == "award" and as_award["certain"]
    offer.heading = ""
    unnamed = intake.classify(offer, [offer])
    assert unnamed["step"] == "bid" and not unnamed["certain"]  # priced, names nothing: a guess, marked


def test_findings_carry_the_value_of_their_item_and_stand_in_the_order_of_the_money():
    """The tender of project B has no prices; its bid in the same project has: a finding on an item says
    what that item is worth and where the price is from, and within a severity the dearest comes first."""
    found = client.get("/api/catalog/B/files/0").json()["findings"]
    priced = [f for f in found if f["money_at_stake"] is not None]
    assert priced and all("of this LV" in f["money_basis"] for f in priced)
    for severity in ("high", "warn", "info"):
        amounts = [float(f["money_at_stake"] or 0) for f in found if f["severity"] == severity]
        assert amounts == sorted(amounts, reverse=True)
