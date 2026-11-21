"""The tender's dates, read from the files (boq.dates): every date found by hand in the dataset, nothing
else, and the wordings other tenders use."""
import io
import json
import zipfile

from fastapi.testclient import TestClient

from boq import dates
from boq.api import app
from conftest import DATASET

client = TestClient(app)


def _read(rel: str) -> set[tuple]:
    path = DATASET / rel
    return {(d["kind"], d["date"], d["time"], d["where"]) for d in dates.read(path.read_bytes(), path.name)}


def test_form_fields_of_a_tender_package_are_read_by_their_place_on_the_page():
    """VHB 211 and 214 print label and filled-in value as separate pieces: A's package, pages 1 and 11."""
    assert _read("04_pdf_tiefbau_sonstige/HEM2301-2_Gesamt-LV.pdf") == {
        ("sent_out", "2024-02-28", None, "page 1"),
        ("due", "2024-03-27", "14:30", "page 1"),
        ("opening", "2024-03-27", "14:30", "page 1"),
        ("binding_until", "2024-04-29", None, "page 1"),
        ("exec_start", "2024-05-13", None, "page 11"),
        ("exec_end", "2025-04-30", None, "page 11"),
    }
    assert _read("04_pdf_tiefbau_sonstige/Abgabe LV.pdf") == {
        ("exec_start", "2023-05-15", None, "page 1"), ("exec_end", "2024-09-30", None, "page 1")}


def test_the_cover_text_of_a_gaeb_file_gives_deadline_and_binding_period():
    path = DATASET / "01_gaeb_xml/501-24-01_GAEB-XML_sas.x83"
    found = dates.read(path.read_bytes(), path.name)
    assert [(d["kind"], d["date"], d["time"], d["approx"]) for d in found] == [
        ("due", "2025-07-21", "10:30", False),
        ("binding_until", "2025-08-22", None, False),
        ("exec_end", "2026-06-30", None, True),  # "bis spätestens Ende Juni 2026 abgeschlossen sein"
    ]
    assert found[0]["label"] == "Einreichungstermin und -ort" and found[0]["text"] == "21.07.2025 | 10:30 Uhr"
    assert dates.plan_of(dates.merge(found)) == {"due": "2025-07-21", "binding_until": "2025-08-22"}


def test_an_lv_and_its_print_out_state_one_date_once():
    found = []
    for rel in ("01_gaeb_xml/GAEB-[PROJEKT_004].X83", "04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf"):
        found += dates.read((DATASET / rel).read_bytes(), rel.split("/")[1])
    [only] = dates.merge(found)
    assert (only["kind"], only["date"]) == ("exec_end", "2025-11-28")  # "28.11.25"
    assert [s["where"] for s in only["sources"]] == ["GAEB text", "page 2"]


def test_files_without_a_stated_deadline_give_none():
    """Print dates, file dates, standards and item numbers such as 1.1.10. are not deadlines."""
    for rel in ("03_pdf_hochbau_projekt/LV_00_Roh_und_Erdauarbeiten.pdf", "03_pdf_hochbau_projekt/LV_14_Sanitaeranlage.pdf",
                "04_pdf_tiefbau_sonstige/Angebot AN24-0305.pdf", "04_pdf_tiefbau_sonstige/Leistungsverzeichnis_leer.pdf",
                "02_gaeb_90/StBALV23040.D86", "02_gaeb_90/[ORT_024] LV24069.D86", "01_gaeb_xml/[NUMMER_001]_leer.X83"):
        assert _read(rel) == set(), rel


def _txt(text: str) -> list[tuple]:
    return [(d["kind"], d["date"], d["time"]) for d in dates.read(text.encode(), "notice.txt")]


def test_wordings_of_other_tenders():
    assert _txt("Bieterfragen sind bis spätestens 10.03.2025, 12:00 Uhr schriftlich zu stellen.") == [
        ("questions_due", "2025-03-10", "12:00")]
    assert _txt("Die Angebote sind bis zum 21.03.2025 um 11.00 Uhr einzureichen.") == [("due", "2025-03-21", "11:00")]
    assert _txt("Submission: 21.03.25") == [("opening", "2025-03-21", None)]
    assert _txt("Baubeginn: 01.09.2025  Fertigstellung: 30.11.2025") == [
        ("exec_start", "2025-09-01", None), ("exec_end", "2025-11-30", None)]
    assert _txt("Rückfragen\nbis 10.03.2025") == [("questions_due", "2025-03-10", None)]
    # a date that belongs to something else on the line
    assert _txt("Fertigstellung nach DIN 18299 vom 01.09.2019") == []
    assert _txt("Lieferung 12.03.2025") == []
    assert _txt("Rohr DN 300, Pos. 1.1.10. und 14.2.30.") == []


def test_two_days_for_one_deadline_are_left_to_the_user():
    found = dates.merge(dates.read("Angebotsfrist: 21.03.2025\nAngebotsfrist: 28.03.2025\nBindefrist 30.04.2025".encode(), "a.txt"))
    assert dates.plan_of(found) == {"binding_until": "2025-04-30"}
    assert dates.plan_of(dates.merge(dates.read(b"Submission 21.03.2025", "a.txt"))) == {"due": "2025-03-21", "opening": "2025-03-21"}


def _docx(*paragraphs: str) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("word/document.xml", "<w:document><w:body>" + "".join(
            f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs) + "</w:body></w:document>")
    return out.getvalue()


def test_intake_reads_the_dates_also_from_a_file_that_is_no_lv():
    """The deadline often stands in the cover letter: it is left out as an LV and read for its dates."""
    lv = DATASET / "01_gaeb_xml/GAEB-[PROJEKT_004].X83"
    letter = _docx("Aufforderung zur Angebotsabgabe", "Abgabetermin: 12.12.2026, 10:00 Uhr", "Bindefrist bis 15.01.2027")
    files = [("files", (lv.name, lv.read_bytes())), ("files", ("Anschreiben.docx", letter))]
    body = client.post("/api/intake", files=files).json()
    assert [f["name"] for f in body["left_out"]] == ["Anschreiben.docx"]
    assert body["plan"] == {"due": "2026-12-12", "binding_until": "2027-01-15", "exec_end": "2025-11-28"}  # the LV's own
    due = next(d for d in body["dates"] if d["kind"] == "due")
    assert due["time"] == "10:00" and due["sources"] == [{"file": "Anschreiben.docx", "where": "document text"}]

    # kept as read when the dates are left out; what the user says wins
    created = client.post("/api/projects", files=files).json()
    plan = client.get("/api/catalog").json()[0]["plan"]
    assert plan == {"due": "2026-12-12", "binding_until": "2027-01-15", "exec_end": "2025-11-28"}
    client.delete(f"/api/catalog/{created['id']}")
    # the dialog says every date at once: a day it changed, one it added, and one it took out ("")
    said = {"due": "2026-12-11", "exec_start": "2027-02-01", "binding_until": ""}
    created = client.post("/api/projects", files=files, data={"dates": json.dumps(said)}).json()
    assert client.get("/api/catalog").json()[0]["plan"] == {"due": "2026-12-11", "exec_start": "2027-02-01", "exec_end": "2025-11-28"}
    client.delete(f"/api/catalog/{created['id']}")
    assert client.post("/api/projects", files=files, data={"dates": '{"deadline": "2026-12-11"}'}).status_code == 422
    created = client.post("/api/projects", files=files, data={"due": "2026-12-10", "questions_due": "2026-12-01"}).json()
    assert client.get("/api/catalog").json()[0]["plan"] == {
        "due": "2026-12-10", "questions_due": "2026-12-01", "binding_until": "2027-01-15", "exec_end": "2025-11-28"}
    client.delete(f"/api/catalog/{created['id']}")


def test_files_added_to_a_project_fill_only_the_dates_it_lacks():
    client.patch("/api/catalog/D", json={"due": "2026-12-01"})
    letter = _docx("Abgabetermin: 12.12.2026", "Bindefrist bis 15.01.2027")
    lv = DATASET / "04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf"
    files = [("files", (lv.name, lv.read_bytes())), ("files", ("Anschreiben.docx", letter))]
    assert client.post("/api/projects", files=files, data={"project": "D"}).status_code == 200
    plan = next(p for p in client.get("/api/catalog").json() if p["id"] == "D")["plan"]
    assert plan == {"due": "2026-12-01", "binding_until": "2027-01-15", "exec_end": "2025-11-28"}
    # the dialog shows these dates when files are added, and what it sends is kept: a moved deadline, one taken out
    said = {"due": "2026-12-12", "binding_until": ""}
    client.post("/api/projects", files=files[1:] + files[:1], data={"project": "D", "dates": json.dumps(said)})
    plan = next(p for p in client.get("/api/catalog").json() if p["id"] == "D")["plan"]
    assert plan == {"due": "2026-12-12", "exec_end": "2025-11-28"}


def test_the_summary_of_a_project_carries_the_dates_of_its_files():
    found = client.get("/api/catalog/A/summary").json()["dates"]
    assert [(d["kind"], d["date"]) for d in found] == [
        ("sent_out", "2024-02-28"), ("due", "2024-03-27"), ("opening", "2024-03-27"),
        ("binding_until", "2024-04-29"), ("exec_start", "2024-05-13"), ("exec_end", "2025-04-30")]
    assert found[1]["sources"] == [{"file": "HEM2301-2_Gesamt-LV.pdf", "where": "page 1"}]
    assert client.get("/api/catalog/F/summary").json()["dates"] == []


def test_the_english_reading_copies_give_the_same_dates():
    """dataset/en/ is what the team drops in when it shows the app in English: same days, English labels."""
    def days(folder, names):
        return {(d["kind"], d["date"], d["time"], d["approx"]) for n in names
                for d in dates.read((folder / n).read_bytes(), n)}

    en = DATASET / "en"
    for folder, originals in (
        ("A_Maschinentechnik-Anlagenbau_8209.003", ["04_pdf_tiefbau_sonstige/HEM2301-2_Gesamt-LV.pdf"]),
        ("E_Tiefbau-und-Verlegung_501-24-01", ["01_gaeb_xml/501-24-01_GAEB-XML_sas.x83"]),
        ("D_Bachdurchlass_152516", ["01_gaeb_xml/GAEB-[PROJEKT_004].X83", "04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf"]),
    ):
        german = {x for rel in originals for x in days(DATASET, [rel])}
        assert german and days(en / folder, [rel.split("/")[1] for rel in originals]) == german, folder
