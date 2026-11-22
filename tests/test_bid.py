"""The bid: unit prices on the client's LV, allowances from the answers, and the X84 that goes back."""
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from boq import amendments, api, bid, db
from boq.parsers.gaeb_xml import parse_gaeb_xml


def test_prices_are_read_as_typed():
    assert bid.price_of("12,50") == Decimal("12.50") and bid.price_of("1.250,00") == Decimal("1250.00")
    assert bid.price_of("12.5") == Decimal("12.50") and bid.price_of("1.250") == Decimal("1250.00")
    assert bid.price_of(" 0,125 € ") == Decimal("0.125") and bid.price_of("") is None
    for wrong in ("viel", "-3", "12,5,0"):
        try:
            bid.price_of(wrong)
        except ValueError:
            continue
        raise AssertionError(wrong)


def test_the_bid_is_priced_carries_allowances_and_goes_back_as_x84(database, tmp_path):
    client = TestClient(api.app)
    analysis_id = client.get("/api/catalog/D/files/0").json()["id"]
    sheet = client.get(f"/api/analyses/{analysis_id}/bid").json()
    # the tender is taken on: Polier has put the prices it has from past bids on the items (D-075), and
    # nothing on the others
    auto = {r["item_oz"] for r in sheet["rows"] if r["unit_price"] is not None}
    assert sheet["x84"] and sheet["items"] == 50 and sheet["priced"] == len(auto) == sheet["from_suggestions"] >= 1
    assert sheet["missing"] == 50 - len(auto) and all(r["source"] == "suggestion" for r in sheet["rows"] if r["item_oz"] in auto)
    first, second = sheet["rows"][0], sheet["rows"][1]
    others = len(auto - {first["item_oz"], second["item_oz"]})

    assert client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {"9.9.9": "1"}}).status_code == 422
    assert client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {first["item_oz"]: "viel"}}).status_code == 422
    sheet = client.put(f"/api/analyses/{analysis_id}/bid", json={
        "prices": {first["item_oz"]: "1.000,00", second["item_oz"]: "12,345"}}).json()
    rows = {r["item_oz"]: r for r in sheet["rows"]}
    assert rows[first["item_oz"]]["price"] == 1000 and rows[first["item_oz"]]["source"] == "own"
    assert rows[first["item_oz"]]["total"] == round(1000 * first["qty"], 2)
    assert sheet["priced"] == 2 + others and sheet["missing"] == 48 - others

    # an open point of the client's answers, accepted as an allowance of 10 %, sits in the unit price
    with db.engine().begin() as conn:
        conn.execute(db.amendments.insert().values(
            id="a1", project_id="D", file=sheet["file"], item_oz=first["item_oz"], kind="allowance",
            value={"percent": None, "note": "Left open."}, quote="", mail_id="m", key="k", status="proposed",
            created=db.now()))
        conn.execute(db.amendments.insert().values(
            id="a2", project_id="D", file=sheet["file"], item_oz=second["item_oz"], kind="quantity",
            value={"to": "36", "number": "36"}, quote="", mail_id="m", key="k2", status="accepted", created=db.now()))
    assert client.get(f"/api/analyses/{analysis_id}/bid").json()["allowances"] == 0  # proposed is not accepted
    amendments.decide("a1", "accepted", {"percent": "10"})
    sheet = client.get(f"/api/analyses/{analysis_id}/bid").json()
    rows = {r["item_oz"]: r for r in sheet["rows"]}
    assert rows[first["item_oz"]]["unit_price"] == 1000 and rows[first["item_oz"]]["price"] == 1100
    assert sheet["allowances"] == round(100 * first["qty"], 2)
    # the client's corrected quantity is shown; the bid keeps the quantity of the file
    assert rows[second["item_oz"]]["qty_answered"] == 36 and rows[second["item_oz"]]["qty"] == second["qty"]
    assert sheet["corrected_quantities"] == 1

    # the suggestions fill what is still empty, and never overwrite a price that was typed
    filled = client.put(f"/api/analyses/{analysis_id}/bid", json={"take_suggestions": True}).json()
    assert filled["from_suggestions"] >= 1 and filled["priced"] == 2 + filled["from_suggestions"]
    assert {r["item_oz"]: r for r in filled["rows"]}[first["item_oz"]]["source"] == "own"
    cleared = client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {second["item_oz"]: ""}}).json()
    assert {r["item_oz"]: r for r in cleared["rows"]}[second["item_oz"]]["unit_price"] is None

    # the X84 is the client's file with the prices in it: read back, texts and quantities are the same
    answer = client.get(f"/api/analyses/{analysis_id}/bid.x84")
    assert answer.status_code == 200 and ".x84" in answer.headers["content-disposition"]
    out = tmp_path / "bid.x84"
    out.write_bytes(answer.content)
    back = parse_gaeb_xml(str(out))
    source = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    before = parse_gaeb_xml(str(source))
    assert back.phase == "84" and b"DA84" in answer.content[:400] and b"ns0:" not in answer.content
    assert [(i.oz, i.qty, i.unit, i.short_text, i.long_text) for i in back.items] == \
           [(i.oz, i.qty, i.unit, i.short_text, i.long_text) for i in before.items]
    priced = {r["item_oz"]: r for r in cleared["rows"] if r["price"] is not None}
    assert {i.oz: (float(i.up), float(i.total)) for i in back.items if i.up is not None} == \
           {oz: (r["price"], r["total"]) for oz, r in priced.items()}
    assert sum(1 for i in back.items if i.up is not None) == cleared["priced"]

    sheet_csv = client.get(f"/api/analyses/{analysis_id}/bid.csv").content.decode("utf-8-sig")
    assert sheet_csv.splitlines()[0] == "OZ;Kurztext;Menge;Einheit;EP;GP" and ";1100,00;" in sheet_csv
    # a file outside a project has no kept source: the sheet works, the X84 does not
    with open(source, "rb") as fh:
        lone = client.post("/api/analyze", files={"file": (source.name, fh)}).json()["id"]
    assert client.get(f"/api/analyses/{lone}/bid").json()["x84"] is False
    assert client.get(f"/api/analyses/{lone}/bid.x84").status_code == 422


def test_a_bid_that_went_out_is_kept_closed_and_can_be_taken_back(database):
    """D-079, D-080: "The bid went out" keeps the X84 with the project and notes the day; from then on no
    price is changed; taken back, the tender is open again as it was."""
    client = TestClient(api.app)
    analysis_id = client.get("/api/catalog/D/files/0").json()["id"]
    before = client.get("/api/catalog").json()
    files_before = [f["name"] for f in next(p for p in before if p["id"] == "D")["files"]]
    first = client.get(f"/api/analyses/{analysis_id}/bid").json()["rows"][0]["item_oz"]
    client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {first: "100"}})

    project = client.post(f"/api/analyses/{analysis_id}/bid/submit").json()
    kept = [f for f in project["files"] if f["role"] == "submitted bid"]
    assert project["plan"]["sent"] and len(kept) == 1 and kept[0]["name"].startswith("Angebot_") and kept[0]["name"].endswith(".x84")
    # the same bid said to have gone out a second time is not kept twice
    again = client.post(f"/api/analyses/{analysis_id}/bid/submit").json()
    assert len([f for f in again["files"] if f["role"] == "submitted bid"]) == 1

    # closed: a price typed is refused, and Polier puts nothing in
    refused = client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {first: "999"}})
    assert refused.status_code == 409 and "went out" in refused.json()["detail"]
    assert client.put(f"/api/analyses/{analysis_id}/bid", json={"take_suggestions": True}).status_code == 409
    rows = {r["item_oz"]: r for r in client.get(f"/api/analyses/{analysis_id}/bid").json()["rows"]}
    assert rows[first]["unit_price"] == 100

    back = client.post("/api/catalog/D/bid/withdraw").json()
    assert not back["plan"].get("sent") and [f["name"] for f in back["files"]] == files_before
    assert client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {first: "120"}}).status_code == 200


def test_a_bid_on_an_lv_that_is_no_gaeb_xml_is_noted_without_a_file(database):
    """No X84 can be written onto a PDF: the day the bid went out is noted, nothing is added to the files."""
    client = TestClient(api.app)
    analysis_id = client.get("/api/catalog/D/files/1").json()["id"]
    assert client.get(f"/api/analyses/{analysis_id}/bid").json()["x84"] is False
    n = len(next(p for p in client.get("/api/catalog").json() if p["id"] == "D")["files"])
    project = client.post(f"/api/analyses/{analysis_id}/bid/submit").json()
    assert project["plan"]["sent"] and len(project["files"]) == n
    assert client.get(f"/api/analyses/{analysis_id}/bid.csv").status_code == 200


def test_a_unit_price_is_built_on_a_material_price_and_its_parts_are_kept(database):
    """D-078: (material x (1 + waste) + hours x wage + equipment) x (1 + surcharge); the parts stay with the
    item until a price is typed over them, and the last surcharge and wage are the next defaults."""
    client = TestClient(api.app)
    analysis_id = client.get("/api/catalog/D/files/0").json()["id"]
    oz = client.get(f"/api/analyses/{analysis_id}/bid").json()["rows"][0]["item_oz"]
    parts = {"material": 4.85, "waste": 5, "hours": 0.1, "wage": 50, "equipment": 1.2, "surcharge": 15}
    sheet = client.put(f"/api/analyses/{analysis_id}/bid/build", json={"oz": oz, **parts}).json()
    row = next(r for r in sheet["rows"] if r["item_oz"] == oz)
    assert row["unit_price"] == 12.99 and row["source"] == "own" and row["build"] == parts  # (5.0925 + 5 + 1.2) x 1.15
    assert sheet["build_defaults"] == {"surcharge": 15, "wage": 50}
    assert client.put(f"/api/analyses/{analysis_id}/bid/build", json={"oz": "9.9.9", **parts}).status_code == 422
    assert client.put(f"/api/analyses/{analysis_id}/bid/build", json={"oz": oz, "material": -1}).status_code == 422
    typed = client.put(f"/api/analyses/{analysis_id}/bid", json={"prices": {oz: "20"}}).json()
    assert next(r for r in typed["rows"] if r["item_oz"] == oz)["build"] is None
