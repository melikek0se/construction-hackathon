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

## D-017 — Cross-trade dependencies: read from the LV texts, graph in memory, shown with three.js
Status: proposed · 2026-11-21

Trade LVs state their own interfaces ("Vorleistung", "Folgeleistung", "bauseits"); `src/boq/project.py` reads
those sentences instead of assuming a general construction sequence, so every edge of the graph has a quote.
The graph lives in memory (27 nodes, 36 edges for project F); Neo4j was discussed and left open by Utku —
it would add persistence and Cypher, not findings. The diagram is a three.js scene (`TradeGraph.tsx`) at
Utku's request; this is a new view for projects and does not bring back the 3D LV map rejected in D-013.
Revisit if: projects must persist across restarts or be queried across many buildings (then a graph database
earns its keep), or the 3D diagram proves as hard to read as the 3D map did (then lay the same graph out flat).

## D-018 — The cross-trade diagram is a structure going up, not a ball
Status: decided · 2026-11-21

Refines D-017 and is the one place D-013's "no 3D" does not apply: the team asked to keep and improve the
three.js diagram. The first version spread the trades through a ball by force layout; position meant nothing
and the lettering was too small to read. Now a trade stands one storey above the last trade it builds on, so
the order of work reads from the ground up (`storeys()` in `TradeGraph.tsx`); trades without any stated
interface lie on the ground in front. Slabs are lettered on their front, so the view turns only about 57° to
either side. In the overview the arrows are a faint web without names; pointing at or picking a trade leaves
only its arrows, solid and named after the linking work.
Revisit if: a project has far more than about 30 trades or more than 4 per storey row — the stack gets deep.

## D-019 — Projects page; dataset projects mapped by hand; created projects kept as folders, no database
Status: decided · 2026-11-21

The app opens on a list of projects instead of a list of files. A project is either one LV in several versions
(tender, bid, award, print-out: dataset projects A–E) or the trade LVs of one building (F). Which dataset file
belongs to which project is a fixed list in `src/boq/catalog.py`, taken from `02-dataset.md`: file names do not
say it, and a wrong automatic grouping would be worse than none. Uploading several files creates a project
that is kept in `data/projects/<id>/` (the files plus `meta.json`, git-ignored) and can be renamed. (A single
file opened as an unsaved LV until D-021 replaced that.) There is still no database: analyses live in memory and are
recomputed from the files, the LLM answers stay in `data/cache/llm/`.
Revisit if: projects need findings, notes or prices stored with them, or several users — then SQLite (D-003).

## D-020 — The UI: yellow and white, industrial, small and square; the projects page shows each LV as a strip
Status: decided · 2026-11-21

Team feedback in steps. The all-yellow pages with heavy black keylines tire the eyes. A first answer (light
ground, rounded soft cards, a large drawn crane, big headline) was rejected as the same language made softer.
Asked for: industrial but modern, nothing round, nothing soft, nothing huge. A dark version was "a bit
better"; four mock-ups were then shown side by side (fingerprint, spec sheet, pipeline, drawing sheet) and the
team chose the fingerprint layout in yellow and white.
So: white ground, the yellow band with its hazard stripe (54 px, tower-crane mark as the logo), hairlines,
square corners, 12–15 px text, small tracked capitals for labels, tabular figures. Yellow is the band, the
one primary action, the project numbers and the hover. On the projects page every project shows its LV item
by item as one strip, flagged items standing up in their severity colour, so where the trouble sits is visible
before a project is opened (`Fingerprint` in `web/src/Projects.tsx`; the data is `marks` in the summary).
The LV workspace, its item sheet, table, remarks, what-if and the project view follow the same language
since 2026-11-21 (the closing block of `web/src/styles.css` restates the earlier rules). `DESIGN.md` was
rewritten from the build the same day. The other three mock-ups were not kept in the
repository.

## D-021 — Files first, project always: intake, then keep as a project or add to one
Status: decided · 2026-11-21

From the research in `07-user-flows.md`. No LV exists outside a project, not even a single uploaded file.
Dropped files are read first (`POST /api/intake`): GAEB phase gives tender / bid / award, files sharing 70 % of
their item numbers are versions of one LV, others are different LVs; the project name comes from the LV. The
user confirms once: a new project, or an existing created project (also via "Add files" on its row or by
dropping on the row). A project of several LVs is compared LV against LV with one file per LV, the GAEB
tender where there is one. Dataset projects stay a fixed mapping and take no files.
Revisit if: the destination should be suggested automatically, or versions need comparing (see "Not built"
in `07-user-flows.md`).

## D-022 — `dataset/en/` is an English reading copy of the dataset, never app input
Status: decided · 2026-11-21

Every file of `dataset/` exists a second time under `dataset/en/` (same names, same formats; sorted by project A–F instead of by format,
with the general files README, GLOSSARY and TRANSLATION_NOTES at the top level),
translated 1:1 so that a non-German speaker can read what the originals say. Errors, contradictions, typos and
anonymisation tokens of the source are kept on purpose (`dataset/en/TRANSLATION_NOTES.md` lists what was noticed).
The copy is not input for the app: the rule checks, the companion rules, the unit and risk-wording lists and the
LLM prompts key on German wording, so an English LV would give few or wrong findings. `GET /api/samples` and
`scripts/inspect_dataset.py` skip `dataset/en`; the catalogue (`catalog.py`) lists files by name and never reaches it.
The copy is produced by `scripts/translate/` (extract → translate by subagents → validate → rebuild → verify);
intermediate files are in `data/processed/translation/`.
Revisit if: the app should analyse English LVs — that needs English rule vocabulary, not this copy.

## D-023 — PDF view: pdf.js in the browser, finding positions from the server
Status: decided · 2026-11-21

An LV opened from a PDF can be read on its original pages (`web/src/PdfView.tsx`, tab "PDF"): pdf.js draws the
page and a text layer over it, findings are marked on their quoted evidence with a note in the margin. Chosen
over page images rendered by the server because Utku wants the text selectable, now and as the basis for the
estimator's own notes on a selected passage. Positions come from the server (`src/boq/pdfmarks.py`, PyMuPDF),
in PDF points from the top left of the page: the quote is searched only inside the item's own stretch (number
line to next number line), then in the pages before the first item; not found means the item's number line is
marked, never another place. The server keeps the path of an analysed file only when the file stays on disk
(dataset, created projects), so a temporary upload has no PDF view.
Marks are matched to the browser's findings by `check | item | evidence`, not by list position: after an AI
review the two lists are in different orders.
Order agreed for what follows: (2) the estimator's own notes, valid / not valid, tagging a colleague for
review; (3) retrieval (GraphRAG) for fact-checking. Design: `docs/superpowers/specs/2026-11-21-pdf-view-design.md`.
Revisit if: GAEB-only LVs should get pages too (render the LV to a page ourselves — then positions are known
exactly), or scanned PDFs must be shown (needs OCR).

## D-024 — An LV without a PDF gets pages drawn by the app
Status: decided · 2026-11-21

GAEB and Excel files have no pages, and most tender files in the dataset are GAEB. For the PDF view the server
draws the LV as a plain A4 print-out (`src/boq/lvpages.py`, PyMuPDF): titles, item number, short and long text,
quantity and unit, prices where the file has them, remarks, in LV order. The text is the file's text; the
layout is ours, and every page and the view say that it is not the client's print-out. Because the app lays
the pages out it knows where each item stands, so marks need no guessing about item positions; the quote is
still searched inside the item's stretch as on a real PDF. Drawn on first use, kept in `data/processed/pages/`
for the life of the analysis. Chosen over an HTML "paper" view because the PDF view, its marks, text selection
and later the user's notes then work on every LV in one way.
A PDF that was uploaded on its own and not kept still has no pages; a "word" over 400 characters (project E
carries an image as text) is named, not printed.
Where the project holds the client's print-out of the same LV, that is shown instead (`_print_out` in
`api.py`): a PDF among the project's other files with at least 70 % of the LV's items (number, unit, quantity),
a priced one for a priced file. The findings stay those of the opened file, marked on the print-out's pages; the
view names both files. Known cost: items the print-out lacks (project A's award has 38 more than the tender
package) have no place there, and their findings are listed above the pages.
Revisit if: such items matter in the demo — then draw the pages for that file after all.

## D-025 — Ask the project: a chat that answers from the project's documents only
Status: decided · 2026-11-21 (Utku: "only from the project documents")

Beside the LV the estimator can ask a question (`src/boq/chat.py`, `POST /api/analyses/{id}/chat`, right
pane tab "Ask the project", `web/src/Chat.tsx`). The model reads the open LV and one file per other LV of the
project (of several versions the tender, a GAEB file before its print-out) and answers with the passages it
rests on: file, item number, quote. As for AI findings, a passage is kept only if it stands word for word in
the item it names; an answer left without one is shown as unconfirmed, and "not in the project documents" is
a valid answer. General knowledge (VOB, standards, usual prices) is excluded on purpose: it would be a
statement without a source. A passage opens its item on the PDF pages, in this file or another file of the
project; the conversation belongs to the project and stays open.
No retrieval step and no graph: the largest project (F, 27 LVs, about 150k tokens) fits into one request and
is prompt-cached, so a follow-up question reads the documents from the cache.
Revisit if: a project no longer fits (then retrieval, possibly over the trade graph of `project.py`); general
knowledge is wanted (then as a separate, labelled kind of answer); answers should be kept between sessions.
