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
Status: superseded by D-026 (storage); the projects page and the hand mapping stand · 2026-11-21

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
No retrieval step and no graph: the largest project (F, 27 LVs, 316,700 tokens measured) fits into one request.
The documents are one block in the project's file order, the same whichever file is open, cached for an hour:
the first question of an hour pays for them (about 2.55 USD on F at list prices), later ones about 0.10 USD.
Revisit if: a project no longer fits (then retrieval, possibly over the trade graph of `project.py`); general
knowledge is wanted (then as a separate, labelled kind of answer); answers should be kept between sessions.

## D-026 — A database for projects, documents, analyses and the LLM cache; dataset projects are seeded
Status: decided · 2026-11-21 (replaces the storage part of D-019)

For a live deployment the app keeps everything in one database (`src/boq/db.py`, SQLAlchemy Core): projects,
their documents with the file bytes, analyses (rule and AI findings) and the LLM answer cache. `DATABASE_URL`
selects it: Postgres in production, a SQLite file `data/boq.db` when unset. File bytes go into the database
too (LVs are small: the whole dataset is 25 MB), so the server keeps nothing on disk and runs on any free host.
The six dataset projects are no longer a special case at run time: `uv run boq-seed` puts them in as ordinary
projects (`source = "demo"`, ids A–F) from the mapping in `catalog.py`, and copies the old `data/cache/llm/`
answers; after that every project takes added files, renames and deletes. Nothing is seeded automatically: a new
database starts empty (user's call, 2026-11-21; a `BOQ_SEED_DEMO` start-up seed existed briefly and was removed). Analyses survive restarts (newest 2,000 kept). Tables are created
on first use, no migrations: a schema change means a new database. `BOQ_PASSWORD` puts HTTP basic auth in
front of everything but `/api/health`, since the URL is public and the AI review spends API credit.
Revisit if: several users or companies need their own projects (accounts), or files outgrow the database
(then object storage, e.g. Cloudflare R2).
Merged with the PDF view (D-023) and the chat (D-025) the same day: that view reads pages from a file, so a project document is
written out on demand to `data/processed/pages/docs/` (`_doc_path` in `api.py`); which PDF belongs to which
analysis is kept in memory only, so after a restart a kept PDF is shown again once its file is reopened.

## D-027 — The chat searches first: only the passages a question is about go to the model
Status: decided · 2026-11-21 (Utku: "cost matters"); replaces the "no retrieval step" part of D-025

Sending every LV of the project with each question was simple and cost too much: project F is 316,700 tokens,
about 2.55 USD for the first question of an hour. Now a local search (`src/boq/retrieve.py`, BM25 over words
and 4-letter pieces of words, no model and no database) picks up to 60 passages: the best hits for the
question, the most similar items of the *other* LVs for the top hits, items named by number, and what an item
refers back to. The model gets those plus an index of all LVs with their sections. Measured on project F:
12–16k input tokens, 0.06–0.08 USD and 5–13 s a question, the same conclusions on the four questions asked
both ways.
Reading everything is still possible, as a button under an answer that says what it costs; that path keeps
the one-hour cache of D-025. Each answer shows what it cost and how many passages from how many files it read.
The price of the search: it is blind to what it did not find, so the model is told it sees an excerpt and
must say "the passages shown do not answer this", not "the project does not say".
No Neo4j, no vector store (the database of D-026 stores projects, it is not searched): 1,076 items are searched in memory in well under a second. Not used yet: the
interface statements and trade graph of `project.py` as a second way to pull linked items.
Revisit if: answers miss passages that reading everything finds (then add the graph edges or embeddings);
projects grow past what an in-memory index handles.

## D-028 — Intake reads the tender and each file's step from the files, shows its evidence, and can be corrected
Status: decided · 2026-11-21 (Atahan: rethink the flow from how an estimator works); refines D-021, which stands

An estimator works on a tender, not on a file, and comes to the app at four moments: the tender arrives (a
folder: forms, LV as PDF and GAEB, plans — nearly every upload), an addendum arrives, the bid has gone out,
the award comes. The step of a file is therefore not something to fill in per file: it follows from who wrote
the document, whether it carries prices and what the project already holds (`src/boq/intake.py`, no LLM).
- **Step**, first rule that applies: GAEB phase; a priced PDF with the same prices as a GAEB bid or award of
  the same LV; the word the PDF is headed with ("Anfrage", "Angebot", "Auftrag", VHB form 211); prices or
  none. No prices is a tender. A priced PDF that names nothing is taken for a bid and marked "check".
- **Qualifier** in the hand mapping's words: contract-form pages make a "tender package" or "submitted bid";
  an LV whose items are part of a larger one with the same heading is an "excerpt".
- **Project**: number and name from the GAEB project fields (`PrjInfo`, records 00 / 02) or the PDF page
  header ("Projekt:", "Bauvorhaben:"), before the LV's own label, which names the trade and is used only for
  a project of one LV. A label that is only an anonymisation token ranks last. The name is `number name`.
- Print-outs headed as different LVs are different LVs even when their items coincide (F: 27 LVs, was 26).
- A file that is not an LV is listed as left out and no longer fails the whole drop.
- The destination is suggested when the number or name matches an existing project (not by items: that
  would mean parsing every project at each intake).
- The user corrects a step with one click in the intake; `PATCH /api/catalog/{id}/files/{n}` does it later
  ("Move to…" next to the selected file on the project row).
`BoQ.phase` of a PDF is unchanged ("84" when priced); the role kept with the document is what the UI shows.
Scored against the hand mapping in `catalog.py` by `scripts/eval_intake.py`: step 43/43, qualifier 43/43,
number 4/6 (B has none by hand, E's is inside its LV title), name 5/6 (D's is only a token).
Added 2026-11-21 (Atahan: the step of a PDF did not seem to work; no dataset PDF was found with a wrong step):
a PDF's heading may carry its number ("Angebot AN24-0305", "Auftrag Nr. 4711"), more words are known
(Angebots-LV, Preisangebot, Auftragserteilung, Auftragsschreiben, Zuschlag, Zuschlagsschreiben, Ausschreibung),
and a heading missing above the column header is looked for on the first two pages; files are also compared
with the project the intake suggests, not only with one they were dropped on; the evidence says in words why
"no prices" means tender and why a priced PDF without heading or GAEB twin is only a guess. There is still no
award PDF in the dataset, so "award" for a PDF is tested on the heading rule only.
Revisit if: real tenders use headers the label list does not know (then a model reads the first page as a
fallback), deadlines are wanted (form 211 is blank in the dataset), or ZIP / folder drops are needed.

## D-029 — Home page: schedule on top, board under it; new project in a dialog; barrier-tape opening
Status: decided · 2026-11-21 (Atahan, after comparing three options each as a clickable mock-up); replaces the register of D-020 on the projects page

- **Two parts, each with only its own matter.** The schedule shows the running tenders on a time axis and
  nothing but dates (question deadline, submission, sent, end of binding period), which are set in place.
  The board shows every tender in one of five stages (Check, Questions, Pricing, Submitted, Award) and
  nothing about dates: the LV strip, the counts, what is open at that stage, the files, the net total.
- **Stages.** Submitted and Award follow from the files (a bid or an award is there). The three before are
  the estimator's own and are set on the card. Research found tables, not boards, in the bid tools; the
  board was chosen anyway because the stages read at once on a projector.
- **Dates are the user's.** No LV file carries them, so they are asked for at creation (optional) and edited
  on the schedule. They live in `projects.plan` (JSON), with the stage. Nothing is invented: a tender without
  dates says so on its lane; demo projects are seeded without dates.
- **Open items are only what the app knows:** stops, cautions, items with a point for the client, formats
  that disagree, a bid or award whose item count differs from the tender. Not shown because not known:
  whether questions were sent, how much is priced, addenda.
- **New project is a modal dialog** (`<dialog>`): files first, then what was read with its evidence, then the
  two dates. Same intake rules as D-028.
- **Opening.** Full yellow with two barrier tapes while the projects are fetched, then the tapes run on
  through on their diagonals (in from a bottom corner, out at the opposite top corner) and the yellow rolls up like a roller shutter until what is left of it is the band (the name stands large on the yellow behind the tapes and fades; the brand then comes into the band from the left), hazard
  stripes in place from the start (changed 2026-11-21, Atahan; before:
  cut away on the slant, tapes pulled back to their own sides); schedule rows are uncovered one after the other, a board card keeps a tape across it until
  its files are read. The one-off wipes also run with "reduce motion" set (the loops do not): a deliberate
  exception for the demo, to be reversed in `home.css` if the product is used for real.
- **The band** (Atahan, after four header options as a mock-up): yellow, 70px, one hazard stripe along the
  lower edge at twice the tape's height (18px), nothing along the top, nothing on it but the brand and the
  page's controls. Tried and dropped: words running along the band (read as buttons), the opening ending
  with a tape straightening into the band, a stripe along both edges, a white header with a slanted plate.
- **The dialog is a site sign** (Atahan, from three options): a white board on two posts, the title on a
  yellow plate cut on the slant like the opening, set up from below. Dropped: a hazard-striped frame with the
  opening's tapes behind it, a panel lowered on crane cables with a storey-by-storey progress rail.
- **Columns added to a table are added to an existing database on start** (`db._add_new_columns`); D-026's
  "a column change means a new database" still holds for every other change.


## D-030 — The app is called Polier; its agent is a 3D head in a hard hat

- **Name: Polier** (the site foreman who catches mistakes before they cost money). Replaces "LV Check" in the
  band, the opening tape and the page title. The server-side strings ("Drawn by LV Check", the auth realm)
  are not renamed yet.
- **Mascot** (`web/src/Mascot.tsx`, three.js): a matte white sphere, two pill eyes, a yellow hard hat, on a dark
  tile, cropped and tilted. It turns towards the pointer, the hat turns with the head; after 6 s without
  pointer movement it looks around on its own; still under reduced motion. Matte on purpose: shine and extra
  detail were tried and rejected (read as cheap or scary). It lives in the **bottom-right corner** of every
  page (`.agent-dock`, 112px, no tile: the whole head floating over a soft shadow; rises in once, hops when
  clicked), not wired to anything yet. Tried and removed the same day: the head in the band beside the name,
  and beside the projects title.
- **Behaviour:** eyes lead, the head follows on a spring and the hat lags; the turn is the angle to the
  pointer (as if the screen were 700px away), so it varies across the page instead of pinning to one side.
  Pointer at rest 2.5 s: random glances (at the page, at you, the other way, a head tilt). Pointer near: leans
  in; over it: looks at you and squints. Click: crouch, hop, squash. Files dragged over the page: bounces.
  Blinks at random and on big gaze shifts. Hook for later: `window.dispatchEvent(new CustomEvent("polier",
  {detail: "hop" | "excited"}))`.
- **It ignores "reduce motion"** (`HONOUR_REDUCED_MOTION = false` in `Mascot.tsx`, and the dock's rise-in):
  the team's Mac has the setting on and the mascot looked dead. Same demo exception as D-029's opening; flip
  the flag if the product is used for real.
- **App icon: a hard hat in profile**, ink on yellow (`web/public/favicon.svg`, PNG fallbacks rendered from it);
  the same silhouette without the tile is the logo in the band (`HardHatIcon` in `Projects.tsx`), replacing
  the crane.
- Options tried and dropped on 2026-11-21: flat SVG marks, figures, detailed 2D characters, rounded-block and
  pebble heads, white helmet. The team knows the head resembles the Grok bot and chose it anyway.

## D-031 — The tender's dates are read from the files by their labels, shown with the source, never guessed

**Decided** 2026-11-21.

No format has a field for the submission deadline; in the dataset it stands in the cover text of an LV (E)
and in the filled-in VHB forms of a package (A). `src/boq/dates.py` reads every file as text and keeps a date
only when a label names it (same line, or beside a date that stands alone; in a PDF by position on the page).
A date without a label is left out. No LLM: the result has to be the same every time and quotable.

- Kinds: sent out, questions until, submission, opening, binding until, work starts, work done by.
- A project is planned by a date only when the files give one day for it; two different days, or an
  approximate one ("Ende Juni 2026"), are shown and left to the user. The opening stands in for the
  deadline when only it is named.
- A question deadline is never derived from the submission date. If none is stated the field stays empty.
- What the user sets wins: files fill only empty dates; on a card the read dates are offered, not applied.
- The new-project dialog asks for every date a tender is planned by (questions, submission, opening,
  binding, work start, work end), pre-filled from the files; "tender sent" is a past fact and only shown.
- Files that are no LV (cover letter) are read for dates and still left out as LVs.

## D-032 — The schedule's axis has two scales; rows show the days left, not the days gone

- **Why:** a tender runs over weeks, the work over months. On one linear axis (8 weeks / 6 months / 1 year)
  either the work was off the edge or the tender's dates stuck together and their two-line labels stacked,
  so rows grew. The heaviest mark on a row was the time already gone.
- **Axis:** eight weeks by the day (the week before today included) on 66 % of the lane, a hatched break,
  then thirteen months by the month (`NEAR`, `FAR`, `axisPos` in `Projects.tsx`). The zoom switch is gone;
  the arrows move by four weeks; a pointer at the edge or a card's "Dates" still moves the axis to a date.
  Bar lengths left and right of the break cannot be compared, which is why the break is drawn.
- **Row:** fixed 68px. Days left to the next hard date as a 30px figure (on yellow within three days), ink
  bar = time left until submission, thin grey line = time gone, dashed = binding period, yellow = work.
  A date's label is one line (the day); what it is, is told by the mark: diamond = questions close, flag =
  submission, outlined flag = bid sent. A legend under the rows says so.
- **Line of all tenders** above the rows: each question deadline (outlined plate) and submission (yellow
  plate) with the tender's letter, stacked when they fall together, "n submissions" when on one day; after
  the break each tender's work as a thin bar, so sites running at the same time show.
- **Considered and not built:** the same Gantt only tightened, a table by calendar week, an agenda by date,
  equal-spaced stations per tender (a candidate for the "Dates" detail under a row). The line of all
  tenders staying visible while the schedule is closed: left out, the database's project has no date ahead
  and the line would be empty.
- **Added the same day, on the user's word:** the schedule opens where the tenders' dates are (this week
  if one is on the axis then, else at the nearest tender's dates), never empty; the year is written above
  the weeks; the "Dates" list under a row shows only label and day. This narrows D-031 for that list: the
  source is still read and kept, and shown on hover, but no longer written under each date.


## D-033 — Pages change behind the roller shutter (the gate); the tapes are for work on the page that stays
Status: decided · 2026-11-21 (built on the user's request to improve the way from the projects page to an LV)

- **Into an LV or a project** (from the projects page, from a project to one of its LVs, from a link): the
  band is the shutter (as in the opening, D-029, where the yellow rolls up until what is left is the band).
  It is let down from under the band, plain yellow with the band's hazard stripe along its foot; the band
  itself stays and is bare meanwhile (brand only). On the shutter: what is being opened, the file, and
  the LV strip with its counts as the projects page last read them ("as last read"; without a summary there
  is no strip and no number). One tape low across it says what is being read. The page is changed only once
  it is covered, and the shutter stays down at least 0.95 s so the name can be read; then it rolls up into
  the band (0.78 s) while the page sets itself up. Built first as a sheet drawn across on the slant, then
  as a separate slatted shutter with an ink rail; both replaced the same day (Atahan: follow the opening,
  the header is the shutter), so that there is one way of covering a page.
- **Back** ("All projects", the brand, "Back to project", the browser's back): the same shutter, bare and
  quicker, about 1.1 s in all.
- **The two crossing tapes on a white veil stay** for work on the page that is open: another version of the
  same LV, a file opened from a chat answer, the AI review.
- **Reduce motion:** the shutter, its lettering and the page setting itself up run anyway (one-off, as D-029's
  opening). The tape on the shutter also keeps running: this goes beyond D-029 ("the loops do not"), for the
  reason of D-030: the team's Mac has the setting on, and a three-second PDF read behind a still shutter
  looks hung. All of it is in one `@media` block at the end of `styles.css`.
- Polier stays in front of the shutter in his corner and hops when the page opens.


## D-034 — Every page has an address; the state writes it, Back and Forward read it
Status: decided · 2026-11-21 (the user asked for routing and pagination, built beside D-033)

- **Addresses** (`web/src/router.ts`, History API, no router library):
  `/` projects · `/projects/:id` a building's overview (for an LV in versions: its first file) ·
  `/projects/:id/files/:n[/table|remarks|whatif|pdf]` one file as an LV ·
  `/projects/:id/lv/:analysis[/view]` a trade LV opened from its building ·
  `/samples/<folder>/<file>[?view=]` a dataset file without a project.
  An LV takes `?item=5.1.4` (the open item), `?page=2` (item table), `?fpage=2` (findings list).
  Item numbers and file names carry dots, so they are kept in the query (or, for samples, last in the path).
- **The React state stays what is shown.** `App.tsx` works out the address from it (`here`) and writes it when
  it changes: a new history entry per page, view, item or list page. So the address changes when the page
  does, behind the shutter, not at the click. On load and on Back / Forward the address is read and
  `navigate()` brings the state to it through the same `run(…, through)` / `leave()` as a click (D-033);
  inside the same LV only view, item and page are set, with no shutter.
- The links of before (`?project=A&file=2&view=table`, `?sample=…`) still open and are rewritten.
  An address whose project is gone opens the projects page and is replaced by `/`.
- The API serves `index.html` for page addresses in the production build (`_WebApp` in `api.py`); unknown
  `/api/…` paths and missing assets stay 404.
- **Pagination:** item table 50 per page, findings list 20 rows per page (one row per item, worst first),
  `Pager.tsx`. A changed search or filter goes to page 1; opening an item "in the table" turns to its page.
  The lists are cut in the browser; the API still sends the whole LV (the map and the checks need all items).
  Not paginated: the projects board (columns by stage, a handful of tenders) and a building's trade list.

## D-035 — Bidder questions go by e-mail from the app: a draft by default, the reply pasted and read back

**Decided** 2026-11-21 (Utku, after talking to the organisers: bidder questions run over e-mail).

- One message per LV with all picked questions, German, written by the server (`mail.compose`) and
  editable before it goes out. It states nothing the questions do not state.
- Two ways out: opened in the estimator's own mail program (`mailto:`, kept as a draft until they mark it
  as sent, because the app cannot see what the mail program did), or sent by the app when `SMTP_HOST` …
  are set in `.env`. No account is needed for the demo and no mail leaves by accident.
- A third way out (added the same day, when it was clear that companies write from their company
  address, most likely in Outlook): the message as an `.eml` file with `X-Unsent: 1`, which a mail program
  opens without the length limit of a link. Assumed for now: Outlook, plain e-mail, no tender platform.
- The client's reply is pasted in and read against the questions of that message by Claude. A question
  counts as answered only with a passage found word for word in the reply; otherwise it stays open. Same
  rule as D-012.
- What was asked is kept in the database per project and LV file (`db.mails`), under a key of item number
  and question text, so it survives a new analysis of the file. A question that was asked stays on the
  list even when a later analysis no longer raises it.
- Not built: reading an inbox (Gmail API or IMAP). The Gmail MCP of the coding assistant is no part of
  the app.
- `db.mails` carries a `kind`. Price inquiries to suppliers (the other e-mail traffic of an estimator) are
  meant to be the second kind on the same table, sending and reply reading, with their own message and
  their own reading instructions.

Revisit if: the client's tender platform, not e-mail, is where questions must go; or replies should arrive
without pasting.

## D-036 — A click on Polier opens the chat; on the list of projects it answers about all tenders from their overview

Decided 2026-11-21 with Utku (he chose: first the existing chat from the avatar, then all projects; no
free chatbot).

- Polier (bottom right) opens a panel above it (`web/src/Agent.tsx`). Inside a project or an LV it is that
  project's conversation (D-025, D-027). A passage clicked in the panel opens the item on the PDF and
  leaves the right pane alone. The "Ask the project" tab of the right pane (LV workspace and project
  overview) was taken out the same day: one place to ask, and the right pane is the findings again.
- On the list of projects the panel is about all projects at once (`POST /api/catalog/chat`,
  `chat.overview_answer`): the model reads one block of fact lines per project (stage, dates with their
  source, files, rule findings, net total: what the projects page shows) and nothing else. Each statement
  cites a project and one of its lines; a line that is not there word for word is dropped, as passages are.
  A click on a line opens the project. "One project" in the panel's head asks a single project's documents
  without opening it.
- The overview holds no LV text. A question about items or wording is answered "ask inside the project",
  not from all documents of all projects: that would cost a whole-project read per project.
- No free chatbot: general knowledge (VOB, usual prices) stays out, as in D-025.

Revisit if: questions across the documents of several projects are wanted (needs one search index over
all projects), or the AI findings should count in the overview (it has rule findings only).

## D-037 — The checks are one pipeline in one file, run in the background when a project is created

**Decided** 2026-11-21 (Atahan).

- `src/boq/pipeline.py` is the one place that says what is checked: a list of steps, each naming a function
  of another module, its kind (deterministic or agentic) and its scope (a document or the project). A new
  check is a function plus one `Step` there; the run, its record and the pages take it from the list.
  `run_checks` (opening a file, the projects page, the CLI) runs the deterministic document steps of the
  same list, so there is no second list of rules.
- Creating a project or adding files starts a run (`src/boq/runs.py`) in a thread of the server; the
  request returns at once and analyses nothing itself. Per document: read, every deterministic step; then
  the agentic steps on one file per LV (the versions of an LV are not paid for twice); then the steps across
  the LVs of a building.
- Every step of every document is a row of the run's record (table `runs`): waiting, running with what it
  is doing, done with what it found and how long it took, skipped with the reason, failed with the error.
  A failing step does not end the run.
- The run's AI findings are kept with it per document and put onto the file when it is opened, so the LV
  page shows them without "Run AI review". The button stays for files no run has reviewed.
- Cost, known: every new project is reviewed by Claude without being asked (project of 296 items: 116 s,
  39 findings). Answers are cached, so a second run is free. A building of 27 LVs is 27 reviews, three at
  a time.
- The runs live in the server process (one worker, as the review's progress): after a restart a run that
  was going is shown as interrupted and can be started again by hand.

Revisit if: the server gets more than one worker (a job queue then), or the review of every upload costs
too much (then agentic steps on request only).

## D-038 — The app does not read the system's "reduce motion" setting

**Decided** 2026-11-21 (Atahan).

- Every animation always runs. All `prefers-reduced-motion` rules in the CSS and the checks in
  `TradeGraph.tsx` and `Mascot.tsx` are removed. This replaces the per-animation exceptions of D-029 and
  D-033 and the mascot's.
- Why: the demo machine has the setting on, and with it the progress signs (the tape running along the
  footer of the new-project dialog, the loading tapes) stood still and looked like a hang.
- Cost, known: people who set "reduce motion" for health reasons get the full motion. Accepted for the
  prototype.

Revisit if: this becomes a product.

## D-039 — The pipeline is the estimator's order of work: six stations, and it waits for the person at the questions

**Decided** 2026-11-21 (Atahan: "the steps the people who do this job follow, but more intelligent; human
in the loop, step by step"). Extends D-037.

- Every step of `src/boq/pipeline.py` stands at one of six stations (`STAGES`): read, rules, ai, compare,
  questions, prices. The pages show a run by station, not as a list of steps.
- A step can be `human`: a gate. `Q-GATE` passes when there is nothing to ask, every question is answered,
  the last day for questions is over, the project already holds a bid or an award, or the person goes on
  without the answers; otherwise the run stops
  with status `waiting` and the price step behind it is `held`. Nothing is sent by the run itself: the
  e-mail is written and sent by the person in the Questions view (D-035).
- A run is taken up again where it stands (rows that are done are left alone). The same mechanism serves
  the gate (`runs.nudge` after a message is written, sent, discarded or answered; `runs.go_on`), a failed
  step tried again (`runs.retry`), and runs cut off by a restart (`runs.resume_interrupted` at start).
- The run moves the tender along the board: to "questions" when it waits there, to "pricing" when the
  prices are worked out. Forward only.
- The cards count what the run found (AI findings, changes against the tender) with the rule findings, so
  card and LV page say the same numbers (`catalog_summary` v4, worked out again when a run ends).
- New steps: the tender's dates (`D-DATES`), three structure rules (number used twice, same description
  twice in a section, share of optional items), the AI's second look (`L-SECOND`: takes out an AI finding
  that repeats another; adds nothing), a later version against its tender (`V-DIFF`, its findings are put
  onto the file when opened), questions drafted (`Q-DRAFT`), prices from past bids (`P-PRICES`).
- Not built, tried and dropped: a quantity-outlier rule (same DN in one section, quantities ten times
  apart). On the dataset it only flagged "wie Position" items and different products.
- Cost, known: the three new rule findings change the AI review's prompt, so every LV reviewed before is
  read once more by Claude (project of 296 items: 0.34 USD); the second look is one more request per LV
  (0.02 USD there).

Revisit if: questions should go out without the person (then the gate needs an approval, not a view), or
several server workers run (D-037).

## D-040 — The client's answers change our side, never the client's file; the estimator decides each change

2026-11-21. Asked for: catch the reply, propose edits to the PDF or GAEB file from it, let the user accept or
edit them. Decided with Utku: the LV is the client's document, a bidder who changes its text or quantities
risks exclusion; what a bidder fills in is prices. So an answer never rewrites the file. It becomes
*amendments* (`src/boq/amendments.py`, table `amendments`) laid over the LV as the app shows and prices it:
`settle` (closes the findings of the question, with a note), `note` (part settled), `quantity` / `unit` /
`text` (the client changed the item: only where the reply states the new value, which must stand in the
quoted passage), `allowance` (the point stays open and is priced as a risk). Each is proposed and then
accepted, changed or rejected by the estimator; each keeps the passage of the reply it rests on. The app
proposes no figure for an allowance: it has no basis for one, the estimator sets the percent.

Replies are found over IMAP where `.env` names an inbox (`IMAP_HOST` …; the same account as SMTP by
default): the message that names ours (`In-Reply-To` / `References` against the stored `Message-ID`), else
one from the address written to with our subject behind "AW:" / "Re:". Nothing in the mailbox is changed.
Chosen over the Gmail API and Microsoft Graph (an app registration and a sign-in screen each), and over the
Gmail MCP server (a tool of the coding assistant, not something the app can call). Pasting the reply stays.
A new LV version issued by the client is uploaded as a new version, as before.

## D-041 — The bid: unit prices on the client's LV, allowances inside the unit price, X84 from the client's X83

2026-11-21. The bid side (`src/boq/bid.py`, table `bid_prices`, view "Bid"). The estimator fills in one
unit price per item; a price suggested from past bids is shown beside it and becomes a price only when
taken (one click per item, or all empty items at once; taken ones stay marked "from past bids"). A risk
allowance accepted from the client's answers (D-040) is not a line of its own — the client's LV has no
place for one — it raises the item's unit price: `price in the bid = unit price × (1 + percent)`, to cents.
A quantity the client corrected in an answer is shown beside the file's quantity, but totals and the
exported file use the file's quantity: the bid has to match the LV the client sent, the corrected LV has
to come from the client. The bid goes out as GAEB DA XML phase 84 written from the kept X83 (namespace and
`DP` to 84, `UP` and `IT` put into each priced item, everything else as it came), and as a CSV sheet for
every format. The X84 is checked by reading it back with the app's parser (same items, texts, quantities;
prices as entered); it is **not validated against the GAEB schema nor opened in another GAEB program**.
Overheads, surcharges on the whole bid (GU-Zuschlag, Nachlass) and the split into labour / material /
equipment are not modelled: the unit price is one figure.

## D-042 — The board says where a tender stands: Intake, Check, Pricing, Submitted, Result; questions run beside the prices

**Decided** 2026-11-21 (Atahan, after the research in `reports/Alman ihale teklif aşamaları.md`: "do all of
it; assume the Gmail MCP will be added"). Changes D-039 in one point (the gate) and D-029 in the columns.

- **A column is where the tender stands, the card's one line is whose move it is.** The line under the six
  marks starts with POLIER (a run is going), YOU (questions to send, a decision in the intake, a check that
  did not finish) or CLIENT (questions out, the bid is out); a tender that ended carries how.
- **Questions is no column and no gate.** No process model and no bid tool found has it as a stage; a bidder
  can ask until shortly before the bid. `Q-GATE` still says whether the questions are open (run status
  `waiting`), but `P-PRICES` no longer waits behind it (`held` is gone). `go-on` now closes the questions.
  A run's view carries `questions` {total, to_send, out, answered}. A plan kept with stage "questions" is
  read as "check".
- **Intake** holds only what the agent found (the mail agent to come): `POST /api/projects` with `found`
  ({via, sender, subject, received}) keeps the files with stage "intake" and starts no run. "Take it on"
  (PATCH stage "check") starts the checks; "Pass" sets outcome "passed". Files dropped by the estimator are
  taken on by that and start in Check, as before.
  Nothing is checked in the intake, the free rules neither: a card with rule findings and no AI findings
  reads as a finished analysis (`catalog_summary` gives `checked: false` and counts nothing).
- **Result replaces Award**: `plan.outcome` is won, lost, passed (no bid) or cancelled (by the client); an
  award among the files is "won" without being said. Set on the card of a submitted tender ("No bid" also
  from Check and Pricing), and taken back with "Open again".
- **Left out on purpose** (in the research, not on the board): the price decision and release before the
  bid (Schlussblatt), the hand-over to the site after the award, the client's requests after submission
  (Nachforderung, Aufklärung, Bindefristverlängerung), excluded and binding-period-expired as outcomes of
  their own. The intake's "read" is the deadline only; a real go/no-go needs a company profile.

Revisit if: the mail agent is built (it calls `POST /api/projects` with `found`; whether it reads the LV
before the estimator decides is open), or an estimator says Check and Pricing are one stage to them (the
research found Check as preparatory work inside the calculation, not as a stage of its own).

## D-043 — Projects page: the board on top, the schedule one lane docked under it; the card's foot says whose move it is

**Decided** 2026-11-21 (Atahan, after five prototypes of the board and the schedule as one view; he chose
"the board, the timeline at the bottom, better cards"). Changes D-029 in the order of the page and in what
the schedule shows; the columns are D-040's.

- **Every tender stands on the page once, as its card.** The schedule no longer has a row per tender. It is
  one lane stuck to the foot of the window: the line of all deadlines, or the lane of the one tender whose
  card is pointed at. The count at the top right of a card holds that tender's lane open and lists its
  dates with where they were read (the old "Dates" button; where no date is ahead the button still says
  "Dates").
- **The card**, top to bottom: plate, name, size; the days to the next hard date as its first figure; the
  fingerprint and the counts (not in the intake); a block that depends on the stage (intake: where it was
  found; check and pricing: new/gone since the last check, the bidder questions to send / with the client /
  answered; then what is open, the net, when the work would run); the foot.
- **The foot is whose move it is (D-040) and the one filled surface of a card**: yellow for YOUR MOVE, the
  running hazard stripe for Polier, tint for the client or nothing open. The stage select and the result
  select moved into it. The six station marks left the card (the strip under the band shows them).
- **Not on the card, on purpose**: a "worst item", a count of items priced from past bids, a mark for a
  version that arrived after the last check. The prototype showed them with made-up data; the API gives
  none of them yet (the two agents asked: the price count would show how thin the price history is, and
  nothing computes money at stake).

- **Revised the same day:** the lane is docked under the band, above the board (Atahan, after seeing it at
  the foot: "better at the top"). One lane, the cards and the pointing are as decided above; the title's
  "on top / under it" is the first version.

Revisit if: there are more tenders than a board shows at once and comparing them on the time axis is
missed (prototype A, one row per tender, was the alternative), or the API gets a worst item per project.

## D-044 — Price inquiries: packages per material group or trade, the estimator sends, quotes compared on cost on site

**Decided** 2026-11-21 (Atahan: "do all of it", after `docs/09-price-inquiries.md`). Builds on D-042.

- Three kinds of item, priced three ways: own work (no inquiry), material (suppliers, the quote is the
  material part only), a foreign trade (subcontractors, the quote is the whole unit price plus the firm's
  surcharge, 10 % unless set). Which is which is decided by Claude from the item texts and from what the
  firm says its own people do (`supply.plan`); the answer is checked against the LV and the directory.
- An inquiry is a package to at most five directory entries, never a line to everybody.
- The gate is per item, not per tender (replaces the idea behind D-039's gate): an item with an open
  question to the client of severity "high" (cannot be priced as written) is in no package until answered;
  other open questions are asked for and marked provisional. Everything else is asked for at once.
- The app writes, the estimator sends: no inquiry and no reminder goes out unread. An unknown supplier is
  never written to by the app on its own (§ 7 UWG, `docs/09`).
- Replies are forced into our lines: an Excel sheet to fill in goes with every inquiry. Free text and PDF
  are read by Claude, a line counting only with its passage in the reply and an asked item number.
- Comparison on cost on site (discount off, freight on, Skonto shown and not worked in), per package; the
  proposal is rule-made and says why (one complete supplier unless the split saves 3 % or more).
  Another product than tendered is flagged and never chosen silently.
- The directory is filled by the estimator and by incoming quotes, not from LVs (they do not say who sells).
- **The run no longer moves the card** from Check to Pricing: price suggestions being ready is not the
  estimator pricing. The estimator moves it (changes D-042 in this point).
- A run's view carries `inquiries` {packages, to_send, out, answered, held}.

Revisit if: a practitioner says how many are really asked and how late answers come (`OPEN_QUESTIONS.md`);
the unit price gets its split into labour / material / equipment (then a supplier's price can enter the
bid); the mail agent reads the inbox by itself (then quotes arrive without "Check the inbox").

## D-045 — A conversation with a supplier has turns; the inbox fills the intake; the risk allowance follows the source of a price

**Decided** 2026-11-21 (Atahan: "implement it, make the agent more capable"; items 3, 4 and 6 of the list of
that evening). Builds on D-042 and D-044.

- **Conversation.** A reply to an inquiry is read for what it is (quote, question, decline, later, other) and
  for what it asks back, each question with its passage. A reply without a price is kept as a turn, not
  refused. The answer is written by Claude from the text of the asked items only (`supply.answer`): what the
  LV says is quoted with its item, what it does not say is said to be clarified with the client and the
  supplier is asked to quote on an assumption of their own. Per question the estimator sees what the answer
  rests on; words that do not stand in the item count as not settled. The estimator sends it; a follow-up
  names the message before it (In-Reply-To), so the thread stays together. `run.inquiries.to_answer` counts
  the conversations that wait for the estimator.
- **Inbox to intake** (`src/boq/inbox.py`). A message of the last two weeks with an attachment the parsers
  read as an LV is put to Claude once: is it an invitation to bid, who asks, by when, and does the work fit
  what the firm's own people do (yes / partly / no, with the reason). An invitation becomes a project in the
  intake with that read on its card; a message that answers one of ours is not looked at. Dates the mail's
  text states go before those of the files. IMAP read-only (`POST /api/inbox/scan`, asked by the page every
  three minutes where an inbox is set) or `.eml` files dropped on the page (`POST /api/inbox/messages`).
  IMAP instead of the Gmail MCP for the reason in D-040: the app cannot call a coding assistant's tool.
- **Risk allowance** (`src/boq/risk.py`, panel in the Bid view). Every priced item has a band by what its
  price rests on (binding quote 2 %, soft quote 6 %, other product 8 %, typed in 5 %, past bids 12 % or their
  spread, open question 20 %: rules of thumb, stated on the page); a seeded simulation gives P50 and P80,
  the allowance proposed is P80 minus the total, and the items behind it are listed. It is shown, not added.

Revisit if: bands can be measured (quotes against what was paid); unanswered points of a supplier's question
should become bidder questions to the client by a click.

## D-046 — What-if varies the bid as it stands, not only a priced file
Status: decided · 2026-11-21

`what_if` takes the bid sheet (`bid.sheet`) as its base: per item the unit price entered with the accepted
allowance in it, times the file's quantity; a bid or award file with nothing entered on it keeps its own
totals. Items without a price count as nothing and the result says how many they are, instead of the view
refusing an LV that came without prices. A quantity the client corrected in an answer stays out of the base
(the bid keeps the file's quantity, D-040) and is one switch of the scenario. Suggested prices are not in the
base: a suggestion is not a price until the estimator takes it.
Revisit if: the bid gets overheads or surcharges on the whole bid — they then belong into the base as well.

## D-047 — Partners are a page; Polier may look for new ones on the web, and writes to none of them
Status: decided · 2026-11-22 (Atahan: "implement all of it"). Changes D-044 in one point.

- Suppliers and subcontractors have a page (`/partners`), not a dialog; one name for both: Partners.
- What is known about a firm is counted from the record (inquiries, replies, quotes), never entered as an
  opinion; a price is shown with its day, validity, terms and tender, and is "out of date" past its
  validity or after 90 days.
- How a firm writes is read by Claude from its own messages; a trait is kept only with a passage that
  stands in them. An inquiry to that firm gets its opening and closing in that style; the items, the dates
  and what is asked for are held against the template, else the template goes out. The estimator still
  reads and sends every message.
- **Web search (was left out in D-044):** Polier may look for firms, on the button or on its own for a
  package with nobody to ask (off until switched on). A firm counts only with a page the search returned.
  It is a candidate until the estimator takes it into the directory; the app writes to no firm on its own
  and the first inquiry to a new one goes out from the estimator (§ 7 UWG, `docs/09`).
- Example history is marked as such everywhere and never prices a real item.

Revisit if: a legal read says a first inquiry to a published address needs more than the estimator's own
send; the card should weigh into who is asked by rule and not only as a hint to the model.

## D-048 — The mailbox is watched by the server; what Polier did is on record; a hand-over sheet for the site

**Decided** 2026-11-22 (Atahan: "do all of it", items 2 and 3 of that morning's list). Builds on D-045.

- **Sweep** (`sweep_inbox` in `api.py`, `POST /api/inbox/sweep`, a task in `lifespan` every three minutes
  where an inbox is set): one look for answers to bidder questions and replies to price inquiries of every
  project, and for new tenders. What is found is read and applied as if pasted. Sending stays with the
  estimator; reading, matching and preparing the next step do not need a click.
- **Record** (`src/boq/events.py`, table `events`, `GET /api/events`): one line per thing the app did or
  read (tender found, answer read, quote read, asks back, decline, run ended), with whose move it leaves.
  Shown as "What Polier did" in the Pipeline dialog.
- **Hand-over sheet** (`render_handover`, `GET /api/analyses/{id}/handover.html`, linked from the Bid view):
  the findings ordered by VOB/B §2 mechanism with what the site has to do for the claim to stand, the
  bidder questions with the client's answers (and the ones never asked, with the warning that silence can
  cost a claim), what the answers changed, the prices that rest on an assumption. No new analysis.
- **Hindsight test of the findings** (`scripts/eval_findings.py`): not a number for the pitch. The dataset's
  later files change no quantities; the only signal is token prices in bids (40 items), and the findings
  point at them barely more often than at other items (rules: 18 % against 7 %; with the AI review 25 %
  against 19 %). The dataset holds no ground truth for LV defects.

## D-049 — A price is the quote for this tender, then the price book, then past bids
Status: decided · 2026-11-22 (Atahan: "the price book is the main suggestion; before it the supplier is
really asked for this project; if no answer comes, earlier prices or what was learned from earlier projects").
Changes D-044 in one point.

- Order per item: (1) a quote for this tender, from an inquiry; (2) until it is in, and where none comes, the
  price book: what partners quoted for the same thing in other tenders (`supply.book`, the matching of
  `boq.prices`: same unit, same thing, same nominal size); (3) only then similar items of past bids.
- **An item with an earlier price is asked for all the same** (was: "a kept quote from another tender still
  prices it, nothing is asked"). The book stands in; it does not replace asking.
- A price past its validity (or older than 90 days without one) is still used where nothing else is
  there, marked "out of date", never above medium confidence, with a wider risk band (15 % against 8 %).
- A subcontractor's earlier price is a whole unit price (with the firm's surcharge) and is the suggestion
  in the bid, before past bids, which stay beside it. A supplier's earlier price is the material part only:
  it is shown beside the unit price and never taken as one (the rule of D-044 stands).
- Example quotes price nothing.

Revisit if: the unit price gets its labour / material / equipment split — then a supplier's price enters
the unit price and this order holds for the material part too.
