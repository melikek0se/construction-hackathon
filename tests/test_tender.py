"""The tender step as one thing: the documents of an LV put together, their differences listed."""
from fastapi.testclient import TestClient

from boq import api

client = TestClient(api.app)


def test_one_lv_from_its_gaeb_file_and_its_print_out():
    t = client.get("/api/catalog/B/tender").json()
    assert len(t["lvs"]) == 1 and t["items"] == 248
    lv = t["lvs"][0]
    docs = {d["index"]: d for d in t["documents"]}
    # the GAEB file carries the items, the print-out says where they stand; bid and award are other steps
    assert docs[lv["carrier"]]["format"] == "GAEB XML" and lv["back"] == {"form": "X84", "file": docs[lv["carrier"]]["name"], "written": True}
    assert [docs[n]["format"] for n in lv["documents"]] == ["GAEB XML", "PDF"]
    assert sorted(d["step"] for d in t["documents"] if d["lv"] is None) == ["award", "bid", "bid"]
    pdf = docs[lv["documents"][1]]
    assert pdf["compare"]["both"] == 248 and pdf["compare"]["qty"] == 0 and pdf["compare"]["unit"] == 0
    assert pdf["compare"]["text"] == 24 and pdf["pages"] == 78 and pdf["extra_remarks"] > 0
    item = next(i for i in lv["items"] if i["oz"] == "3.1.9")
    assert [s["doc"] for s in item["sources"]] == lv["documents"] and item["sources"][1]["page"]
    differing = [i for i in lv["items"] if i["diff"]]
    assert all(i["diff"]["doc"] == pdf["index"] and i["diff"]["alike"] <= 0.9 for i in differing)
    assert sum(1 for i in lv["items"] if i["diff"]) == pdf["compare"]["text"]
    assert any(r["doc"] == pdf["index"] for r in lv["remarks"])


def test_two_gaeb_formats_of_one_lv_say_the_same():
    t = client.get("/api/catalog/A/tender").json()
    assert len(t["lvs"]) == 1
    d83 = next(d for d in t["documents"] if d["format"] == "GAEB 90" and d["step"] == "tender")
    assert d83["compare"] == {**d83["compare"], "both": 159, "qty": 0, "unit": 0, "text": 0}


def test_a_building_is_one_lv_per_file():
    t = client.get("/api/catalog/F/tender").json()
    assert len(t["lvs"]) == 27 and t["lvs"][0]["no"] == "00" and t["lvs"][0]["back"]["form"] is None
    assert all(len(lv["documents"]) == 1 for lv in t["lvs"])


def test_a_text_difference_becomes_a_question_only_when_the_estimator_asks():
    t = client.get("/api/catalog/B/tender").json()
    lv = t["lvs"][0]
    oz = next(i["oz"] for i in lv["items"] if i["diff"])
    assert t["asked"] == []
    opened = client.get(f"/api/catalog/B/files/{lv['carrier']}").json()
    assert not any(f["check_id"].startswith("D-") for f in opened["findings"])
    try:
        t = client.put("/api/catalog/B/tender/ask", json={"lv": lv["id"], "oz": oz, "ask": True}).json()
        assert t["asked"] == [{"lv": lv["id"], "oz": oz}]
        opened = client.get(f"/api/catalog/B/files/{lv['carrier']}").json()
        found = [f for f in opened["findings"] if f["check_id"] == "D-TEXT"]
        assert len(found) == 1 and found[0]["item_oz"] == oz and found[0]["action"] == "ask_client"
        questions = client.get(f"/api/analyses/{opened['id']}/questions").json()["questions"]
        assert any(q["item_oz"] == oz and "maßgebend" in q["question"] for q in questions)
    finally:
        t = client.put("/api/catalog/B/tender/ask", json={"lv": lv["id"], "oz": oz, "ask": False}).json()
    assert t["asked"] == []
    assert client.put("/api/catalog/B/tender/ask", json={"lv": 0, "oz": "0.0.0", "ask": True}).status_code == 404


def test_another_quantity_in_the_second_document_is_always_a_finding():
    from boq import tender
    item = {"oz": "1.1", "short": "Rohr", "qty": "50", "unit": "m", "diff": {"doc": 1, "qty": "36"}}
    docs = [{"format": "GAEB XML", "name": "a.x83"}, {"format": "PDF", "name": "a.pdf"}]
    found = tender.difference_findings({"carrier": 0, "items": [item]}, docs, [7, 8], set())
    assert [f.check_id for f in found] == ["D-QTY"] and found[0].severity == "high"
    assert "50 m" in found[0].question_de and "36 m" in found[0].question_de


def test_an_award_is_held_against_the_tender_and_the_bid():
    b = client.get("/api/catalog/B/tender").json()
    assert len(b["awards"]) == 1
    award = b["awards"][0]
    docs = {d["index"]: d for d in b["documents"]}
    assert docs[award["doc"]]["step"] == "award" and award["lv"] == 0 and award["priced"] > 200
    # the bid and the award of this project carry the same prices (docs/02-dataset.md)
    assert docs[award["bid"]["doc"]]["format"] == "GAEB 90" and award["bid"]["differs"] == 0
    assert abs(award["net"] - award["bid"]["net"]) < 0.01 and award["net"] > 0
    a = client.get("/api/catalog/A/tender").json()["awards"][0]
    assert len(a["added"]) == 38 and a["bid"] is None  # the award of A has 38 items the tender lacks
    assert client.get("/api/catalog/D/tender").json()["awards"] == []


def _boq(name, fmt, rows, phase="83"):
    """An LV of a few items for the tests: rows of (number, text, quantity, unit)."""
    from decimal import Decimal

    from boq.model import BoQ, Item, SourceRef
    return BoQ(name="LV", file=name, format=fmt, phase=phase, items=[
        Item(oz=oz, path=["Erdarbeiten"], short_text=text, long_text=text, qty=Decimal(qty), unit_raw=unit, unit=unit,
             source=SourceRef(file=name)) for oz, text, qty, unit in rows])


def test_a_second_file_of_the_same_format_is_a_new_issue_and_gives_the_changes():
    from boq import tender
    one = [("1.1", "Baustelle einrichten", "1", "psch"), ("1.2", "Graben ausheben bis 2 m Tiefe", "50", "m3"),
           ("1.3", "Rohr DN 300 liefern und verlegen", "120", "m"), ("1.4", "Schacht DN 1000 setzen", "4", "St"),
           ("1.5", "Oberboden andecken", "200", "m2"), ("1.6", "Verbau herstellen", "300", "m2")]
    two = [one[0], ("1.2", "Graben ausheben bis 2 m Tiefe", "36", "m3"),
           ("1.3", "Rohr DN 400 aus Stahlbeton liefern, verlegen und Dichtheit pruefen", "120", "m"),
           one[3], one[5], ("1.7", "Asphalt wiederherstellen", "80", "m2")]
    # most of an LV stays as it was when it is issued again: that is how the two are known to be one LV
    same = [(f"2.{n}", f"Leistung {n} wie beschrieben ausfuehren", str(10 + n), "m") for n in range(1, 21)]
    one, two = one + same, two + same
    files = [("LV.x83", "GAEB XML", "gaeb_xml", one), ("LV.pdf", "PDF", "pdf", one), ("LV_Stand2.x83", "GAEB XML", "gaeb_xml", two)]
    project = {"id": "t", "number": "", "name": "t", "kind": "versions", "plan": {},
               "files": [{"id": n, "name": name, "format": fmt, "role": "tender"} for n, (name, fmt, _, _) in enumerate(files)]}
    v = tender.view(project, [_boq(name, key, rows) for name, _, key, rows in files], [None, 3, None])
    lv = v["lvs"][0]
    assert len(v["lvs"]) == 1 and lv["issues"] == [[0, 1], [2]] and lv["carrier"] == 2 and lv["before"] == 0
    assert lv["documents"] == [2]  # the tender is its latest issue; the earlier documents are only held against it
    assert [(d["issue"], d["current"]) for d in v["documents"]] == [(1, False), (1, False), (2, True)]
    # the checks, the questions and the prices go by the same file: the latest issue, not the first that came
    assert tender.carriers([("tender", _boq(name, key, rows)) for name, _, key, rows in files]) == [2]
    change = {i["oz"]: i["change"] for i in lv["items"]}
    assert change["1.1"] is None and change["1.4"] is None
    assert change["1.2"] == {"kind": "quantity", "was_qty": "50", "was_unit": "m3"}
    assert change["1.3"]["kind"] == "text" and change["1.7"] == {"kind": "new"}
    assert [r["oz"] for r in lv["removed"]] == ["1.5"]
    assert all(i["diff"] is None for i in lv["items"])  # a change between issues is not a contradiction of documents


def test_the_work_on_an_earlier_issue_follows_to_the_new_one():
    from sqlalchemy import delete, insert, select

    from boq import db, tender
    row = {"project_id": "follow-test", "item_oz": "1.2", "unit_price": "12.50", "source": "own", "updated": db.now()}
    with db.engine().begin() as conn:
        conn.execute(delete(db.bid_prices).where(db.bid_prices.c.project_id == "follow-test"))
        conn.execute(insert(db.bid_prices).values(file="LV.x83", **row))
    try:
        assert tender.follow("follow-test", "LV.x83", "LV_Stand2.x83") == 1
        assert tender.follow("follow-test", "LV.x83", "LV_Stand2.x83") == 0  # moved already
        with db.engine().connect() as conn:
            assert conn.execute(select(db.bid_prices.c.file).where(db.bid_prices.c.project_id == "follow-test")).scalars().all() == ["LV_Stand2.x83"]
    finally:
        with db.engine().begin() as conn:
            conn.execute(delete(db.bid_prices).where(db.bid_prices.c.project_id == "follow-test"))
