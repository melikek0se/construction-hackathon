"""Excel import. The workbooks are built here, in the layouts of public LV templates (see docs/02-dataset.md)."""
from decimal import Decimal

import openpyxl
from fastapi.testclient import TestClient

from boq import api
from boq.checks import run_checks
from boq.parsers import parse_file


def workbook(path, rows, sheet="Leistungsverzeichnis"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
    for row in rows:
        ws.append(row)
    wb.create_sheet("Kostenübersicht").append(["Titel", "Summe"])
    wb.save(path)
    return str(path)


TENDER_STYLE = [
    ["NORDLICHT", None, "LEISTUNGSVERZEICHNIS"],
    ["Projekt / BV", "Umbau Verwaltungsgebäude", None, None, "Gewerk", "Trockenbau"],
    [],
    ["OZ", "Pos.-Art", "Kurztext", "Langtext (Leistungsbeschreibung)", "Menge", "ME", "Einheitspreis\n(EUR)", "Gesamtpreis\n(EUR)"],
    ["  1   BAUSTELLENEINRICHTUNG"],
    ["1.1", "Normalposition", "Baustelle einrichten", "Einrichten der Baustelle inkl. Räumen.", 1, "psch", 1850, 1850],
    ["1.2", "Eventualposition", "Bestandsschutz Bodenbelag", "Abdecken des Bodens.", 120, "m²", 6.8, None],
    ["  2   ABBRUCH"],
    ["2.1", "Alternativposition", "Bodenbelag aufnehmen", "Alternativ zu Pos. 1.2.", 85, "lfm", 9.8, 85 * 9.8],
    [None, None, "Summe netto", None, None, None, None, 3499],
]


def test_layout_with_position_types_and_title_cells(tmp_path):
    boq = parse_file(workbook(tmp_path / "lv.xlsx", TENDER_STYLE))
    assert boq.format == "excel" and boq.phase == "84"
    assert [(i.oz, i.kind, i.unit) for i in boq.items] == [
        ("1.1", "lump_sum", "psch"), ("1.2", "contingency", "m2"), ("2.1", "alternative", "m")]
    first, second, third = boq.items
    assert first.path == ["BAUSTELLENEINRICHTUNG"] and third.path == ["ABBRUCH"]
    assert first.long_text == "Einrichten der Baustelle inkl. Räumen." and first.source.line == 6
    assert second.total == Decimal("816.00")  # formula without a stored value: quantity x unit price
    assert third.total == Decimal("833")      # 85 * 9.8 arrives as 833.0000000000001
    assert "Umbau Verwaltungsgebäude" in boq.remarks[0].text


def test_layout_with_other_headings_and_title_rows(tmp_path):
    rows = [
        ["LEISTUNGSVERZEICHNIS – POSITIONEN"],
        ["Pos.", "Leistungsbeschreibung", "Art", "Menge", "Einheit", "Einheitspreis\n(EUR, netto)", "Gesamtpreis\n(EUR, netto)"],
        ["01", "VORBEREITENDE ARBEITEN"],
        ["01.01", "Bestand aufnehmen", "Normal", 1, "psch", 680, 680],
        ["01.02", "Edelstahl-Rohr DN 125 liefern", "Normal", "1.250,5", "Stk", "12,40", None],
        ["Zwischensumme Titel 01 (netto)", None, None, None, None, None, 680],
    ]
    boq = parse_file(workbook(tmp_path / "lv2.xlsx", rows))
    assert [(i.oz, i.path) for i in boq.items] == [("1.1", ["VORBEREITENDE ARBEITEN"]), ("1.2", ["VORBEREITENDE ARBEITEN"])]
    assert (boq.items[1].qty, boq.items[1].up, boq.items[1].unit) == (Decimal("1250.5"), Decimal("12.40"), "St")
    # the rule checks run on it like on any other LV: the pipe is supplied and nothing lays it
    assert [f.check_id for f in run_checks(boq)] == ["C-SUPPLY-INSTALL"]


def test_sheet_without_an_lv_and_upload(tmp_path):
    empty = parse_file(workbook(tmp_path / "notes.xlsx", [["Notizen"], ["Termin", "Dienstag"]]))
    assert empty.items == []
    client = TestClient(api.app)
    with open(workbook(tmp_path / "lv.xlsx", TENDER_STYLE), "rb") as fh:
        r = client.post("/api/analyze", files={"file": ("lv.xlsx", fh)})
    assert r.status_code == 200 and len(r.json()["boq"]["items"]) == 3
    with open(tmp_path / "notes.xlsx", "rb") as fh:
        assert client.post("/api/analyze", files={"file": ("notes.xlsx", fh)}).status_code == 422
