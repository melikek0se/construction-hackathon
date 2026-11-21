# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-21 (hackathon day 2, PDF view and chat merged with the database and deploy work)

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
  report section, CLI `--prices`). History: the three priced bids (643 items after dropping token prices, e.g. under
  1 EUR/m³ or 0.1 EUR per metre-week). A price is suggested only from items with the same unit, the same head word and the same nominal
  size, at TF-IDF similarity ≥ 0.62; looser matches are shown as references, lump sums never get a price.
  Back-test `scripts/eval_prices.py`, each project priced from the other two: **5 of 643 items get a price**
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
  project; three.js diagram of the trades as a structure going up (D-018): a trade stands one storey above the last
  trade it builds on, trades without a stated interface lie in front; lettered slabs, red for an open
  interface; faint arrows in the overview, solid and named once a trade is pointed at or picked.
  Seen in headless Chrome at 1440x900 with project F (overview and one picked trade, click opens the trade
  sheet); dragging to turn and zooming were not exercised.
  "Open this LV" leads into the normal workspace and back. Deterministic, no LLM.
  On project F (27 LVs, 1,076 items): 177 interface statements, 39 dependencies, 21 findings — roof drains
  expected "bauseits" by both 12 Dachabdichtung and 14b Dachentwässerung (Stop); 01 Fertigteiltreppen (6 of 6
  items), 11 Sandwichsockel (8 of 9) repeated inside 00 Rohbau and 06 Kautschukboden (7 of 11) inside
  20 Bodenbelagsarbeiten; wall plaster expected by the flooring LV with no plaster LV in the project.
  Words broken at a PDF line end are joined before reading the statements (2026-11-21): removed a gap finding
  built from a half sentence ("bauseitige Stahlum-"); it is now the edge 19 Stahltüren → 22 Schreinerarbeiten.
  Checked: graph renders and selects in Chrome at 1600x950 through a script. Not checked: an engineer's view
  of the dependencies; dragging by hand; a project of GAEB files.

- Projects page (D-019; `src/boq/catalog.py`, `GET /api/catalog`, `/api/catalog/{id}/summary`,
  `/files/{n}`, `/project`, `PATCH /api/catalog/{id}`; `web/src/Projects.tsx`): the app opens on the list of
  projects, A–F from the dataset plus projects created by upload, each row with its versions or trade count,
  items, Stop / Caution / Note counts and net total where a priced version exists. A versions project opens its
  tender with a switcher for the other versions; a trades project opens the cross-trade view. Several uploaded
  files are kept as a project and can be renamed in the band. Deep link `?project=A&file=2`.
  Walked through in Chrome by script (list, open B, switch to the award, open F, create a project from three
  PDFs, rename it); `tests/test_catalog.py` covers the API. Restyled on 2026-11-21 (D-020): yellow and white,
  one row per project; inside it the three steps tender, bid, award in order, the files of a step side by
  side as selectable format buttons, the selected file's items as a strip with its own counts (clicking the
  strip opens that file), and a note when two formats of one step give different findings. A building with
  many trade LVs uses the same three lines: its LVs are the files of the tender step, drawn as one strip LV
  after LV, with the LVs that carry a stop or caution named underneath (each opens that LV). Compact yellow band with a crane mark. Flows per D-021 and
  `07-user-flows.md`: dropped or chosen files go through an intake panel (role and LV grouping per file, name
  from the LV), then become a project or join a created one ("Add files" on its row, or drop on the row).
  Walked through in Chrome by script at 1440x900: create a project from a tender and its print-out, open it,
  add a third file. Not seen: 1920 and phone widths of the dark page, drag-and-drop with a real mouse.
  The LV workspace (map, findings, item sheet, table, remarks, what-if) and the project view use the same
  yellow-and-white language since 2026-11-21; `DESIGN.md` was rewritten for it the same day. Loading shows
  two barrier tapes pulled across the screen (`web/src/Loading.tsx`) instead of a banner. Not built: deleting a project, adding files to an
  existing one, a summary that includes the findings between trade LVs (the row counts per-LV rule findings).

- Fixed while testing: `project.statements` hung for about three minutes on project E, whose text holds one
  192,356-character line (embedded image); lines over 2,000 characters are now skipped for that scan.

- English reading copy of the dataset (`dataset/en/`, D-022, 2026-11-21): all 44 files translated 1:1 in their own
  format and sorted by project (A–F, one folder each; `dataset/` itself stays sorted by format), source errors, contradictions and anonymisation tokens kept; `GLOSSARY.md`, `README.md` (method, limits)
  and `TRANSLATION_NOTES.md` at the top level, and one `TRANSLATION_NOTES.md` per project folder (2,022 source
  defects noticed while translating, per file with OZ or page). Made with `scripts/translate/` (`pipeline.py extract | batch | ingest | rebuild`, `verify.py`,
  `build_notes.py`; 57 batches translated by subagents). Verified by script: the nine GAEB files parse to identical
  items (OZ, quantity, unit, unit price, total), XML markup identical outside text nodes, every PDF page has the
  same numbers and tokens as its source. Rendered pages were looked at for a sample only. A second pass compared every file pair for lost content
  (`audit.py`, three build defects fixed) and had all 13,797 German–English pairs read by independent reviewers
  (`review.py`, 157 corrections applied); see "Completeness check" in `dataset/en/README.md`. Not app input: the
  sample list and `inspect_dataset.py` skip the folder. Side fix: GAEB 90 encoding detection now takes `m³` in
  cp850 into account (`encoding_of` in `parsers/gaeb90.py`), which a file without umlauts needs.

- PDF view (D-023; `src/boq/pdfmarks.py`, `GET /api/analyses/{id}/source.pdf`, `/marks`, `web/src/PdfView.tsx`,
  `pdfjs-dist`): tab "PDF" for an LV opened from a PDF that stays on disk (dataset, created projects). The
  original pages with selectable text; each finding marked on its quoted evidence in its severity colour, a
  note in the margin level with it; a click on a mark or note opens the item sheet, an item picked elsewhere
  scrolls the PDF to it (`&view=pdf&item=…`); zoom 100–200 % keeps the place, notes stay at the right edge.
  A quote is searched only inside the item's own stretch (whole, else its longest run of at least four
  words), else the item's number line gets a bar; only findings without an item are looked for in the
  preliminary remarks. Rule findings on all 34 dataset PDFs: 79 of 89 on the quote, 10 on the item line, none
  lost, slowest file 0.3 s; project C with the AI review: 61 findings, 56 on the quote, 5 on the item line.
  Marks are kept per analysis until its findings change.
  Seen in Chrome by script (1792x976, 1440x900, 1000x800) on project C: pages and marks, hover and click on a
  mark, click on a note, text selected through the text layer, deep link to 5.3.100 (page 61), zoom 150 and
  200 % (marks stay on the text, canvas redrawn sharp), "Run AI review" from this view (cached answers: 36
  notes added, each opens its own item, the view stays where it was scrolled to), a finding picked in the list
  scrolls the PDF; LV 00 of project F opened from the project view (68 pages, 10 notes); no tab on a GAEB
  file. An independent review found five faults, all fixed with tests: two uploaded LVs of the same file name
  showed one PDF, an item finding could be marked in the remarks, slow marks for quotes that are not on the
  page, the view jumping back to the selection after a review, the PDF left open.
  Not seen: a hand on the mouse (dragging a selection, wheel zoom), phone widths, an AI review that is not
  cached. Known limits: a quote that runs over a page break is marked on its first page only; an item's
  stretch includes a section heading that follows it; with a repeated item number the first place is used;
  pointing at a mark redraws all rows (fine at 71 pages, untested on much longer files).

- Pages for LVs without a PDF (D-024; `src/boq/lvpages.py`): a GAEB or Excel LV is drawn as a plain A4
  print-out (titles, item number, short and long text, quantity, unit, prices, remarks), so the PDF tab exists
  for every LV except a PDF uploaded on its own. Every page says it is drawn by the app, not the client's
  print-out. Rule findings on the nine GAEB files: 110 on the quote, 17 on the item line, none lost; the
  largest (project E, 296 items) is 170 pages and takes 1.2 s to draw.
  Seen in Chrome by script: project A's X83 as drawn pages (61 pages, 20 notes, deep link to 5.1.46 on its
  mark); project C's D84 offer (28 pages with EP / GP; it carries no texts, so drawn pages are numbers only);
  an item without findings picked in the item table scrolls the PDF to its line. An Excel LV (three items,
  built as in the tests) was uploaded to the running server and its page looked at as an image.
- The client's print-out instead of drawn pages (D-024): a GAEB file opened from a project is shown on the
  project's PDF of the same LV when there is one (A → `HEM2301-2_Gesamt-LV.pdf`, B tender →
  `Leistungsverzeichnis_leer.pdf`, B bid and award → `Abgabe LV.pdf`, C offer → `Angebot AN24-0305.pdf`,
  D → `LV-Ausdruck-[PROJEKT_004].pdf`; E has none and is drawn). All items of the GAEB file have a place on
  the print-out except in A's award (159 of 197) and B's bid / award (248 of 249); rule findings: 59 on the
  quote, 19 on the item line, 1 without a place. Seen in Chrome: project A, 5.1.46 marked on page 104 of 136
  of the client's package. Only for files opened from the projects page, not for the `?sample=` link or for
  the LVs of a trades project.
- PDF view, after Utku tried it by hand: Ctrl / Cmd + wheel and a trackpad pinch zoom the pages (50–400 %,
  around the pointer); selecting text no longer jumps to unrelated text (the end-of-content guard of pdf.js's
  own viewer, `watchTextLayer` in `PdfView.tsx`); notes and tool row cannot be selected. Checked by script
  (wheel events, a programmatic selection); a real drag with the mouse is for Utku to confirm.

- Ask the project (D-025; `src/boq/chat.py`, `POST /api/analyses/{id}/chat`, `web/src/Chat.tsx`): the right
  pane has two tabs, Findings and Ask the project. A question is answered from the open LV and the other LVs
  of its project only; each answer lists its passages (item, file, German quote), a click opens the item on
  the PDF pages, in another file if that is where it stands. Passages that are not word for word in the item
  are dropped; "Not in the project documents" and "unconfirmed" are shown as such. Model and effort:
  `BOQ_CHAT_MODEL` (default: the review model, `claude-opus-5-5`), `BOQ_CHAT_EFFORT` (default low).
  Live, 2026-11-21: project D (one LV, 12k tokens) 7 s for the first question, 4.5 s for a follow-up read
  from the prompt cache, a question about usual market prices answered "not in the documents"; project F
  from LV 12 ("which LV supplies the roof drains?") 21 s, 27 documents read, five confirmed passages from
  LV 12 and LV 14b, and it names the same open interface the cross-LV check reports. Seen in Chrome: the
  answer, a click on a passage of LV 14b opens that LV on page 4 with the passage in view and the
  conversation still there. Offline tests in `tests/test_chat.py`.
  Completed on 2026-11-21 after Utku's review:
  - Cost, read from the API's token counts at `claude-opus-5-5` list prices (input 4, output 20, cache read
    0.20, one-hour cache write 8 USD per million tokens): project F is 316,700 tokens of documents, not the
    150k estimated from character counts. First question in an hour about 2.55 USD, each later one about
    0.08–0.10 USD (7–33 s); project D (12,300 tokens) about 0.10 USD, then about 0.01 USD.
  - The documents are sent in the project's file order whichever file is open, and cached for one hour
    (`BOQ_CHAT_CACHE_TTL`): before, each LV of a project had its own copy and every first question paid in
    full. The open file is named to the model ("this LV") and sent as a second block only if it is not among
    the documents (a bid beside the tender).
  - A clicked passage is outlined on the page (`POST /api/analyses/{id}/locate`, the same search as for
    findings) and scrolled to.
  - The project overview (trades projects) has the chat too; an answer's passage opens the LV it stands in.
  - Conversations are kept in the browser per project (`localStorage`) and survive a reload.
  - The prompt tells the model to keep anonymisation tokens as written; checked live on the answer that
    had replaced one („nach [PERSON_125] AN“ now stays).
  Seen in a separate browser (Playwright, 1440x900): overview chat on project F, reload keeps it, a passage
  of LV 02 opens that LV with „Vorleistung: Wandputz PII und PIV“ outlined on page 8. Also seen there: the
  offer D84 of project C on the client's offer PDF with texts and prices at 3.2.110, picked in the item
  table; an Excel LV uploaded through the page (intake, new project, PDF tab with drawn page, note and mark;
  the test project was deleted again).
  Not done: the one-hour cache was not waited out (a second question after more than five minutes); an
  answer with "found: false" still shows its nearest passages under the label "Not in the project
  documents", which reads oddly when the answer is "no LV contains this"; no chat on the list of projects.

- Database and deploy (2026-11-21, D-026, `docs/08-deploy.md`): projects, documents (file bytes), analyses and
  the LLM cache in one database (`src/boq/db.py`; Postgres via `DATABASE_URL`, SQLite `data/boq.db` locally).
  Dataset projects seeded by `uv run boq-seed`, then ordinary: files can be added to and removed from any
  project, projects deleted (two-click Delete on the projects page; file removal is API only:
  `DELETE /api/catalog/{id}/files/{index}`). Analyses and AI findings survive a restart. `Dockerfile` (one image,
  React build inside), `BOQ_PASSWORD` basic auth, `GET /api/health`. Checked: 111 tests; the image against a
  Postgres 17 container (seed, upload, restart keeps the project, 401 without password); server memory peaks
  at about 170 MB with project F opened. `docker-compose.yml` runs the same setup locally (image + Postgres,
  :8080, password `demo`, seeds itself); an AI review on project D was cached in Postgres and answered from
  it after a restart in 0.03 s (the old disk-cache answers did not match the current prompts: 4 real requests). Not checked: the new Delete button clicked in a browser; a real
  deploy (needs the team's accounts).
- Chat cost (D-027; `src/boq/retrieve.py`): the chat no longer sends the whole project with each question.
  A local search picks up to 60 passages and the model reads those plus an index of all LVs. Project F, live:
  five questions for 0.34 USD in total (0.06–0.08 USD and 5–13 s each, 12–16k input tokens), against about
  2.55 USD for a first question before; the answers to the roof-drain, wall-plaster and edge-strip questions
  say the same as the whole-project answers did. Each answer shows its cost and what was read; a button under
  the last answer reads every document instead and states the price (F: about 2.53 USD now, then 0.06 USD a
  question for an hour). Seen in a separate browser on project F: the cost line, the priced button, a passage
  of LV 14b opened and outlined. Not done: the "read every document" button was not clicked in the browser
  (its server path is tested and was run live before); no comparison on more than four questions; the chat
  model is still `claude-opus-5-5` (`BOQ_CHAT_MODEL=claude-sonnet-5-5` would halve the price, untested).
  Spent on live chat tests on 2026-11-21, estimated from token counts: about 5 USD, most of it before this change.

- Intake rebuilt (D-028; `src/boq/intake.py`, `POST /api/intake`, `POST /api/projects` with `roles`,
  `PATCH /api/catalog/{id}/files/{n}`, `IntakePanel` in `web/src/Projects.tsx`): the project number, name and
  client and each file's step (tender / bid / award, with "package", "excerpt", "as submitted") are read from
  the files — GAEB header fields, the PDF page header, prices, a GAEB twin with the same prices — and shown
  with their evidence; a step that is only inferred is marked "check" and any step is corrected with one
  click; the destination project is suggested by number or name; a file that is no LV is left out instead of
  failing the drop. Score against the hand mapping (`scripts/eval_intake.py`): step 43/43, qualifier 43/43,
  number 4/6, name 5/6. Seen in headless Chrome at 1440x900 through a script: B's five files plus a Word
  file, F's 27 PDFs (name "79-222 Ausbildungszentrum und Bürogebäude -AK Juni 21", 27 LVs), a lone priced PDF
  marked "check" and set to award, the award of A dropped after its tender (destination suggested).
  Not seen: narrow widths, a real mouse drag. A file is moved to another step from the project row ("Move to…" beside the selected file; seen once in
  headless Chrome: a PDF bid moved to Award). Not built: ZIP / folders, deadline. Untested on tenders outside the dataset: the header labels are the ones these six projects use.

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
2. PDF view, next steps agreed with Utku: (a) the estimator's own notes on a line or a selected passage,
   marking a finding valid / not valid, tagging a colleague who is notified to review; (b) retrieval
   (GraphRAG) for fact-checking findings; (c) highlight a chat passage on the page
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
- Price and report review (2026-11-21), fixed: token prices of rental units (bid B: a fence "vorhalten" at
  0.03 EUR per metre-week) were kept in the price history; 13 dropped, back-test unchanged. Price sizes read
  "Da 125" as the checks do. A bidder question about several items (a missing-item finding with three supply
  items, an AI finding on a clause quoted for several items) now names all of them ("Betrifft auch: …") in the
  text and the HTML report. Checked and correct: the bid PDF of B sums to 835,804.22 EUR, as its own last page
  says (the award D86 differs by two prices); price dates match the GAEB headers; section totals equal the net
  total on every priced file. Open: the back-test figures in the report's price note are written in, not computed.
- Project and API review (2026-11-21), fixed in the uncommitted projects-page work (`api.py`, test in
  `tests/test_catalog.py`): `_same_lv` grouped files by item numbers alone, and project F's trade LVs restart
  at 1.1.10 — 8 of 27 LVs counted as "versions" of another and were dropped from the cross-LV analysis when F
  was opened from the projects page, the roof-drain Stop with them (14b fell in with 14a / 14c). Files now
  pair only on shared items with the same unit and quantity, member by member (no chaining), and the
  cross-LV analysis keeps an LV that repeats part of another (01 inside 00). Upload errors no longer show the
  server's temporary file path. Checked: catalog summaries, path handling, error codes, project analysis time.
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
