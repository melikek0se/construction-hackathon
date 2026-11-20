# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-20 (evening, hackathon day 1)

## Now

Upload → parse → rule findings → table works end to end for GAEB files: Python package `src/boq` (parsers, model,
rule checks, missing-item check, CLI, FastAPI) and a React screen in `web/`. GAEB XML, GAEB 90 and PDF are
parsed, the LLM checks run against the Claude API, and the findings can be exported as a risk report and a
list of bidder questions. No prices yet.

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
  grouped per item, replaced by the item sheet on selection: a picture of the item (`ItemVisual.tsx`: the two
  diameters of a DN contradiction to scale; value rank chart on priced files), evidence, reason, action, German
  LV text. Also item table, preliminary remarks, upload / drag-and-drop / dataset picker (GAEB and PDF), and the
  "Run AI review" button. Deep link: `?sample=<path>&view=table&item=5.1.4`. Design notes: `PRODUCT.md`,
  `DESIGN.md`, `.impeccable/`.
  Checked in Chrome through a script at 1440x900 (hover, click, severity toggle, section filter, a GAEB and a
  PDF sample). Not checked: the AI review button against the live API from this UI; a person clicking through.

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

## In progress

- LLM findings: verify a sample against the LV text, tune the prompt where they are weak, and decide model and
  effort by cost per LV.

- nothing

## Next (in order)

1. Decide team split, demo LV
3. Companion rules for building trades (project F parses now; the rules still only know civil work)
4. Money at stake for findings on unpriced LVs (needs the price history)
5. Verification and prompt tuning of the LLM findings (see In progress)
6. Money at stake in the report for unpriced LVs (needs prices)
7. Price suggestion + what-if · RFQ (email, then voice) — in parallel if people allow

## Not built / known gaps

- PDF parser limits: needs a text layer (no OCR); a short text is only separated from the long text where it is
  bold or sits alone on the OZ line (project D prints neither, so its short text is the first description line);
  "*** Wiederholungsbeschreibung" notes printed above an item are not linked to it; one percentage item of bid B
  (10.1.1) is missed. No Excel import.
- `R-DIM-MISMATCH` can misfire when the long text names a second part with its own DN (seen once: project F,
  LV 14b, pipe DN 100 through a sleeve DN 200).
- Companion rules look at the whole LV, not per section: an item missing in section 5 is masked if section 3
  has one. They cover pipeline and civil work only.
- X83 files do not mark alternative / contingency items the way the D86 does (B: 14 `W`, 4 `B` only in the D86).
- Demo machine: do not let it sleep. On 2026-11-20 two commands "hung" for minutes; `pmset -g log` showed the
  laptop asleep both times (lid closed 22:13–23:01, maintenance sleep 23:03–23:08) with an LLM request and a test
  run in flight. Not a code fault. Keep it on power with the lid open, or start the servers under `caffeinate -i`.
- No benchmark price source; none is freely available.
- ElevenLabs: nothing configured; German speech recognition quality untested.
