"""Price inquiries: the directory, the plan held against the LV, the sheet out and back, the comparison."""
import io
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from boq import catalog, supply
from boq.api import app

DATASET = Path(__file__).parent.parent / "dataset"
client = TestClient(app)


def _project():
    path = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    made = client.post("/api/projects", files=[("files", (path.name, path.read_bytes()))],
                       data={"name": "Inquiries", "due": "2099-01-20"}).json()
    return made["id"], client.get(f"/api/catalog/{made['id']}/files/0").json()


def _filled(mail_id: str, prices: dict[str, float], terms: dict | None = None, product: dict | None = None) -> bytes:
    book = load_workbook(io.BytesIO(client.get(f"/api/mails/{mail_id}/items.xlsx").content))
    page = book["Positionen"]
    for row in page.iter_rows(min_row=2):
        if row[0].value in prices:
            row[4].value = prices[row[0].value]
            if product and row[0].value in product:
                row[5].value, row[6].value = product[row[0].value], "ja"
    for n, value in enumerate((terms or {}).values(), 1):
        book["Konditionen"].cell(row=n, column=2).value = value
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def test_the_model_s_packages_are_held_against_the_lv_and_the_directory():
    pid, opened = _project()
    try:
        from boq.model import BoQ

        boq = BoQ.model_validate(opened["boq"])
        a, b = boq.items[0].oz, boq.items[1].oz
        directory = [{"id": "s1", "kind": "supplier"}, {"id": "n1", "kind": "subcontractor"}]
        got = supply.check_plan([
            {"name": "Rohre", "kind": "material", "why": "x", "items": [a, "9.9.9", a], "ask": ["s1", "n1", "nope"]},
            {"name": "Elektro", "kind": "subcontract", "why": "y", "items": [a, b], "ask": ["n1"]},
            {"name": "Leer", "kind": "material", "why": "z", "items": ["8.8"], "ask": []}], boq.items, directory)
        # an unknown item and id are dropped, a supplier of the wrong kind too; an item stays in the first package
        assert [(p["id"], p["items"], p["ask"]) for p in got] == [("p1", [a], ["s1"]), ("p2", [b], ["n1"])]
    finally:
        catalog.remove_project(pid)


def test_an_inquiry_goes_out_as_a_sheet_and_the_quotes_are_compared_on_what_they_cost_on_site(monkeypatch):
    pid, opened = _project()
    aid, made = opened["id"], []
    try:
        for name in ("Rohrhandel Nord", "Baustoffe Süd"):
            made.append(client.post("/api/suppliers", json={"name": name, "email": f"{name.split()[0].lower()}@example.org",
                                                           "groups": ["Rohre"]}).json()["id"])
        assert client.post("/api/suppliers", json={"name": ""}).status_code == 422
        ozs = [i["oz"] for i in opened["boq"]["items"] if i["qty"]][:3]

        async def planned(boq, skip, client=None):
            return supply.check_plan([{"name": "Rohre und Formstücke", "kind": "material", "why": "pipes", "items": ozs,
                                       "ask": made}], [i for i in boq.items if i.oz not in skip], supply.suppliers())

        monkeypatch.setattr(supply, "plan", planned)
        state = client.post(f"/api/analyses/{aid}/supply/plan").json()
        package = state["packages"][0]
        assert [r["oz"] for r in package["items"]] == ozs and [a["status"] for a in package["ask"]] == ["new", "new"]
        assert state["reply_by"] == "2099-01-17"  # three days before the submission

        draft = client.post(f"/api/analyses/{aid}/supply/compose", json={"package": "p1", "supplier_id": made[0]}).json()
        assert draft["to"] == "rohrhandel@example.org" and f"Pos. {ozs[0]}" in draft["body"] and "frei Baustelle" in draft["body"]
        assert "17.01.2099" in draft["body"]
        for sid in made:
            draft = client.post(f"/api/analyses/{aid}/supply/compose", json={"package": "p1", "supplier_id": sid}).json()
            state = client.post(f"/api/analyses/{aid}/supply/mails", json={"package": "p1", "supplier_id": sid, **draft}).json()
        mails = [a["mail"]["id"] for a in state["packages"][0]["ask"]]
        assert [a["status"] for a in state["packages"][0]["ask"]] == ["drafted", "drafted"]

        # the first prices everything free to site; the second is cheaper per line but ex works with freight,
        # leaves one item out and offers another product for one
        first = _filled(mails[0], {ozs[0]: 10.0, ozs[1]: 20.0, ozs[2]: 30.0}, {"basis": "ja", "freight": None, "discount_pct": 10})
        second = _filled(mails[1], {ozs[0]: 8.0, ozs[1]: 19.0}, {"basis": "nein", "freight": 150, "discount_pct": None, "skonto": "3 % 10 Tage",
                                                                 "valid_until": "01.01.2020"}, product={ozs[0]: "Fabrikat X Typ 7"})
        for mail_id, data in zip(mails, (first, second)):
            took = client.post(f"/api/mails/{mail_id}/quote", files={"file": ("antwort.xlsx", data)})
            assert took.status_code == 200, took.text
        state = client.get(f"/api/analyses/{aid}/supply").json()
        cmp = state["packages"][0]["comparison"]
        one, two = cmp["columns"]
        qty = {r["oz"]: r["qty"] for r in state["packages"][0]["items"]}
        assert one["covered"] == 3 and one["lines"][ozs[0]]["net"] == 9.0  # the 10 % taken off
        assert abs(one["total"] - (qty[ozs[0]] * 9 + qty[ozs[1]] * 18 + qty[ozs[2]] * 27)) < 0.01
        assert two["covered"] == 2 and two["freight"] == 150 and two["lines"][ozs[0]]["alternative"]
        assert any("not priced" in f for f in two["flags"]) and any("expired" in f for f in two["flags"])
        assert any("other product" in f for f in two["flags"])
        assert cmp["single"] == one["quote"] and cmp["proposal"]["mode"] in ("single", "split") and cmp["proposal"]["why"]
        assert [a["status"] for a in state["packages"][0]["ask"]] == ["answered", "answered"]
        assert state["prices"][ozs[2]]["status"] == "quoted" and not state["prices"][ozs[2]]["taken"]
        # what a supplier offered is what it sells: the directory keeps it
        assert any(p["name"] == "Fabrikat X Typ 7" for p in supply.supplier(made[1])["products"])

        state = client.post(f"/api/analyses/{aid}/supply/choose", json={"package": "p1", "mode": "single", "quote": one["quote"]}).json()
        price = state["prices"][ozs[0]]
        assert price["taken"] and price["unit_price"] == 9.0 and price["source"] == "Rohrhandel Nord" and price["part"] == "material"
        # a supplier's price is material only: it is no unit price and does not go into the bid by itself
        assert client.post(f"/api/analyses/{aid}/supply/to-bid").json()["taken"] == 0
        tally = supply.tally(pid)
        assert tally == {"packages": 1, "to_send": 0, "out": 0, "answered": 2, "held": tally["held"]}
    finally:
        catalog.remove_project(pid)
        for sid in made:
            supply.remove_supplier(sid)


def test_a_reply_in_free_text_counts_only_where_its_passage_stands_in_the_reply_and_its_item_was_asked():
    asked = [{"oz": "1.1.10", "label": "PE-Rohr DN 100", "qty": 120.0, "unit": "m"},
             {"oz": "1.1.20", "label": "Schieber DN 100", "qty": 4.0, "unit": "St"}]
    reply = "Pos. 1.1.10 PE-Rohr da 110: 12,40 EUR/m frei Baustelle. Schieber: 310,00 EUR je Stück, ab Lager."
    raw = [{"pos": "01.1.10", "unit_price": 12.4, "unit": "m", "product": "", "alternative": False, "quote": "12,40 EUR/m", "note": ""},
           {"pos": "1.1.20", "unit_price": 310, "unit": "Stk.", "product": "", "alternative": False, "quote": "310,00 EUR je Stück", "note": ""},
           {"pos": "1.1.20", "unit_price": 1, "unit": "St", "product": "", "alternative": False, "quote": "not in the reply", "note": ""},
           {"pos": "7", "unit_price": 5, "unit": "m", "product": "", "alternative": False, "quote": "frei Baustelle", "note": "something else"}]
    read = supply.match_lines(asked, reply, raw, {"basis": "free_to_site", "freight": -1, "discount_pct": -1, "skonto": "",
                                                  "valid_until": "", "binding": "unknown", "note": ""})
    assert [(line["oz"], line["unit_price"], line["unit_differs"]) for line in read["lines"]] == [("1.1.10", 12.4, False), ("1.1.20", 310.0, False)]
    assert read["dropped"] == 1 and [u["pos"] for u in read["unmatched"]] == ["7"]
    assert read["terms"]["freight"] is None and read["terms"]["discount_pct"] is None
