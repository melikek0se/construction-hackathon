"""The film's own tender (docs/10-demo-video.md): made up like the mock world, built with its tools, and
sent to the estimator's mailbox on the demo mail server as one new mail, so that it arrives on camera.

    docker compose exec -T api python - check < scripts/demo_video/tender.py   # build it, read the LV back, send nothing
    docker compose exec -T api python - send  < scripts/demo_video/tender.py   # the invitation arrives now

It is a smaller sibling of mock/mail/t1_birkenweg.toml: rows of that LV with other quantities, and a few of
its own (the dewatering item Jürgen swears about, an explosive-ordnance survey nobody in the directory does).
"""
import shutil
import smtplib
import sys
import tempfile
import tomllib
from pathlib import Path

from boq import demomail, mail, mockmail

NUMBER = "TBA-2026-131"
PROJECT = "Erneuerung Regenwasserkanal Fliederweg"
# rows of Birkenweg kept: number → quantity here ("" keeps it)
KEEP = {
    "1.1.10": "", "1.1.20": "", "1.1.30": "26 Wo", "1.1.60": "", "1.2.10": "", "1.2.40": "18 St",
    "2.1.10": "410 m", "2.1.20": "470 m2", "2.1.50": "90 m",
    "3.1.10": "8 St", "3.1.20": "820 m3", "3.1.40": "640 m3", "3.1.50": "", "3.1.60": "210 m3", "3.1.70": "560 m3",
    "3.2.10": "1120 m2", "3.3.10": "", "3.3.20": "14 Wo",
    "4.1.10": "190 m", "4.1.20": "186 m", "4.1.50": "12 St", "4.2.10": "5 St", "4.2.20": "13 St", "4.2.30": "5 St", "4.2.40": "5 St",
    "5.1.20": "144 m", "5.1.30": "18 St", "5.1.60": "8 St",
    "6.1.20": "470 m2", "6.1.30": "470 m2", "6.1.40": "470 m2", "6.1.60": "470 m2", "6.2.30": "90 m",
    "7.1.20": "330 m", "7.1.30": "5 St", "7.1.70": "",
}
AFTER = {
    "1.1.60": "1.1.70 | 205 m | Kampfmittelsondierung der Kanaltrasse | Kanaltrasse vor Beginn der Erdarbeiten durch eine nach § 7 SprengG zugelassene Fachfirma auf Kampfmittel sondieren: Oberflächensondierung (Geomagnetik) mit digitaler Aufzeichnung und Auswertung, Sondierbreite 3,00 m über die gesamte Trassenlänge, Erkundungstiefe bis 4,00 m, einschließlich Freigabebescheinigung je Bauabschnitt. Abrechnung nach Metern Trasse. Das Freilegen und Bergen von Verdachtspunkten wird gesondert nach Aufwand vergütet.",
}
INSTEAD = {
    "3.3.10": "3.3.10 | 1 psch | Wasserhaltung für die gesamte Bauzeit | Wasserhaltung für sämtliche Rohrgräben und Baugruben für die gesamte Bauzeit, Art und Umfang nach Wahl des AN, einschließlich aller Erschwernisse, auch bei Starkregen, Hochwasser und Rohrbrüchen Dritter. Einrichten, Betreiben, Vorhalten und Räumen. Mehrkosten gleich welcher Ursache werden nicht gesondert vergütet.",
}
REMARKS = f"""Vorbemerkungen zum Leistungsverzeichnis
Baumaßnahme: Erneuerung des Regenwasserkanals im Fliederweg zwischen Rosenstraße (Schacht R 112) und Tulpenweg (Schacht R 117), einschließlich der Anschlussleitungen bis zur Grundstücksgrenze und der Wiederherstellung der Verkehrsflächen.
Vergabenummer: {NUMBER}, Öffentliche Ausschreibung nach VOB/A.
Angebotsfrist: {{+16}}, 10:00 Uhr
Bieterfragen bis: {{+8}}
Bindefrist: {{+58}}
Ausführungsbeginn: {{+90}}
Fertigstellung: {{+216}}
Vertragsgrundlagen sind die VOB/B und VOB/C in der bei Angebotsabgabe gültigen Fassung, die ZTV E-StB, die ZTV A-StB, die ZTV Asphalt-StB sowie DIN EN 1610 und das Arbeitsblatt DWA-A 139.
Der Fliederweg ist eine Anliegerstraße mit beidseitiger Wohnbebauung. Die Bauausführung erfolgt abschnittsweise unter Vollsperrung in Abschnitten von höchstens 50 m Länge. Die Zufahrt für Rettungsdienst und Müllabfuhr ist jederzeit zu gewährleisten.
Baugrund: Unter der Fahrbahnbefestigung stehen nach dem Baugrundgutachten vom {{-95}} Auffüllungen bis 1,10 m, darunter Geschiebelehm an, örtlich mit Sandlinsen. Schichtenwasser wurde zwischen 1,60 m und 2,40 m unter Gelände angetroffen. Das Gutachten liegt den Vergabeunterlagen bei.
Aushubboden: Der beim Aushub anfallende Boden bleibt Eigentum des Auftraggebers. Wiedereinbaufähiger Boden ist auf dem Zwischenlager des städtischen Bauhofs, Am Klärwerk 4 (Entfernung ca. 4 km), abzuladen. Die Entsorgung nicht verwertbarer Böden wird nach Deklaration gesondert nach Zuordnungsklassen vergütet.
Kampfmittel: Das Baufeld liegt nach Auskunft des Kampfmittelräumdienstes in einer Verdachtsfläche. Erdarbeiten dürfen erst nach Freigabe begonnen werden.
Arbeitszeit: werktags 7:00 bis 18:00 Uhr.
Vertragsstrafe: 0,1 v. H. der Auftragssumme je Werktag der Überschreitung des Fertigstellungstermins, höchstens 5 v. H.
Abrechnung nach Aufmaß. Stundenlohnarbeiten nur auf schriftliche Anordnung der Bauüberwachung."""

BODY = f"""Sehr geehrte Damen und Herren,

die Stadt Norderbek schreibt die Kanal- und Straßenbauarbeiten für die Erneuerung des Regenwasserkanals im Fliederweg öffentlich aus (Vergabenummer {NUMBER}). Da Ihr Unternehmen den Kanal in der Mühlenstraße gebaut hat, übersenden wir Ihnen die Unterlagen zusätzlich zur Bekanntmachung auf dem Vergabemarktplatz Nord direkt.

Die wichtigsten Termine:
Angebotsfrist und Eröffnung: {{+16|long}}, 10:00 Uhr
Bieterfragen bis: {{+8}}
Bindefrist: {{+58}}
Ausführung: {{+90}} bis {{+216}}

Das Leistungsverzeichnis liegt als GAEB-Datei (X83) und als PDF-Ausdruck bei. Bieterfragen richten Sie bitte per E-Mail an die Zentrale Vergabestelle."""


def rows() -> str:
    t1 = tomllib.loads((mockmail.ROOT / "t1_birkenweg.toml").read_text("utf-8"))["lv"][0]["items"]
    out, heads = [], []
    for line in t1.split("\n"):
        cells = line.split(" | ")
        if line.startswith("#"):
            level = line.split(" | ")[0].count(".")  # "# 3" a section, "# 3.1" under it
            heads = heads[:level] + [line]
            continue
        if len(cells) < 4 or cells[0] not in KEEP:
            continue
        out += heads  # the titles above this row, once
        heads = []
        if KEEP[cells[0]]:
            cells[1] = KEEP[cells[0]]
        out.append(INSTEAD.get(cells[0], " | ".join(cells)))
        if cells[0] in AFTER:
            out.append(AFTER[cells[0]])
    return "\n".join(out)


def bundle() -> str:
    q = '"""'
    return f"""
[[lv]]
key = "kanal"
file = "LV_Regenwasserkanal_Fliederweg"
format = "x83"
client = "tba"
name = "Kanal- und Straßenbauarbeiten Fliederweg"
project = "{PROJECT}"
number = "{NUMBER}"
remarks = {q}{REMARKS}{q}
items = {q}
{rows()}
{q}

[[lv]]
key = "druck"
base = "kanal"
file = "LV_Regenwasserkanal_Fliederweg_Ausdruck"
format = "pdf"
drop = ["3.1.50"]
set = ["6.1.40 | 410 m2 | Asphalttragschicht AC 22 T S, 10 cm | Asphalttragschicht aus Asphalttragschichtmischgut AC 22 T S, Bindemittel 50/70, Einbaudicke 10 cm, nach ZTV Asphalt-StB herstellen."]

[[mail]]
id = "einladung"
day = 0
time = "08:12"
from = "tba.meyer"
to = "us"
subject = "Aufforderung zur Angebotsabgabe – Regenwasserkanal Fliederweg ({NUMBER})"
body = {q}{BODY}{q}
attach = ["lv:kanal", "lv:druck"]
"""


AWARD = f"""Sehr geehrter Herr Doe,

nach Abschluss der Prüfung und Wertung erhalten Sie den Zuschlag auf Ihr Angebot für die Erneuerung des Regenwasserkanals im Fliederweg (Vergabenummer {NUMBER}). Ihr Angebot war das wirtschaftlichste.

Der Auftrag liegt als GAEB-Datei (X86) bei. Das Auftragsschreiben folgt mit der Post. Zur Bauanlaufbesprechung laden wir gesondert ein.

Wir freuen uns auf die Zusammenarbeit."""


def award_bundle(prices: list[tuple[str, float]]) -> str:
    q = '"""'
    lines = "\n".join(f"{oz} | {price:.2f}".replace(".", ",") if False else f"{oz} | " + f"{price:.2f}".replace(".", ",") for oz, price in prices)
    return f"""
[[lv]]
key = "auftrag"
base = "kanal"
phase = "86"
file = "Auftrag_Regenwasserkanal_Fliederweg"
prices = {q}{lines}{q}

[[mail]]
id = "zuschlag"
day = 0
time = "09:02"
from = "tba.meyer"
to = "us"
subject = "Zuschlag – Regenwasserkanal Fliederweg ({NUMBER})"
body = {q}{AWARD}{q}
attach = ["lv:auftrag"]
"""


def build(more: str = ""):
    root = Path(tempfile.mkdtemp())
    shutil.copy(mockmail.ROOT / "world.toml", root / "world.toml")
    (root / "film.toml").write_text(bundle() + more, "utf-8")
    return mockmail.build(root)


def deliver(m) -> None:
    """One mail of the bundle sent now, as a new message, from its sender's address."""
    from email.utils import formatdate, make_msgid
    message = m.message
    del message["Date"]
    message["Date"] = formatdate(localtime=True)
    del message["Message-ID"]
    message["Message-ID"] = make_msgid(domain=m.sender.email.split("@")[1])
    acc = mail.account()
    demomail.ensure_quietly(m.sender.email)
    with smtplib.SMTP(acc["host"], acc["port"], timeout=30) as server:
        server.ehlo()
        try:
            server.login(m.sender.email, "demo")
        except smtplib.SMTPException:
            pass
        server.send_message(message)
    print("sent:", message["Subject"])


def main() -> None:
    what = (sys.argv[1:] or ["check"])[0]
    if what == "award":  # award ANALYSIS_ID: the award on the prices of the bid as the app holds it
        import json
        import urllib.request
        rows_ = json.load(urllib.request.urlopen(f"http://localhost:8000/api/analyses/{sys.argv[2]}/bid"))["rows"]
        prices = [(r["item_oz"], r["unit_price"]) for r in rows_ if r.get("unit_price")]
        _, mails, _ = build(award_bundle(prices))
        deliver(next(m for m in mails if m.key == "film.zuschlag"))
        return
    _, mails, lvs = build()
    invitation = next(m for m in mails if m.key == "film.einladung")
    if what == "check":
        print(invitation.message["Subject"], "→", [p.email for p in invitation.to])
        for part in invitation.message.iter_attachments():
            print(" ", part.get_filename(), len(part.get_payload(decode=True)), "bytes")
        print(sum(1 for line in rows().split("\n") if not line.startswith("#")), "items")
    elif what == "send":
        deliver(invitation)


main()
