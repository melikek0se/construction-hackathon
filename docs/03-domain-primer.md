# Domain primer: German bidding and estimating

What a developer needs to know to build this tool. Compiled from web research on 2026-11-20.
**[V]** = checked against the linked source. **[U]** = practice knowledge or derivation, not verified — confirm with
a mentor or the brother (civil engineer) before putting it on a slide.

## Glossary

| German | English | Note |
|--------|---------|------|
| Leistungsverzeichnis (LV) | Bill of quantities (BoQ) | Written by the client's planner, priced by bidders |
| Position (Pos.) / Ordnungszahl (OZ) | Item / item number | |
| Titel, Los, Abschnitt | Title, lot, section | Levels of the LV tree |
| Kurztext / Langtext | Short / long text | Long text is the contractually relevant description |
| Vorbemerkungen | Preliminary remarks | Apply to all items; where risk is often shifted |
| Menge, Mengeneinheit (ME) | Quantity, unit | |
| Einheitspreis (EP) / Gesamtpreis (GP) | Unit price / total price | GP = EP × quantity |
| Pauschale (psch) | Lump sum | |
| Bedarfsposition / Eventualposition | Contingency item | Executed only if ordered |
| Wahlposition / Alternativposition | Alternative item | Client picks one variant |
| Zulage | Surcharge item | Extra on top of a base item |
| Stundenlohnarbeiten | Hourly-rate work | |
| Fabrikat, "oder gleichwertig" | Product make, "or equivalent" | |
| bauseits | Provided by the client / by others | |
| Aufmaß | Measurement of executed work | Payment is by measured quantity |
| Nachtrag | Change order / claim | |
| Bieterfrage | Bidder question to the client | The correct reaction to an unclear LV |
| Bindefrist | Bid validity period | |
| Kalkulator | Estimator | Our user |
| AG / AN | Client / contractor | Auftraggeber / Auftragnehmer |
| AVA | Tendering software | ORCA, California, RIB iTWO, NEVARIS … |
| GAEB | Exchange format for LVs | 83 = tender, 84 = bid, 86 = award |
| VOB/A, /B, /C | Procurement rules, contract terms, technical terms | |
| Preisspiegel | Price comparison sheet | Bids or supplier quotes side by side |

## How a unit price is built

```
  Lohn (labour)        = Aufwandswert [h/unit] × Kalkulationslohn [EUR/h]
+ Stoffe (materials)   = purchase price × (1 + waste) + freight
+ Geräte (equipment)
+ Sonstiges / Nachunternehmer (other / subcontractors)
= EKT  Einzelkosten der Teilleistung (direct cost)
+ BGK  Baustellengemeinkosten (site overhead)
= Herstellkosten
+ AGK  Allgemeine Geschäftskosten (company overhead)
+ W+G  Wagnis und Gewinn (risk and profit)
= Einheitspreis
```

Two methods: **Zuschlagskalkulation** (fixed surcharges on direct cost) and **Kalkulation über die Angebotsendsumme**
(site overhead calculated per project, AGK and W+G as a share of the bid total, then spread over the items).
Public clients ask for the breakdown on VHB forms **221** (surcharge method), **222** (bid-total method) and
**223** (breakdown of selected unit prices). [V] <https://www.bauprofessor.de/lohnkosten-efb-preisblaetter/>

Typical ranges [V] <https://www.bauprofessor.de/gemeinkostenzuschlaege/>:

| Component | Range |
|-----------|-------|
| AGK, share of bid total | 15–25 % |
| Profit | 3–5 % |
| Risk (Wagnis) | 2–4 % |
| Overall surcharge on direct cost (simple method) | 28–40 % |
| Differentiated surcharge on labour / materials / equipment / subcontractors | ~35 % / ~28 % / ~15 % / ~10 % |
| BGK, share of turnover | 5–12 % |

**Labour.** Collective benchmark wage (Ecklohn) 24.60 EUR/h from 1 April 2026; wage on-costs about 91 % (West, 2026)
[V] <https://www.bauprofessor.de/lohnzusatzkosten/>. That puts the calculation wage at roughly 45–52 EUR/h and billing
rates at 60–75 EUR/h [U, derived]. Our dataset shows **80–100 EUR/h** billed in real 2023–2024 bids for hourly-rate
items (`02-dataset.md`) — use the data, it is the better anchor.
Labour hours per unit (**Aufwandswerte**) come from ARH tables, Plümecke "Preisermittlung für Bauarbeiten", and each
firm's own post-calculation [V] <https://www.baunetzwissen.de/drucken/arbeitszeit-richtwerte-49211>. There is no free
machine-readable source; an LLM estimate with a band is the hackathon option.

**Waste / loss** (Verschnitt, Bruch, Streuverlust). Tiles 5–10 %, up to 15–20 % for diagonal or large-format laying;
laminate, parquet, vinyl 5–10 % [V, consumer-grade sources]
<https://www.sanier.de/bodenbelag/fliesen/fliesenmenge-berechnen>. Rules of thumb [U]: drywall boards 5–10 %,
profiles 3–5 %, rebar 2–5 %, ready-mix concrete 1–3 %, pipes 3–5 %, masonry 2–5 %, insulation 3–8 %.
Make these configurable per trade.

> **Important:** the LV quantity is the *installed* quantity, and payment follows the measured installed quantity.
> Waste is not added to the LV quantity — it goes into the contractor's material cost per unit, and into the
> *order* quantity for procurement.

## Prices move

- **Bid validity (Bindefrist):** normally up to 30 calendar days for national tenders, 60 for EU-wide
  [V] <https://www.bauprofessor.de/bindefrist/>. The bidder is bound to the price for that time.
- **Supplier quotes** are often non-binding ("freibleibend") or valid 2–4 weeks; steel, bitumen, timber are frequently
  daily prices [U]. So the bidder is bound longer than the suppliers are — that gap is priced as risk.
- **Stoffpreisgleitklausel (VHB form 225):** material price escalation clause, tied to Destatis producer price indices,
  used when price risk cannot be calculated and delivery is more than a month after the bid
  [V] <https://www.fib-bund.de/Inhalt/Vergabe/VHB/2023-06-20_Formblatt_225.pdf>. Check: long execution period +
  volatile material + no escalation clause = flag.
- **Indices:** Destatis GENESIS-Online has a free REST API. Construction price indices: tables 61261-0001 … -0012;
  producer price index by product: 61241-0004 (verify the current code)
  [V] <https://www.destatis.de/EN/Service/OpenData/api-webservice.html>. Use them to bring 2023/2024 prices from our
  dataset to today. The API **requires an account** (username/password or token, POST only) [V]
  <https://genesis.destatis.de/datenbank/online/docs/GENESIS-Webservices_Einfuehrung.pdf>. The construction price index
  is quarterly, the producer price index monthly.
- **Benchmarks:** BKI, sirAdos, STLB-Bau/DBD, baupreislexikon.de are all commercial. **No free unit-price dataset was
  found.** Our options: the three priced bids in the dataset, indices, bottom-up synthesis, supplier quotes.

## Where change orders come from

VOB/B §2 [V — all rows checked against the text at <https://dejure.org/gesetze/VOB-B/2.html>]:

| Rule | Trigger | What the tool looks for |
|------|---------|-------------------------|
| §2 Abs. 3 | Executed quantity deviates more than 10 % from the LV | Implausible quantities, inconsistent quantities across related items |
| §2 Abs. 5 | Client changes the design or gives instructions | Vague specs ("nach Wahl des AG", "nach Bemusterung"), contradictions |
| §2 Abs. 6 | Work needed but not in the contract | Missing items; must be announced *before* execution |
| §2 Abs. 7 | Lump sum — fixed unless deviation is unreasonable | Large scope behind a `psch` item |
| §2 Abs. 8 | Work without order — normally unpaid | |
| §2 Abs. 10 | Hourly work only if agreed in advance | Hourly-rate items with token quantities |

VOB/A §7 [V] <https://lxgesetze.de/vob-a-2019/7>: the description must be **unambiguous and exhaustive** ("eindeutig
und erschöpfend"), must not place an **unusual risk** on the contractor, and contingency items are generally not
allowed. Violations by a public client are bidder-question material.

VOB/C DIN 18299 [V] <https://www.bauprofessor.de/besondere-leistungen/>: **Nebenleistungen** (section 4.1) are included
without being mentioned; **Besondere Leistungen** (section 4.2) are owed and paid only if expressly described. An item
that folds special services (scaffolding, dewatering, disposal, shoring) into the price "without separate payment" is a
cost trap; a special service that is needed but described nowhere is a change order.

Case law [V]: ambiguity generally goes against the public client, **but** a bidder who sees an obviously incomplete
description must ask — otherwise the risk is theirs.
<https://vergabeblog.de/2014-02-11/bgh-unklarheiten-der-leistungsbeschreibung-gehen-zu-lasten-des-oeffentlichen-auftraggebers/>
This is why "generate the bidder questions" is a real feature and not decoration.

## Red-flag wording

Sourced [V] (<https://www.vob.de/magazin/unklare-leistungsbeschreibungen/>,
<https://bauanalyst.de/blog/leistungsverzeichnis-pruefen>):

- "nach Erfordernis", "soweit erforderlich", "je nach Bedarf"
- "bauseits", "bauseits beizustellen"
- "laut Aufwand"
- "nach Weisung / Angabe der Bauleitung"
- "nach Muster", "nach Bemusterung"
- completeness clauses: "alle zur ordnungsgemäßen Ausführung erforderlichen Leistungen sind einzurechnen"
- plans and LV disagree and no order of precedence is given

Estimator practice [U]:

- "nach Wahl des AG"
- "komplett", "betriebsfertig", "schlüsselfertig", "funktionsfähig"
- "einschl. aller Nebenarbeiten", "in den EP einzurechnen", "wird nicht gesondert vergütet"
- "ggf.", "ca.", "bis zu", "mind.", "in Abstimmung mit"
- named product without "oder gleichwertig"; "o. glw." without a field for the offered product
- "wie vor, jedoch" reference chains
- "Erschwernisse sind einzukalkulieren"; ground or existing-structure risk assigned to the contractor
- "Entsorgung" without a waste class
- "außerhalb der Regelarbeitszeit", "in Abschnitten"
- quantity 1 `psch` for a large scope; surcharge item without base item; missing references to plans or soil report

Weight these by context — "komplett" in a pump-delivery item is normal; in an earthworks item it is not.

## Supplier price inquiries in practice

Mostly [U]; partial support: <https://www.bauprofessor.de/preisspiegel-einkauf-stoffe/>

- **The supplier asks first: who are you?** Company and customer number, project name and site address (freight zone,
  delivered to site vs ex works), exact product / spec / standard or "equivalent", quantity and partial deliveries,
  delivery window, unloading, whether this is a bid or an awarded job, reply deadline.
- **List price ≠ your price.** Customer discount groups, project prices, volume tiers, cash discount, annual bonus,
  freight, small-quantity surcharges. This is why web-scraped list prices are weak and a direct inquiry is worth it.
- Quotes are compared net-net (incl. freight and discount) in a **Preisspiegel**.

## Tooling

- **pyGAEB** (Python, MIT) — GAEB DA XML 2.0–3.3, all phases, validation, writing. Small project, released April 2026.
  GAEB 90 not supported. [V] <https://github.com/frameiq/pygaeb> — worth a 20-minute trial before hand-writing the
  XML parser.
- **No open-source GAEB 90 parser found.** Write our own (small). Layout reference: "Das Freie GAEB Buch"
  [V] <https://www.mwm.de/download/ftp/docs/Das_freie_GAEB_Buch.pdf>. Record 00 carries the OZ mask (`1122PPPPI` =
  level 1 two digits, level 2 two digits, item four digits, index one). The book gives unit price as 3 implied
  decimals; **two of our three priced files use 2** — trust the `EP × Qty = GP` check, not the spec.
- GAEB DA XML 3.3 documentation (free):
  <https://www.gaeb.de/wp-content/uploads/2019/10/Fachdokumentation_GAEB-DA-XML_3.3.pdf>

## Who already does this

Vendor claims, not tested: **BauAnalyst** (AI LV check for VOB risks and change-order rights), **baugenic** (risks,
contradictions, change-order potential), **handwAI** (LV analysis for trades), **SCAIT** (CH, plausibility vs
benchmarks), **GAEB-KI-PreisNavigator** (AI pricing of GAEB items), **Tendermeister** (GAEB bid automation),
**Cosuno** (GC tendering platform with price estimates). Incumbent AVA/estimating suites: RIB iTWO, NEVARIS, BRZ,
Sidoun, ORCA.

Most are either risk-text checkers or price suggesters. **Risk check → explainable price with provenance → supplier
inquiry that closes the price gap, in one flow** is where we can be different. Expect a judge to say "BauAnalyst does
this" — have the answer ready.

## Verification pass (2026-11-20, second round)

- VOB/A §7 confirmed at <https://dejure.org/gesetze/VOB-A/7.html>: unambiguous and exhaustive (Abs. 1 Nr. 1), no
  unusual risk (Nr. 3), contingency items generally not to be included (Nr. 4), product neutrality (Abs. 2).
- **Still unverified — treat as configurable assumptions, do not put on slides:** supplier quote validity of
  "2–4 weeks" (only "freibleibend" as standard clause is supported); waste percentages per trade (forums and guides
  only); labour-hour values except masonry (ARH: 0.32–0.41 h/m² for 17.5 cm Planziegel wall,
  <https://www.gima-ziegel.de/wp-content/uploads/Auszug_Handbuch_Richtzeit-Tabellen.pdf>).
- **Pitch numbers.** Usable: Bundesrechnungshof data on federal road construction 1995–1999 — 2,988 contracts with
  7,321 change-order agreements (about 2.5 per contract), 98 % commissioned only after execution (via Wanninger 2003,
  <https://www.cemconsultants.de/downloads/Behinderungen-Nachtraege.pdf>). Not usable: bid hit rates ("1 in 10"),
  hours per bid, average change-order volume as a share of contract sum — no reputable source found.
