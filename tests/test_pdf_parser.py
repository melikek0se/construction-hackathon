"""PDF parser against the GAEB version of the same LV (metric: scripts/eval_pdf_parser.py)."""
import sys
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from eval_pdf_parser import PAIRS, PDF, score  # noqa: E402

from boq.parsers import parse_file  # noqa: E402


@pytest.mark.parametrize("name, pdf, truth", PAIRS, ids=[p[0] for p in PAIRS])
def test_pdf_matches_gaeb_twin(name, pdf, truth):
    r = score(pdf, truth)
    assert r["recall"] >= 0.99 and r["extra"] <= 1
    assert r["qty"] == 1 and r["unit"] == 1
    if r["text"] is not None:
        assert r["text"] >= 0.95
    if r["price"] is not None:
        assert r["price"] >= 0.99  # B: the submitted PDF bid differs from the D84 in two items


def test_offer_layout_with_inline_prices():
    boq = parse_file(str(PDF / "Angebot AN24-0305.pdf"))
    assert boq.phase == "84" and sum(i.total for i in boq.items) == Decimal("988913.89")
    first = boq.items[0]
    assert (first.oz, first.short_text, first.qty, first.unit) == ("1.1.10", "Baustelleneinrichtung herstellen", 1, "psch")
    assert (first.up, first.total, first.source.page) == (72000, 72000, 1)


def test_tender_package_skips_contract_forms():
    boq = parse_file(str(PDF / "HEM2301-2_Gesamt-LV.pdf"))  # 136 pages, the LV starts after the forms
    assert len(boq.items) == 159 and boq.items[0].source.page > 20
    item = next(i for i in boq.items if i.oz == "5.1.9")
    assert item.path == ["Rohrleitungen", "Rohrleitungen aus nichtrostenden [PERSON_089]"]  # from page headers
    assert "Bogen DN 100 PN 10" in item.long_text and "Übertrag" not in item.long_text


def test_building_trade_lv_with_position_types():
    boq = parse_file(str(PDF.parent / "03_pdf_hochbau_projekt" / "LV_14a_Betonkernaktivierung.pdf"))
    kinds = {i.oz: i.kind for i in boq.items}
    assert len(boq.items) == 36 and kinds["2"] == "alternative"
    assert not any(i.short_text.startswith("***") for i in boq.items)


def test_items_keep_the_position_of_their_number_line():
    boq = parse_file(str(PDF / "Leistungsverzeichnis.pdf"))
    assert all(i.source.page and i.source.y is not None for i in boq.items)
    order = [(i.source.page, i.source.y) for i in boq.items]
    assert order == sorted(order)  # items stand in reading order
