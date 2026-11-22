"""Rule checks: real defects in the dataset, and seeded defects for the companion rules."""
import re
from decimal import Decimal
from pathlib import Path

import pytest

from boq.checks import run_checks
from boq.checks.companion_rules import RULES
from boq.checks.companions import check_companions
from boq.model import BoQ, Item, SourceRef
from boq.parsers import parse_file
from boq.units import normalise_unit

XML = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml"
A, B = XML / "8209.003_Leistungsverzeichnis_leer.X83", XML / "[NUMMER_001]_leer.X83"
D, E = XML / "GAEB-[PROJEKT_004].X83", XML / "501-24-01_GAEB-XML_sas.x83"


def found(findings, check_id):
    return {f.item_oz for f in findings if f.check_id == check_id}


def test_real_dimension_contradictions_are_found():
    """Copy-paste errors that are really in the tender files (docs/02-dataset.md, finding 9)."""
    assert {"5.1.4", "5.1.46"} <= found(run_checks(parse_file(str(A))), "R-DIM-MISMATCH")
    assert "1.1.4" in found(run_checks(parse_file(str(B))), "R-DIM-MISMATCH")
    assert "2.3.23" in found(run_checks(parse_file(str(E))), "R-DIM-MISMATCH")


@pytest.mark.parametrize("path", [A, B, D, E])
def test_sound_lvs_raise_no_missing_item_alarm(path):
    """The four tender LVs are complete: no companion rule may claim a missing item."""
    findings = check_companions(parse_file(str(path)))
    assert [f for f in findings if f.severity != "info"] == []


def test_work_priced_into_another_item_is_reported():
    """Project D has no shoring item; the excavation text says 'Aushub mit Verbau oder geböscht'."""
    findings = check_companions(parse_file(str(D)))
    (f,) = [f for f in findings if f.check_id == "C-TRENCH-SHORING"]
    assert (f.item_oz, f.severity, f.action) == ("2.5", "info", "add_surcharge")
    assert "Verbau" in f.evidence


SEEDS = [
    (B, "C-TOPSOIL"), (B, "C-PRESSURE-TEST"), (B, "C-DISINFECTION"), (B, "C-TRENCH-SHORING"),
    (B, "C-TRENCH-BACKFILL"), (B, "C-SURFACE-RESTORE"), (B, "C-PIPE-BEDDING"),
    (D, "C-SURFACE-RESTORE"), (D, "C-SHAFT-COVER"), (D, "C-PIPE-BEDDING"), (D, "C-TRENCH-BACKFILL"),
    (E, "C-SITE-CLEARANCE"), (E, "C-DISINFECTION"), (E, "C-PRESSURE-TEST"), (E, "C-SURFACE-RESTORE"),
    (E, "C-SHAFT-COVER"),
]


@pytest.mark.parametrize("path, rule_id", SEEDS, ids=[f"{p.name[:12]}-{r}" for p, r in SEEDS])
def test_seeded_missing_item_is_caught(path, rule_id):
    """Delete the companion items from a sound LV; the rule must notice."""
    rule = next(r for r in RULES if r.id == rule_id)
    boq = parse_file(str(path))
    before = [f for f in check_companions(boq) if f.check_id == rule_id]
    boq.items = [i for i in boq.items if rule.triggers(i) or not re.search(rule.companion, i.label, re.I)]
    after = [f for f in check_companions(boq) if f.check_id == rule_id]
    assert len(after) > len(before)


def test_wie_vor_items_inherit_what_the_previous_item_does():
    """Project C: 'wie vor, jedoch Steuerkabel' follows 'Verlegen der PE-Rohre', so the cable is laid."""
    pdf = XML.parent / "04_pdf_tiefbau_sonstige"
    for name in ("Leistungsverzeichnis.pdf", "Angebot AN24-0305.pdf"):
        findings = check_companions(parse_file(str(pdf / name)))
        assert [f for f in findings if f.severity != "info"] == [], name
    boq = _project_c()
    boq.items += [_item("4.1.21", "Liefern eines Steuerkabels A2Y-F", "420", "m"),
                  _item("4.1.61", "Verlegen der PE-Rohre 2 x da 50 im Rohrschatten", "2380", "m"),
                  _item("4.1.71", "wie vor, jedoch Steuerkabel A2Y-F", "420", "m")]
    boq.items = [i for i in boq.items if i.oz not in ("4.1.20", "4.1.70", "4.1.60")]
    assert check_companions(boq) == []
    boq.items = [i for i in boq.items if i.oz != "4.1.71"]  # now the cable really is not laid
    assert [f.check_id for f in check_companions(boq)] == ["C-SUPPLY-INSTALL"]


def _item(oz, label, qty, unit):
    return Item(oz=oz, short_text=label, qty=Decimal(qty), unit_raw=unit, unit=unit,
                source=SourceRef(file="LV-Positionen.docx"))


def _project_c():
    """Pipe and duct work packages of project C as grouped in LV-Positionen.docx."""
    return BoQ(file="c", format="gaeb_xml", items=[
        _item("3.1.20", "Muffendruckrohre TYT DN 250 liefern", "1451", "m"),
        _item("3.1.60", "Muffendruckrohr TYT DN 250 mit integrierter Zugsicherung liefern", "524", "m"),
        _item("3.2.20", "GGG DN 250 verlegen", "1975", "m"),
        _item("4.1.10", "PE-HD Rohre 2x da 50 x 4,6 mm (Leerrohr) liefern", "2380", "m"),
        _item("4.1.60", "PE-HD Rohre 2x da 50 x 4,6 mm (Leerrohr) verlegen", "2380", "m"),
        _item("4.1.20", "Steuerkabel liefern", "500", "m"),
        _item("4.1.70", "Steuerkabel verlegen", "500", "m"),
        _item("4.1.210", "Sandbettung und Umhüllung", "300", "m3"),
        _item("4.1.230", "Druckprüfung", "4760", "m"),
    ])


def test_supply_and_laying_pairs_of_project_c_are_consistent():
    assert check_companions(_project_c()) == []


@pytest.mark.parametrize("dropped, size", [("3.2.20", "250"), ("4.1.60", "50"), ("4.1.70", None)])
def test_supplied_but_not_laid(dropped, size):
    boq = _project_c()
    boq.items = [i for i in boq.items if i.oz != dropped]
    (f,) = [f for f in check_companions(boq) if f.check_id == "C-SUPPLY-INSTALL"]
    assert f.severity == "high" and f.category == "change_order"
    assert size is None or f"DN/da {size}" in f.explanation


def test_supplied_and_laid_quantities_disagree():
    boq = _project_c()
    next(i for i in boq.items if i.oz == "3.2.20").qty = Decimal("1795")  # transposed digits
    (f,) = check_companions(boq)
    assert f.check_id == "C-SUPPLY-INSTALL-QTY" and f.category == "quantity"
    assert "1975" in f.explanation and "1795" in f.explanation


def test_arithmetic_error_in_a_bid():
    boq = parse_file(str(XML.parent / "02_gaeb_90" / "Angebot AN24-0305.D84"))
    assert found(run_checks(boq), "R-ARITHMETIC") == set()
    boq.items[0].total += 1000
    (f,) = [f for f in run_checks(boq) if f.check_id == "R-ARITHMETIC"]
    assert f.money_at_stake == 1000


def test_broken_reference():
    boq = parse_file(str(XML.parent / "02_gaeb_90" / "StBALV23040.D86"))
    assert found(run_checks(boq), "R-REF-BROKEN") == set()
    boq.items = [i for i in boq.items if i.oz != "3.2.4"]
    assert "3.2.5" in found(run_checks(boq), "R-REF-BROKEN")


def _lv(*items, phase="83"):
    return BoQ(file="t.x83", format="gaeb_xml", phase=phase, items=[
        Item(oz=oz, short_text=short, long_text=long, qty=Decimal(qty), unit_raw=unit,
             unit=normalise_unit(unit), source=SourceRef(file="t.x83"))
        for oz, short, long, qty, unit in items])


def test_sleeve_size_in_the_long_text_is_no_contradiction():
    """LV 14b item 48: wall duct for a DN 100 pipe, core drilling with a fibre-cement sleeve DN 200."""
    duct = ("1.1", "Außenwand-Rohrdurchführung DN 100",
            "für 1 Medienrohr mit Außendurchmesser 105-115 mm,\nbestehend aus:\nSpezialfaserzement-Futterrohr DN 200,", 1, "St")
    pipe = ("1.2", "Edelstahl-Rohr DN 125", "Edelstahlrohr DN 100, 139,7 x 2,6 mm", 10, "m")
    assert found(run_checks(_lv(duct, pipe)), "R-DIM-MISMATCH") == {"1.2"}


def test_many_zero_quantities_are_one_finding():
    zeros = [(f"8.1.{n}", f"Angebot Fabrikat {n}", "", 0, "St") for n in range(1, 7)]
    one = [("1.1", "Pumpe", "", 0, "St")]
    grouped = [f for f in run_checks(_lv(*zeros)) if f.check_id == "R-QTY-ZERO"]
    assert len(grouped) == 1 and grouped[0].item_oz == "8.1.1" and len(grouped[0].related_oz) == 5
    assert grouped[0].title.startswith("6 items")
    assert found(run_checks(_lv(*one)), "R-QTY-ZERO") == {"1.1"}


def test_a_clause_in_the_remarks_is_a_finding_on_every_item_under_its_title():
    """Project C, LV Schachtbauwerk: "für alle Aussparungen keine gesonderte Vergütung" stands in the
    preliminary remarks, so no item carries it. The quote is the client's sentence, word for word."""
    boq = parse_file(str(XML.parent / "04_pdf_tiefbau_sonstige" / "LV-Schachtbauwerk.pdf"))
    on_remarks = [f for f in run_checks(boq) if f.check_id == "R-REMARK-WORDING"]
    assert on_remarks and all(f.item_oz is None and f.severity == "warn" for f in on_remarks)
    assert "„Bei Neuerstellung von Wänden wird für alle Aussparungen keine gesonderte Vergütung gewährt.“" in on_remarks[0].evidence
    assert f"the {len(boq.items)} items of the LV" in on_remarks[0].explanation
    text = " ".join(" ".join(r.text.split()) for r in boq.remarks)
    for f in on_remarks:
        assert all(quote in text for quote in f.evidence.strip("„“").split("“ | „"))


def test_unless_listed_separately_price_it_in_is_a_risk_shift():
    """Project E 3.6.8: "soweit nicht separat ausgeschrieben sind einzukalkulieren" was skipped by the guard
    meant for "soweit … nicht gesondert vergütet wird"."""
    shift = ("1.1", "Inbetriebnahme", "Prüfungen soweit nicht separat ausgeschrieben sind einzukalkulieren.", 1, "psch")
    opposite = ("1.2", "Geräte", "Geräte vorhalten, soweit der Einsatz nicht gesondert vergütet wird.", 1, "psch")
    assert found(run_checks(_lv(shift, opposite)), "R-WORDING") == {"1.1"}


def test_site_set_up_that_includes_dismantling_has_its_clearance():
    """LV 09 item 9.2.0: "Baustelle einrichten, vorhalten und wieder abbauen" — not a missing clearance."""
    setup = ("9.2.0", "Baustelleneinrichtung", "Baustelle einrichten, vorhalten und wieder abbauen.", 1, "pau")
    (f,) = [f for f in check_companions(_lv(setup)) if f.check_id == "C-SITE-CLEARANCE"]
    assert f.severity == "info" and f.title.startswith("No separate item")


def test_unit_spellings_written_out():
    assert [normalise_unit(u) for u in ("pauschal", "Stunden", "Wochen", "Monat", "Tage")] == ["psch", "h", "Wo", "Mt", "d"]
