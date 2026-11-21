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
    assert supply.at_hand(boq, None) == {}
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
