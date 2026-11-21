# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-20 (evening, hackathon day 1)

## Now

Upload → parse → rule findings → table works end to end for GAEB files: Python package `src/boq` (parsers, model,
rule checks, missing-item check, CLI, FastAPI) and a React screen in `web/`. GAEB XML, GAEB 90 and PDF are
parsed, the LLM checks run against the Claude API, and the findings can be exported as a risk report and a
list of bidder questions. Excel LVs are imported, unit prices are suggested from the three priced bids (with
very low coverage, see below), and a what-if view varies the total of a priced LV.

## Done

- Dataset (`dataset/`) analysed → `02-dataset.md`
- `scripts/inspect_dataset.py`: inventory of all GAEB files, totals of the three priced bids verified
  (`EP × Qty = GP` holds for all 720 priced items)
- Challenge analysis, check catalogue, pitch skeleton → `01-challenge-analysis.md`
- Domain research (estimating, VOB, red flags, tooling, competitors) → `03-domain-primer.md`
- Brother's field insights assessed → `04-field-insights.md`
- Voice agent concept and ElevenLabs research → `05-voice-agent.md`
- Architecture proposal and data model → `06-architecture.md`

- GAEB XML + GAEB 90 parsers → `boq.model.BoQ` (all nine GAEB files; the three bid totals match to the cent;
  project A parses identically from X83 and D83)
- Rule checks (`boq.checks.rules`): arithmetic, missing/zero quantity, unknown unit, short-vs-long DN mismatch,
  broken "wie Position" reference, risk wording, large lump sums
- Missing-item check (`boq.checks.companions`, rules in `companion_rules.py`): ten companion rules. On the four
  tender LVs: no false "missing item"; two "priced into another item" findings (D 2.5 shoring, E 2.3.13 bedding);
  16 seeded deletions all caught (`tests/test_checks.py`)
- Two contradictions found that were not known before: A 5.1.46 (DN 125 vs DN 100), E 2.3.23 (DN 150 vs DN 300)
- `dataset/` regrouped into five format folders; the duplicate `data/raw/` removed

- FastAPI (`src/boq/api.py`): `POST /api/analyze` (upload), `GET /api/samples` and `/api/samples/analyze` (the
  nine GAEB files of the dataset, one click each)
- Web UI (`web/`), second design (D-013; the first table-and-list screen was replaced). Yellow site-signage look
  for a projector. Left: the LV map (`LvMap.tsx`), one named row per section, one mark per item, items with
  findings as numbered blocks (Stop / Caution / Note); clicking a section filters the list. Right: findings
  grouped per item, replaced by the item sheet on selection: a picture per finding (`ItemVisual.tsx`: two
  diameters to scale for a DN contradiction; quantity × unit price = total for arithmetic and zero or missing
  quantity; plates and an arrow for a broken reference and for companion findings; two bars for supplied vs
  installed and for a lump sum's description against the LV median; for wording and AI findings a line map of
  the description with the quoted passage marked; value rank chart on priced files), evidence, reason, action,
  German LV text. Also item table, preliminary remarks, upload / drag-and-drop / dataset picker (GAEB and PDF), and the
  "Run AI review" button. Deep link: `?sample=<path>&view=table&item=5.1.4`. Design notes: `PRODUCT.md`,
  `DESIGN.md`, `.impeccable/`.
  Checked in Chrome through a script at 1440x900 (hover, click, severity toggle, section filter, a GAEB and a
  PDF sample). "Run AI review" was run once from this UI against the live API (project D, 50 items: 55 s, 11 findings
  added, no error). Pictures seen on real findings for every type except `R-ARITHMETIC`, `R-QTY-MISSING`,
  `R-REF-BROKEN` and the supplied-vs-installed check, which do not occur in the dataset files tried.
  After merging the report / prices / what-if work (2026-11-21): section risk points in the UI now use the
  report's 5 / 2 / 1 (shown per map row and in the headline), the price block draws the suggestion, its band and
  each past price on one axis, what-if shows before / after as two bars and marks only the difference cell,
  and the report buttons are secondary to Upload in the band.
  Not checked: a person clicking through.

- PDF parser (`src/boq/parsers/pdf.py`, PyMuPDF text layer, no LLM): works on positioned lines, finds the OZ
  column, skips contract forms and page furniture. Scored against the GAEB twin of the same LV with
  `scripts/eval_pdf_parser.py` (six pairs, 1,254 items): 2 items missed, 1 extra, quantity and unit 100 %, prices
  100 % on offer C and 99.2 % on bid B (the two differences are real, see `02-dataset.md`), text 96–99 %.
  All 34 PDFs parse; the 27 building-trade LVs of project F give 1,104 items (no ground truth for those).

- LLM checks (`src/boq/checks/llm.py`, Claude API): one request per title (large titles split, at most 60
  items each), shared context (preliminary remarks + index of all items) prompt-cached, JSON-schema output,
  answers cached on disk in `data/cache/llm/`. Six check types: unclear scope, contradiction, missing item, typo,
  risk shift, quantity. A finding is kept only if its quote is found verbatim in the item text or the remarks.
  Wired into the API (`POST /api/analyses/{id}/llm`), the UI ("Run AI review") and the CLI (`--llm`).
  Offline tests in `tests/test_llm.py` (request building, evidence filter, cache, missing credentials).
  Live runs with `claude-opus-5-5`, effort medium (2026-11-20): project D (50 items) 4 requests, 53 s, 12 findings;
  project C PDF (274 items) 9 requests, 90 s, 36 findings, about 0.90 USD (81k input, 96k cache-read, 12k
  cache-write, 25k output tokens). No finding was dropped by the evidence filter in either run. The findings
  have been read but not verified one by one against the LVs.

- Risk report and bidder questions (`src/boq/report.py`). Report: summary, what to do, risk per section and
  per item (points: 5 per Stop, 2 per Caution, 1 per Note — a ranking, not money), item types, change-order
  potential grouped by VOB/B §2 Abs. 3 / 5 / 6 / 7, bidder questions, all findings; values only where the file
  has prices. Served as one printable page (`GET /api/analyses/{id}/report.html`, print to PDF from the
  browser), as JSON (`…/report`) and the questions as German text (`…/bieterfragen.txt`); buttons in the top
  band; CLI `--report`, `--questions`. Bidder questions are German: templates for rule findings, written by the
  model for AI findings (`Finding.question_de`). The server keeps the AI findings of an analysis, so the report
  includes them once the review has run. On project C (PDF, with AI review): 61 findings, 34 questions.
  Seen in the browser: the top of the report page and the two buttons. Not done: printing to PDF, a read of
  the 34 German questions by someone who writes Bieterfragen for a living.

- Price suggestions (`src/boq/prices.py`, `GET /api/analyses/{id}/prices`, item sheet "Price from past bids",
  report section, CLI `--prices`). History: the three priced bids (656 items after dropping token prices under
  1 EUR). A price is suggested only from items with the same unit, the same head word and the same nominal
  size, at TF-IDF similarity ≥ 0.62; looser matches are shown as references, lump sums never get a price.
  Back-test `scripts/eval_prices.py`, each project priced from the other two: **5 of 656 items get a price**
  (median error 23 %, all inside the band). On unseen LVs: D 1 of 50, E 4 of 296. Three unlike projects are too
  little history; the code is ready for more. When the item itself is left out but its own project stays in the
  history, 310 of 682 get a price at 6 % median error — the number to expect once similar projects are in.
- What-if (`src/boq/whatif.py`, `POST /api/analyses/{id}/whatif`, view tab "What-if"): change unit prices or
  quantities of the items in a section and/or containing a word, leave alternative / contingency items out;
  returns new total, per-section and per-item differences. Works on priced files only. The files carry no
  labour / material split, so a change applies to the whole unit price, and the view says so.
- Excel import (`src/boq/parsers/excel.py`, .xlsx and .xls): finds the header row by the usual German column
  names, reads titles, items, position types, prices. Tried on four public LV templates (11–13 sample items
  each; a fifth, a calculation sheet, has no LV in it); tests build their own workbooks in those layouts.
- Companion check: "wie vor, jedoch …" items inherit what the previous item does (fixed a false Stop on
  project C, where the control cable is laid by a "wie vor" item).

- Projects (`src/boq/project.py`, `POST /api/projects`, `GET /api/projects/sample`, `web/src/ProjectView.tsx`,
  `TradeGraph.tsx`): several trade LVs of one building analysed together. Reads the interface statements in
  the item texts ("Vorleistung (baus.): …", "Folgeleistung: …", "bauseits …"), works out which other LV of the
  project contains that work (by trade named in file / section titles, or by the thing named), and builds an
  in-memory graph of trades. Findings between LVs: `P-BOTH-EXPECT-OTHERS` / `P-INTERFACE-GAP` (work expected
  from others that no LV contains), `P-SAME-SCOPE` (an LV repeated inside another), `P-DUPLICATE-SCOPE` (single
  items in two LVs). UI: several files dropped at once, or the dataset project from the landing page, open as a
  project; three.js graph of trades laid out as a ball (force layout in 3D, turns slowly until touched; drag,
  zoom, click), every arrow tagged with the work that links the two trades (in the overview only arrows with
  three or more statements behind them, all arrows of a picked trade), panel with the cross-LV findings or the
  clicked trade,
  "Open this LV" leads into the normal workspace and back. Deterministic, no LLM.
  On project F (27 LVs, 1,076 items): 177 interface statements, 39 dependencies, 21 findings — roof drains
  expected "bauseits" by both 12 Dachabdichtung and 14b Dachentwässerung (Stop); 01 Fertigteiltreppen (6 of 6
  items), 11 Sandwichsockel (8 of 9) repeated inside 00 Rohbau and 06 Kautschukboden (7 of 11) inside
  20 Bodenbelagsarbeiten; wall plaster expected by the flooring LV with no plaster LV in the project.
  Words broken at a PDF line end are joined before reading the statements (2026-11-21): removed a gap finding
  built from a half sentence ("bauseitige Stahlum-"); it is now the edge 19 Stahltüren → 22 Schreinerarbeiten.
  Checked: graph renders and selects in Chrome at 1600x950 through a script. Not checked: an engineer's view
  of the dependencies; dragging by hand; a project of GAEB files.

## In progress

- LLM findings on project C (`Leistungsverzeichnis.pdf`, 36 findings, cached run of 2026-11-20) checked against
  the LV text, quantities and remarks by reading, not by an engineer:
  - 24 hold up on the facts they state (e.g. 3.2.540 lump sum "in Regie gemäß Pos. 6.1.10", which is the survey
    item; 4.1.10 three inner pipes vs 2 x da 50; 3.2.260 bolt grades reversed against the remarks; 3.2.110 twelve
    restrained joints for 524 m; 1.1.80 and 2.2.10 work announced without an item; 3.2.460 SN 8 vs 10 kN/m²).
  - 1 looks wrong: 4.1.250 (6 + 3 wall seals "do not match" 3 core drillings) — the seals equal the duct and
    cable entries of 4.1.270–4.1.300 (2 + 4 and 1 + 2).
  - 11 are judgement calls that need an estimator: 2.1.50, 2.1.10, 2.3.40, 2.3.100, 3.1.80, 3.2.530, 4.1.80,
    4.1.260 (cable diameter), 4.1.60, 5.3.30, 7.1.10.
  Still open: an engineer's read of those 11 and of the 34 German bidder questions; prompt tuning; model and
  effort by cost per LV.

- nothing

## Next (in order)

1. Decide team split, demo LV
3. Projects: trade vocabulary and interface wording beyond project F; quantity checks between trades
   (screed area against floor coverings); decide in-memory graph vs Neo4j
4. Money at stake for findings on unpriced LVs (needs the price history)
5. Verification and prompt tuning of the LLM findings (see In progress)
6. Money at stake in the report for unpriced LVs (needs prices)
7. Price suggestion + what-if · RFQ (email, then voice) — in parallel if people allow

## Not built / known gaps

- PDF parser limits: needs a text layer (no OCR); a short text is only separated from the long text where it is
  bold or sits alone on the OZ line (project D prints neither, so its short text is the first description line);
  "*** Wiederholungsbeschreibung" notes printed above an item are not linked to it; one percentage item of bid B
  (10.1.1) is missed.
- Check review (2026-11-21), fixed: a sleeve or core-drilling size in the long text ("Futterrohr DN 200" around a
  DN 100 pipe, LV 14b item 48) no longer counts as a DN contradiction; more than three zero quantities in one LV
  are one finding (award A had 38 separate warnings); "soweit nicht separat ausgeschrieben, sind …
  einzukalkulieren" is reported (the guard for "soweit … nicht gesondert vergütet" swallowed it); a site set-up
  that says "wieder abbauen" has its clearance (LV 09 warned "missing"); companion sizes read "Da 125"; units
  "pauschal", "Stunden", "Wochen", "Monat(e)", "Tage" are known. Still open: companion rules run on the label,
  so an LV printed without a separate short text (project D as PDF) gives different missing-item results than
  its GAEB twin. AI review: a failed title (refusal, max tokens, network) is skipped and listed in
  `stats.failures`; the review fails only if every title fails. The UI does not show `failures` yet.
- Companion rules look at the whole LV, not per section: an item missing in section 5 is masked if section 3
  has one. They cover pipeline and civil work only.
- Parser review (2026-11-21), fixed: GAEB 90 read the W / B flags of column 21 (repeat / reference description)
  as alternative / contingency — 18 items of bid B (126,475 EUR) were offered as "optional" in what-if and listed
  as Wahl- / Bedarfspositionen in the report; the `L` flag made 7.1.12 (2 St) a lump sum. GAEB XML repeat
  descriptions (`<RefRNo IDRef>`) now fill `refs`. Excel: a numeric OZ 1.10 is no longer read as 1.1, and a
  `psch` row with an empty quantity (or a priced row without one) is an item, not a title. Still open: the
  shared performance description of B's XML (`RefPerfNo`, 22 items) is kept as a remark, not attached to items.
- Demo machine: do not let it sleep. On 2026-11-20 two commands "hung" for minutes; `pmset -g log` showed the
  laptop asleep both times (lid closed 22:13–23:01, maintenance sleep 23:03–23:08) with an LLM request and a test
  run in flight. Not a code fault. Keep it on power with the lid open, or start the servers under `caffeinate -i`.
- No usable benchmark price source. Tried the South Tyrol reference price list for civil works 2021 (public
  XLS, 8,091 priced German-language items): as a price source for the three German bids it matches 8 of 656
  items with a median error of 106 % (labour at half the German billing rate, some fittings 3–9 times higher).
  Not wired in. The file is in `data/external/` (git-ignored, licence not stated).
- ElevenLabs: nothing configured; German speech recognition quality untested.
