# Dataset

Source: `Challenge A Dataset` zip from the organisers, committed under `dataset/` (44 files, ~25 MB), sorted by format:
`01_gaeb_xml/`, `02_gaeb_90/`, `03_pdf_hochbau_projekt/` (project F), `04_pdf_tiefbau_sonstige/`, `05_positionslisten/`.
Reproduce the numbers below with `python3 scripts/inspect_dataset.py`.

Everything is anonymised with placeholder tokens: `[FIRMA_044]`, `[PERSON_132]`, `[ORT_024]`, `[ADRESSE_016]`,
`[TELEFON_084]`, `[EMAIL_004]`, `[PROJEKT_004]`, `[NUMMER_001]`, `[URL_012]`, `[BILD_001]`.
The anonymiser was over-eager: it also replaced things that are not personal data (see Gotchas).

**English reading copy:** `dataset/en/` holds all 44 files once more in English (same subfolders, names and
formats), translated 1:1 with every error, contradiction and anonymisation token of the source kept. It is for
reading only and never app input (D-022); `dataset/en/README.md` says how it was made and what its limits are,
`dataset/en/TRANSLATION_NOTES.md` lists the source defects the translators noticed, per file with item number or page.

## The six projects

The 44 files are not 44 BoQs. They group into six projects, three of which come with **real priced bids**.

| # | Project | Trade | Files | Prices? |
|---|---------|-------|-------|---------|
| A | **8209.003 "Maschinentechnik – Anlagenbau"** (water utility plant engineering, tender 28.02.2024) | Mechanical / plant | `8209.003_Leistungsverzeichnis_leer.D83`, `…_leer.X83` (same empty LV, 159 items), `[ORT_024] LV24069.D86` (award, 197 items), `HEM2301-2_Gesamt-LV.pdf` (136 p, full tender package incl. VHB forms — link to this project is likely, not verified) | Yes — award, **536,991.65 EUR net** |
| B | **"Ringschluss Brunnenwasser"**, Neubau Technische Chemie (public client, VHB Bayern, 03/2023) | Civil / pipeline | `[NUMMER_001]_leer.X83` (248 items), `Leistungsverzeichnis_leer.pdf` (78 p), `StBALV23040.D84` (bid), `StBALV23040.D86` (award), `Abgabe LV.pdf` (91 p, submitted bid incl. forms) | Yes — bid = award, **897,305.45 EUR net**, 249 items |
| C | **2024-001 "Fernleitung"** (long-distance water pipeline) | Civil / pipeline | `Leistungsverzeichnis.pdf` (71 p, empty LV), `LV-Schachtbauwerk.pdf` (14 p excerpt: shaft structures), `Angebot AN24-0305.D84` + `.pdf` (contractor offer, 25.11.2024), `LV-Positionen.docx` | Yes — offer, **988,913.89 EUR net**, 274 items |
| D | **152516 Bachdurchlass** (culvert replacement, small municipality, 05/2025) | Civil | `GAEB-[PROJEKT_004].X83` (50 items), `LV-Ausdruck-[PROJEKT_004].pdf` (22 p) | No |
| E | **501-24-01** | Mixed (296 items, many `St`, 27 hourly-rate items) | `501-24-01_GAEB-XML_sas.x83` | No |
| F | **79-222 "Ausbildungszentrum und Bürogebäude"** (training centre + office building) | 27 building-trade LVs | `LV_00_Roh_und_Erdauarbeiten.pdf` … `LV_23_Sanitaertrennwaende.pdf` (1–68 pages each, ~400 pages total) | No — these are subcontractor inquiries ("Anfrage") from a general contractor |

Why this matters:

- **A, B, C give us ground truth unit prices** (~720 priced items) — enough to seed a small price history for pipeline/civil/plant work. This covers the challenge's "optional: historical project data".
- **A/B/D exist as both GAEB and PDF** → we can score our PDF parser against the GAEB version of the same LV.
- **F is the "many trades, cross-trade dependencies" case** from the problem statement (e.g. Estrich ↔ floor coverings ↔ underfloor heating ↔ waterproofing). PDF only.
- No Excel files and no planned-vs-actual cost data are in the set.

## Findings worth building on

1. **Bidder-added optional items in project A.** The award file has 197 items, the tender 159. The 38 extra items sit
   in a new title `08` with texts such as *"Mehrkosten Armaturen für Ausführung VAG"* (extra cost for a different valve
   make), *"Zulage Entsorgungskosten …"* (disposal surcharge) and concrete pump models. They carry a unit price but
   **quantity 0 and total 0**, so they are not in the 536,991.65 EUR. They are price offers for alternatives and
   extras the bidder expected to matter — not executed change orders, but a real signal of where the tender was
   under-specified (product make, disposal).
2. **Speculative / token prices.** Offer C has 44 items under 1 EUR/unit (e.g. 0.05 EUR/m² × 30,230 m²); B has 22
   (e.g. 0.03 EUR per metre-week). Normal for "vorhalten" (keep on site) items, but also the signature of
   speculative pricing on quantities the bidder expects to change. Useful as an outlier check on a competitor's or
   subcontractor's offer.
3. **Bidder fill-in fields.** PDFs contain `Angebotenes Fabrikat: '.........'` (bidder must name the product) and dotted
   price fields. Items demanding a product choice are exactly the ones that need a supplier quote.
4. **Position types are flagged in the data.** XML files carry `LumpSumItem`, `Provis` (24 contingency items in
   project E) and `RefDescr` / `SubDescr`. B's D86 marks 14 items `W` and 4 `B` in column 21 of record 21:
   these are **not** alternative / contingency items but repeat (Wiederholungs-) and reference (Bezugs-)
   descriptions — every `W` is followed by a record 28 and "Wie Position …", and the file's own section totals
   include them. The XML twin marks the same pairs `<RefDescr>Ref</RefDescr>` / `Rep` with `<RefRNo IDRef>`.
   GAEB 90 marks a real alternative with `A` in column 12. No priced file in the dataset has alternative or
   contingency items. (Corrected 2026-11-21; the parser read W / B as Wahl / Bedarf before.)
5. **`LV-Positionen.docx` is a human-made grouping** of project C's items by work package (asphalt, trench, pipe
   material DN 250, cable duct …) including "either/or" and "with" combinations. It shows which items belong together
   — a seed for the "missing item" check (pipe delivered but no laying item, etc.).
6. **Unit chaos.** `St`, `Stk`, `Stk.`, `St.`; `m3`, `m³`; `h`, `Std`, `Std.`; `t`, `to`; `psch`, `PSCH`; plus time-based
   units `Wo`, `StWo`, `mWo`, `m2d`, `Mt`, `Jahr`. Normalise before any comparison.
7. **Cost breakdown exists only nominally.** A's D86 declares four components (Löhne / Stoffe / Geräte / Sonstiges)
   and the X83 of B requests a unit price breakdown (`UPBkdn`), but in A all cost sits in the first component.
   We have no real labour/material split in the data.

8. **Real hourly rates are in the priced bids** (Stundenlohnarbeiten items, unit `h`). Billing rates incl. all
   surcharges, 2023–2024: helper 80, skilled worker 82–85, foreman 85, engineer / project lead 100 EUR/h (A and B);
   C ranges 61.70–113.50 EUR/h for labour and machine-with-operator hours. A usable anchor for labour cost.

9. **Real copy-paste contradictions exist.** Project A, item 05.01.4: short text "Edelstahl-Rohr DN 125", long text
   "Edelstahlrohr DN 100 … 139,7 x 2,6 mm" (139.7 mm is DN 125; the neighbouring DN 100 item was copied). Item 05.03.1:
   "Ausbaustück DN 65" with "Muttern A4, DN 100" in the long text, identical to the DN 100 item below it. Project B,
   item 1.1.4: "DN100" in the short text, "DN 150" in the long text. A short-vs-long dimension check finds these.
   The check (`R-DIM-MISMATCH`) also found two more: A 5.1.46 "Losflansch DN 125" with "Losflansch, DN 100" in the
   long text, and E 2.3.23, existing main "DN 150" in the short text and "GGG DN 300" in the long text. It does not
   flag A 05.03.1, where the right DN also appears in the long text.
10. **Money is concentrated.** In offer C the 20 largest of 274 items make up 80.5 % of the total; in award A the top
   20 of 197 make up 67 %. Reviewing by money at stake is justified by the data.
11. **Related quantities are checkable.** Offer C: pipe delivered 1,451 m + 524 m = 1,975 m = pipe laid 1,975 m;
   calibration 4,760 m = 2 × 2,380 m of twin duct. Consistent here — so a mismatch elsewhere is a real finding.
12. **Risk wording is frequent.** Project E (296 items): "einzukalkulieren" in 58 items, "ca." in 77, 38 lump-sum
   items. Example 02.03.0001: one lump sum "hardship surcharge for all road and civil items in all trades" for a soil
   protection concept, described in ~4,000 characters. Example 02.03.0035: 10 m³ of search trenches for "pipes of
   unknown or imprecise position", width "as needed".

## Formats

### GAEB DA XML (`.X83`, `.x83`)

- Phase 83 = invitation to tender (no prices). Versions 3.1 (namespace `…/GAEB_DA_XML/200407`) and 3.2
  (`…/GAEB_DA_XML/DA83/3.2`). **Match elements by local name, ignore the namespace.**
- Structure: `Award/BoQ/BoQBody/BoQCtgy` (nested titles, `RNoPart` = number segment) `/BoQBody/Itemlist/Item`.
  The full item number (OZ) is the concatenation of `RNoPart` along the path; `BoQBkdn` gives segment lengths.
- Item: `Qty`, `QU` (unit), `Description/CompleteText/DetailTxt` (long text, HTML-like `p`/`span` with inline styles)
  and `OutlineText` (short text). Optional: `LumpSumItem`, `Provis`, `UPBkdn`, `RefDescr`, `SubDescr`, `SumDescr`.
- Preliminary remarks (`AddText`, `Remark`) hold contract-relevant text (site conditions, what is included in prices).
  They matter for risk analysis — do not drop them.
- Some files are single-line XML with 65 kB lines; fine for a parser, bad for `grep`.

### GAEB 90 (`.D83`, `.D84`, `.D86`)

Fixed-width, 80 columns, CRLF, record type in columns 1–2, running line number in 75–80.
84 = bid (prices), 86 = award. Layout as observed in our files (0-based slices):

| Record | Meaning | Fields |
|--------|---------|--------|
| `00` | Header | phase at `[10:12]` |
| `01`–`08` | Project name, dates, client, bidder, currency | |
| `T0`/`T1`/`T9` | Free text block before the LV (preliminary remarks) | |
| `11` / `12` | Title start / title text | OZ prefix `[2:11]` |
| `21` | Item header | OZ `[2:11]`, flags `[11:23]` (`W`, `B`, `L` seen), quantity `[23:34]` with 3 implied decimals, unit `[34:38]` |
| `25` | Short text | `[2:72]` |
| `26` | Long text line | `[5:72]` |
| `23` | Prices | OZ `[2:11]`, then unit price, total price, quantity (whitespace separated) |
| `30` | Unit price breakdown | 4 × 10 digits |
| `31` / `32` | Title end / title sum | |
| `99` | Trailer (totals, item count) | |

### PDF

All 34 PDFs have a text layer (no OCR needed). At least four different print layouts (different AVA programs).
Common pattern: `OZ  short text` → long text lines → `quantity unit  ........  ........`. Page headers/footers and
"Übertrag" (carry-over) lines repeat on every page and must be stripped. Tender packages (`HEM2301-2`, `Abgabe LV`)
start with many pages of contract forms before the LV begins.

## Gotchas

- **Encoding differs per file.** Four GAEB 90 files are DOS code page (cp850/cp437); `Angebot AN24-0305.D84` is
  latin-1 (otherwise `m³` decodes as `m│`). Detect per file.
- **Unit price width differs per file.** 10 digits / 2 decimals in A and B, 11 digits / 3 decimals in C. Total price is
  always 2 decimals. Use `EP × Qty == GP` as a parser self-check (it holds for all 720 priced items).
- **OZ formatting differs.** `01010001` (B) vs ` 1 1  10` (C) vs `0101   1` (A). Normalise to a dotted form.
- **`StBALV23040.D84` has prices but no quantities or texts** — join with the D86 or X83 on OZ.
- **Sums include alternative items.** Our naive total for B adds `W` items; a correct total excludes Wahlpositionen.
- **Anonymiser artefacts.** Product names and standards got replaced: `KSB Etabloc TELEFON_084` (a pump model),
  `VOB [ORT_016] C` (= "VOB Teil C"), `ATV DIN [ORT_032]`, `[PERSON_167] WL` (probably a pipe product), GAEB 90
  placeholders padded with zeros (`[FIRMA_0000…0044]`). A typo/consistency checker must ignore `[TOKEN_nnn]` patterns,
  and the LLM prompt should explain them.
- **Language is German throughout.** Technical German with heavy abbreviation (`i.L.`, `DN`, `lfm`, `psch`, `einschl.`).

## Files from outside the dataset (not in the repository)

Downloaded 2026-11-20 into `data/external/excel/` (git-ignored) to try the Excel import and a benchmark:

- LV templates with sample items: `excelwelt.com/leistungsverzeichnis-vorlage/` (three .xlsx, 11–13 items, OZ /
  Pos.-Art / Kurztext / Langtext / Menge / ME / Einheitspreis / Gesamtpreis), `excelvorlage.de/leistungsverzeichnis-2/`
  (one sample row), `streit-software.de/vorlagen/leistungsverzeichnis-erstellen` (a calculation sheet, no LV).
- Richtpreisverzeichnis Tiefbau 2021 of the Autonomous Province of Bolzano (XLS, German and Italian, 10,967
  rows, 8,117 with a price): `oeffentliche-vertraege.provinz.bz.it/de/informationssystem-offentliche-vertraege/richtpreisverzeichnis-2021`.
  Other wording (unit `Nr` for pieces) and another price level than the German bids; see STATE.md for the test.

## Not yet looked at in detail

- `Abgabe LV.pdf` (submitted bid of project B) is priced, but **not identical to `StBALV23040.D84`/`.D86`**: item
  1.1.1 is 26,000.00 in the PDF and 16,000.00 in the GAEB files, item 1.1.12 is 1,233.33/m in the PDF and
  6,000.00/m in the GAEB files; the PDF total is 835,804.22 EUR against 897,305.45 EUR. Which is the later
  version is unknown. Item 10.1.1 exists only in the GAEB files.
- Anonymiser artefact in `StBALV23040.D86`: the item number `08010003` was replaced by `TEL00009` (taken for a
  phone number), so that item parses as `TE.L0.9`; the PDF has it as 8.1.3.
- Project C, item 3.2.60 (found by `R-DIM-MISMATCH` on the PDF): short text "Muffenschutz aus Gummi DN 300",
  long text "Muffenschutz aus Gummi DN 500".
- Content of the long preliminary remarks (what risks they shift to the contractor).
- Cross-trade overlaps inside project F.
