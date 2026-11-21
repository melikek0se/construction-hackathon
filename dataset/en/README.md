# `dataset/en/` — English reading copy of the dataset

Every file of `dataset/` once more, in English, with the same file names and formats (GAEB XML, GAEB 90, PDF,
DOCX). It is for a reader who does not know German and wants to see exactly what the original says.

**It is a reading aid, not input for the app.** The checks key on German wording (decision D-022 in
`docs/DECISIONS.md`); the app's sample list and `scripts/inspect_dataset.py` skip this folder.

## Layout

`dataset/` sorts the files by format; this folder sorts them **by project**, following the project list of the app
(`src/boq/catalog.py`, described in `docs/02-dataset.md`). The tables below give the German original of every file.

General files, valid for all projects, are at the top level:

- `README.md` — this file: layout, method, checks, limitations.
- `GLOSSARY.md` — the one German → English term list used for all files, and the codes that stay German.
- `TRANSLATION_NOTES.md` — what applies to all files, and an index of the notes per project.

Each project folder holds the files of that project and its own `TRANSLATION_NOTES.md`: every error, typo,
contradiction or oddity noticed in the source of those files and how it was carried over (2,022 entries in all).

### `A_Maschinentechnik-Anlagenbau_8209.003/` — Mechanical engineering – plant construction (water utility)

| File | What it is | German original |
|---|---|---|
| `8209.003_Leistungsverzeichnis_leer.D83` | tender | `dataset/02_gaeb_90/8209.003_Leistungsverzeichnis_leer.D83` |
| `8209.003_Leistungsverzeichnis_leer.X83` | tender | `dataset/01_gaeb_xml/8209.003_Leistungsverzeichnis_leer.X83` |
| `HEM2301-2_Gesamt-LV.pdf` | tender package | `dataset/04_pdf_tiefbau_sonstige/HEM2301-2_Gesamt-LV.pdf` |
| `[ORT_024] LV24069.D86` | award | `dataset/02_gaeb_90/[ORT_024] LV24069.D86` |

### `B_Ringschluss-Brunnenwasser/` — Ring connection well water (civil / pipeline)

| File | What it is | German original |
|---|---|---|
| `Abgabe LV.pdf` | submitted bid | `dataset/04_pdf_tiefbau_sonstige/Abgabe LV.pdf` |
| `Leistungsverzeichnis_leer.pdf` | tender | `dataset/04_pdf_tiefbau_sonstige/Leistungsverzeichnis_leer.pdf` |
| `StBALV23040.D84` | bid | `dataset/02_gaeb_90/StBALV23040.D84` |
| `StBALV23040.D86` | award | `dataset/02_gaeb_90/StBALV23040.D86` |
| `[NUMMER_001]_leer.X83` | tender | `dataset/01_gaeb_xml/[NUMMER_001]_leer.X83` |

### `C_Fernleitung_2024-001/` — Long-distance pipeline (civil / pipeline)

| File | What it is | German original |
|---|---|---|
| `Angebot AN24-0305.D84` | offer | `dataset/02_gaeb_90/Angebot AN24-0305.D84` |
| `Angebot AN24-0305.pdf` | offer | `dataset/04_pdf_tiefbau_sonstige/Angebot AN24-0305.pdf` |
| `LV-Positionen.docx` | list of items grouped by work package (not an LV) | `dataset/05_positionslisten/LV-Positionen.docx` |
| `LV-Schachtbauwerk.pdf` | excerpt | `dataset/04_pdf_tiefbau_sonstige/LV-Schachtbauwerk.pdf` |
| `Leistungsverzeichnis.pdf` | tender | `dataset/04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf` |

### `D_Bachdurchlass_152516/` — Stream culvert (civil)

| File | What it is | German original |
|---|---|---|
| `GAEB-[PROJEKT_004].X83` | tender | `dataset/01_gaeb_xml/GAEB-[PROJEKT_004].X83` |
| `LV-Ausdruck-[PROJEKT_004].pdf` | tender | `dataset/04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf` |

### `E_Tiefbau-und-Verlegung_501-24-01/` — Civil works and laying (civil / pipeline)

| File | What it is | German original |
|---|---|---|
| `501-24-01_GAEB-XML_sas.x83` | tender | `dataset/01_gaeb_xml/501-24-01_GAEB-XML_sas.x83` |

### `F_Ausbildungszentrum-und-Buerogebaeude_79-222/` — Training centre and office building (27 building-trade LVs)

The 27 trade LVs `LV_00_Roh_und_Erdauarbeiten.pdf` … `LV_23_Sanitaertrennwaende.pdf` (German originals in `dataset/03_pdf_hochbau_projekt/`), plus `TRANSLATION_NOTES.md`.

## What was kept verbatim, and why

The originals contain errors that the app is meant to find (a short text saying DN 125 above a long text saying
DN 100, quantities that do not match, leftovers of copy and paste, typos). A translation that repairs them would
hide the very things a reader wants to see. So nothing was corrected, harmonised or completed:

- Numbers, item numbers (OZ), quantities, prices, dates, DN / PN values and dimensions, in the German number format
  (`139,7`, `1.451,00`).
- Unit codes (`St`, `psch`, `m³`, `Mt`, `StWo` …). Where a file explains a unit, only the explanation is translated.
- Standards and rule sets (DIN, EN, ISO, VOB, ATV, ZTV, DVGW …), article and product codes, product, company and
  street names.
- Anonymisation tokens (`[FIRMA_044]`, `[ORT_016]`, `TELEFON_084`, `[PROJEKT_000…0002]`), byte-identical. Some
  replaced product names, standards or ordinary words; those sentences are as damaged in English as in German.
- Contradictions, ambiguity ("approx.", "at the client's choice"), blank fill-in fields and dotted price lines.
- Misspelled German words are rendered with a comparable English misspelling and logged in the notes.
- German abbreviations used as codes (AG, AN, EP, GP, LV, OZ …); the glossary explains them.
- File names, including their misspellings.

## How it was made

Scripts are in `scripts/translate/`, intermediate files in `data/processed/translation/` (git-ignored).

1. **Extract** (`pipeline.py extract`): each file is cut into segments, with their place in the file.
   - GAEB XML: the text nodes of the descriptions and labels, found on the raw string (no XML round trip).
   - GAEB 90: the text records (`01`, `06`–`08`, `11`, `12`, `20`, `25`, `26`, `T1` …), per item and paragraph.
   - DOCX: one segment per paragraph of `word/document.xml`.
   - PDF: paragraphs rebuilt from the positioned text of each page (same left edge, same size, consecutive lines).
2. **Deduplicate**: identical source strings are translated once (34,100 segments → 14,756 unique, about 1.6 M characters).
3. **Translate**: 57 batches of about 40,000 characters, each by one Claude subagent working from
   `scripts/translate/TRANSLATOR_BRIEF.md` and the glossary, each also writing down what looked wrong in the source.
4. **Validate** every segment automatically (`common.validate`): same number of entries, the same digit groups, the
   same anonymisation tokens, the same DN / PN / DIN / EN strings, no German function words left. Rejected segments
   went back to the translator.
5. **Rebuild** (`pipeline.py rebuild`):
   - GAEB XML: only the text nodes are replaced; every other byte is the source's.
   - GAEB 90: text records are re-wrapped to the width the source uses, the sequence in columns 75–80 is renumbered,
     the encoding of the source (cp850 or latin-1) and its line endings are kept. Numeric records are untouched.
   - DOCX: the English paragraph goes into the first `<w:t>` of the paragraph, the others are emptied; every other
     zip entry is copied.
   - PDF: the German text is removed by redaction (line art and images stay), the English is written into the same
     place with the original size, weight and line pitch, shrunk where it does not fit.
6. **Verify** (`verify.py`), results below.

## Verification

All 44 files pass.

- GAEB XML (4) and GAEB 90 (5): source and English parsed with `boq.parsers`; item number, quantity, unit, unit price
  and total of every item are identical, and unit price × quantity = total holds on the three priced files. XML:
  with the text nodes blanked, source and English are identical. GAEB 90: every line 80 characters, sequence
  consecutive, encoding as the source.
- DOCX (1): ten of eleven zip entries byte-identical; `document.xml` differs only inside `<w:t>`.
- PDF (34, 836 pages): same page count; on every page the same digit groups and the same anonymisation tokens as the
  source. Three pages per file were rendered next to the original and a sample of them looked at.

## Completeness check (German against English)

Because nothing may be lost in translation, every file pair was compared a second time after the build.

- **File level** (`scripts/translate/audit.py`, read back from the finished files): every item of the GAEB files has
  its short and long text in both languages with the same digit groups and tokens; every paragraph of the DOCX is
  there; on every PDF page each English line is found in the text layer, no translated German line is left, and
  text that was not translated (numbers, units, tokens) is still present. This found and fixed three defects of
  the first build: about 30 one-word labels that were cut off in a narrow box ("Location:" printed as "Locati"),
  ten lines of contract forms in `HEM2301-2_Gesamt-LV.pdf` that the PDF library did not return and that had
  stayed German, and three German lines that could not be removed under the English.
- **Segment level** (`scripts/translate/review.py`): all 13,797 German–English pairs were read by reviewers who had
  not translated them (44 batches), looking for omissions, additions, wrong meaning, changed values and repaired
  source errors. 157 corrections were applied: 61 codes that had been translated although they are kept (AD, VL / RL,
  dimension letters), 54 wrong terms (for example "eckig" as "square", "Schutzart" as "protection class",
  "absperrbar" as "lockable", "Betondecke" under floor tiles as "ceiling"), 21 omissions of a word or phrase
  ("schichtenweise", "je", "mit Gelenk", one half of "Ab-/Eindichten"), 8 German words left over, 6 additions and a
  few others. No number, unit, standard or anonymisation token was found changed.

What this does not prove: the reviewers are language models reading 200 to 550 pairs each, so a missed omission is
possible. A sentence that runs over two segments is sometimes divided differently in English than in German; read
in order nothing is missing, but the two halves do not match one to one. The ten remaining messages of the audit
are footnote marks ("Anlagen²"): the digit is on the English page, at its original position.

## Known limitations

- **PDF layout.** English is written into the box of the German paragraph. It is usually shorter, so paragraphs end
  earlier and leave white space; where it is longer the text is shrunk. No page was added and no text was left out.
  The 96 boxes shrunk below 72 % of the original size (mostly short labels in front of a value; the smallest is
  56 %, about 5.6 pt) are listed per file in the project's `TRANSLATION_NOTES.md`. The English PDFs are larger
  than the originals (35 MB against 21 MB) because the fonts of the new text are embedded. Fonts are a standard sans-serif (monospace where the source uses Courier), not the
  originals.
- **PDF tables and forms.** A label next to a value, a bullet and its text, and table cells are translated as
  separate pieces. Where a paragraph was re-flowed, a value that stood on the third line of a German block can stand
  on the second line of the English one. Where the source itself prints text over other text (anonymised lines laid
  over the original), the English does too.
- **Text hidden in the source stays hidden.** Lines that the source cuts off at the edge of a text frame (contract
  conditions in `Abgabe LV.pdf`) are not shown in English either.
- **No scanned pages.** All 34 PDFs have a text layer on every page, so no page was left untranslated.
- **Sentences cut by a page break** were translated in two halves, with the other half as context. The word order
  at the break can read less smoothly than in German.
- **GAEB 90 line counts differ** from the source because the text was re-wrapped (for example 3,874 instead of
  4,278 records in project A's D83). Lines that the source cuts off in the middle of a word are cut off at the
  corresponding English word.
- **Terms.** One glossary was used, but 57 translators worked in parallel. Terms that are not in the glossary can
  vary between files (for example trade abbreviations in the electrical and sanitary LVs; names of German
  institutions are translated in most places and left in German in a few). "Muffe" is "socket" throughout, also on
  the pre-insulated district-heating pipe of project B, where "joint casing" is the usual English term.
- **Floors** are counted the British way: "1. OG" is "1st floor", the first storey above the ground floor.
- **The twins are translated independently.** The same LV as GAEB and as PDF (projects A, B, D) was cut into
  different segments, so the English wording of one item can differ slightly between the two files.
- **The notes are observations, not an audit.** `TRANSLATION_NOTES.md` lists what the translators noticed while
  translating; an error nobody noticed is still in both the German and the English file.
- **The glossary grew during the run.** Entries added late (directional drilling, floor abbreviations, contract
  form terms) were applied to earlier batches only where a plain replacement was safe.
