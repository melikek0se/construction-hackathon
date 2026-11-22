# Mock mail: the world of the demo mail server

A made-up but coherent history of a civil-works contractor's mail, as data. `boq-mail --fill` (boq.mockmail)
puts it into the mailboxes of the demo mail server: every message into the sender's "Sent Items" and each
recipient's inbox. `boq-mail --check` builds everything without a server and reads every LV back with the
app's parsers. Everything here is invented; domains end in `.test`.

```
docker compose exec api boq-mail --fill           # put it in (again: nothing doubles; a fill of an earlier day is replaced)
docker compose exec api boq-mail --fill --reset   # take the mock mail out and put it in fresh
uv run boq-mail --check                           # no server needed
```

## Time

Every date is relative to the day of the fill, so the tenders are always open ones.
- A mail has `day = -3` (sent three days ago; weekends are moved to the Friday before) and `time = "08:41"`.
- In any text (subject, body, LV remarks and long texts, documents, sheet terms): `{+12}` → `03.12.2026`,
  `{+12|long}` → `Donnerstag, 03.12.2026`, `{-30|month}` → `Oktober 2026`, `{kw+3}` → the calendar week,
  `{+12|iso}`. Days ahead are moved to the Monday after a weekend.
- The app looks into the last 14 days of the inbox for tenders. So "current" tenders are sent on day -1 to -10
  with deadlines ahead; history is day -15 and older (back to about -540).

## Files

- `world.toml`: the parties (`us`, clients, suppliers, subcontractors, others) and their people. A mail names
  them as `party` or `party.person` (`tba.meyer`, `us`, `rohr.yildiz`). A person's signature (`sign`) is put
  under every mail they send, exactly as written there: where it starts with a closing ("Mit freundlichen
  Grüßen"), the body must not have one; where it is only a name block (ours), the body ends with the closing.
- Every other `*.toml` is a bundle: `[[lv]]`, `[[doc]]`, `[[sheet]]`, `[[mail]]`. Keys are local to the file.

### `[[lv]]`: a bill of quantities, made as a file at fill time

```toml
[[lv]]
key = "kanal"
file = "LV_Kanalsanierung_Birkenweg"    # file name without extension
format = "x83"                           # x83 (GAEB XML 3.2), x83-31 (3.1), d83 (GAEB 90), xlsx, pdf
client = "tba"
name = "Kanalsanierung Birkenweg"        # the LV's label
project = "Erneuerung Mischwasserkanal Birkenweg, 2. BA"   # optional, defaults to name
number = "TBA-2026-114"
remarks = """Vorbemerkungen … Angebotsfrist: {+12}, 10:00 Uhr …"""
items = """
# 1 | Baustelleneinrichtung
# 1.1 | Allgemein
1.1.10 | 1 psch | Baustelle einrichten | Baustelle einrichten, vorhalten und räumen. // Zweiter Absatz.
1.1.20 | 420 m | Bauzaun stellen und vorhalten | Bauzaun h = 2,00 m … | E
> Ein Hinweistext zwischen den Positionen.
2.1.20 | - m3 | Bodenaustausch | Menge fehlt absichtlich.
"""
```
- Title: `# number | label`. Item: `number | quantity unit | short text | long text | flags`, cells divided
  by ` | ` (blank, bar, blank; never use that sequence inside a text). ` // ` in a long text is a new paragraph.
  Quantity with a decimal comma, no thousands dot (`1250,5`); `-` leaves the quantity out. Flags: `E`
  Bedarfsposition, `A` Wahlposition. A line starting with `>` is a note between items.
- d83: all item numbers with the same number of parts (2 or 3), units at most 4 characters.
  pdf: no item without a quantity. xlsx and pdf lose nothing else.
- A changed issue of an LV: `base = "kanal"`, then `set = ["2.1.10 | 1400 m3 | … | …"]` (rows replaced by
  number), `drop = ["2.2.10"]`, `add = """rows"""`, and any of file / format / remarks to differ.

- Our bid and the client's award are the same LV with unit prices: `base = "kanal"`, `phase = "84"` (bid;
  the file becomes .X84 / .D84, a PDF is headed "Angebot" on our paper) or `phase = "86"` (award; .X86 / .D86,
  a PDF headed "Auftrag"), and `prices = """2.1.10 | 14,85"""` (one line per item: number, unit price). An
  award is usually `base = "<the bid>"` and inherits its prices; `set` / `drop` / `add` / `prices` change it.
- The print-out of an LV is `base = "kanal"`, `format = "pdf"`: the same LV as a second document. Differences
  between the two (another quantity, a sentence more) are written with `set`.

### `[[doc]]`: a PDF letter (cover letter, offer, invoice, minutes)

```toml
[[doc]]
key = "anschreiben"
file = "Aufforderung_zur_Angebotsabgabe.pdf"
title = "Aufforderung zur Abgabe eines Angebots"
from = "tba"            # whose letterhead; default: the sender of the mail
text = """Lines of text. A line with ' | ' is a table row of up to six cells:
Pos. | Bezeichnung | Menge | Einheit | EP | GP"""
```

### `[[sheet]]`: the Excel sheet of a price inquiry

```toml
[[sheet]]
key = "rohre"
file = "Preisanfrage_Kanalrohre_Birkenweg.xlsx"
items = """
2.3.10 | 386 m | PP-Kanalrohr DN 300 SN 10 | 41,80 | NordPipe PP SN10 | | Lieferzeit 2 Wochen
2.3.20 | 12 St | Schachtunterteil DN 1000 | 412,00 | Hausmarke | ja |
"""   # number | quantity unit | label | unit price | make offered | "ja" if an alternative | note
terms = { basis = "ja", freight = 0, discount_pct = 3, skonto = "2 % 10 Tage, 30 Tage netto", valid_until = "{+28}" }
```
Attach it as `sheet:rohre:blank` (as we send it out) or `sheet:rohre` (filled in, as it comes back).

### `[[mail]]`

```toml
[[mail]]
id = "einladung"
day = -4
time = "08:41"
from = "tba.meyer"
to = "us"                 # or a list; cc = [...]
subject = "Aufforderung zur Angebotsabgabe – Kanalsanierung Birkenweg (TBA-2026-114)"
body = """Sehr geehrte Damen und Herren, …"""
attach = ["lv:kanal", "doc:anschreiben"]
reply_to = "einladung"    # an earlier mail of this file (or "otherfile.id"): sets the thread, quotes it below
quote = false             # optional: do not put the answered mail under the text
sign = false              # optional: no signature (automatic mail)
```
A reply must be dated after the mail it answers. Subjects of replies carry "AW: " / "Re: " as real ones do.

## The story (keep to it, so the files agree with each other)

Our firm: **Acme Tiefbau GmbH**, Hamburg; about 45 people; does sewer, pipeline, earth and road works with
its own crews; buys pipes, concrete, aggregates, valves; subcontracts asphalt, trenchless work, CCTV,
landscaping, electrics, traffic safety, disposal. Estimator: John Doe (`us`). Site manager: Jonas Albers.

Past jobs (the history refers to them by these names; "day" is when we estimated them):

| Key | Job | Client | Estimated (day) | Outcome |
|-----|-----|--------|-----------------|---------|
| P1 | Kanalerneuerung Mühlenstraße, Norderbek | tba | -520 … -500 | won; built last year |
| P2 | Trinkwasserleitung DN 200 Hauptstraße, Brande | wvg | -410 … -395 | won |
| P3 | Erschließung Gewerbegebiet Süd, 1. BA | arch (for the Stadt Itzehoe) | -300 … -285 | lost (2nd, 3.1 % above) |
| P4 | Abwasserpumpwerk Deichstraße mit Druckleitung | tba | -215 … -200 | won; under construction |
| P5 | Regenwasserkanal Schulweg | tba | -150 … -138 | lost (4th) |
| P6 | Radweg K 22, Abschnitt Hemdingen | lbk | -95 … -80 | won (Zuschlag day -52) |
| P7 | Abwasserdruckleitung Marschhof (HDD) | wvg | -48 … -36 | submitted, result open |

Current tenders (inbox, day -10 … -1), one bundle each:

| Key | Tender | Client | Format | Deadline |
|-----|--------|--------|--------|----------|
| T1 | Erneuerung Mischwasserkanal Birkenweg, 2. BA | tba | x83, later a changed issue | {+14}, extended |
| T2 | Trinkwasserleitung DN 150 Geestweg–Dorfstraße | wvg | d83 | {+8} |
| T3 | Wohnquartier Störwiesen: Erschließung + Außenanlagen (two LVs) | arch | x83-31 | {+16} |
| T4 | Bürogebäude Überseering: Trockenbau / Maler (not our trade) | gu | xlsx | {+6} |
| T5 | Hofentwässerung und Pflaster Halle 4 | ind | pdf | {+10} |
| T6 | Rahmenvertrag Hausanschlüsse 2027 | swn | xlsx | {+2} |
| T7 | Geh- und Radweg L 113, Ortsdurchfahrt | lbk | x83 | {+5} |

Price levels for this region and year (net, so quotes agree across firms; vary ±10 % by firm, +3 to 6 % a year):
PP-Kanalrohr DN 300 SN 10 about 42 €/m, DN 200 21 €/m, DN 400 78 €/m; Steinzeugrohr DN 300 68 €/m; Schachtunterteil
DN 1000 420 €/St, Schachtring DN 1000 h=500 92 €/St, Konus 138 €/St, Schachtabdeckung D 400 215 €/St;
PE 100 RC da 180 SDR 11 31 €/m, da 110 15,50 €/m; Schieber DN 150 510 €/St, DN 100 320 €/St, Unterflurhydrant
DN 80 690 €/St; Beton C25/30 126 €/m³, C30/37 138 €/m³; Frostschutz 0/32 14,50 €/t, Schotter 0/45 16,80 €/t,
Füllsand 9,20 €/t, RC 0/45 9,80 €/t; Betonpflaster 8 cm 17,50 €/m², Tiefbord 8/25 7,90 €/m, Hochbord 15/30
12,40 €/m; Asphalttragschicht AC 22 T S 10 cm 23,50 €/m², Deckschicht AC 11 D S 4 cm 14,80 €/m² (subcontracted,
incl. laying); HDD da 180 95–140 €/m; TV-Inspektion 2,90 €/m, Dichtheitsprüfung Haltung 185 €/St;
Bodenentsorgung Z 1.2 24 €/t, Z 2 38 €/t, > Z 2 72 €/t; Verbaubox Miete 95 €/Woche je Element;
Verkehrssicherung halbseitige Sperrung mit LSA 185 €/Tag.

## Writing rules

- German throughout, as people in this trade really write: every firm has its own voice (set by its
  signature in `world.toml` and kept in every mail of that firm): du or Sie, "Moin" or "Sehr geehrter Herr
  Doe", terse or formal, lower case, typos where the person is in a hurry. Mails differ in length.
- Real substance: item numbers, quantities, prices, delivery times, terms, makes, questions back, things
  that go wrong (late, wrong unit, price only ex works, alternative product, minimum quantity, price rise).
- No real firms, brands or people. Makes are invented ("NordPipe", "Störtal Typ SU-M").
- Standards and rules may be named as they exist (DIN EN 1610, ZTV E-StB, VOB/B, DVGW W 400-2).
- No `{` or `}` in texts other than the date marks.
