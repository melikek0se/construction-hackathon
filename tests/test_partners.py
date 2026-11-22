"""Partners: what is known about a supplier across tenders, the mail put to it, its style held against its
own words, the inquiry worded that way with the items untouched, a firm found on the web taken in."""
import asyncio
import json
from email.message import EmailMessage
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import insert

from boq import db, partners, partners_demo, supply
from boq.api import app

client = TestClient(app)


class _Claude:
    """Stands in for the Claude API: answers every request with the same JSON."""

    def __init__(self, answer: dict):
        usage = SimpleNamespace(input_tokens=1, output_tokens=1, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        reply = SimpleNamespace(stop_reason="end_turn", model="claude-opus-5-5", usage=usage,
                                content=[SimpleNamespace(type="text", text=json.dumps(answer))])

        async def create(**_):
            return reply

        self.beta = SimpleNamespace(messages=SimpleNamespace(create=create))


def _eml(sender: str, to: str, text: str, subject: str = "Angebot") -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"], m["Date"], m["Message-ID"] = sender, to, subject, "Mon, 02 Nov 2026 09:00:00 +0100", f"<{abs(hash(text))}@x>"
    m.set_content(text)
    return m.as_bytes()


def test_the_examples_fill_the_page_are_marked_and_never_price_a_real_item():
    assert client.post("/api/partners/examples").json() == {"firms": 6}
    page = client.get("/api/partners").json()
    rohr = next(p for p in page["partners"] if p["name"] == "Beispiel Rohrhandel GmbH")
    assert rohr["more"]["example"] and rohr["card"]["asked"] == 2 and rohr["card"]["answer_rate"] == 100
    assert rohr["card"]["reply_hours"] == 15.0 and rohr["card"]["prices"] == 7
    assert {w["status"] for w in page["waiting"]} == {"sent"} and all(w["example"] for w in page["waiting"])
    pipe = next(b for b in page["book"] if b["label"] == "PP-Kanalrohr DN 300 SN 10")
    assert pipe["suppliers"] == 2 and all(o["example"] for o in pipe["offers"])
    one = client.get(f"/api/partners/{rohr['id']}").json()
    newest = next(p for p in one["prices"] if p["label"] == "PP-Kanalrohr DN 300 SN 10")
    assert newest["net"] == 41.2 and newest["before"]["net"] == 38.4 and newest["before"]["change_pct"] == 7.3
    assert one["usual"]["basis"] == "free_to_site" and any(e["kind"] == "mail" and e["direction"] == "in" for e in one["timeline"])
    # a made-up price is no price at hand for a real LV, whatever its item is called
    from boq.model import BoQ, Item
    boq = BoQ(file="x.x83", format="gaeb_xml", items=[Item(oz="1", short_text="PP-Kanalrohr DN 300 SN 10", unit="m", unit_raw="m",
                                                         qty=10, source={"file": "x.x83"})])
    assert boq.items[0].label == "PP-Kanalrohr DN 300 SN 10"
    assert supply.book(boq, None) == {}
    client.delete("/api/partners/examples")
    assert client.get("/api/partners").json()["partners"] == []


def test_saved_mail_goes_to_the_firm_it_is_from_and_a_style_trait_needs_its_passage():
    sid = supply.save_supplier({"name": "Rohr Nord", "email": "anfrage@rohr-nord.example", "kind": "supplier"})["id"]
    read = partners.take_messages([
        _eml("J. Brandt <brandt@rohr-nord.example>", "kalkulation@bau.example", "Moin Herr Kaya,\n\nPreise stehen in der Liste, alles frei Baustelle.\n\nGruß\nJ. Brandt"),
        _eml("kalkulation@bau.example", "anfrage@rohr-nord.example", "Moin Herr Brandt,\n\nschaffst du das bis Donnerstag?"),
        _eml("Fremd <info@fremd.example>", "kalkulation@bau.example", "Guten Tag, unser Katalog."),
    ])
    assert read["kept"] == 2 and read["unknown"] == [{"email": "info@fremd.example", "name": "Fremd", "messages": 1}]
    talk = client.get(f"/api/partners/{sid}").json()["timeline"]
    assert sorted(e["direction"] for e in talk) == ["in", "out"]
    said = {"address": "Du", "address_quote": "Preise stehen in der Liste", "salutation": "Moin Herr Kaya,", "closing": "Beste Grüße",
            "register": "casual", "length": "short", "answers_with": "filled sheet", "person": "J. Brandt",
            "habits": [{"text": "Quotes free to site.", "quote": "alles frei Baustelle"},
                       {"text": "Always late.", "quote": "kommt wie immer später"}],
            "summary": "Short and casual.", "write_like": "Use du."}
    style = asyncio.run(partners.read_style(sid, _Claude(said)))
    # the closing and the second habit are not in his message: left out, and counted
    assert style["salutation"] == "Moin Herr Kaya," and style["closing"] == "" and style["dropped"] == 1
    assert [h["text"] for h in style["habits"]] == ["Quotes free to site."]
    assert supply.supplier(sid)["more"]["style"]["address"] == "Du"


def test_an_inquiry_in_the_partner_s_style_keeps_its_items_and_falls_back_when_a_date_is_lost():
    body = ("Sehr geehrte Damen und Herren,\n\nwir bitten um Ihre Preise:\n\nPos. 1.1 – 10 m – Rohr DN 300\n    PP, SN 10\n"
            "Pos. 1.2 – 2 St – Schacht\n\nWir benötigen Ihr Angebot bis 12.01.2099.\n\nVielen Dank und freundliche Grüße\nM. Kaya\nBau GmbH\n")
    style = {"address": "Du", "salutation": "Moin,", "closing": "Gruß", "register": "casual", "length": "short", "person": "", "write_like": ""}
    good = {"opening": "Moin Herr Brandt,\n\nwir brauchen deine Preise:", "closing": "Bis 12.01.2099 wäre gut.\n\nDanke und Gruß\nM. Kaya\nBau GmbH", "changed": ["du"]}
    made = asyncio.run(partners.restyle(body, style, {"contact": "Herr Brandt"}, _Claude(good)))
    assert "Pos. 1.1 – 10 m – Rohr DN 300\n    PP, SN 10\nPos. 1.2 – 2 St – Schacht" in made["body"] and made["body"].startswith("Moin Herr Brandt,")
    lost = {**good, "closing": "Danke und Gruß\nM. Kaya\nBau GmbH"}
    assert asyncio.run(partners.restyle(body, style, {}, _Claude(lost))) is None


def test_a_firm_found_on_the_web_is_a_candidate_until_it_is_taken_into_the_directory():
    with db.engine().begin() as conn:
        conn.execute(insert(db.partner_searches).values(
            id="s1", created=db.now(), what="Statik", kind="subcontractor", region="Hamburg", reason="asked for", by="you",
            queries=["Statiker Hamburg"], note="", usd=0.2,
            candidates=[{"name": "Büro A", "kind": "subcontractor", "place": "Hamburg", "website": "a.example", "email": "",
                         "phone": "", "sells": ["Statik"], "why": "Does it.", "source_url": "https://a.example/",
                         "source_title": "Büro A", "status": "new", "supplier_id": None}]))
    assert client.get("/api/partners").json()["partners"] == []
    passed = client.post("/api/partners/searches/s1/0", json={"take": False}).json()
    assert passed["candidates"][0]["status"] == "dismissed" and supply.suppliers() == []
    client.post("/api/partners/searches/s1/0", json={"take": False})  # taken back
    taken = client.post("/api/partners/searches/s1/0", json={"take": True}).json()["candidates"][0]
    firm = supply.supplier(taken["supplier_id"])
    assert taken["status"] == "added" and firm["source"] == "web" and firm["groups"] == ["Statik"]
    assert firm["more"]["found"]["url"] == "https://a.example/" and firm["more"]["website"] == "a.example"


def _quote(project: str, supplier: str, lines: list[tuple[str, str, float]], valid_until: str) -> None:
    """A quote as the price inquiries keep it: (label, unit, net price) per line."""
    with db.engine().begin() as conn:
        conn.execute(insert(db.quotes).values(
            id=f"{project}-{supplier}"[:12], created=db.now(), project_id=project, file="other.x83", mail_id="m", supplier_id=supplier,
            package="p1", text="", terms={"basis": "free_to_site", "valid_until": valid_until, "binding": "binding"},
            lines=[{"oz": str(n), "label": label, "unit": unit, "unit_price": price, "product": "", "alternative": False,
                    "unit_differs": False, "note": "", "quote": None} for n, (label, unit, price) in enumerate(lines, 1)]))


def test_a_price_is_the_quote_then_the_price_book_then_past_bids():
    from boq.model import BoQ, Item
    sub = supply.save_supplier({"name": "Asphalt Nord", "kind": "subcontractor"})["id"]
    mat = supply.save_supplier({"name": "Rohr Nord", "kind": "supplier"})["id"]
    _quote("old1", sub, [("Asphalttragschicht AC 22 T S, 10 cm", "m2", 20.0)], "2099-01-01")
    _quote("old2", mat, [("PP-Kanalrohr DN 300 SN 10", "m", 40.0), ("PP-Kanalrohr DN 200 SN 10", "m", 20.0)], "2020-01-01")
    item = lambda oz, text, unit: Item(oz=oz, short_text=text, unit=unit, unit_raw=unit, qty=10, source={"file": "new.x83"})  # noqa: E731
    boq = BoQ(file="new.x83", format="gaeb_xml", items=[item("1", "Asphalttragschicht AC 22 T S, 10 cm", "m2"),
                                                       item("2", "PP-Kanalrohr DN 300 SN 10", "m"),
                                                       item("3", "Baustelle einrichten", "psch")])
    known = supply.book(boq, "new")
    # a subcontractor's price is a whole unit price, with the firm's 10 % on it; a supplier's is material only
    assert known["1"]["whole"]["unit_price"] == 22.0 and not known["1"]["whole"]["stale"] and "material" not in known["1"]
    assert known["2"]["material"]["unit_price"] == 40.0 and known["2"]["material"]["stale"] and "whole" not in known["2"]
    assert known["2"]["material"]["confidence"] == "medium" and "out of date" in known["2"]["material"]["reason"]
    assert "3" not in known
    # the same quotes say nothing about the tender they were given for
    assert supply.book(boq.model_copy(update={"file": "other.x83"}), "old1").get("1") is None

    from boq.api import _prices
    said = {s["item_oz"]: s for s in _prices(boq, "new")["suggestions"]}
    assert said["1"]["basis"] == "partners" and said["1"]["unit_price"] == 22.0 and said["1"]["matches"][0]["project"] == "Asphalt Nord"
    assert said["2"]["unit_price"] is None and said["2"]["material"]["supplier"] == "Rohr Nord"  # material is no unit price

    items = {i.oz: i for i in boq.items}
    plan = {"packages": [{"id": "p1", "kind": "subcontract", "items": ["1"]}, {"id": "p2", "kind": "material", "items": ["2"]}]}
    before = supply.item_prices(plan, {}, {}, items, {}, known, {})
    # both are in a package (asked for in this tender) and the book stands in until the quote is there
    assert before["1"] == {**before["1"], "status": "at_hand", "unit_price": 22.0, "instead_of": "no quote for it yet", "stale": False}
    assert before["2"]["status"] == "at_hand" and before["2"]["stale"] and before["2"]["part"] == "material"
    assert before["3"] == {"status": "own"}
    column = {"quote": "q1", "supplier": "Asphalt Nord", "date": "2026-11-22", "terms": {}, "lines": {"1": {"net": 19.0, "alternative": False, "product": ""}}}
    after = supply.item_prices(plan, {"p1": {"mode": "single", "quote": "q1"}}, {"p1": {"columns": [column]}}, items, {}, known, {})
    assert after["1"]["status"] == "quoted" and after["1"]["unit_price"] == 20.9 and after["1"]["taken"]
