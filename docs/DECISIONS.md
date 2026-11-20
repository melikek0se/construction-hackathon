# Decisions

Append-only log. One entry per decision: what, why, and what would make us revisit it.
Status is **decided** (team agreed) or **proposed** (recommendation, waiting for the team).

## D-001 — Error detection and risk report are the core; pricing and voice come second
Status: proposed · 2026-11-20

The brief marks error detection as "priority" and asks for a risk report as the deliverable. Pricing is "optional".
Upload → findings → report must work end to end before anyone starts on prices or voice.
Revisit if: the organisers publish judging criteria that weight innovation over the stated priorities.

## D-002 — Build on GAEB first, PDF later
Status: proposed · 2026-11-20

GAEB parsing is deterministic and the dataset has GAEB for four of six projects. Three projects exist as GAEB and PDF,
so the GAEB version is the ground truth for testing the PDF parser.
Revisit if: the jury's demo file turns out to be PDF only (ask — Q5).

## D-003 — Stack: Python/FastAPI backend, React frontend, Claude API, SQLite or JSON
Status: proposed · 2026-11-20

Python has the best PDF and data tooling; details in `06-architecture.md`.
Revisit if: the team is stronger in TypeScript end to end.

## D-004 — Rule-based checks before LLM checks
Status: proposed · 2026-11-20

Rules are fast, free, explainable and cannot hallucinate. The LLM is used for what rules cannot do (unclear scope,
missing items, contradictions). Every finding carries its origin (`rule` / `llm`) and quoted evidence.

## D-005 — A price is never shown without source, date and confidence
Status: proposed · 2026-11-20

From the field insights: no price is fully reliable or current. Items without a reliable price are shown as price
gaps instead of receiving a confident-looking estimate. See `04-field-insights.md` #4.

## D-006 — Voice agent: yes, time-boxed, browser role-play on stage, ElevenLabs
Status: proposed · 2026-11-20

Differentiator, but not the judged core. Starts only after D-001 is met; about four hours for one person; email RFQ is
built first as the fallback sharing the same data model; no real supplier is called. See `05-voice-agent.md`.

## D-007 — Repository docs in English, German domain terms kept and glossed
Status: proposed · 2026-11-20

The brief and the pitch are in English; the data is German. Team conversation can be in any language.

## D-008 — Raw dataset is committed under `dataset/`
Status: decided · 2026-11-20

It is anonymised, 25 MB, and every teammate needs it. The original zip is redundant.
We use the folder layout Utku committed (sorted by format); the flat `data/raw/` copy was removed.
Revisit if: the organisers restrict redistribution and the repository is public (Q9).

## D-009 — Missing items are found by deterministic companion rules first, the LLM second
Status: proposed · 2026-11-20

"Pipe supplied but not laid", "trench deeper than 1.25 m without shoring", "asphalt cut but not restored" are
checked by explicit rules (`src/boq/checks/companion_rules.py`), seeded from `LV-Positionen.docx` and the standards
behind them. A rule has three outcomes: companion item exists (silent), companion only mentioned inside another
item's description (info: priced into that item), not mentioned anywhere (missing item). Follows D-004; the LLM
check `L-MISSING-ITEM` stays for what no rule covers.
Revisit if: rules produce false alarms on a jury file — then drop the rule, do not loosen the evidence requirement.

## D-010 — Item numbers are stored dotted and without leading zeros
Status: proposed · 2026-11-20

`01010001`, `0101   1` and ` 1 1  10` all become `1.1.1` / `1.1.10`. This is the form the PDFs print and the
join key between files of the same project (tender X83 ↔ bid D84 ↔ award D86).

## D-011 — PDFs are parsed from the text layer with rules; accuracy is a measured number
Status: proposed · 2026-11-20

`src/boq/parsers/pdf.py` uses PyMuPDF positions and no LLM: deterministic, about a second per LV, free, and it
cannot invent an item. `scripts/eval_pdf_parser.py` scores it against the GAEB twin of the same LV (recall, extra
items, quantity, unit, price, text similarity); `tests/test_pdf_parser.py` fails if a number drops.
PyMuPDF is pinned below 1.26 (newer releases do not install on Intel Macs) and is AGPL-licensed — fine for the
hackathon, to be replaced or licensed for a product.
Revisit if: a jury PDF is scanned or has a layout the rules miss — then add an LLM or a layout model as a
fallback and score it with the same script before trusting it.

## D-012 — LLM findings must quote the LV; unquoted findings are dropped in code
Status: proposed · 2026-11-20

The model returns structured findings with a verbatim German quote. `llm._validate` discards any finding whose
quote is not in the item text or the preliminary remarks, or whose item number does not exist. This enforces "no
evidence, no finding" (CLAUDE.md) mechanically instead of by prompt. Model `claude-opus-5-5` at effort `medium`
for all requests (`BOQ_LLM_MODEL`, `BOQ_LLM_EFFORT` to change); the two-model split of `06-architecture.md` is
not built — decide it from measured cost and quality after the first live runs.
Revisit if: too many good findings are dropped because the model paraphrases — then loosen the match, not the rule.

## D-013 — UI: a flat map of the LV first; yellow site-signage look; Stop / Caution / Note
Status: decided · 2026-11-20

Three screens were tried on day 1. The table-and-list screen was rejected as unreadable. A 3D site plan was built
next and rejected the same day: the yellow signage look was liked, the 3D could not be read. Kept: the yellow
"under construction" look, sized for a projector. The loaded LV opens as a strip map (`web/src/LvMap.tsx`) — one
named row per section, one mark per item, items with findings as numbered coloured blocks — and the selected item
gets a picture (`ItemVisual.tsx`). Do not bring 3D back without being asked.
The UI labels `high` / `warn` / `info` as Stop / Caution / Note (red circle, yellow triangle, blue square);
backend values are unchanged. Fonts are self-hosted (`@fontsource`), so the demo does not need the internet.
Revisit if: an LV has several thousand items — one mark per item will need grouping.

## D-014 — Bidder questions are German; the risk report ranks by points, not by money
Status: proposed · 2026-11-20

Bieterfragen go to a German client, so `Finding.question_de` holds German text: fixed templates for rule findings,
written by the model for AI findings (same request as the finding, prompt version 2). The report is English with
German quotes. Sections and items are ranked by risk points (5 / 2 / 1 per Stop / Caution / Note); the report
names the formula and shows money only where the file has prices, because tender LVs have none (PRODUCT.md,
principle 4). The report is a server-rendered page printed to PDF from the browser — no PDF library.
Revisit if: prices exist for unpriced LVs — then rank by money at stake instead.

## D-015 — A price suggestion needs the same unit, head word and size; anything looser is a reference
Status: proposed · 2026-11-20

`src/boq/prices.py` matches lexically (TF-IDF, no embeddings API) and is strict on purpose: back-testing showed
that loose matches are within 25 % of the real price about one time in three, and that hourly items share so
much boilerplate that an excavator was priced as a foreman. Result: very few suggestions from three bids, all
with sources and a band; "no reliable price" for the rest (D-005). Lump sums are never priced from history.
Token prices under 1 EUR are kept out of the history. A project's own bid is not used to price its own tender.
Revisit if: more priced bids are available — rerun `scripts/eval_prices.py` and relax only what the numbers allow.

## D-016 — What-if changes whole unit prices, because the files have no cost split
Status: proposed · 2026-11-20

A "material price +10 %" scenario is expressed as "unit prices of items in section X / containing word Y +10 %".
The architecture's labour / material / equipment split does not exist in any dataset file (02-dataset.md,
finding 7), and inventing shares would put made-up numbers into a total. The view shows how many items and how
much money each change touches.
Revisit if: a file with a real unit-price breakdown (GAEB `UPBkdn` filled in) turns up.
