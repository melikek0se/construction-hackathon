"""Price suggestions from the three priced bids: matching rules and the back-test."""
import sys
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from boq import api
from boq.model import Item, SourceRef
from boq.parsers import parse_file
from boq.prices import load_history, suggest_prices

DATA = Path(__file__).parent.parent / "dataset"
sys.path.insert(0, str(DATA.parent / "scripts"))
from eval_prices import backtest, summary  # noqa: E402

HISTORY = load_history(DATA)


def item(label, unit, kind="normal", long_text=""):
    return Item(oz="1", short_text=label, long_text=long_text, qty=Decimal(10), unit_raw=unit, unit=unit,
                kind=kind, source=SourceRef(file="t"))


def test_history_is_the_three_bids_without_token_prices():
    assert {e.project for e in HISTORY.entries} == {"A", "B", "C"}
    assert all(e.unit_price > 0 and e.item.unit for e in HISTORY.entries)
    assert not any(e.item.unit == "m3" and e.unit_price < 1 for e in HISTORY.entries)  # 0.34 EUR/m3 is no price
    c = next(e for e in HISTORY.entries if e.project == "C" and e.item.oz == "3.1.10")
    assert "Muffendruckrohr" in c.item.long_text  # the offer prints short texts; the long text is from the tender PDF


def test_same_item_in_another_project_is_priced_with_its_source():
    s = HISTORY.suggest(item("Baufacharbeiter-in sämtliche Kosten/Zuschläge", "h", kind="hourly"))
    assert Decimal("71.60") <= s.unit_price <= Decimal("85.00") and s.confidence in ("high", "medium")
    assert s.low <= s.unit_price <= s.high
    sources = {(m.history.project, m.history.item.oz, m.history.source) for m in s.matches}
    assert {("B", "3.5.1", "award 15.03.2023"), ("C", "7.1.60", "offer 25.11.2024")} <= sources


def test_what_is_not_comparable_gets_no_price():
    # same boilerplate, different thing: an excavator with driver is not a skilled worker
    assert HISTORY.suggest(item("Minibagger Fahrer-in sämtliche Kosten/Zuschläge", "h", kind="hourly")).unit_price is None
    assert HISTORY.suggest(item("Baufacharbeiter-in sämtliche Kosten/Zuschläge", "St")).unit_price is None  # other unit
    assert HISTORY.suggest(item("Baustelleneinrichtung", "psch", kind="lump_sum")).unit_price is None
    assert HISTORY.suggest(item("Muffe PE DN/OD63 SDR11", "St")).unit_price == Decimal("32.74")
    assert HISTORY.suggest(item("Muffe PE DN/OD 110 SDR11", "St")).unit_price is None  # other nominal size
    assert HISTORY.suggest(item("Dachabdichtung Bitumenbahn zweilagig", "m2")).matches == []


def test_backtest_each_project_priced_from_the_other_two():
    """The honest number: few suggestions, and those few must be good."""
    everything = [r for rows in backtest(HISTORY).values() for r in rows]
    s = summary(everything)
    assert 3 <= s["suggested"] <= 30  # three unlike projects: coverage is small, and we say so
    assert s["median_err"] <= 0.30 and s["in_band"] >= 0.8


def test_own_bid_is_not_used_to_price_its_own_tender():
    boq = parse_file(str(DATA / "04_pdf_tiefbau_sonstige" / "Leistungsverzeichnis.pdf"))  # project C's tender
    r = suggest_prices(boq, HISTORY)
    assert r["history"]["excluded_project"] == "C"
    assert all(m["project"] != "C" for s in r["suggestions"] for m in s["matches"])
    assert r["with_price"] < 10


def test_api_and_report_carry_the_prices():
    client = TestClient(api.app)
    path = DATA / "01_gaeb_xml" / "501-24-01_GAEB-XML_sas.x83"
    with open(path, "rb") as fh:
        analysis_id = client.post("/api/analyze", files={"file": (path.name, fh)}).json()["id"]
    prices = client.get(f"/api/analyses/{analysis_id}/prices").json()
    assert prices["items"] == 296 and 0 < prices["with_price"] < 20
    assert len(prices["suggestions"]) == 296
    priced = [s for s in prices["suggestions"] if s["unit_price"] is not None]
    assert all(s["matches"] and s["low"] <= s["unit_price"] <= s["high"] for s in priced)
    assert abs(prices["estimate"]["mid"] - sum(s["value"] for s in priced)) < 0.01
    page = client.get(f"/api/analyses/{analysis_id}/report.html").text
    assert "Prices from past bids" in page and "This is not a bid total" in page
    with open(DATA / "02_gaeb_90" / "Angebot AN24-0305.D84", "rb") as fh:  # a priced bid needs no suggestions
        priced_id = client.post("/api/analyze", files={"file": ("Angebot AN24-0305.D84", fh)}).json()["id"]
    assert client.get(f"/api/analyses/{priced_id}/prices").json() is None


def test_rental_token_prices_are_not_history():
    """Bid B keeps a fence "vorhalten" at 0.03 EUR per metre-week: a token price, like 0.34 EUR/m3."""
    rentals = [e for e in HISTORY.entries if e.item.unit in ("mWo", "m2Wo", "m2d", "md", "StWo", "Wo")]
    assert rentals and all(e.unit_price >= Decimal("0.1") for e in rentals)
    assert not any(e.project == "B" and e.item.oz == "1.2.3" for e in HISTORY.entries)  # Bauzaun vorhalten 0.03
