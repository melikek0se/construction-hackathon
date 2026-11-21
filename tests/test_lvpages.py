"""Pages drawn from an LV that came without a PDF (src/boq/lvpages.py), and findings marked on them."""
from decimal import Decimal
from pathlib import Path

import pymupdf

from boq.checks import run_checks
from boq.lvpages import TOP, render
from boq.model import BoQ, Item, Remark, SourceRef
from boq.parsers import parse_file
from boq.pdfmarks import locate

DATA = Path(__file__).parent.parent / "dataset"
TENDER_D = DATA / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"


def words_on_line(page, y):
    return [w[4] for w in page.get_text("words") if abs((w[1] + w[3]) / 2 - y) <= 3]


def test_every_item_is_drawn_where_the_positions_say():
    boq = parse_file(str(TENDER_D))
    pdf, positions = render(boq)
    doc = pymupdf.open(stream=pdf)
    assert set(positions) == {i.oz for i in boq.items}
    for item in boq.items:
        page, y = positions[item.oz]
        assert words_on_line(doc[page - 1], y)[0] == item.oz
    order = [positions[i.oz] for i in boq.items]
    assert order == sorted(order)  # LV order is reading order
    body = pymupdf.Rect(0, TOP - 10, 600, 850)  # below the running head of each page
    text = " ".join(" ".join(p.get_text(clip=body).split()) for p in doc)
    for item in boq.items:  # nothing of the LV is left out
        assert " ".join(item.short_text.split()) in text
        assert " ".join(item.long_text.split())[:200] in text


def test_findings_of_a_gaeb_file_are_marked_on_its_drawn_pages(tmp_path):
    boq = parse_file(str(TENDER_D))
    findings = run_checks(boq)
    pdf, positions = render(boq)
    path = tmp_path / "lv.pdf"
    path.write_bytes(pdf)
    out = locate(path, boq, findings, positions)
    assert out["items"] == {oz: [page, y] for oz, (page, y) in positions.items()}
    placed = [m for f, m in zip(findings, out["marks"]) if f.item_oz]
    assert placed and all(m["located"] in ("quote", "item") and m["rects"] for m in placed)
    for m in placed:  # never before the item's own number line
        page, y = positions[m["oz"]]
        assert (m["page"], m["rects"][0][3]) >= (page, y - 8)
    assert sum(m["located"] == "quote" for m in placed) > len(placed) / 2


def item(oz, short, long="", qty="1", unit="St", **more):
    return Item(oz=oz, short_text=short, long_text=long, qty=Decimal(qty), unit_raw=unit, unit=unit,
                source=SourceRef(file="x.x83"), **more)


def test_a_long_text_runs_over_pages_and_nothing_is_lost():
    lines = [f"Zeile {n} der Beschreibung mit einigen Worten" for n in range(300)]
    boq = BoQ(file="x.x83", format="gaeb_xml", name="Test", items=[
        item("1.1.10", "Langer Text", "\n".join(lines)), item("1.1.20", "Danach")])
    pdf, positions = render(boq)
    doc = pymupdf.open(stream=pdf)
    assert doc.page_count >= 4 and positions["1.1.20"][0] == doc.page_count
    text = "\n".join(p.get_text() for p in doc)
    assert all(line in text for line in lines)


def test_german_characters_prices_and_remarks_are_printed():
    boq = BoQ(file="x.d84", format="gaeb_90", name="Angebot", remarks=[Remark(text="Alle Preise sind Festpreise.")], items=[
        item("1.1.10", "Größe Ø 100 – „Rohr“", "Lichte Weite ≥ 100 mm, 2,5 m³ je m²", qty="1234.5", unit="m³",
             path=["Erdarbeiten", "Aushub"], up=Decimal("12.5"), total=Decimal("15431.25"))])
    pdf, positions = render(boq)
    page = pymupdf.open(stream=pdf)[0]
    text = " ".join(page.get_text().split())
    for expected in ("Alle Preise sind Festpreise.", "Erdarbeiten", "Aushub", "Größe Ø 100 – „Rohr“",
                     "Lichte Weite ≥ 100 mm, 2,5 m³ je m²", "1.234,500 m³", "12,50", "15.431,25"):
        assert expected in text, expected
    remark_y = page.search_for("Alle Preise sind Festpreise.")[0].y1
    assert remark_y < positions["1.1.10"][1]  # remarks stand before the first item


def test_embedded_data_and_overlong_words_stay_on_the_page():
    """Project E carries an image as one 192,356-character "word" in an item text: not LV text, not printed."""
    blob = "iVBORw0KGgo" * 2000
    long_word = "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen" * 2  # a real word, just too long
    boq = BoQ(file="x.x83", format="gaeb_xml", name="N" * 300, items=[item("1.1.10", "Bild", f"vor {blob} nach {long_word} Ende")])
    pdf, _ = render(boq)
    doc = pymupdf.open(stream=pdf)
    assert doc.page_count == 1
    text = "".join(doc[0].get_text().split())
    assert blob not in text and "22000characters" in text and long_word in text and "Ende" in text
    assert max(w[2] for w in doc[0].get_text("words")) <= 547.5
