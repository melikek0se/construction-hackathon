"""Where a finding stands on the PDF page (src/boq/pdfmarks.py)."""
from pathlib import Path

import pymupdf
import pytest

from boq.checks import run_checks
from boq.model import Finding
from boq.parsers import parse_file
from boq.pdfmarks import locate

PROJECT_C = Path(__file__).parent.parent / "dataset" / "04_pdf_tiefbau_sonstige" / "Leistungsverzeichnis.pdf"

HEAD = [(50, "Pos."), (110, "Leistungsbeschreibung"), (400, "Menge"), (460, "Einh.")]
PAGE_1 = [
    (60, HEAD),
    (90, [(110, "Vorbemerkung: Alle Preise sind Festpreise.")]),
    (130, [(50, "1.1.10"), (110, "Rohrleitung liefern")]),
    (146, [(110, "Material nach Wahl des AG, einschl.")]),
    # one text block, as a paragraph is in a real LV: PyMuPDF joins a hyphenated word only inside a block
    (162, [(110, "bauseitige Stahlum-\nmantelung herstellen")]),
    (194, [(110, "12,000 St ...... ......")]),
    (240, [(50, "1.1.20"), (110, "Schacht setzen")]),
    (256, [(110, "Abdeckung nach Wahl des AG")]),
    (272, [(110, "5,000 St ...... ......")]),
    (700, [(50, "1.1.30"), (110, "Graben verfuellen")]),
]
PAGE_2 = [
    (60, HEAD),
    (100, [(110, "Verdichtung lagenweise,")]),
    (116, [(110, "einschl. aller Nebenleistungen")]),
    (132, [(110, "30,000 m3 ...... ......")]),
]


@pytest.fixture
def two_page_lv(tmp_path):
    doc = pymupdf.open()
    for rows in (PAGE_1, PAGE_2):
        page = doc.new_page(width=595, height=842)
        for y, spans in rows:
            for x, text in spans:
                page.insert_text((x, y), text, fontsize=10)
    path = tmp_path / "lv.pdf"
    doc.save(path)
    boq = parse_file(str(path))
    assert [i.oz for i in boq.items] == ["1.1.10", "1.1.20", "1.1.30"]  # the helper is an LV the parser reads
    return path, boq


def finding(oz, evidence):
    return Finding(item_oz=oz, category="contract_risk", check_id="T", severity="warn",
                   evidence=evidence, explanation="x", action="ask_client")


def test_same_phrase_in_two_items_marks_the_right_one(two_page_lv):
    path, boq = two_page_lv
    m = locate(path, boq, [finding("1.1.20", "nach Wahl des AG")])["marks"][0]
    second = next(i for i in boq.items if i.oz == "1.1.20").source
    assert m["located"] == "quote" and m["page"] == second.page and m["rects"]
    assert all(r[1] >= second.y - 8 for r in m["rects"])


def test_quote_broken_at_a_line_end_is_found(two_page_lv):
    path, boq = two_page_lv
    m = locate(path, boq, [finding("1.1.10", "bauseitige Stahlummantelung")])["marks"][0]
    assert m["located"] == "quote" and len(m["rects"]) >= 2


def test_quote_on_the_continuation_page(two_page_lv):
    path, boq = two_page_lv
    m = locate(path, boq, [finding("1.1.30", "einschl. aller Nebenleistungen")])["marks"][0]
    assert m["located"] == "quote" and m["page"] == 2


def test_quote_not_in_the_item_falls_back_to_the_item_line(two_page_lv):
    path, boq = two_page_lv
    m = locate(path, boq, [finding("1.1.10", "this text is nowhere")])["marks"][0]
    first = boq.items[0].source
    assert m["located"] == "item" and m["page"] == first.page and len(m["rects"]) == 1
    assert m["rects"][0][1] <= first.y <= m["rects"][0][3]


def test_quote_of_another_item_is_not_borrowed(two_page_lv):
    path, boq = two_page_lv  # "Schacht setzen" stands in 1.1.20 only
    m = locate(path, boq, [finding("1.1.10", "Schacht setzen")])["marks"][0]
    assert m["located"] == "item"


def test_quote_from_the_preliminary_remarks(two_page_lv):
    path, boq = two_page_lv
    m = locate(path, boq, [finding(None, "Alle Preise sind Festpreise")])["marks"][0]
    assert m["located"] == "quote" and m["page"] == 1 and m["oz"] is None
    assert all(r[3] < boq.items[0].source.y for r in m["rects"])


def test_finding_without_a_place(two_page_lv):
    path, boq = two_page_lv
    marks = locate(path, boq, [finding(None, "nowhere"), finding("9.9.9", "nowhere")])["marks"]
    assert [m["located"] for m in marks] == ["none", "none"]
    assert all(m["rects"] == [] and m["page"] is None for m in marks)


def test_project_c_every_item_finding_is_placed():
    boq = parse_file(str(PROJECT_C))
    findings = run_checks(boq)
    out = locate(PROJECT_C, boq, findings)
    assert len(out["marks"]) == len(findings) and len(out["pages"]) == pymupdf.open(PROJECT_C).page_count
    assert [m["finding"] for m in out["marks"]] == list(range(len(findings)))
    for f, m in zip(findings, out["marks"]):
        if f.item_oz:
            assert m["located"] in ("quote", "item") and m["rects"], f
            page = out["pages"][m["page"] - 1]
            assert all(0 <= r[0] < r[2] <= page["width"] and 0 <= r[1] < r[3] <= page["height"]
                       for r in m["rects"])
    by_quote = sum(m["located"] == "quote" for m in out["marks"])
    print(f"project C: {by_quote} of {len(findings)} findings located by quote")
    assert by_quote > 0


def test_excerpt_cut_mid_word_with_the_parsers_hyphen_is_found(two_page_lv):
    path, boq = two_page_lv  # a rule's excerpt: cut at both ends, the line-end hyphen kept as "- "
    m = locate(path, boq, [finding("1.1.10", "…erial nach Wahl des AG, einschl. bauseitige Stahlum- mantelung herst")])["marks"][0]
    first = boq.items[0].source
    assert m["located"] == "quote" and m["page"] == 1
    assert all(first.y < r[1] and r[3] < 200 for r in m["rects"])  # inside 1.1.10, below its number line


def test_evidence_that_wraps_a_quote_in_words_of_its_own(two_page_lv):
    path, boq = two_page_lv  # e.g. R-DIM-MISMATCH: short text „…“ vs long text DN 500
    m = locate(path, boq, [finding("1.1.20", "short text „Abdeckung nach Wahl des AG“ vs long text DN 500")])["marks"][0]
    assert m["located"] == "quote" and len(m["rects"]) == 1
    assert 250 < m["rects"][0][3] < 262  # the line "Abdeckung nach Wahl des AG"


def test_item_finding_is_never_marked_in_the_preliminary_remarks(two_page_lv):
    path, boq = two_page_lv  # the quote stands in the remarks only: the item line, not a highlight elsewhere
    m = locate(path, boq, [finding("1.1.20", "Alle Preise sind Festpreise")])["marks"][0]
    second = next(i for i in boq.items if i.oz == "1.1.20").source
    assert m["located"] == "item" and m["rects"][0][1] <= second.y <= m["rects"][0][3]


def test_the_pdf_is_closed_again(two_page_lv, monkeypatch):
    path, boq = two_page_lv
    opened = []
    real = pymupdf.open
    monkeypatch.setattr("boq.pdfmarks.pymupdf.open", lambda *a, **k: opened.append(real(*a, **k)) or opened[-1])
    locate(path, boq, [finding("1.1.10", "nach Wahl des AG"), finding("1.1.10", "nowhere at all in here")])
    assert len(opened) == 1 and opened[0].is_closed
