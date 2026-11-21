# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-21 (hackathon day 2, PDF view and chat merged with the database and deploy work)

## Now

Upload → parse → rule findings → table works end to end for GAEB files: Python package `src/boq` (parsers, model,
rule checks, missing-item check, CLI, FastAPI) and a React screen in `web/`. GAEB XML, GAEB 90 and PDF are
parsed, the LLM checks run against the Claude API, and the findings can be exported as a risk report and a
list of bidder questions. Excel LVs are imported, unit prices are suggested from the three priced bids (with
very low coverage, see below), and a what-if view varies the total of the bid in progress (or of a priced file).

## Done

- Partners page (2026-11-22, D-047; `src/boq/partners.py`, `partners_demo.py`, tables `partner_messages`,
  `partner_searches`, column `suppliers.more`; `web/src/Partners.tsx`, `partners.css`; replaces the Suppliers
  dialog, `Suppliers.tsx` is gone): `/partners`, reached from "Partners" in the band and from a firm's name
  in the price inquiries, through the shutter with the band and the rows coming in. Tabs: Suppliers,
  Subcontractors (list left, the firm right: what is open with it, a card counted from the record — asked,
  answered, median time to the first reply, quotes, taken, reminders —, particulars, usual terms from its
  quotes, a subcontractor's papers with expiry, how it writes, every price with day, validity, terms, tender
  and the change against its price before, every message and call), Waiting (open conversations of all
  tenders, whose move), Price book (every quoted line by what was priced), Found on the web, Your firm.
  The agent uses it: the plan of an inquiry sees "preferred" and how often a firm answered, leaves out
  "do not ask"; an inquiry to a firm whose style is on record has its opening and closing written that
  way (`partners.restyle`, the items never change, the plain template is one click away); the answer to a
  supplier's question takes the tone too; "do not phone" refuses the voice call.
  Checked: `tests/test_partners.py` (4), full pytest 210 passed, type-check and build. On the dev stack
  with real Claude calls: a style read (8 s: Du, "Moin Herr Kaya,", five habits each with its passage, none
  dropped), an inquiry of project D worded that way (6 s; items identical), a web search for
  "Tragwerksplanung / Statik" in Hamburg (about 40 s, 0.22 USD, 2 queries, 8 firms each with its page).
  Seen in headless Chrome at 1500 wide, no console error: all six tabs, a supplier and a subcontractor,
  the way there from the projects page and back, Waiting → "Open the inquiry" → a firm's name → back to the LV.
  **Not run**: the mailbox history over IMAP and the call record and recording from ElevenLabs (no
  account in `.env`; the API shapes are from the docs, as for the rest of `voice.py`); Polier's own search
  on a timer (`keep_looking`: same code as the button, the loop itself was not waited for); `.eml` dropped
  on the page in a browser (the API path is tested); "Take into the directory" clicked in a browser.
  Known: the contact of a firm found is what the search reported, not checked against its page (the page
  says so); the example history (six made-up firms, "Your firm" → Examples) shares the price book with real
  quotes, marked "example"; the dev database has it in; a firm's widths under 1000px were not looked at.

- Risk report by the money (2026-11-22): "Items by the money at stake" ranks by the worst finding, then
  the item's value (from the file, else what the findings were given, with where the price is from); a
  file without prices says what the items with findings are worth by the prices at hand. Checked on the
  dev API (project B's tender: 3,460 EUR from its bid) and by the tests that render the report.

- Findings ranked by money (2026-11-22; `_item_values`, `_with_stakes` in `api.py`, `Finding.money_basis`): a
  finding without an amount of its own gets the value of its item (quantity × unit price) and says where the
  price is from: the file, the bid in progress, a priced version of the same LV in the project (bid, award),
  else the suggestion from past bids. Within a severity the dearest item comes first; the findings list
  shows the largest amount per item, not the sum. Checked: `tests/test_catalog.py` (project B: the tender's
  findings priced from its bid, in order), dev API on two projects. First opening of a tender whose only
  priced twin is a PDF takes about 9 s (the PDF is parsed once per server start). Not seen in a browser.
  The risk report still ranks by its own points.

- Conversations with suppliers, tenders from the inbox, price risk on the bid (2026-11-21 late, D-045):
  `supply.answer` and the thread in `Inquiries.tsx`; `src/boq/inbox.py` with `/api/inbox/*`, "Check mail" in
  the band and `.eml` dropped on the page; `src/boq/risk.py` with `Risk.tsx` in the Bid view.
  Checked: `tests/test_supply.py` (a reply that asks back is a turn, the answer follows it), `test_inbox.py`
  (invitation → intake once, other mail passed over, no LV not put to the model), `test_risk.py`; type-check.
  With real Claude calls on the dev stack: a supplier's reply with three questions read (kind question, each
  with its item and passage) and the answer drafted (one settled from the LV with its quote, three said to
  be clarified with the client); a made-up invitation as `.eml` → project in the intake in 5 s with "fits
  your work" and the reason, deadline and question date from the mail; the risk panel on project D (9 of 50
  items priced: 2.1 %, the largest typed-in item and the one over an open question on top), seen in
  headless Chrome. Not checked: IMAP against a real mailbox (scan, replies); the thread, the answer composer
  and "Check mail" clicked in a browser; `.eml` dropped on the page in a browser.
  Known: "Die Bindefrist endet am …" in a mail's text is not read as the binding date.
  **Voice call (item 5), run on 2026-11-22 with a key**: `src/boq/voice.py`, `/api/analyses/{id}/supply/call`,
  `/api/mails/{id}/call-price` and `call-end`, `web/src/Call.tsx` behind "Call" on a supplier's row (shown
  only with `ELEVENLABS_API_KEY`). The agent and its client tool were made through the API on first use
  (German, `eleven_flash_v2_5`, default voice; its id is kept in table `settings`). In headless Chrome with
  a fake microphone the call connected over WebRTC, the agent spoke its opening with the project's name
  filled in and asked again when nobody answered; hanging up ended it and kept the transcript. The server
  side of a price was run by hand (a price for an asked item is kept as a quote marked not binding, one
  for an unknown item is refused with words the agent hears). **Not done: a call with a person answering,
  so the agent calling `submit_price` itself, German numbers by voice, and how it sounds are unheard.**
  The old simulate-conversation endpoint is gone (410), so no simulated supplier either. Set the firm's
  name in "Suppliers" first: without it the agent says "der Firma unser Unternehmen".

- Price inquiries to suppliers and subcontractors (2026-11-21, D-044; research and what is built:
  `docs/09-price-inquiries.md`; `src/boq/supply.py`, tables `suppliers`, `supply_plans`, `quotes`, `settings`;
  `web/src/Inquiries.tsx`, `Suppliers.tsx`, `supply.css`): view "Price inquiries" on every LV, "Suppliers" in
  the band. Directory and firm particulars; packages per material group / trade (Claude, also pipeline step
  `P-INQUIRIES`); German inquiry with an Excel sheet; replies read (sheet, PDF, pasted text, inbox);
  comparison on cost on site with a proposal; taken subcontractor prices into Utku's bid.
  Also merged: origin/main e11f93e (Utku: inbox replies, amendments, bid); decisions renumbered (board D-042,
  docked schedule D-043). The run no longer moves a card from Check to Pricing.
  Checked: `tests/test_supply.py` (plan held against LV and directory; sheet out and back, two quotes
  compared, discount, freight, missing item, other product, expired, proposal, choice, directory learns the
  product; free-text lines kept only with their passage and an asked item), full pytest 197 passed,
  type-check. In the dev stack on project D (50 items): six example suppliers (`….example` addresses, marked
  "example"), a plan of five packages **put in by hand**, three inquiries written, three filled-in sheets
  read back, the view seen in headless Chrome at 1500 wide.
  With a working key (same evening), on project D through the dev API: the plan by Claude (8 s, 0.03 USD:
  six packages for 25 of 50 items — pipes, shafts, bulk material for suppliers; asphalt, landscaping,
  structural analysis for subcontractors, the last with nobody in the directory; item 1.1 held for the
  client); a made-up reply in free German text read by Claude (9 s, 0.03 USD: the supplier's own numbering
  1) to 4) matched to our items, one other product flagged, the item it does not make left without a
  price, an unasked extra kept apart, ex works plus freight, "freibleibend", valid until); the pipeline
  step on a real run ("6 packages for 25 items to ask outside; 1 with nobody in the directory to ask").
  Known from that reply: a discount on part of the items only is not worked in (it is said in the terms).
  A new plan keeps the id of a package that is still mostly the same items, so its inquiries stay with it.
  Not checked: a quote as PDF, sending through SMTP with the sheet attached, replies found in an inbox, the
  Suppliers dialog and the composer and reader clicked in a browser, a reminder, "Put the taken
  subcontractor prices into the bid" in the browser.
  Not built (web search: built since, see Partners page): the app sending by itself; a supplier's material price inside
  the bid's unit price; the card line for inquiries (the field `run.inquiries` is there).

- Board by where the tender stands (2026-11-21, D-042; research: `reports/Alman ihale teklif aşamaları.md`):
  columns Intake · Check · Pricing · Submitted · Result. Questions is no column: the prices no longer wait
  for the bidder questions (`runs.py`, `pipeline.py`), the questions stay open beside them. Every card has
  one line on whose move it is (POLIER / YOU / CLIENT, `nowOf` in `Projects.tsx`). Intake is for tenders an
  agent found (`POST /api/projects` with `found`, no run until "Take it on"); nothing fills it yet, the
  mail agent is not built. Result holds won, lost, no bid, cancelled (`plan.outcome`).
  To see an intake card: `curl -X POST localhost:8000/api/projects -F files=@<LV> --form-string
  'found={"via":"mail","sender":"…","subject":"…","received":"2026-11-21"}'`.
  Checked: `tests/test_runs.py` (prices done while the questions wait, closing them, intake → taken on
  starts a run, outcome set and taken back), full pytest 190 passed, type-check; the page in headless
  Chrome at 1440 wide with one intake card, a "6 questions to send" card, a submitted and two won cards.
  Clicked through in headless Chrome, no console error: "Pass" (to Result as No bid) and "Open again"
  (back to Intake), Result "Lost" on a submitted card and back, the stage select Pricing → Check → Pricing,
  the strip's questions station ("Your move", "Close the questions") with the prices station done beside it.
  Not checked in the browser: "Take it on" (it starts a paid AI review; the API test covers it), a CLIENT
  line with questions out, the settings dialog's stage select.
  In the intake nothing is checked, the rules neither (Atahan: half an analysis on the card confuses): the
  summary of an intake project has `checked: false`, zero counts and is not kept; the card says "268 items ·
  not checked yet". Files added to an intake project start no run. Opening an intake project's LV still
  shows the rule findings there (the LV page runs the rules when a file is opened).
  Known: a run recorded before this change shows no questions count until the project is run again.

- Projects page, board over a docked schedule (2026-11-21, D-043): the board is on top; the schedule is one
  lane stuck to the foot of the window (all deadlines, or the lane of the card pointed at; the count on a
  card holds its lane open with the dates and their sources). New card: countdown top right, fingerprint
  and counts, a stage block (found / new·gone / questions to send·with client·answered / open / net / work),
  whose move it is as the filled foot with the stage or result select in it; `RunSegs` is no longer on the
  card. `web/src/Projects.tsx` (`Card`, `Schedule`, `ProjectsPage`), `home.css` (last two blocks).
  Checked: `npm run build`; in headless Chrome at 1500 wide against the dev database: the page, a card
  pointed at (its lane in the dock), a count clicked (lane held, dates and legend listed).
  Not checked in the browser: the selects in the foot, a POLIER foot (no run was going), drag and drop of
  files onto a card, widths under 1180px, the page with no project.
  Revised the same day (Atahan): the lane is docked under the band, not at the foot; it stays there while
  the board scrolls, and held dates open downwards. Polier is back at the foot of the window. Checked in
  headless Chrome: the page, a card pointed at, a count clicked.
  Price inquiries on the card (D-044's `run.inquiries`): a line in the stage block (packages, to send / out /
  answered, items held for the client) and in the foot: YOUR MOVE "N price inquiries to send" (named with the
  questions where both wait), else SUPPLIER "N out, M answered" when nothing is the estimator's or the
  client's move. Checked in headless Chrome on project a1344a2b6dbc (block and foot with both waiting); the
  SUPPLIER foot was not seen (no project has inquiries out and nothing to send).
  Answers to decide and the bid on the card: the run view (`GET /api/runs`) carries `decisions`
  (`amendments.tally`: proposed, accepted, quantities, allowances) and `bid` (`bid.tally`: priced on the
  fullest file, priced_all, from_suggestions), counted from the tables alone. Card: "The client's answers"
  (N to decide, quantities corrected, allowances), "Bid · X of N items priced" with a bar and how many came
  from past bids; the foot names every move of the estimator in one line (questions to send · changes to
  decide · price inquiries to send). No net and no "bid ready" on the card: both need the LV read (the Bid
  view has them). `tests/test_card_tallies.py`; seen in headless Chrome on a1344a2b6dbc with rows put in
  for the look and taken out again. A project without a run shows neither (they ride on the run view).
  The opening waits for the cards (Atahan: one loading screen, not two): the shutter stays down until
  every project's summary is there, at most 8 s (`allIn` in `App.tsx`), and a card whose numbers came
  behind it shows no tape (`covered` on `ProjectsPage` and `Card`). Measured in headless Chrome against
  the dev database: six cards taped under the shutter, the shutter lifts when the last is read (about
  4.3 s cold), no card taped or untaping after it. Not checked: the 8 s cap with a slow project.
  The card's middle is a checklist (Atahan chose it from six card designs in a playground, roomy over
  compact): one row per open thing, its mark says whose it is (yellow square: the estimator's; open
  square: the client's or a supplier's; tick: done; grey dot: to know), a second small line has the rest
  (out, answered, held). Rows: new findings since the last check, bidder questions, the client's answers,
  price inquiries, items priced (with a bar), then what `openItems` says. The foot says one move in full
  and counts several ("3 things wait for you"). Seen in headless Chrome on a1344a2b6dbc with rows put in
  for the look and taken out again; `npm run build`.
  Card, second playground (Atahan chose: count + band, filled head, six stations, band wipes in): the
  head is filled by where the tender stands (pale yellow intake, tint with the client or ended otherwise,
  ink when won; a yellow bar at its left when it is the estimator's move); the estimator's move shows
  its count on an ink plate in the yellow foot; while a run is going the foot is the six stations with
  "3/6 AI review" and the station's line; when a run ends on a card that is on the page the foot wipes
  in and the estimator's rows come in (`just-done`, once). Seen in headless Chrome: heads, plate, list.
  Not seen in the browser: the stations foot and the wipe (no run was going).
  The letter on the yellow plate is the project's own (2026-11-22): column `projects.plate`, given when the
  project is kept — the first free of A..Z, AA..; the dataset projects hold A..F; older rows get theirs on
  the next read, oldest first (`catalog.next_plate`, `_fill_plates`). Before, an upload showed the first
  letter of its name, so two projects could carry the same plate. Tried on a scratch database; not seen in
  the browser.
  On the card the plate now holds the tender's number as its files state it (`projects.number`, e.g.
  `8209.003`), as wide as the number, above the name (which then drops the number it begins with); a tender without a
  number has no plate on its card. Seen in headless Chrome. The number is the one in the file header; when
  that is empty or an anonymisation token, the number most file names begin with, else the one the title
  begins with (`intake.leading_number`, `number_in_names`: digits joined by . - / or four digits and more,
  never a date; "Angebot AN24-0305" gives nothing). Projects already kept get it on read (`catalog._project`).
  `eval_intake.py`: project number 5/6 (was 4/6; the sixth, B, has none by hand but 15145 in its file). The letter stays
  on the schedule row and on the line of all tenders, where it ties a deadline to its row.
  Not built (shown in the prototype with made-up data): worst item per project, "new version, not
  checked".

- Projects page, band (2026-11-21): two buttons at the top right, "Pipeline" and "New project" (moved up from the
  board's head, which keeps only the drop hint). The schedule is always open: its switch in the band
  (`ScheduleSwitch`) and the sliding wrapper are gone. Checked: type-check, the page in headless Chrome at 1440
  wide. Not checked: clicking the two buttons in the browser; the page with no project.

- Audit of what Claude costs (2026-11-21; `src/boq/spend.py`, table `llm_calls`, `GET /api/spend[?project=]`):
  one row per request to the Claude API (AI review, second look, chat, chat about all projects, reply
  read) with project, file, pipeline run, the model that answered, the token counts the API returned, the
  time it took, USD at list prices and the last four characters of the API key; an answer taken from the
  app's own cache is a row too, at 0 USD. What a request belongs to is said once around the call
  (`spend.scope`), not passed through the callers. UI: a line "Claude $x, n requests" at the top of the
  pipeline dialog (per project behind "Record" on the strip, all projects from the band), opening to the
  sums per purpose and the latest requests.
  Checked: `tests/test_spend.py` (2, with a stand-in for the API); on the dev stack a cached run (5 rows at
  0 USD under its project, file and run) and one real chat question (0.0306 USD, the same figure the chat
  returns); the dialog in headless Chrome. Not checked: the row of a real, uncached AI review and of a
  reply read (same code path as the tested one). Known: USD is an estimate, not the invoice; requests made
  before this are not in it; a request that fails before an answer comes back is not noted.

- Pipeline as a workflow with a gate (2026-11-21, D-039; `pipeline.py`, `runs.py`, `web/src/Runs.tsx`): six
  stations (read, rules, AI review, compare, questions, prices). The run stops at the bidder questions with
  status `waiting` until they are answered, the person goes on without (`POST /api/runs/{id}/go-on`) or the
  last day for questions is over; then the prices. Also `…/retry` (failed steps again), `…/cancel`, runs cut
  off by a restart go on at start, "n new, n gone" against the run before, USD per agentic step.
  New steps: dates, three structure rules, the AI's second look, version against tender, questions drafted,
  prices. `GET /api/runs` without a project is now the latest run of every project.
  UI: a strip of the six stations under the band of a project and an LV (a station opens to its steps, a
  step with findings puts them into the list, the waiting station holds "Write the e-mail" and "Go on to
  the prices"); six marks and one line on every card; "Pipeline" in the band of the projects page opens a
  table project × station; the record of a project's runs behind "Record" on the strip. The cards count
  the run's findings too, and the run moves the card along the board.
  Checked: `tests/test_runs.py` (8: record, gate waits, go on, goes on by itself when all are answered,
  stop and take up again, version against tender, skipped and failed steps, a building). On the dev stack,
  real runs: 296 items (AI review and second look 0.36 USD, 40 AI findings, 0 taken out, stopped at 30
  questions, "go on" → prices → card in Pricing); 50 items in two files, the server restarted while Claude
  was reading: the run went on by itself and stopped at 6 questions; a building of two trade LVs made
  through the API (0.23 USD, both LVs waiting, 7 and 3 questions). Seen in headless Chrome at 1440 wide:
  the strip on an LV and on the project view, open stations, a step filtering the list, card marks, the
  table; no console error.
  Not checked: "Stop" and "Try again" pressed in the browser (covered by the test; live, Stop only takes
  effect after the step it is on, up to a minute in the AI review, and the button says so); "Write the
  e-mail" leading into a sent message and a pasted reply in the browser (the same path is covered by the
  test through `mail`); a building of 27 LVs; widths under 1200px (six stations and the buttons share one
  row). Known: on the project view of a building the waiting station has no "Write the e-mail" (an LV has
  to be opened for it); a run's "version against tender" findings make `reviewed` true on a file the AI did
  not read; "Run AI review" by hand replaces them until the file is opened again. Prices: 0 of 296 on the
  dataset's own projects, because a project's own bid is left out of its history. A project that already
  holds a bid or an award does not wait at the questions.

- Pipeline and background runs (2026-11-21, D-037): `src/boq/pipeline.py` lists every check as a step (7 rule
  steps, 10 missing-item steps, the AI review, the comparison between LVs); `src/boq/runs.py` runs them in a
  thread when a project is created or gets files and keeps a record per step and document (table `runs`).
  API: `GET /api/pipeline`, `GET /api/runs`, `POST /api/catalog/{id}/runs`; a file opened from a project
  carries the AI findings of its latest run (`reviewed` in the answer). UI (`web/src/Runs.tsx`, `runs.css`):
  a "Pipeline" switch in the band on the projects page (all runs) and on a project (its runs), counting the
  steps while a run is going; a dialog with each run, its documents and every step with result, detail and
  time; a line on the card of a project being checked; "Run again" on a project. A run that ends while its
  project is open puts its findings onto the page without moving it.
  Checked: `tests/test_runs.py` (record, skipped and failed steps, findings on the opened file, two trade
  LVs compared) and one real run through the dev API on an uploaded project (296 items, 19 steps, AI review
  116 s, 39 findings, then on the opened file). A project created through the API was then followed in headless Chrome at 1440 wide (248 items,
  run started by itself, AI review 102 s, 31 findings): switch counting and card line on the projects page,
  the dialog with the running step, the LV page taking the findings when the run ended (7 → 38) without a
  reload, no console error. While a run reviews the open file, "Run AI review" waits for it (added after
  that walk, type-checked only). Not checked: a run on a building of many LVs; two runs at once; a person
  clicking through.
  `POST /api/projects` no longer returns the analysed LVs of a building (`lvs`), only id, kind and name.

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
  "Run AI review" button. Deep link: `?sample=<path>&view=table&item=5.1.4` (since D-034: `/samples/<path>?view=table&item=5.1.4`; the old form is rewritten). Design notes: `PRODUCT.md`,
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
  While a review runs the page says what is being done (2026-11-21): a board under the loading tapes with the
  section being read, sections read of all, and the findings so far for each of the six checks
  (`ReviewTapes` in `web/src/Loading.tsx`, asked every 0.7 s from `GET /api/analyses/{id}/llm/progress`,
  filled by the `progress` callback of `run_llm_checks`). Every request looks for all six kinds at once, so
  the board shows no "now checking typos" step: that would be invented. The state is kept in the server
  process, so it needs one worker. Seen in the browser with stubbed answers (start and mid-run, 1280×800 and
  ×620) and through the real API on a cached review of project D; not yet seen on a live, uncached review.
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

- Bidder questions by e-mail (D-035; `src/boq/mail.py`, table `mails`, `web/src/Questions.tsx`, tests in
  `tests/test_mail.py`): view "Questions" (also the "Bidder questions" button in the band, `&view=questions`).
  Pick questions, the German message is written and can be changed, then "Open in mail program" (draft,
  "Mark as sent") or "Send from …" when `SMTP_*` is set. Each question shows Not asked / Draft / Sent /
  Partly answered / Answered. The client's reply is pasted into the message's card and read by Claude; an
  answer needs a passage that is in the reply word for word. The answer also shows on the finding it
  belongs to (item sheet). Seen in the browser on project D against the Docker API with a live reply read
  (three questions sent, a made-up reply: 1 answered, 1 in part, 1 open, 5 s). Tried on 2026-11-21: a 40-question
  message (15,000+ characters, umlauts, a line starting with a dot) through a real SMTP conversation on a
  loopback socket arrives whole (`tests/test_mail.py`); and "Open in mail program" in Utku's Chrome. There
  `mailto:` is handled by a web mail page (Yandex, not signed in), which replaced the app's tab and lost the
  message; the link now opens in a new tab, so the app stays. Not tried: a mail provider with TLS and login
  (needs an account in `.env`), and a mail program that actually takes the message (Gmail as Chrome's
  handler, Outlook, Apple Mail). A very long message may be cut by some programs; "Copy the text" is the
  way around.
  The English copies of the six projects (`dataset/en`, D-022) were loaded as projects for a while on
  2026-11-21 and taken out again: their rule findings are few (D: 0 against 4, E: 7 against 48), as D-022
  says. Work goes on with the German files.
  "Download for Outlook (.eml)" gives the same message as a file (`GET /api/mails/{id}/message.eml`), for
  messages too long for a link; whether Outlook opens it as a draft ready to send has not been seen on a
  real Outlook (none is set up on the development Mac).
  The file is named after the subject and the day (`Bieterfragen_Bachdurchlass_152516_2026-11-21.eml`).
  In the Docker dev environment the app sends to Mailpit (`mail` in `docker-compose.yml`, read at
  http://localhost:8025; an `SMTP_HOST` in `.env` takes its place): "Send from kalkulation@polier.test" from
  the page arrived there whole (2026-11-21). Mailpit delivers nothing; a real provider is still untried.
  "To" is filled from the file where it names the client's address (`BoQ.client_email`): GAEB XML
  `OWN/Address/Email`; PDF the address in the letterhead of most pages, else the first on a page that is
  not LV (cover, VHB form), not for a bid (the contractor's own paper); GAEB 90 and Excel not read. In the
  dataset every address is an anonymisation token (`[EMAIL_004]`), so there the field stays empty and a
  line says the address is blanked out; with a real address tried on a changed copy of an X83 (API) and in
  the UI with the API's answer replaced. Not tried: a real tender PDF with a real address. Only the opened
  file is read, not its twin in the project (a GAEB file whose PDF print-out has the address).
  Replies from the inbox and what they change (D-040; `src/boq/amendments.py`, table `amendments`): with
  `IMAP_HOST` in `.env` the Questions view has "Check the inbox for replies"; a reply is recognised by the
  `Message-ID` of the message the app sent, else by sender and subject, read like a pasted one, and the
  mailbox is left untouched. From every read reply (pasted or found) the app puts up amendments under the
  question: close the finding, note, new quantity / unit / wording (only if the quoted passage states it),
  risk allowance in percent (the estimator sets the figure). Accept, Change, Reject, Take back. Accepted:
  the finding shows as settled and leaves the counts, the item sheet shows the old quantity struck and the
  new one, the notes and the allowance. Tried 2026-11-21 in Docker on project D with a real Claude call on a
  made-up reply (5 s: one part answer, one quantity change 50 → 36 m³ found and proposed, one not answered)
  and in the browser (accept, allowance refused without a figure, reject, settled finding, counts). With a
  Gmail account in `.env` (app password) Utku sent a message from the app (2026-11-21, after a fix: the
  sending code asked for STARTTLS before greeting the server, so Gmail refused the login; Mailpit takes
  mail without either) and the IMAP login and opening the inbox worked. **Not yet seen: a real reply found
  in a real inbox** — that step ran only against a stand-in in `tests/test_mail.py`. The tests run without
  any mail account (`tests/conftest.py`), so the account in `.env` is never used by them. Not done: the accepted quantity and allowance do not
  reach the prices, the what-if or the risk report yet (that is the bid side, next); settled findings stay
  in the findings list and on the LV map; drafts sent from the user's own mail program have no Message-ID
  on record, so their replies are matched by sender and subject only.
  The bid (D-041; `src/boq/bid.py`, table `bid_prices`, `web/src/Bid.tsx`, `tests/test_bid.py`): view
  "Bid" on every LV. One row per item: quantity (with the client's corrected one beside it), the price
  suggested from past bids, the unit price typed in (German or plain decimals, saved on leaving the field),
  the accepted allowance, the price that goes into the bid and the total; net total and what part of it
  is allowance on top; "Take the n suggested prices" fills the empty items; "Download the bid (X84)" for a
  GAEB XML file kept in a project, "Download as sheet (CSV)" for every LV. Tried 2026-11-21 in the browser
  on project D (price typed, wrong input refused with the reason, suggestion taken, X84 downloaded and
  read back: phase 84, 50 items, the two prices). Known limits: project D gets one suggestion out of 50
  items (the history is thin); the X84 is not validated against the GAEB schema or opened in a GAEB
  program; an incomplete bid can be downloaded (the view says how many items lack a price); no overheads
  or surcharges on the whole bid; the risk report still reads prices from priced files
  only, not from the bid in progress (the what-if does since 2026-11-21, see What-if below).
  Since then (2026-11-21, late): a real reply was found in a real Gmail inbox and read. It showed a bug —
  one reply was read into all three messages that shared subject and address — fixed: a reply belongs to
  the message it names, else to the newest earlier message without a Message-ID on record
  (`mail.answered_by`, test). The changes of one answer are now one decision under the question (note,
  changed value, optional allowance in percent — empty means none; one Accept, one Reject, Take back), and
  a question whose answer is decided is marked "Closed" with its text struck through. Every message card
  can be deleted (a sent or answered one asks twice; its reply and decisions go with it, the API no
  longer refuses). Checked in the browser on project D with Utku's real messages, read-only.
  Next on the same table: price inquiries to suppliers as a second kind of mail.
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
  returns new total, per-section and per-item differences. The files carry no
  labour / material split, so a change applies to the whole unit price, and the view says so.
  Since 2026-11-21 the total that is varied is the bid as it stands (`bid.sheet`): the unit prices entered in
  the Bid view with the accepted allowances in them, on an LV without prices too; a bid or award file still
  uses its own prices. The view says how many items have no price yet (they count as nothing) and links to
  the bid; the quantities the client corrected in its answers are listed with what each would move, and one
  tick counts with them (the bid itself keeps the file's quantities, D-040). Tried in the browser on project
  D with 35 of 50 items priced, one allowance and two corrected quantities (one on an unpriced item), and on
  E with no price at all; `tests/test_whatif.py`. Not done: a scenario is not kept, no P50 / P80 range here (the Bid view has one, `risk.py`, D-045), and
  the risk report still reads prices from priced files only.
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
  files are kept as a project and can be renamed in the band. Deep link `?project=A&file=2` (since D-034: `/projects/A/files/2`).
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
  documents", which reads oddly when the answer is "no LV contains this". (The list of projects has a chat since D-036.)

- Database and deploy (2026-11-21, D-026, `docs/08-deploy.md`): projects, documents (file bytes), analyses and
  the LLM cache in one database (`src/boq/db.py`; Postgres via `DATABASE_URL`, SQLite `data/boq.db` locally).
  Dataset projects seeded by `uv run boq-seed`, then ordinary: files can be added to and removed from any
  project, projects deleted (two-click Delete on the projects page; file removal is API only:
  `DELETE /api/catalog/{id}/files/{index}`). Analyses and AI findings survive a restart. `Dockerfile` (one image,
  React build inside), `BOQ_PASSWORD` basic auth, `GET /api/health`. Checked: 111 tests; the image against a
  Postgres 17 container (seed, upload, restart keeps the project, 401 without password); server memory peaks
  at about 170 MB with project F opened. `docker compose up` is the whole dev environment (Postgres, API with
  auto-reload, Vite with hot reload; both reloads checked in the containers), `--profile prod` the production
  image on :8080 (password `demo`); an AI review on project D was cached in Postgres and answered from
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
  headless Chrome: a PDF bid moved to Award). Not built: ZIP / folders. Untested on tenders outside the dataset: the header labels are the ones these six projects use.

- Home page rebuilt (2026-11-21, D-029): a schedule of the running tenders on top (dates only, set in place),
  a board of all tenders by stage under it (strip, counts, open items, files, net), new project in a modal
  dialog, barrier-tape opening (since changed: the tapes cross on diagonals, bottom corner to opposite top
  corner, and the yellow rolls up as a roller shutter that stops as the band, the name large on the yellow until then, stripes on it from the
  start; looked at as stills in headless Chrome, where the end state is pixel-identical to the band, the
  motion itself not watched). Backend: `projects.plan` (stage, due, questions_due, sent, binding_until),
  `PATCH /api/catalog/{id}` takes them, `POST /api/projects` takes `due` and `questions_due`, the summary
  carries `questions` and `priced` per document. Styles in `web/src/home.css`. Checked through a script in
  headless Chrome at 1440 wide against a seeded SQLite database (opening, schedule, board, dialog with one
  real X83 read). Not checked: a person clicking through, creating a project from the dialog end to end in
  a browser, widths under 1180px, the Docker Postgres picking up the new column.
  Revised (2026-11-21): the band has a thin hazard stripe along its top and its lower edge; the schedule runs
  the full window width straight under the band, opens on every load without the tape wipe, and closes with
  the arrow by its title; two labels of a row less than eight days apart open to opposite sides. The board is
  headed "Projects" with the New project button. Checked in headless Chrome at 1920 wide.
  Revised again (2026-11-21): the schedule is switched from a "Schedule" button at the top right of the band
  (count of running tenders, ink while open), hidden while there is no project, opened again whenever a
  project is added; it drops out of the band with a short slide. Cards no longer list the stop / question /
  caution counts (the strip above already shows them). Type-checked and built; not looked at in a browser.

- Name and mascot (D-030): the app is **Polier**; a 3D head in a hard hat (`web/src/Mascot.tsx`) living in the
  bottom-right corner of every page (follows the pointer, glances around at rest, leans in, hops on click,
  bounces on a file drag; every 30 to 70 seconds it turns three quarters away (cheeks to one side, face free), shows two big round cheeks and bounces them up
  and down together (long on the way up, piled flat at the bottom) while looking back over its shoulder (lids half down, a blush, one wink), about 4.6 s, also on the event `polier` with detail `moon` and when "popo" is typed anywhere on the page; a strip, as a pole dance at full size (the free mascot's canvas is three times its box, up
  and to the left, so it can leave its corner: a scaffold tube drops in, two round hands in yellow gloves appear for the strip only, it holds on and sways, swings round it
  twice with an arm out (turning with the swing, so its back and cheeks show on every turn), climbs hand over hand, tips upside down and spirals down, bounces its cheeks against
  the tube with two slaps, blows a kiss with hearts, tips the hat; about 12 s); a split (back to you, the two hands take hold of the cheeks, squeeze and pull
  them apart sideways at their own height (still together at the top and the bottom, a gap between), an "x" between them, they snap shut and wobble; about 4.7 s) on the event detail `split` or when
  "split" is typed only on the event detail `strip` or when
  "strip" is typed; seen in
  headless Chrome on the dev stack 2026-11-21), since D-036 the way into the chat; app icon and band logo: a hard hat in profile. Checked by driving the pointer
  with puppeteer in Chrome at 1440 wide on the dev stack (follow, near, over, idle glances, hop all seen).
  Not checked: a person using it, the file-drag bounce, the
  production build, the PDF view's "Drawn by LV Check" and the auth realm still carry the old name.
  Drawn 1.2 times larger since 2026-11-21 (134px box, was 112).

- Mascot, cheeks (2026-11-21): not two spheres set on the body but the body's own surface pushed out to where
  two balls would stand (`shapeCheeks` in `Mascot.tsx`, each frame while it has its back to you; about 0.5 ms,
  measured in the page). Round and large, the outer rim runs into the body in a soft curve without a line, the
  only line is the cleft. In the split they are pulled sideways at their own height and slope down to the bare
  body between them (an almond-shaped valley with the "x"), still together at the top and the bottom. Seen in
  headless Chrome frames for the turn-around and the split; the pole dance not shot again since. Headless
  Chrome (software GL) draws the finer body slowly; not looked at on a real GPU.

- Sideways overflow (2026-11-21): what slides into the band or the page from the side widened the page for a
  moment (28px, a horizontal scrollbar at the bottom); `.app` now has `overflow-x: clip`. Measured per frame in
  headless Chrome at 1440 wide: 28px before, 0 after, on the projects page, into a project and back.

- Polier answers (2026-11-21, D-036; `web/src/Agent.tsx`, `POST /api/catalog/chat`, `chat.overview_answer`):
  a click on the head opens a chat panel above it (Esc or × closes it). In a project or an LV: that
  project's conversation; the "Ask the project" tab of the right pane is gone (LV workspace and project
  overview), Polier is the only place to ask. On the list of projects: all projects at
  once, answered from their overview lines (stage, dates, files, rule findings, net totals), each answer
  citing project and line, a click opens the project; or one project picked in the panel. Conversations are
  kept in the browser as before. Polier bounces on a question and hops on the answer.
  Live in Chrome through a script at 1440 wide on the Docker stack: project D picked on the list, a question
  answered in 9 s, its passage opened the LV with the quote marked on the PDF and the panel still open;
  four questions about all projects (most stops, priced bids and totals in Turkish, next deadline, roof
  drains) in 4–7 s and 0.03–0.04 USD each, figures as on the cards, the roof-drain one sent to project F;
  a cited line opened D and F; the conversation was there again after a reload. `tests/test_chat.py` (+3).
  Not checked: a person clicking through, widths under 500px, the production build in a browser, a
  catalogue of many projects (the overview is sent whole: about 5k tokens for the six).

- New-project dialog (2026-11-21): files can be added to the ones waiting (button or drop; the same file is
  not taken twice) and taken out again; name, dates and corrected steps stay while the set is read again; a
  drop without any LV keeps the dialog open and says why. Walked through in headless Chrome by script on an
  empty database: open dialog, one X83, add its PDF, add a priced PDF and a .docx, remove both, create with
  name and deadline, project opens with both versions, card and schedule row show name and date, PDFs alone
  (bid by heading, bid guessed, tender), add files from a card, a .docx alone. Not checked: real drag and
  drop with the mouse, a person clicking through.
  Many files: the file list scrolls under its heading, the fields scroll on their own, header and footer stay
  (same for project settings; under 1180 px wide the body scrolls as one column). Checked only on a mock
  dialog with these layout rules and 40 rows in Chrome, not in the running app.
  The dialog was taller than the screen from 1700 px wide: `body` is zoomed there and `100vh` is not, so
  its `max-height` came out 1.15 to 1.4 times the viewport. `body` now carries `--zoom` beside `zoom`
  (styles.css) and the dialog divides its vh/vw lengths by it. Anything else sized in vh/vw inside the
  zoomed body needs the same.
  While files are read the rows are ghosts (name only, pale) and the footer's edge carries the running tape,
  as it does while the project is kept. "Reduce motion" is no longer read anywhere (D-038). Type-checked,
  not looked at in a browser.

- Own form controls (2026-11-21): `web/src/controls.tsx` (`Select`, `DateField`) replace every native
  `<select>` and `type="date"` (stage and step on a card, "Goes into" and both dates in the new-project
  dialog, schedule dates, findings category, what-if); checkbox, number and search fields restyled in
  `controls.css`. Panels use the Popover API (top layer, so no clipping and usable inside the modal dialog)
  and correct for `body { zoom }`. Described in `DESIGN.md` ("Select and date field"). Checked in headless
  Chrome by script: schedule calendar (open, arrow keys, PageDown, Esc returns focus), stage and step
  selects, category select by keyboard, panel placement at 1800px (zoomed, flips above). Not checked: the
  controls inside the new-project dialog with files loaded, what-if selects, Safari/Firefox, touch.

- Dates read from the files (2026-11-21, D-031): `src/boq/dates.py` reads every file as text (PDF with
  positions, GAEB XML, GAEB 90, .docx, .xlsx, .txt; also files that are no LV) and keeps a date only when a
  label says what it is: tender sent, questions until, submission, bid opening, binding until, work starts,
  work done by. Each with file, place, label and line. In the dataset: A (VHB 211 and 214 in the package:
  27.03.2024 14:30, binding 29.04.2024, work 13.05.2024 to 30.04.2025), E (GAEB cover text: 21.07.2025
  10:30, award period 22.08.2025, done by end of June 2026), B and D (execution dates only), C and F none.
  No file in the dataset states a question deadline; that pattern is tested on made-up lines only.
  German and English labels: the English reading copies in `dataset/en/` give the same 13 dates.
  `POST /api/intake` returns `dates` and `plan`; the new-project dialog fills submission and questions from
  it with the quoted source; `POST /api/projects` keeps them (and the binding period) when none is sent, and
  files added to a project fill only the dates it lacks; the project summary (v3) carries `dates`, shown on
  the card with "Use these" for the schedule. `tests/test_dates.py` (9). Walked through in headless Chrome
  at 1440 wide on a seeded SQLite database: cards of A, B, D, E, "Use these" on E, dialog with E's X83.
  Not checked: a person clicking through, narrow widths, a real cover letter (only a made-up .docx).
  Not read: contract milestones (B: "Dokumentation BA01 bis 30.10.2023"), calendar weeks, scanned PDFs,
  a label and its date on two lines of running text in GAEB 90. A date cleared in the dialog comes back
  from the files on create; it is taken out on the schedule.
  Revised (2026-11-21): the dialog has one date field per date a tender is planned by (questions until,
  submission, bid opening, binding until, work starts, work done by), each filled from the files once they
  are read and re-filled when files are added, with the quoted source under it; a day the user set stays.
  "Tender sent" is shown as a fact. The fields are there when files are added to a project too (its own
  dates first; a different day in the added files is named under the field). The plan keeps `opening`,
  `exec_start`, `exec_end`; `POST /api/projects` takes `dates` (JSON, "" takes a day out, which replaces
  the caveat above). The card lists the project's dates: read ones with their file, hand-set ones as such,
  a read day the project does not use as "not used". Walked through in headless Chrome at 1440 wide with
  A's English copies: X83 alone (six empty fields), plus the package PDF (five filled), create (plan kept).
  Not seen in a browser: the fields when adding to a project, a hand-set date on a card, narrow widths.
  Revised again (2026-11-21): dates are no longer set on the schedule or taken over on the card. The card
  has only a "Dates" button: it opens the schedule, moves it to that tender's dates (awarded ones shown
  while asked for) and lists them under its row with their source. The schedule moves by two weeks
  (arrows, "Today"); a date outside the eight weeks is a button that goes there. Rows use the project's
  dates, else the ones its files state without doubt. The band's switch is a signboard: running count on
  an ink plate, and the next date due. Builds; not seen in a browser (extension was not connected).
  The schedule has no heading line any more (only the arrows and the range) and slides open and shut
  (height 0fr→1fr, 320 ms); it stays mounted, inert while shut, so its position is kept.
  Each row now draws every date the tender has (questions, submission, bid opening when it is another
  day, sent, binding until, work start and end with the work as a yellow bar); a label that would run
  into another goes a line lower and the row grows. At each edge one pointer to the nearest date outside
  the eight weeks ("+n" for more).
  The schedule shows 8 weeks, 6 months (the default) or 1 year, switched beside the arrows on one line; a quarter of the
  span lies before today and the arrows move a quarter. 8 weeks is read by calendar week with weekends
  shaded, the longer spans by month (January lines darker). Not seen in a browser.
  Rebuilt (2026-11-21, D-032): the axis has two scales instead of the three zooms: eight weeks by the day,
  a hatched break, thirteen months by the month; the arrows move it by four weeks. Rows are 68px and do not
  grow: the days left to the next date as a large figure beside the name, time left as the ink bar, time
  gone as a thin grey line, one-line date labels (the mark says what the date is, legend under the rows).
  Above the rows one line of all tenders: deadlines as plates (same day: stacked, "2 submissions"), work
  as thin bars. Five options were compared first on a throwaway page (not in the repo). Seen in headless
  Chrome at 1440 and 1100 wide with a made-up catalogue of seven tenders and with the database's one
  project (pointer to its 2024 dates, "Dates" opened). Not checked: a person clicking through, under 900px.
  Then (same day): the schedule opens at this week only while a running tender has a date on the axis;
  else at the dates of the tender nearest to today (the database's project: March 2024), until the user moves
  it. The year stands above the weeks, where the axis begins and where a year begins. The "Dates" list under
  a row shows label and day only; the source (file, page, words) is on hover.
- **The gate** (2026-11-21, D-033): opening an LV or a project no longer pops in under two tapes. The
  band is the shutter, as in the opening: it is let down from under the band (`Gate` in
  `web/src/Loading.tsx`, styles under "the gate" in `styles.css`), says what is being opened with the LV strip and counts the projects page already has, the
  page changes behind it, and it rolls up into the band while band lettering, map rows and findings pane set themselves up.
  Going back uses the same shutter, bare. In `App.tsx`: `run` / `runProject` take a third argument `through`
  (a `GateInfo`) for a change of page; without it the old tapes are used (version switch, chat citation);
  `leave(swap)` is the way back. A deep link starts with the shutter down.
  Seen in headless Chrome at 1440x900, frame by frame, with "reduce motion" on, on a GAEB file (0.2 s) and
  back. Not seen: a slow PDF (3 s), a trades project, a failed open, a deep link.

- Addresses and pagination (2026-11-21, D-034): `web/src/router.ts` gives every page a URL (`/projects/A/files/1/table?item=5.1.46&page=2`,
  `/projects/F`, `/projects/F/lv/<analysis>`, `/samples/<path>`); `App.tsx` writes the address from its state
  and reads it on load and on Back / Forward, through the shutter of D-033. Old `?project=` / `?sample=` links
  are rewritten. Item table 50 per page, findings list 20 per page (`Pager.tsx`). The production API answers
  page addresses with `index.html` (test in `tests/test_api.py`). Checked in headless Chrome at 1440×900 against
  a scratch database with the six dataset projects: click into C, table, page 2, a row, Back ×4 to the projects
  page, Forward, findings page 2, another version and Back, reload on a table + item address, an old-style
  link, an unknown project, a sample, a building's LV by address, "Back to project", Back / Forward between
  the building and its LV; no console error. Not checked: the production image (only the unit test), a person
  clicking through, Safari.

- **LV page, band** (2026-11-21, on the user's word): no brand on an open LV or project; at the left a back
  button (one step up: "Project" for an LV opened from a building, else "Projects"), then the name alone in
  the display face (no file line under it; the file name is its tooltip), at the right only the actions (Risk report, Bidder questions). "All
  projects" and "Back to project" are gone from the actions. Seen in headless Chrome at 1440 and 900 wide
  on a versions project; the project view and an LV inside a building not seen.

- **Project settings** (2026-11-21, on the user's word): a "Settings" button at the right of the band of an
  open LV or project opens a dialog (`web/src/Settings.tsx`, the new-project dialog's sign): the name, the
  stage, every date of the tender (the six planned ones and "Bid sent"; under each whether it was set here
  or read from the files, and from where), the files with their step, "Remove" per file (two clicks; not
  the only file), "Add files" (leaves for the projects page and its add-files dialog), "Delete project"
  (two clicks; the page closes behind the shutter). Every change is kept at once, through the endpoints the
  projects page already used; new on the client only `removeProjectFile` (`DELETE /api/catalog/{id}/files/{n}`).
  The open page follows: a removed open version reopens another, the band and versions bar take the new
  name and steps. A date the files state cannot be taken out, only overruled: cleared, the field shows the
  files' day again. Tried in headless Chrome on a throwaway project of two files: rename, step, remove the
  open file, delete. Not tried: setting and clearing a date in the dialog, a building of trade LVs, "Add files".

- **Cards without their file list** (2026-11-21, on the user's word): the "n files" fold on a card of the
  projects page is gone (files with their step, "Add files", "Delete"). All of it is in the project's
  settings now; a single file of a project is opened from the versions bar of its LV page. Dropping files
  onto a card still adds them.

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
