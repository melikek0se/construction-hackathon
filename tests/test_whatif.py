"""What-if on the priced bids of the dataset."""
from pathlib import Path

from fastapi.testclient import TestClient

from boq import api
from boq.parsers import parse_file
from boq.whatif import Adjustment, Scenario, what_if

G90 = Path(__file__).parent.parent / "dataset" / "02_gaeb_90"
B = parse_file(str(G90 / "StBALV23040.D86"))
C = parse_file(str(Path(__file__).parent.parent / "dataset" / "04_pdf_tiefbau_sonstige" / "Angebot AN24-0305.pdf"))


def test_no_change_is_the_bid_total():
    r = what_if(C, Scenario())
    assert r["before"] == r["after"] == 988913.89 and r["delta"] == 0 and r["changed_items"] == 0
    assert abs(sum(s["before"] for s in r["sections"]) - 988913.89) < 0.01


def test_price_change_on_a_word_touches_only_matching_items():
    r = what_if(C, Scenario(adjustments=[Adjustment(kind="price", percent=15, keyword="Muffendruckrohr")]))
    adj = r["adjustments"][0]
    assert adj["items"] > 0 and r["changed_items"] == adj["items"]
    assert abs(r["delta"] - adj["value"] * 0.15) < 0.05 * adj["items"]  # rounding per item
    assert {s["key"] for s in r["sections"] if s["delta"]} == {"3"}  # pipe supply sits in section 3


def test_adjustments_combine_and_sections_limit_them():
    whole = what_if(C, Scenario(adjustments=[Adjustment(kind="quantity", percent=10)]))
    assert abs(whole["delta_percent"] - 10) < 0.01 and not whole["quantity_beyond_10_percent"]
    one = what_if(C, Scenario(adjustments=[Adjustment(kind="quantity", percent=20, section="2"),
                                           Adjustment(kind="price", percent=-5, section="2")]))
    two = next(s for s in one["sections"] if s["key"] == "2")
    assert abs(two["after"] / two["before"] - 1.2 * 0.95) < 1e-4 and one["quantity_beyond_10_percent"]
    assert all(s["delta"] == 0 for s in one["sections"] if s["key"] != "2")


def test_optional_items_can_be_left_out():
    r = what_if(B, Scenario())
    optional = r["optional_items"]
    assert {o["kind"] for o in optional} == {"alternative", "contingency"} and len(optional) == 18
    drop = [o["item_oz"] for o in optional]
    without = what_if(B, Scenario(exclude=drop))
    assert abs(without["delta"] + sum(o["total"] for o in optional)) < 0.01
    assert all(o["excluded"] for o in without["optional_items"])


def test_api_and_unpriced_lv():
    client = TestClient(api.app)
    path = G90 / "StBALV23040.D86"
    with open(path, "rb") as fh:
        analysis_id = client.post("/api/analyze", files={"file": (path.name, fh)}).json()["id"]
    r = client.post(f"/api/analyses/{analysis_id}/whatif",
                    json={"adjustments": [{"kind": "price", "percent": 10, "keyword": "Asphalt"}]}).json()
    assert r["priced"] and r["delta"] > 0 and r["adjustments"][0]["items"] > 0
    assert client.post(f"/api/analyses/{analysis_id}/whatif", json={"adjustments": [{"kind": "x", "percent": 1}]}).status_code == 422
    tender = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    with open(tender, "rb") as fh:
        unpriced = client.post("/api/analyze", files={"file": (tender.name, fh)}).json()["id"]
    assert client.post(f"/api/analyses/{unpriced}/whatif", json={}).json() == {"priced": False}
