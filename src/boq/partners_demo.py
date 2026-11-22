"""Example history for the partners page: six made-up firms with made-up mail, quotes and prices.

The dataset is anonymised and names no supplier, and a new installation has talked to nobody yet, so the
page would be empty where it matters: prices with their dates, who answers and how fast, how each one
writes. This puts in a history to look at. Everything it makes is marked as an example (`more.example` on
the firm, `terms.example` on a quote, `meta.example` on a message, `via: demo` on older mail), is shown as
one, never prices a real item (`supply.book` passes example quotes over) and is taken out again with
`remove`. The addresses end in `.example` and reach nobody.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, insert, select

from boq import db, supply

JOBS = {"lw": "Beispiel · Kanalsanierung Lindenweg", "gp": "Beispiel · Erschließung Gewerbepark Ost",
        "hs": "Beispiel · Trinkwasserleitung Hafenstraße"}

# (days ago, direction, subject, text)
FIRMS = [
    {"name": "Beispiel Rohrhandel GmbH", "kind": "supplier", "email": "anfrage@rohrhandel.example", "contact": "Herr Brandt",
     "phone": "+49 40 5550 110", "place": "Hamburg", "groups": ["PE-Rohre", "Formstücke", "Kanalrohre", "Schächte"],
     "more": {"customer_no": "K-20417", "preferred": True, "contacts": [{"name": "Frau Yıldız", "role": "Innendienst", "email": "yildiz@rohrhandel.example", "phone": ""}]},
     "mail": [
         (410, "out", "Preisanfrage Kanalrohre BV Lindenweg", "Moin Herr Brandt,\n\nwir kalkulieren gerade die Kanalsanierung Lindenweg und brauchen Preise für PP-Rohre DN 300 und die Schachtringe. Liste hängt an. Schaffst du das bis Donnerstag?\n\nViele Grüße\nM. Kaya"),
         (409, "in", "AW: Preisanfrage Kanalrohre BV Lindenweg", "Moin Herr Kaya,\n\nPreise stehen in der Liste, alles frei Baustelle Hamburg. Bei den Schachtringen habe ich dir unsere Hausmarke eingetragen, die ist gleichwertig und sofort lieferbar. Gilt vier Wochen.\n\nGruß\nJ. Brandt"),
         (95, "in", "Preisanpassung PP-Rohre", "Moin Herr Kaya,\n\nkurze Info vorab: PP geht zum Monatsersten um rund 7 % hoch, der Hersteller zieht an. Wenn du noch was offen hast, sag kurz Bescheid, dann halte ich dir den alten Preis bis Monatsende.\n\nGruß\nJ. Brandt"),
     ],
     "quotes": [
         ("lw", 409, 22, {"basis": "free_to_site", "skonto": "2 % in 10 Tagen, 30 Tage netto", "valid_days": 28, "binding": "binding"},
          [("PP-Kanalrohr DN 300 SN 10", "m", 38.40, "", False), ("PP-Kanalrohr DN 200 SN 10", "m", 19.90, "", False),
           ("Schachtring DN 1000, h = 500 mm", "St", 86.00, "Hausmarke RH-Beton", True)]),
         ("gp", 62, 8, {"basis": "free_to_site", "skonto": "2 % in 10 Tagen, 30 Tage netto", "valid_days": 28, "binding": "binding"},
          [("PP-Kanalrohr DN 300 SN 10", "m", 41.20, "", False), ("PP-Kanalrohr DN 200 SN 10", "m", 21.30, "", False),
           ("PE 100 RC Druckrohr da 110 SDR 11", "m", 15.60, "", False), ("Schachtring DN 1000, h = 500 mm", "St", 91.50, "Hausmarke RH-Beton", True)]),
     ]},
    {"name": "Beispiel Baustoffe Nord", "kind": "supplier", "email": "vertrieb@baustoffe-nord.example", "contact": "Frau Petersen",
     "phone": "+49 4101 5550 23", "place": "Pinneberg", "groups": ["Beton", "Schotter", "Sand", "Betonfertigteile", "Rohre"],
     "more": {"customer_no": "110388"},
     "mail": [
         (300, "in", "Ihre Anfrage vom 12.01.", "Sehr geehrter Herr Kaya,\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot als PDF. Die Preise verstehen sich ab Werk Pinneberg zuzüglich Fracht; die Frachtpauschale entnehmen Sie bitte dem Angebot. Unser Angebot ist freibleibend.\n\nMit freundlichen Grüßen\ni. A. Karin Petersen\nVertrieb Innendienst"),
         (20, "in", "Ihre Preisanfrage Gewerbepark Ost", "Sehr geehrter Herr Kaya,\n\nbevor wir anbieten können, benötigen wir bitte den vorgesehenen Lieferzeitraum und die Angabe, ob die Baustelle mit Sattelzug anfahrbar ist.\n\nMit freundlichen Grüßen\ni. A. Karin Petersen\nVertrieb Innendienst"),
     ],
     "quotes": [
         ("lw", 300, 96, {"basis": "ex_works", "freight": 420.0, "skonto": "30 Tage netto", "valid_days": 21, "binding": "non_binding"},
          [("Frostschutzschicht 0/32", "t", 13.90, "", False), ("Beton C25/30 XC2", "m3", 118.00, "", False),
           ("Schachtring DN 1000, h = 500 mm", "St", 82.40, "", False)]),
         ("gp", 55, 120, {"basis": "ex_works", "freight": 460.0, "skonto": "30 Tage netto", "valid_days": 21, "binding": "non_binding"},
          [("Frostschutzschicht 0/32", "t", 14.60, "", False), ("Beton C25/30 XC2", "m3", 124.00, "", False),
           ("PP-Kanalrohr DN 300 SN 10", "m", 43.80, "", False)]),
     ],
     "open": [("hs", 6, "sent", 1)]},
    {"name": "Beispiel Armaturen & Pumpen", "kind": "supplier", "email": "angebote@armaturen.example", "contact": "",
     "phone": "+49 421 5550 771", "place": "Bremen", "groups": ["Armaturen", "Schieber", "Pumpen", "Hydranten"],
     "more": {},
     "mail": [
         (140, "in", "Angebot 24-1187", "Guten Tag,\n\nanbei unser Angebot 24-1187. Preise netto ab Lager Bremen, Lieferzeit Schieber ca. 3 Wochen. Für Rückfragen bitte anrufen, per Mail dauert es bei uns.\n\nFreundliche Grüße\nTeam Angebote"),
     ],
     "quotes": [
         ("hs", 140, 170, {"basis": "ex_works", "freight": 95.0, "discount_pct": 5.0, "skonto": "", "valid_days": 30, "binding": "binding"},
          [("Keilflachschieber DN 100 PN 16", "St", 312.00, "", False), ("Unterflurhydrant DN 80", "St", 685.00, "", False),
           ("Keilflachschieber DN 150 PN 16", "St", 498.00, "", False)]),
     ],
     "open": [("gp", 9, "sent", 2)]},
    {"name": "Beispiel Asphalt und Straßenbau", "kind": "subcontractor", "email": "kalkulation@asphalt.example", "contact": "Herr Demir",
     "phone": "+49 4121 5550 64", "place": "Elmshorn", "groups": ["Asphaltarbeiten", "Straßenbau", "Markierung"],
     "more": {"preferred": True, "documents": [{"name": "Präqualifikation (PQ-VOB)", "valid_until": "2027-03-31"},
                                               {"name": "Freistellungsbescheinigung § 48b EStG", "valid_until": "2026-12-31"},
                                               {"name": "Betriebshaftpflicht", "valid_until": "2027-01-15"}]},
     "mail": [
         (200, "in", "AW: Angebotsanfrage Asphalt Lindenweg", "Hallo Herr Kaya,\n\nAngebot anbei, Einheitspreise in Ihrer Liste. Einbau frühestens ab KW 36, vorher sind beide Kolonnen gebunden. Preise fest bis Jahresende.\n\nViele Grüße\nS. Demir"),
     ],
     "quotes": [
         ("lw", 200, 48, {"basis": "free_to_site", "skonto": "", "valid_days": 150, "binding": "binding"},
          [("Asphalttragschicht AC 22 T S, 10 cm", "m2", 21.80, "", False), ("Asphaltdeckschicht AC 11 D S, 4 cm", "m2", 13.90, "", False)]),
         ("gp", 50, 30, {"basis": "free_to_site", "skonto": "", "valid_days": 90, "binding": "binding"},
          [("Asphalttragschicht AC 22 T S, 10 cm", "m2", 23.40, "", False), ("Asphaltdeckschicht AC 11 D S, 4 cm", "m2", 14.70, "", False),
           ("Fugen schneiden und vergießen", "m", 6.20, "", False)]),
     ]},
    {"name": "Beispiel Elektro- und MSR-Technik", "kind": "subcontractor", "email": "angebot@emsr.example", "contact": "Frau Dr. Lang",
     "phone": "+49 40 5550 932", "place": "Norderstedt", "groups": ["Elektrotechnik", "MSR-Technik", "Kabel"],
     "more": {"documents": [{"name": "Präqualifikation (PQ-VOB)", "valid_until": "2026-12-05"}]},
     "mail": [
         (120, "in", "Absage Ihre Anfrage Pumpwerk", "Sehr geehrter Herr Kaya,\n\nvielen Dank für Ihre Anfrage. Leider können wir aus Kapazitätsgründen für dieses Vorhaben kein Angebot abgeben. Bei künftigen Projekten ab dem zweiten Quartal berücksichtigen Sie uns gern wieder.\n\nMit freundlichen Grüßen\nDr. A. Lang"),
     ],
     "quotes": [],
     "open": [], "declined": [("hs", 121, 20)]},
    {"name": "Beispiel Garten- und Landschaftsbau", "kind": "subcontractor", "email": "buero@galabau.example", "contact": "Herr Olsen",
     "phone": "+49 4103 5550 18", "place": "Wedel", "groups": ["Landschaftsbau", "Rasen", "Pflanzarbeiten", "Zaunbau"],
     "mail": [
         (60, "in", "Angebot Gewerbepark", "Hallo,\n\nPreise siehe unten, alles inkl. Material und Anfahrt:\nOberboden andecken 20 cm: 4,60 €/m²\nRasenansaat: 1,85 €/m²\n\nBitte nicht anrufen, wir sind tagsüber auf der Baustelle. Mail lesen wir abends.\n\nGruß Olsen"),
     ],
     "quotes": [
         ("gp", 60, 72, {"basis": "free_to_site", "skonto": "", "valid_days": 60, "binding": "unknown"},
          [("Oberboden andecken, d = 20 cm", "m2", 4.60, "", False), ("Rasenansaat", "m2", 1.85, "", False)]),
     ]},
]


def _ago(days: float, hours: float = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days, hours=-hours)


def present() -> bool:
    with db.engine().connect() as conn:
        return conn.execute(select(db.partner_messages.c.id).where(db.partner_messages.c.via == "demo").limit(1)).first() is not None


def remove() -> None:
    """Take every example out again: the history, the quotes, the inquiries, and the firms made here."""
    with db.engine().begin() as conn:
        conn.execute(delete(db.partner_messages).where(db.partner_messages.c.via == "demo"))
        for q in conn.execute(select(db.quotes.c.id, db.quotes.c.terms)).all():
            if (q.terms or {}).get("example"):
                conn.execute(delete(db.quotes).where(db.quotes.c.id == q.id))
        for m in conn.execute(select(db.mails.c.id, db.mails.c.meta)).all():
            if (m.meta or {}).get("example"):
                conn.execute(delete(db.mails).where(db.mails.c.id == m.id))
        for s in conn.execute(select(db.suppliers.c.id, db.suppliers.c.more)).all():
            if (s.more or {}).get("example") == "made":
                conn.execute(delete(db.suppliers).where(db.suppliers.c.id == s.id))
            elif (s.more or {}).get("example"):  # a firm that was there before keeps its entry, without the mark
                from sqlalchemy import update
                conn.execute(update(db.suppliers).where(db.suppliers.c.id == s.id).values(more={**s.more, "example": False}))


def _inquiry(conn, sid: str, firm: dict, job: str, days: float, reply_hours: float | None, reply: str = "",
             answers: dict | None = None, reminders: int = 0) -> str:
    """One example inquiry as the app would have kept it, with the reply that came back on it."""
    mail_id, last = uuid.uuid4().hex, None
    for n in range(reminders + 1):
        last = mail_id if n == 0 else uuid.uuid4().hex
        sent = _ago(days - n * 3)
        conn.execute(insert(db.mails).values(
            id=last, kind=supply.PRICE_INQUIRY, project_id=None, file=JOBS[job], created=sent, to=firm["email"],
            subject=("Erinnerung: " if n else "") + f"Preisanfrage – {firm['groups'][0]} – {JOBS[job].split(' · ')[1]}",
            body="", via="smtp", sent_at=sent, items=[],
            meta={"package": "x1", "supplier_id": sid, "kind": "reminder" if n else "inquiry", "example": True}))
    if reply_hours is not None:
        from sqlalchemy import update
        conn.execute(update(db.mails).where(db.mails.c.id == last).values(
            reply=reply or "(Excel sheet)", reply_at=_ago(days - reminders * 3, reply_hours), reply_via="imap",
            answers=answers or {"kind": "quote", "summary": "", "asks": [], "unmatched": []}))
    return last


def put() -> int:
    """Put the example history in (once). Firms of the same name that are in the directory get it; the
    others are made. Returns how many firms carry it."""
    if present():
        return 0
    known = {s["name"]: s for s in supply.suppliers()}
    for firm in FIRMS:
        have = known.get(firm["name"])
        fields = {k: firm[k] for k in ("contact", "phone", "place")}
        more = {**firm.get("more", {}), "example": True if have else "made"}
        if have:
            sid = supply.save_supplier({**fields, "more": more}, have["id"])["id"]
        else:
            sid = supply.save_supplier({**fields, "name": firm["name"], "kind": firm["kind"], "email": firm["email"],
                                        "groups": firm["groups"], "source": "demo", "more": more})["id"]
        with db.engine().begin() as conn:
            for days, direction, subject, text in firm["mail"]:
                conn.execute(insert(db.partner_messages).values(
                    id=uuid.uuid4().hex, supplier_id=sid, at=_ago(days), direction=direction, subject=subject,
                    text=text, via="demo", message_id=None))
            for job, days, hours, terms, lines in firm["quotes"]:
                mail_id = _inquiry(conn, sid, firm, job, days + hours / 24, hours)
                made = _ago(days)
                conn.execute(insert(db.quotes).values(
                    id=uuid.uuid4().hex[:12], created=made, project_id=None, file=JOBS[job], mail_id=mail_id,
                    supplier_id=sid, package="x1", text="",
                    terms={"basis": terms.get("basis", "unknown"), "freight": terms.get("freight"),
                           "discount_pct": terms.get("discount_pct"), "skonto": terms.get("skonto", ""),
                           "valid_until": (made + timedelta(days=terms["valid_days"])).date().isoformat(),
                           "binding": terms.get("binding", "unknown"), "note": "", "example": True},
                    lines=[{"oz": str(n), "label": label, "unit": unit, "unit_price": price, "product": product,
                            "alternative": alt, "note": "", "quote": None, "unit_differs": False}
                           for n, (label, unit, price, product, alt) in enumerate(lines, 1)]))
            for job, days, _status, reminders in firm.get("open", []):
                _inquiry(conn, sid, firm, job, days, None, reminders=reminders - 1 if reminders else 0)
            for job, days, hours in firm.get("declined", []):
                _inquiry(conn, sid, firm, job, days, hours, reply=firm["mail"][0][3],
                         answers={"kind": "decline", "summary": "Declines: no capacity for this job.", "asks": [], "unmatched": []})
        supply.learn(sid, [{"product": label} for _, _, _, _, lines in firm["quotes"] for label, *_ in lines])
    return len(FIRMS)
