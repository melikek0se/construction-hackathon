# Glossary — German → English, used for every file in `dataset/en/`

One term, one rendering. German abbreviations that work as codes (AG, AN, EP, GP, LV, OZ, DN, PN, VOB, ZTV, DIN …)
are kept as they are and explained here.

## Codes kept in German

| Code | Stands for | Meaning |
|---|---|---|
| LV | Leistungsverzeichnis | bill of quantities |
| OZ | Ordnungszahl | item number |
| AG | Auftraggeber | client |
| AN | Auftragnehmer | contractor |
| EP | Einheitspreis | unit price |
| GP | Gesamtpreis | total price |
| ME | Mengeneinheit | unit of measure (column header: "Unit") |
| DN / PN | Nennweite / Nenndruck | nominal diameter / nominal pressure |
| VOB, VOB/A, VOB/B, VOB/C | Vergabe- und Vertragsordnung für Bauleistungen | German construction contract procedures |
| ATV, ZTV, DIN, EN, DVGW, AGFW, STLB-Bau, VHB | standards, rule sets, forms | kept verbatim |
| GAEB | data exchange standard for LVs | kept verbatim |
| NU | Nachunternehmer | subcontractor (the code NU is kept where the source uses it) |
| BE | Baustelleneinrichtung | site setup (the code BE is kept where the source uses it) |
| OK / UK | Oberkante / Unterkante | top edge / bottom edge (kept: OK, UK) |
| GOK | Geländeoberkante | ground level (kept: GOK) |
| B, H, T, L, D, d, s, U (before a dimension) | Breite, Höhe, Tiefe, Länge, Dicke / Durchmesser, Durchmesser, Wandstärke, Umfang | width, height, depth, length, thickness / diameter, diameter, wall thickness, circumference — the letters are kept |
| NN | Normalnull | sea level datum ("ü. NN" → "above NN") |

Unit codes are never translated: `St`, `Stk`, `psch`, `m`, `m2`, `m²`, `m3`, `m³`, `lfm`, `h`, `Std`, `t`, `to`, `kg`,
`Wo`, `Mt`, `StWo`, `mWo`, `m2Wo`, `m2d`, `Jahr` … Where a file explains a unit (`St   Stück`), only the explanation
is translated (`St   piece`).

## Bill of quantities structure

| German | English |
|---|---|
| Leistungsverzeichnis | bill of quantities |
| Leistungsbeschreibung | description of work |
| Position (Pos.) | item |
| Titel | section |
| Abschnitt | division |
| Bereich | area |
| Los | lot |
| Gewerk | trade |
| Kurztext | short text |
| Langtext | long text |
| Vorbemerkungen | preliminary remarks |
| Technische Vorbemerkungen | technical preliminary remarks |
| Hinweis(text) | note |
| Menge | quantity |
| Einheit | unit |
| Einheitspreis | unit price |
| Gesamtpreis / Gesamtbetrag | total price / total amount |
| Summe | total |
| Übertrag | carried forward |
| Zusammenstellung | summary |
| Angebotssumme | bid total |
| netto / brutto | net / gross |
| Mehrwertsteuer / Umsatzsteuer (MwSt. / USt.) | VAT |
| Nachlass | discount |
| Seite | page |
| Druckdatum | print date |
| Währung | currency |

## Item types and pricing words

| German | English |
|---|---|
| Grundposition | base item |
| Bedarfsposition / Eventualposition | contingency item |
| Wahlposition / Alternativposition | alternative item |
| Zulage / Zulageposition | surcharge item ("Zulage zu Pos. …" → "surcharge to item …") |
| Wiederholungsbeschreibung | repeat description |
| Bezugsbeschreibung / Bezugsposition | reference description / reference item |
| wie Position … / wie vor, jedoch | as item … / as before, but |
| Pauschal / pauschal / Pauschale | lump sum |
| Stundenlohnarbeiten | hourly-rate work (daywork) |
| einzukalkulieren / einzurechnen / einkalkuliert | to be included in the price / included in the price |
| ist in die Einheitspreise einzurechnen | is to be included in the unit prices |
| wird nicht gesondert vergütet | is not paid separately |
| Vergütung | payment |
| Abrechnung | billing (measurement for payment) |
| Aufmaß | measurement |
| Nachweis | proof (verification) |
| Nachtrag / Nachtragsangebot | change order / change-order offer |
| Mehrkosten / Minderkosten | additional cost / reduced cost |
| nach Wahl des AG / AN | at the client's (AG) choice / at the contractor's (AN) choice |
| nach Angabe des AG / der Bauleitung | as specified by the client (AG) / by site management |
| nach Aufwand | on a time-and-material basis |
| ca. | approx. |
| bauseits / bauseitig | by others on site (provided by the client side) |
| o. glw. / oder gleichwertig | or equivalent |
| Fabrikat | make |
| Typ | type |
| Angebotenes Fabrikat | make offered |
| vom Bieter einzutragen | to be entered by the bidder |

## Parties and procedure

| German | English |
|---|---|
| Auftraggeber (AG) | client (AG) |
| Auftragnehmer (AN) | contractor (AN) |
| Bieter | bidder |
| Bewerber | applicant |
| Bietergemeinschaft | bidding consortium |
| Arbeitsgemeinschaft (ARGE) | joint venture |
| Hauptangebot / Nebenangebot | main bid / alternative bid |
| Eigenerklärung zur Eignung | self-declaration of suitability |
| Zweckverband | special-purpose association |
| Baubeschreibung | construction description |
| Wagnis und Gewinn | risk allowance and profit |
| Nachunternehmer | subcontractor |
| Bauherr | building owner |
| Bauleitung / Bauüberwachung | site management / construction supervision |
| Vergabestelle | contracting authority |
| Ausschreibung | tender |
| Öffentliche Ausschreibung | open tender |
| Beschränkte Ausschreibung | restricted tender |
| Freihändige Vergabe | negotiated award |
| Vergabe | award |
| Angebot | bid (public tender) / offer (a contractor's quotation); "Anfrage" → inquiry |
| Aufforderung zur Abgabe eines Angebots | invitation to submit a bid |
| Angebotsfrist | bid deadline |
| Auftrag / Zuschlag | contract / award of contract |
| Vertragsbedingungen (Besondere / Zusätzliche / Weitere Besondere) | contract conditions (special / additional / further special) |
| Formblatt | form |
| Vertragsstrafe | contractual penalty |
| Sicherheitsleistung / Bürgschaft | security / guarantee bond |
| Abnahme | acceptance |
| Mängelansprüche / Gewährleistung | defect claims / warranty |
| Ausführungsfrist | completion period |
| Bauzeit | construction period |
| Baubeginn | start of construction |
| Kalkulation / Urkalkulation | cost estimate / original cost estimate |
| Lohn / Löhne, Stoffe / Material, Geräte, Sonstiges | labour, materials, equipment, other |
| Stunden | hours |

## Site and general work

| German | English |
|---|---|
| Baustelleneinrichtung | site setup |
| Baustelle einrichten / räumen | set up / clear the site |
| vorhalten / Vorhaltung | keep available on site / keeping available on site |
| Vorhaltedauer / Vorhaltemenge | availability period / quantity kept available |
| liefern | supply |
| einbauen | install |
| liefern und einbauen / liefern und verlegen / liefern und montieren | supply and install / supply and lay / supply and assemble |
| herstellen | produce (construct, make — one of these by object, "herstellen und vorhalten" → "construct and keep available on site") |
| verlegen | lay |
| montieren / Montage | assemble / assembly |
| demontieren / Demontage / Rückbau | dismantle / dismantling / removal |
| abbrechen / Abbruch | demolish / demolition |
| entsorgen / Entsorgung | dispose of / disposal |
| verwerten | recycle |
| laden / fördern / transportieren | load / convey / transport |
| Bauzaun | site fence |
| Verkehrssicherung | traffic safety measures |
| Gerüst / Schutzgerüst | scaffold / protective scaffold |
| Bauwasser / Baustrom | construction water / construction power |
| Tagesunterkunft | day accommodation |
| Beweissicherung | preservation of evidence (condition survey) |
| Bestand / Bestandsplan | existing (structures) / as-built drawing |
| Inbetriebnahme | commissioning |
| Dokumentation | documentation |
| Wartung | maintenance |
| Prüfung / Druckprüfung | test / pressure test |

## Civil works and pipelines

| German | English |
|---|---|
| Erdarbeiten | earthworks |
| Boden / Aushub | soil / excavation |
| Baugrube / Graben / Rohrgraben | excavation pit / trench / pipe trench |
| Verbau | shoring |
| Wasserhaltung | dewatering |
| Verfüllen / Verfüllung | backfill / backfilling |
| verdichten | compact |
| Bettung / Rohrbettung | bedding / pipe bedding |
| Oberboden | topsoil |
| Frostschutzschicht | frost protection layer |
| Tragschicht / Deckschicht | base course / surface course |
| Asphalt / Pflaster / Bordstein | asphalt / paving / kerb |
| Rohr / Rohrleitung / Leitung | pipe / pipeline / line |
| Druckrohr / Muffendruckrohr | pressure pipe / socket pressure pipe |
| Formstück | fitting |
| Armatur | valve (fitting where it is not a valve) |
| Schieber / Absperrklappe | gate valve / butterfly valve |
| absperrbar | can be shut off (not "lockable") |
| eckig | angular (not "square": the shafts are 2,00 x 3,00 m) |
| Schutzart (IP …) / Schutzklasse | degree of protection / protection class |
| Betondecke | concrete slab under a floor, concrete ceiling where the underside is meant |
| Flansch / Muffe | flange / socket |
| Schacht / Schachtbauwerk | shaft / shaft structure |
| Schachtabdeckung | manhole cover |
| Durchlass | culvert |
| Hausanschluss | house connection |
| Kabelschutzrohr | cable duct |
| Schmutzwasser / Regenwasser / Trinkwasser | wastewater / stormwater / drinking water |
| Brunnenwasser | well water |
| Fernleitung | long-distance pipeline |
| Spülbohrung / Spülbohrverfahren | directional bore / directional drilling method |
| Pilotbohrung | pilot bore |
| Start- / Zielgrube | launch / reception pit |
| Homogenbereich (HB) | homogeneous zone (HB) |
| Bodenklasse | soil class |
| Außendurchmesser (AD, DA, Da) | outside diameter (the codes AD, DA, Da are kept as written) |
| Verrechnungssatz | charge-out rate |
| MSR | I&C (instrumentation and control) |
| Vorlauf / Rücklauf (VL / RL) | flow / return (VL / RL kept) |
| Stahlbeton / Beton / Bewehrung / Schalung | reinforced concrete / concrete / reinforcement / formwork |
| Fertigteil | precast element |

## Building trades (project F)

| German | English |
|---|---|
| UG / EG / OG / DG | basement / ground floor / upper floor / attic floor. "1. OG", "2.OG" → "1st floor", "2nd floor", counted the British way: the 1st floor is the first storey above the ground floor |
| GB (in "Bedarfsposition mit / ohne GB") | total amount ("contingency item with / without total amount") |
| GK / STB | plasterboard / reinforced concrete |
| Rohbau | structural works |
| Estrich | screed |
| Bodenbelag | floor covering |
| Fliesen / Naturstein | tiles / natural stone |
| Malerarbeiten | painting works |
| Trockenbau | drywall construction |
| Abdichtung | waterproofing |
| Dämmung / Wärmedämmung | insulation / thermal insulation |
| Porenbeton | aerated concrete |
| Sockelleiste | skirting board |
| Untergrund | substrate |
| Schreinerarbeiten | joinery works |
| Sanitär | sanitary (plumbing) |
| Elektro (ELT) | electrical (ELT) |
| UP / AP (Unterputz / Aufputz) | flush-mounted / surface-mounted |
| S / Ö (Schließer / Öffner contacts) | NO / NC |
| RWA | SHEV (smoke and heat exhaust ventilation) |
| KG 444 (Kostengruppe) | cost group code, kept: KG 444 |
| Tür / Tor / Sektionaltor | door / gate / sectional door |

## Things that are never changed

- Numbers, item numbers, quantities, prices, dates, dimensions, DN / PN values — including the German number format
  (`139,7`, `1.451,00`).
- Standards and rule sets: `DIN EN 1092-1`, `ATV DIN 18300`, `VOB/B`, `ZTV …`, `DVGW W 400`.
- Article and product codes, product names, street names.
- Anonymisation tokens: `[FIRMA_044]`, `[ORT_016]`, `TELEFON_084`, `[PROJEKT_000…0002]`, `[PERSON_167]` …
- Blank fill-in fields: `'.........'`, dotted lines.
- Errors of the source: wrong or contradicting values, leftovers of copy and paste, cut-off words. A misspelled German
  word is rendered with a comparable misspelling in English.
