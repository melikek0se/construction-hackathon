"""Parsers against the dataset: counts, bid totals and a few known items."""
from decimal import Decimal
from pathlib import Path

import pytest

from boq.parsers import parse_file

DATA = Path(__file__).parent.parent / "dataset"
XML, G90 = DATA / "01_gaeb_xml", DATA / "02_gaeb_90"


@pytest.mark.parametrize("path, items", [
    (XML / "8209.003_Leistungsverzeichnis_leer.X83", 159),
    (XML / "[NUMMER_001]_leer.X83", 248),
    (XML / "GAEB-[PROJEKT_004].X83", 50),
    (XML / "501-24-01_GAEB-XML_sas.x83", 296),
    (G90 / "8209.003_Leistungsverzeichnis_leer.D83", 159),
])
def test_tender_files(path, items):
    boq = parse_file(str(path))
    assert boq.phase == "83"
    assert len(boq.items) == items
    assert len({i.oz for i in boq.items}) == items  # item numbers are unique
    assert all(i.short_text and i.long_text and i.qty is not None and i.unit for i in boq.items)


@pytest.mark.parametrize("name, items, total", [
    ("[ORT_024] LV24069.D86", 197, "536991.65"),
    ("StBALV23040.D84", 249, "897305.45"),
    ("StBALV23040.D86", 249, "897305.45"),
    ("Angebot AN24-0305.D84", 274, "988913.89"),
])
def test_priced_files(name, items, total):
    boq = parse_file(str(G90 / name))
    assert len(boq.items) == items
    assert sum(i.total for i in boq.items) == Decimal(total)
    for i in boq.items:  # unit price decimals differ per exporter; this proves we read them right
        if i.qty is not None:
            assert abs(i.up * i.qty - i.total) < Decimal("0.011"), i.oz


def test_same_lv_in_both_formats():
    """Project A exists as GAEB XML and GAEB 90: both parsers must agree item by item."""
    xml = {i.oz: i for i in parse_file(str(XML / "8209.003_Leistungsverzeichnis_leer.X83")).items}
    g90 = {i.oz: i for i in parse_file(str(G90 / "8209.003_Leistungsverzeichnis_leer.D83")).items}
    assert xml.keys() == g90.keys()
    for oz, a in xml.items():
        b = g90[oz]
        assert (a.qty, a.unit, a.kind, len(a.path)) == (b.qty, b.unit, b.kind, len(b.path)), oz


def test_item_details():
    boq = parse_file(str(G90 / "StBALV23040.D86"))
    by_oz = {i.oz: i for i in boq.items}
    it = by_oz["1.1.1"]
    assert it.short_text.startswith("Sanitärcontainer aufstellen")
    assert (it.qty, it.unit, it.up, it.total) == (1, "St", Decimal("16000"), Decimal("16000"))
    assert it.path[1] == "Baustelleneinrichtung"
    assert by_oz["3.2.5"].kind == "alternative"
    assert by_oz["3.2.5"].refs == ["3.2.4"]  # "Wie Position  3. 2.   4., jedoch"
    kinds = [i.kind for i in boq.items]
    assert kinds.count("alternative") == 14 and kinds.count("contingency") == 4
