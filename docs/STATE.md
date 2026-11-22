# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-21 (hackathon day 2, PDF view and chat merged with the database and deploy work)

## Now

Upload → parse → rule findings → table works end to end for GAEB files: Python package `src/boq` (parsers, model,
rule checks, missing-item check, CLI, FastAPI) and a React screen in `web/`. GAEB XML, GAEB 90 and PDF are
parsed, the LLM checks run against the Claude API, and the findings can be exported as a risk report and a
list of bidder questions. Excel LVs are imported, unit prices are suggested from the three priced bids (with
very low coverage, see below), and a what-if view varies the total of the bid in progress (or of a priced file).

## Started

- The board's columns are Intake, Tender, Bid, Award (2026-11-22, D-074, replacing D-067; `COLUMNS` and
  `STAGE_LABEL` in `Projects.tsx`): Intake holds what waits for the go (the checks are done there), Tender what was taken on (stage
  "pricing"; "check" is no stage to choose any more and is read as "pricing"), Bid what is with the
  client, Award what ended. Nothing migrated on the server.
  Checked: type-check. Not checked: the board in a browser.

- The way from a mail to the first results, checked end to end (2026-11-22, before "Take it on"): a new
  tender (made up for it: SWN-K-2026-077 Regenwasserkanal Ahornring, 15 items, X83 and print-out, with
  planted faults; `data/processed/e2e/`, git-ignored) was sent by SMTP from the client's mailbox to
  kalkulation@polier.test and nothing was pressed.
  What happened: the server's own sweep found it 128 s after it was sent (it looks every 180 s); Claude
  read the mail (restricted VOB/A tender, fits the firm's work, with the reason); the project stood in the
  intake with number, name, client, five dates (all as the files state them), the day both files came;
  the run started by itself ("tender arrived") and was done in 35 s for 0.15 USD: read, rules, AI review
  on the X83, questions and prices held "after the tender is taken on". Found: the item without a
  quantity, both risk wordings, both quantities the print-out states differently, and from the AI nine
  more, among them the leak test in m2 (planted) and the disposal "whatever the class" (planted).
  Two faults found by it and put right: (1) Polier's note said "3 stops" where the page and the card said
  5: the two differences between the documents were no part of the run. They are counted at the compare
  station now (the row of the print-out: "held against the other document of this LV: 2 quantities or
  units differ"), so the station is "done" and not "skipped" where an LV came in two documents; run,
  summary, card, rail and note say the same. (2) Such a difference stood twice beside its item, as a
  finding and as "The documents differ here": once now.
  Checked after the fix: full pytest 225 passed; the tender run again (0.00 USD, from the cache): 5 stops,
  9 cautions in the run and in the note; the page in Chrome (five steps, four locked, "Take it on" /
  "Pass", 16 cards, the cover's dates and strip).
  Not checked: the board's card of it and Polier's radio call in a browser; a tender whose mail carries
  no LV, one that is not the firm's trade, a second mail for the same tender (tested before, D-058).
  The test project (4a9790b326d6) and its mail are still there.

- Five improvements to the new steps (2026-11-22; `Questions.tsx`, `Tender.tsx`, `TenderDoc.tsx`, `App.tsx`,
  `api.py`): (1) the questions' cover page lists every question on one line (tick for the next message,
  item number that leads to the item, status), above the message; (2) "No message has gone out yet." where
  the inbox line said every message had its reply; (3) a price card of an item in a package says whether
  the inquiry went out, to whom and when, or who is to be asked, and counts as "to look at" while unsent;
  the count is named "In an inquiry, no price yet"; (4) the price cards are read again every 8 s, so what
  is done in the inquiries on the cover page shows beside the items; an item pressed in the inquiries
  stays in the Prices step; (5) the summary counts what two documents of an LV state differently, as the
  opened LV does (summaries worked out again, v 6): T1's card, rail and page all say 4 stops.
  Checked: type-check, build, pytest on catalog, tender, runs. In Chrome on T1: 18 lines in the list, a
  tick taken out (the message says 17 questions, the card's box follows) and put back, a number pressed
  (the page goes to 3.1.40 and stays in the step); 37 price cards "In a package, not sent yet" with
  package and firms, 3 waiting for the client, 4 from past bids; the rail's "4 stops".
  Not checked: the 8 s reading after something sent, a card of an inquiry that is out.

- Questions and Prices on the tender's document (2026-11-22, D-068; `TenderDoc.tsx` (`StepLayer`),
  `Questions.tsx` (`layout`), `Tender.tsx` (`pricesLayer`), `router.ts`, `tenderdoc.css`): both steps are
  the same page as the Tender step, with their own cover page, cards and marks. Front end only.
  T1 Birkenweg was taken on for it (stage set to Check, a fresh run started by hand on issue 2: 17
  questions drafted, 10 inquiry packages planned, 0.42 USD).
  Checked: type-check, build. In Chrome on the dev stack: Questions on WVG-N-2644 (one question: the
  message as the cover page, a "?" in the strip, the card beside 3.2.30) and on T1 (18 cards, 18 marks,
  "1 of 18 to look at"); Prices on both (T1: the six counts, the inquiries with their packages on the
  cover page, 44 cards and 44 marks, a press on a mark leading to its item).
  Not checked: sending a message, ticking a question off, a reply and the changes to decide on a card;
  anything pressed inside the inquiries on the cover page (their width there is 711px, nothing ran out
  of it on T1); a tender of several LVs; under 1280px; the full pytest (no backend change).
  Known: an item of a planned package that was not sent yet says "Asked, no answer yet" on its card, as
  the counts did before; such a card does not name the firm. After something is done inside the
  inquiries the cards beside the items are those of before until the step is opened again.

- The board in four columns (2026-11-22, D-067; `Projects.tsx`, `home.css`): Intake and Check are one
  column Tender; a tender still to be taken on stands first in it with its two buttons. Type-check clean,
  not looked at in the browser. On the tender document the same day (`TenderDoc.tsx`, `tenderdoc.css`, the
  blocks at the end of the file): the map on tint without a border, room at both edges (`--td-gut`), the
  LV head as a black slab and the section head as a grey band, "x of N to look at" with back and on.
- Cover sheet graphs, the map as one column, and the checks on the right issue (2026-11-22; `TenderDoc.tsx`,
  `tenderdoc.css`, `tender.carriers`, `runs.py`, `api.py`, `catalog.py`):
  **A fault put right:** a run read, and the summary counted, the first file of an LV, also when the client
  had replaced it. T1's AI review ran on issue 1 while the page shows issue 2. Both go by the file that
  carries the LV now (`tender.carriers`, the pick `tender.view` makes); kept summaries are worked out
  again (v 5). **T1's issue 2 has no AI review yet: it needs a run** (nothing on the page starts one
  while the last run is "done").
  **Cover sheet:** "What came when" (a lane: a mark per day files arrived, today, questions until, bid due;
  the day each file came by mail is kept in `plan.arrivals`, else the day it was put in; set by hand for
  T1 from its two mails, 18.11. and 21.11.) and "Where the findings are" (per section, or per LV of a
  building: the fingerprint strip of the project cards, as long as its share of the items, with counts).
  Dates and arrivals are one block, "Dates" (Atahan: two blocks for it were absurd): the lane, and under
  it the same days in a row in the order of time (the tender came, issue 2 came, questions until,
  submission, binding, work starts), the next one due on yellow; "Change the dates" in its head.
  **Map:** one column at the left with every piece at once; the part being read is held in the middle,
  what was read stands dimmed above, what comes below; it moves at the pace of the text. The 42px index
  and the pieces beside each section are gone.
  Checked: type-check, build, pytest on runs, tender, catalog, inbox (the whole suite passed before the
  map change, which is front end only). In Chrome on T1: the cover with both graphs, the counts now
  issue 2's (10 cautions, 2 notes), the map with "Kanalbau" in the middle drifting up 0, 36, 70 px as the
  reading goes through the section, four pieces dimmed above.
  Not checked: a tender of several LVs (the map with LV rows, the strips per LV), a tender without dates
  or with one arrival, under 1280px.
  Known: the page shows one stop the header does not count (a quantity the two documents state
  differently: it is added when the LV is opened and is not in the summary).

- One bar on the tender page (2026-11-22, Atahan: "can you not put these into one bar"; `Tender.tsx`,
  `tender.css`, `App.tsx`, `runs._stages`): the pipeline strip is off the page. What Polier is doing is
  said in the cell of the step it belongs to (read, rules, AI review, compare: Tender; questions; prices),
  with the barrier tape running along the cell's foot. At the end of the rail, only when they apply:
  "Run the checks" (no run yet, or the last one stopped), "Stop" (a run is going), "Close the questions"
  (in the Questions step while the run waits for them), then "Take it on" / "Pass". A held station says
  why ("after the tender is taken on").
  Checked: type-check, build, `tests/test_runs.py`; seen in Chrome on T1 after its run: one bar, the
  Tender cell with "4 stops · 14 cautions · 6 notes". Not seen: a run going (the tape, the line that
  changes, "Stop"), "Run the checks", "Close the questions": a run asks Claude, none was started.
  Gone from this page with the strip: the panel of a station with its steps, "Record" (the Pipeline page
  has the record), "retry" of failed steps (now: "Run the checks again", a whole new run), a station
  filtering the findings. `PipelineStrip` in `Runs.tsx` is no longer used.

- Cover sheet as the first page of the document (2026-11-22, Atahan: not a panel that opens above, a
  page as in a PDF; `TenderDoc.tsx`, `tenderdoc.css`): the line "About this tender" and the cover that
  opened under it are gone. The document begins with a page that names the tender, the client and the
  counts, then Dates, How it came (the mail, Polier's read), What came (the files, replaced ones struck
  through), The bid goes back as. "n to look at · next" stands at the top right over the card column.
  Item quantities say "PDF page n" where "p. n" stood.
  Checked: type-check, build; seen in Chrome on the dev stack on T1. Not checked: a tender without a
  mail, one with more than eight documents, under 1280px (one column).

- The first step has one view (2026-11-22, Atahan: "what is needed is to stand in one view"): no switch,
  no Items, Pages or Between LVs in the Tender step; their addresses open the document. A finding about
  the whole LV is a card beside the LV's head; "Details" is gone from the finding cards (it led to the
  item table). A passage of Polier's answer opens the document on its item, not the pages.
  Checked: type-check, build; in Chrome on the dev stack `/projects/…/items` opens the document, no
  switch, five steps. Not on the document, so nowhere at the moment: the PDF pages with the findings
  marked on them, the trade diagram and the findings between the LVs of a building, the finding
  pictures, search and filter over the items, "Run AI review" (the pipeline strip's "Run" starts a run).
  Their code is still there (`PdfView.tsx`, `ProjectView.tsx`, the item table in `Tender.tsx`).

- Tender and Check one step, checks on arrival (2026-11-22, D-065; `runs.py` (`taken_on`, the held
  stations), `api.py`, `router.ts`, `App.tsx`, `Tender.tsx`, `TenderDoc.tsx`): a new tender's run starts
  at once (read, rules, AI review, compare); questions and prices are held until "Take it on", which lets
  the same run go on. Five steps on the tender page; the first is the document with the findings as cards
  beside the items and severity colours on the strips.
  Checked: full pytest 225 passed (new: an intake tender's run does every check, holds questions and
  prices, and goes on as the same run once taken on; the three tests of the old rule changed), type-check,
  `npm run build`. In Chrome on the dev stack: T1 in the intake with five steps, "1 stop · 2 cautions ·
  1 note" on the first, four finding cards of the rules beside their items, a press on a red mark in a
  strip leading to its item.
  Not checked: a tender arriving on the dev stack and its run starting by itself, and "Take it on" letting
  it go on (both would ask Claude; the tests do it with a stand-in for the review); AI findings as cards
  (the tenders in the dev database stood unchecked in the intake and have no run: "Run" in the strip, or
  taking one on, gives them one); "Details"; a tender of several LVs ("Show them beside the items");
  the board's intake card with its strip; the Pipeline page with held stations.
  Known: an item with several findings and a change has a long column of cards, and the cards of the
  items after it stand lower than their rows. Findings about the whole LV (no item) are not on the
  document; they are in the findings list of the Items view. The map and read views of the Check step
  are no longer reachable (their code is still in `Tender.tsx`).

- Tender step as one document (2026-11-22, D-064; `web/src/TenderDoc.tsx`, `tenderdoc.css`, `Tender.tsx`,
  `router.ts`): what came, then every LV with remarks and items on one page; the piece of the map at the
  left of its section, the card of an item at its right, both scrolling with the text; a 42px index and
  the line "About this tender" stay. It replaces Map and Read in the Tender step (intake included);
  Items and Pages are as before. Front end only.
  Checked: type-check, `npm run build`. In Chrome on the dev stack, window about 2040 wide (body zoom
  1.15), no console error: T1 Birkenweg in the intake (issue 2 of 2: 4 documents, 13 cards, 2 to look at),
  `?item=4.2.50` opening on that item with its card, by script a press on the index, on a mark in a strip,
  "next" twice, the line opened (cover sheet in three columns), no card over another; a one-LV project
  that is past the intake; Document → Items → Document.
  Not checked: a tender of several LVs (none is in the dev database: the cards "No LV n came" and "No GAEB
  file for n LVs", the index of LV numbers and `?lv=` are unseen in the app, seen only in the mock-up);
  "Ask the client" pressed on a card; "Set the dates" from a card; under 1280px and under 900px; the full
  pytest (no backend change).
  Known: Polier's mascot stands over the lower right corner of the card column. A link that names an item
  of the Tender step (`?item=`) scrolls there; a press on an item in the text does nothing, since its
  card is always open. The Check, Prices and Bid steps still have their three columns.

- Intake page: research and mock-ups, nothing built (2026-11-22; `playground/intake/`, untracked;
  `cd playground/intake && python3 -m http.server 5302 --bind 127.0.0.1`): what the estimator wants to see
  while a tender is in the intake (one LV in several formats, several LVs, a new Stand arriving meanwhile).
  Research tab (Turkish, sources marked read / search excerpt / not found) and four designs on three
  scenarios with real data (T1 Birkenweg from the dev API, the 27 LVs of project F): A register (row per
  LV, column per format, Stand), B by arrival, C only what needs a decision, D recommended (A's table,
  C's list, B's time as one lane). Waiting for Atahan's choice. Seen in headless Chrome at 1500 wide;
  the buttons were not clicked.
  **E, Atahan's idea, added the same day** (`doc.js`, `data-t1.js`, `data-f.js`): the whole tender as one
  document: map at the left (LVs, the open LV's sections, passed ones dimmed, follows the scroll), the
  text in the middle (the client's mails, then per LV the remarks and the items, notes in the margin),
  the open item or point at the right (the list "for you to look at" while nothing is open). Cover, dates,
  lane and the register of D fold away under a one-line bar "About this tender". Seen in headless Chrome
  at 1500 wide on T1 with Stand 2 and on the 27 LVs (1.076 items): the top, a jump to an item, a point
  with its passage, the map following. Not checked: a hand on the mouse, the 240 ms jump (the pictures
  were taken with the jump made at once), the bar opened, under 1280px.
  **E changed at Atahan's word (same day): nothing beside the text is a panel.** The piece of the map for
  a section stands at the left of that section (it holds at the top while its section is read and leaves
  with it), the card of an item or of a marked passage hangs at the right of it and scrolls with it;
  cards do not push the text apart (`settle` moves one down that would run into the one above). What
  stays put: a 42px index at the far left (LV numbers, or section numbers for one LV) to jump with, and
  "n to look at · next" in the step rail. Seen in headless Chrome at 1500 wide: the mails with their
  three cards, a jump to a reworded item, LV 13 of the 27. Not checked: by hand, "next", a card taken
  and taken back, the bar opened, under 1280px.

- New projects into the intake (2026-11-22, D-063; `POST /api/projects` in `api.py`, texts in `Projects.tsx`):
  a project made in the new-project dialog (or by dropping files) stands in the Intake column, read and not
  checked, until "Take it on"; no run starts by itself. Checked: `tests/test_runs.py` (no run on creation,
  "taken on" starts it), 224 tests pass, type-check; a throwaway project on the dev server had stage intake,
  `checked: false`, no run. Not seen in a browser.

- Models and effort per task (2026-11-22, D-062; `src/boq/engines.py`, `GET/PUT /api/models`, block "Models" in
  `Runs.tsx`): which Claude model does which of nine tasks and at which effort, chosen on the Pipeline page, now called "Engine
  room" in the band. Checked against the running API: choose, read back at request time, a wrong model
  refused, back to the default. Not seen in a browser yet; no request was sent on Fable or Haiku.

- Polier's chat (2026-11-22, D-066, replaces the look of D-060; `Agent.tsx`, `Chat.tsx`, `chat.css`, the
  `.agent-*` rules of `styles.css`, `says.css`): a poster of its own, chosen by the user after four rounds of
  mockups (`playground/chat-native/`). Polier keeps his corner and his size. Nothing asked: a black slab beside
  him ("Ask me.", three questions, the field). First question: the side panel (460px, tape down its left edge
  that runs while he reads, head with what is asked about, question as numeral and headline, passages as black
  bars, yellow foot). What Polier says by himself is the same slab. Seen in headless Chrome on the projects
  page: the slab, a question answered about all projects with its bars, a kept conversation on the tender page.
  A notice was seen only as its markup put into the page by hand, not as a real event. Not checked: an answer
  inside a project with item passages, "not in the documents", the project list, under 900px wide, the motion
  itself. Open: on the tender page (`/projects/:id`) the panel asks about all projects, not that project
  (`agentHere` is empty there; so before this change).

- Tender page (2026-11-22, D-050; `src/boq/tender.py`, `GET /api/catalog/{id}/tender`, `web/src/Tender.tsx`,
  `tender.css`, routes in `router.ts`): a project opens on its tender, read from all the documents of the
  tender step; views Map, Read, Items; cover sheet; documents drawer; item sheet with where the item
  stands and what another document says differently. The workspace of before is at `/archive/…`, reached
  from the step rail and "Workspace", and has "Tender" in its band.
  Checked: `tests/test_tender.py` (B: X83 + print-out, 248 of 248 items in both, 0 quantities and units,
  24 texts differ; A: X83 and D83 say the same; F: 27 LVs), full pytest 214 passed, type-check and build.
  Seen in headless Chrome at 1500 wide on the dev stack: map, item sheet, read, items, drawer on a one-LV
  project; map and one LV's item table on the 27-LV project; an `/archive` address.
  Not checked: a hand on the mouse; clicking through the step rail, "Workspace" and "Tender" (the
  navigation is typed and built, not clicked); Back and Forward between the tender page and the archive;
  settings changes (file removed, step moved) refreshing the page; widths under 1180px; the projects
  page's cards opening the page (same code path as the address).
  Known: the dev database holds the English copies, where 90 texts of B differ instead of 24 (translation,
  not the client). Pipeline strip, findings and Polier's chat are not on the tender page. A project name
  that begins with its number shows it once, in the name. The mock-ups stay in `playground/tender/`
  (untracked; `python3 -m http.server 5300 --bind 127.0.0.1` there) and can go.

- Check step on the tender page (2026-11-22, D-051; `Tender.tsx`, `tender.css`, `App.tsx` (`checkLv`,
  the `check` handed to `TenderPage`), `router.ts`): `/projects/:id/check[/:view]`. Findings on the
  strips in severity colours, the findings list at the left, the item sheet at the right, findings as
  margin notes with the quoted passage marked in the Read view, a findings column in the item table,
  "Run AI review" in the list. Several LVs: marks and counts per LV from the summary, the LV's own
  findings when it is opened.
  Checked: type-check, build. Seen in headless Chrome at 1500 wide on the dev stack: map with an open
  finding, read view, item table with the sheet, the 27-LV overview and one of its LVs with the run's
  AI findings; clicked by script: Tender → Check → Tender → Check, then Back (the address follows, the
  open item stays).
  Not checked: "Run AI review" pressed from this page (same function as before; costs money); a
  finding without an item picked in the list; the "asked" link from the sheet into the archive's
  Questions view; Forward; widths under 1180px; a project whose summary failed.
  Known: no pipeline strip, no findings between LVs, no trade diagram on this page (under `/archive`).

- Questions step on the tender page (2026-11-22, D-052; `tender.difference_findings`, `asked`,
  `PUT /api/catalog/{id}/tender/ask`, `_document_differences` in `api.py`; `Tender.tsx`, `App.tsx`):
  `/projects/:id/questions`. The questions view of before inside the page; at its left the items the
  documents word differently, each with "Ask"; the same on the item's sheet in the Tender step. Asked,
  the difference is a finding of the LV and a German bidder question in the next message.
  Checked: `tests/test_tender.py` (asked → finding D-TEXT and its question, taken back, unknown item
  refused; another quantity is always a finding, on a made-up pair, since the dataset has none), full
  pytest 216 passed, type-check of these files. Seen in headless Chrome at 1500 wide on the dev stack:
  the step on a one-LV project; "Ask" clicked by script (the question appears in the list and in the
  draft message, the rail counts it), then taken back through the API; one LV of the 27-LV project with
  its 12 questions.
  Not checked: sending a message from this page (the view and its calls are unchanged); "Ask the client"
  on the Tender step's sheet clicked; "Take it out"; an item number in the questions leading into Check;
  the 27-LV overview of this step; widths under 1180px.
  Known: `npm run build` fails at the moment on three unused names in `Partners.tsx` (another session's
  work in progress, not this change). The dev database's English copies give 90 differing wordings on
  project B, where the German files give 24.

- Prices step on the tender page (2026-11-22, D-053; `Tender.tsx` (`pricedOf`, `PriceStrip`), `App.tsx`,
  `router.ts`, `tender.css`): `/projects/:id/prices[/:view]`. Strips by how firm each item's price is,
  a count per source at the left, unit price and where it is from in the item table, a price note in
  the margin of the Read view, the price inquiries as a fourth view. Front end only.
  Checked: type-check of these files; backend untouched. Seen in headless Chrome at 1500 wide on
  project D of the dev stack (50 items: 14 with a quote for this tender, 11 asked, 1 held, 24 without):
  map, item table, read view with "395,52 € material per m · Quote for this tender: …", the inquiries
  view with its six packages; clicked by script: Tender → Prices → Inquiries → Check → Tender, the
  address and the open cell follow.
  Not checked: the item sheet in this step after the last fix (it showed the Tender step's sheet; one
  word changed, not looked at again); a price-book or past-bids price on screen (project D has none:
  those two branches of `pricedOf` are unseen); anything pressed inside the inquiries view from this
  page; several LVs; widths under 1180px.
  Since checked: the item sheet of this step is the one with the price block (seen in the DOM).

- Bid step on the tender page (2026-11-22, D-054; `Tender.tsx`, `App.tsx`, `router.ts`, `tender.css`):
  `/projects/:id/bid[/items]`. Map with priced items as thin ink lines and open ones standing, the net
  total and three counts at the left with X84 and CSV, the bid sheet of before as the second view.
  "To the bid" in the Prices step and in the inquiries lead here. Front end only.
  Checked: type-check of these files. Seen in headless Chrome at 1500 wide on project D of the dev
  stack (9 of 50 priced, 106.665,40 € net, the same figures as the sheet): map and sheet; clicked by
  script: Prices → "To the bid" → "Bid sheet" → Back.
  Not checked: a price typed into the sheet from this page and the map following it; the X84 and CSV
  links pressed; a suggestion taken as it stands on the map (project D has none); several LVs; widths
  under 1180px. The full pytest was not run again after the Questions step (no backend change since).
  Known: `npm run build` still fails on `Partners.tsx` (another session's work in progress).

- Award step on the tender page (2026-11-22, D-055; `tender._award`, `Tender.tsx` (`AwardSheet`),
  `App.tsx`, `router.ts`): `/projects/:id/award[/items]`. With an award file: what it changed against
  the tender and the bid on the map, in the table and on the item's sheet, contract total and bid total
  at the left, the hand-over sheet. Without: the step says so and keeps how the tender ended.
  Checked: `tests/test_tender.py` (B: award on LV 0, bid D84, no price differs, same total; A: 38 items
  added, no bid; D: no award). Seen in headless Chrome at 1500 wide on the dev stack: B's map with the
  dropped item 8.1.3 open, A's item table (197 rows with tendered, awarded, price, total), D without an
  award; clicked by script: "Lost" set and taken back, the rail's cell follows.
  Not checked: the row "Only in the award" on the map and an added item's sheet; a price that differs
  from the bid and a changed quantity (the dataset has neither); "Add the award file"; the hand-over
  link; several LVs; widths under 1180px.
  Known: an award is matched to an LV by item numbers only; its texts are not compared.

- The rest of the archive on the tender page (2026-11-22, D-056; `Tender.tsx`, `App.tsx`, `router.ts`
  (`viewsOf`)): Pages as a view of Tender and Check, What-if as a view of Bid, the pipeline strip under
  the rail in Check, "Between LVs" (trade diagram, findings between LVs) as a view of Check for a tender
  of several LVs. Front end only; the components are the ones of before.
  Checked: type-check of these files. Seen in headless Chrome at 1500 wide on the dev stack: the pages
  in Check with a finding marked and its sheet open (78 pages drawn), the pages in Tender, the what-if
  on project D (9 items, +10 %), the between-LVs view of the 27-LV project (diagram, 18 findings) with
  the pipeline strip of its run above it.
  Not checked: anything clicked in these views from this page (a mark on a page, a trade in the diagram
  leading into its LV, "Run", "Record", a station filtering the list, a what-if change); the views'
  switch clicked (the addresses were opened directly); widths under 1180px.
  Known: in the Check step the rail and the pipeline strip stand one over the other, twelve cells in
  two rows. `/archive` is still there ("Workspace" in the band, single dataset files).

- The workspace of before removed (2026-11-22, D-057; `router.ts`, `App.tsx`, `LvMap.tsx` deleted): no
  `/archive`, no "Workspace"; old addresses lead to the step that replaced them; chat citations, the
  partners page, a new project and the risk report lead into the tender page.
  Checked: type-check and `npm run build` (clean again). By script in headless Chrome on the dev stack:
  `/archive/projects/…/files/2/questions` → the Questions step; `/projects/…/files/12/table?item=6.1.40`
  on the 27-LV project → Check, items, LV 12, that item; the band holds "Risk report" and "Settings";
  "Projects" back to the board (29 cards) and Back to the Check step again; `/samples/…` → the projects
  page.
  Not checked: a passage of Polier's answer clicked (the code path is new: `cite`, `citing`); "Open the
  inquiry" from the partners page; a new project created by upload opening on its tender; files dropped
  while a tender is open; a file removed in the settings; the old `?project=…` form. The full pytest was
  not run (no backend change since the Award step: 217 passed then).
  Known: `ItemsView` and `RemarksView` in `components.tsx` are unused now. A copy of `App.tsx` from
  before this change is not kept in the repository (git has the last commit).
  Next: a walk through all six steps by hand; then the two rows of cells in the Check step.

- Polier says what it did (2026-11-22; `web/src/Says.tsx`, `says.css`, `App.tsx`): a call over the site
  radio at the left of the mascot in place of the notice under the band (first a plain white bubble,
  which Atahan found boring; he chose the radio from three in `playground/says/`, port 5301: ink plate,
  signal bars, what Polier calls out, the sentence letter by letter, the mascot hops, confetti and a
  cheer for an award). Seen in headless Chrome on the dev stack with two events written while the board
  was open: "YOU WON IT!" with its sentence, "1 more", the button and the line at the foot; the test
  events deleted again. Not seen: the confetti and the mascot's moves (a still picture cannot show
  them), the typing, the second call following the first. The page asks `GET /api/events?after=…` every
  6 s; what Polier noted since the page opened is said one at a time, oldest first, in the first person
  ("I found this in your mail: …"), with "Open <project>" where it belongs to one; a bubble goes after
  14 s unless the pointer rests on it; a tender or a run among the news makes the board read its projects
  again. "Check mail" that finds nothing says so in the bubble too. Hidden while the chat is open.
  Also fixed: "Check mail" (`/api/inbox/scan`, which the page also calls every three minutes) and the
  hand-over of .eml files now wait for the same lock as the server's sweep; two looks at once had made
  two projects of each invitation (seen on the fresh database: 17 projects, 7 of them twice; removed).
  Checked: type-check; in headless Chrome on the dev stack one event written while the board was open
  appeared as a bubble about 8 s later with its headline, text and "Open …" (the test event deleted
  again). Not checked: several bubbles in a row, the 14 s, "Open", the bubble during a real sweep, narrow
  widths; the wording after the last change (first-person sentences) not looked at.

- Issues of an LV (2026-11-22, D-058; `tender._issues`, `follow`, `view`; `_files_for_a_project` in
  `api.py`; `catalog.hashes`; `Tender.tsx`): a re-issued LV replaces the one before with its change list,
  the work follows to it, and files that come by mail for a known tender join its project.
  Checked: `tests/test_tender.py` (issues, the change list, no contradiction between issues, the work
  follows once), `tests/test_inbox.py` (a known tender's LV joins its project without the model; the same
  file twice is not kept), full pytest 224 passed, type-check. With the mock tender T1 of the demo mail
  data (`mock/mail/t1_birkenweg.toml`, files made by `mockmail`), on the dev stack as a throwaway intake
  project, deleted again: issue 1 alone shows the 6 planted differences between X83 and print-out (3
  quantities, 3 wordings); with issue 2 added the page shows "Issue 2 of 2", 9 changed or new items and
  1 dropped, exactly what the data states, and no contradiction; seen in headless Chrome: map with a
  changed quantity open, read view with a reworded item.
  Not checked: the work following on a real project with sent questions and quotes (the table move is
  tested on bid prices only); the mailbox branch against the demo mail server (the mails are not in a
  mailbox yet); the cover sheet and the read view after the last two small fixes; several LVs with issues.
  Since (same day): remarks are compared sentence by sentence; T1's regenerated print-out gives exactly
  one passage "only in the PDF file" (the Zwischentermin with its Vertragsstrafe and the Lärmschutz
  clause). The sweep reads the mailbox oldest first. Agreed with the session that makes the demo mail data
  (`mock/mail/`): German stays; our own bid mails carry our address in Cc so the bid file reaches the
  project; two jobs R1 and R2 with tender, bid and award inside the last 13 days are being written (R2's
  award drops, adds, changes a quantity and a price). R2 seen on the Award step (its four generated files as a
  throwaway intake project on the dev stack, deleted again): contract total 171.789,50 €, bid 168.915,50 €,
  and all four marks, each on the item the data names (quantity 3.1.30, dropped 5.1.10, added 4.1.70, other
  price 3.1.10 with 385,00 against 368,00); the sheet of the added item. Until then no price difference and
  no changed quantity had been on screen. R1 not opened (award equals bid).

## Done

- **Mock mail** (2026-11-22, D-061; `mock/mail/`, `src/boq/mockmail.py`, `tests/test_mockmail.py`): the demo
  mail server's mailboxes hold a made-up world: 460 messages in 28 mailboxes, 37 LVs with 1413 items,
  7 current tenders, 2 recent jobs with bid and award, 7 past jobs, the history with 14 partners. Dates are
  relative to the day of the fill; the mail server fills at every start, `boq-mail --fill --reset` by hand.
  Checked: every LV (all four formats, with and without prices) reads back with the parsers; a fill of
  the dev server (16 s, a second one puts in nothing); `inbox.recent` finds the 17 messages with files of
  the last 14 days; `partners.mailbox_history` puts 294 messages to the 14 firms; filled price sheets read
  back with `supply.read_sheet`; the sweep made intake projects of T1–T7, R1, R2 and the forwarded list, and
  R1/R2's bid and award and T1's Stand 2 joined their projects (seen by the tender session).
  Not checked: the AI review on the planted defects (the rules find the missing quantities and part of the
  risk wording only), the partners page and the style analysis on this history, the fill on Render.
  Slip to know of: an early generator test of mine reached the dev inbox and made a test project; it was
  deleted and T1 taken in afresh.


- **Phone calls taken out** (2026-11-22, D-059): voice agent, ElevenLabs, call endpoints and buttons, the
  "do not phone" flag removed; inquiries go by e-mail only. Older entries below that describe the call are
  history; a call kept in the database from before is left out of a firm's conversations. Checked: full
  pytest (one failure from the change fixed, then partners and API tests passed), type-check and build.
- **Demo mail server** (2026-11-22, D-052; `src/boq/demomail.py`, `docker/mail.sh`, `docker/start.sh`,
  Dockerfile stage `mail`): Stalwart with Roundcube in place of Mailpit. Mail, accounts and settings are kept
  in Postgres (`boq_mail`), every party has a mailbox with password `demo`, the app is
  `kalkulation@polier.test`. Dev: service `mail`, webmail http://localhost:8025/webmail/ (also `/webmail/` of
  the app and of Vite). Deployed: `DEMO_MAIL=1` runs the same inside the app's container.
  **Mailboxes are empty but for the firm's: filling them with accounts and mail is next**
  (`docker compose exec mail boq-mail ADDRESS…` makes an account; mail goes in over SMTP or IMAP APPEND).
  Checked in dev: `mail.send` with a file makes the supplier's mailbox, the copy lands in "Sent Items"; the
  supplier logs into the webmail through the app, sees the inquiry, answers; after a restart of the mail
  server `mail.find_replies` finds that answer. Checked in the prod image with a 512 MB limit:
  `/api/inbox`, `/api/inbox/scan`, webmail login behind the password; 206 MB used. 216 tests pass.
  **Not checked: on Render and Neon themselves** (Stalwart's TLS connection to Neon, `CREATE DATABASE` there,
  Roundcube's redirects behind Render's HTTPS), the app's pages against filled mailboxes.

- Clauses in the remarks are findings (2026-11-22, D-076; `rules.remarks`, `pdfmarks._locate`): a rule
  (`R-REMARK-WORDING`) finds the wording of `R-WORDING` ("keine gesonderte Vergütung", "in die Einheitspreise
  einzurechnen", "soweit erforderlich") in the preliminary remarks and the notes between items: one finding
  per block, the client's sentence quoted whole, with how many items stand under that title (and their value
  in a priced file). 55 findings over the German dataset files, 0 to 6 per LV. They are in the findings list
  and the risk report, and marked on the PDF page where the sentence stands; picking one opens the page.
  The Remarks tab is gone: for a day it showed these passages marked in the remark text, which the PDF tab
  shows already, and before that only the text. Not done: the amount is in the explanation, not in "money
  at stake" (the finding has no item to take a price from); remarks are not read by the AI review on their
  own, only as context for the items.
- Price order: quote, then price book, then past bids (2026-11-22, D-049; `supply.book`, `api._prices`,
  `supply.item_prices`, `risk.BANDS`): an item is asked for in its tender even where an earlier price
  exists; until the quote is in, a partner's price for the same thing from another tender stands in
  (subcontractor: the suggestion in the bid, with the surcharge; supplier: "material" beside the unit
  price, in the item sheet and the bid), out-of-date ones marked; past bids come last and stay beside.
  The item sheet says which it is ("Price from your partners' quotes"), the bid column is "Suggested".
  Checked: `tests/test_partners.py` (order, surcharge, stale, own tender left out), full pytest; on the
  dev stack a second project made from project D's English X83: 4 of 50 items with a unit price from a
  subcontractor's quote and 10 with a material price (past bids alone gave 1 of 50); bid view and two item
  sheets seen in headless Chrome. The test project was deleted again (its run spent a few cents).
  Not done: a tender whose quote then comes in, seen in the browser (the order is tested in
  `item_prices`); the risk report's own price section still words everything as "past bids".

- Partners page rebuilt (2026-11-22, D-051; `web/src/Partners.tsx`, `partners.css`, `POST
  /api/partners/follow-up`; the user found the first build poor, the proposal with its drawings is in
  `data/processed/partners-proposal/`, git-ignored). Built, in the order proposed:
  1. **The firm page**: name, contact and what it sells as text ("edit" leads to the form), what is open with
     it and the way to answer, four measures set against the directory (answers with a mark per inquiry,
     median first reply against the directory's, price level over the lowest on what another firm priced too,
     prices that hold and when the next run out), then four sheets: Prices (one row per thing, the course of
     the price as steps, days left of the validity, the earlier quotes behind a press), Conversations (one
     thread per inquiry, open ones unfolded), Terms and particulars (form, usual terms, papers, how Polier
     treats the firm, remove), How they write. A subcontractor's paper running out within 45 days is said in
     red under the name.
  2. **The register**: suppliers and subcontractors in one table (was two tabs with a list), filtered by
     chips, sorted by a press on a column head; a "Today" line above it (waits for you, waits for the firm,
     papers running out, prices out of date). With a firm open the others stand in a narrow list beside it.
     `/partners/subcontractors` leads to the directory. "Your firm" is a button at the right, "example" is said
     once above the table instead of on every row.
  3. **The price book**: per thing a line with a mark per quote (lowest that holds yellow, out of date hollow),
     the distance from the lowest in per cent on one scale for the whole book, the other firms' surcharge in
     words; chips for "a price holds", "two firms or more", "nothing holds".
  4. **Follow-ups** (was Waiting): your moves first; per row what the firm's record says ("usually answers
     within 5 days: 1 day over"), and "Write the answer" / "Write a reminder": the message is written by the
     same code as in the price inquiries, shown to read and change with what each answer rests on, then sent
     or kept unsent.
  Checked: type-check of the partners files, `tests/test_partners.py`, full pytest 214 passed; in headless
  Chrome at 1500 wide, no console error: register (filter, sort, add form), a supplier and a subcontractor
  with every sheet, price book, follow-ups, the old addresses, and "Write the answer" once with a real Claude
  call (11 s, four points, three marked as not settled by the LV). **Not run**: "Send" and "Keep unsent" of a
  follow-up (same endpoint as in the price inquiries), "Write a reminder" in the browser (the endpoint
  answers; the only real conversation open is a question back), below 1000 px wide.
  5. **Polier's read** (`partners.read_firm`, `POST /api/partners/{id}/read`, kept in `suppliers.more.read`):
     on the firm page, three to five sentences on what to know before asking the firm, written by Claude from
     the facts counted from the record and the messages. A sentence is kept only if its sources exist, the
     passage it quotes stands in the message it names, and every figure in it stands in its sources; a press
     on a sentence shows what it rests on. Asked for by a press, not on opening the page.
  6. **Coverage** (tab; `partners.needs`): per tender its packages with every firm on each and where the
     conversation stands (quote in, asked, your move, not asked, declined), "taken into the bid", "only one
     firm"; a package with nobody to ask stands red with "Search the web" or "Look at the N found on the web".
     Tenders an inquiry has gone out for first; "Every plan" shows all. The count of such gaps is on the tab
     and in the "Today" line.
  Checked for 5 and 6: full pytest and `npm run build`; in headless Chrome at 1500 wide, no console error:
  the coverage of project D (6 packages; "Every plan": 59 in 28 tenders), a read of one example supplier with
  a real Claude call (five sentences, none dropped) and its sources opened. **Not run**: "Search the web" from
  the coverage view (it calls the same search as the "Found on the web" tab), a read of a firm with a thin
  record, a test of `read_firm`'s three checks with a made-up answer.
  **Second pass (2026-11-22)**, after going over the pages again. Faults put right: "price level" called a
  firm the lowest when it was not (now a count: lowest on 5 of 6 things another firm priced too, and how far
  over on the others); a package's conversation showed as two threads (grouped by package now, not by
  message); a firm without prices opened on an empty sheet; e-mail and phone are links; Polier's read is a
  numbered list; below 1000 px the firm stands alone with "All firms" above its name (the button no longer
  runs off the page). Added: "Let Polier phone" in the follow-ups (the call panel of the price inquiries,
  `Call.tsx`); in Coverage "Write the inquiry to …" for a firm on a package that was not asked (same panel
  to read and send as the follow-ups; `POST /api/partners/follow-up` takes `inquiry` and `call` too); in the
  register a column "Lowest on", Polier's first sentence under the firm, and "Let Polier read the N firms it
  has not read"; the "Today" line stands on the register only, says prices that run out within 7 days (was:
  all that are out of date) and that the firm's own name and e-mail are not entered; the read and the four
  measures stand side by side from 1500 px; a read says when the record has changed since.
  Checked: full pytest, build, and in headless Chrome at 1500, 1920 and 900 wide without a console error:
  each fault above, the inquiry written from Coverage (not sent), the call panel opened (no call started).
  **Not run**: a call from the follow-ups, sending from Coverage, "read all" in the register.
  **Third pass (2026-11-22)**, what was left: two or three firms ticked in the register stand side by side
  below it (replies, first reply, prices that hold, and every thing more than one of them priced, the lowest
  marked, each price with its terms); the price book can be put "By package" (the package of the tender a
  thing was last asked for) and marks "terms differ" where it compares ex works with free to site; what a web
  search found for a package with nobody to ask opens under that package in Coverage with "Take into the
  directory" / "Pass", and "Found on the web" is no longer a tab (Coverage has "Web searches", the page with
  the searches, the free search and Polier's own looking is still there); a price out of date that belongs to
  a tender's package has "ask again" (the inquiry for that package, to read and send); the open sheet of a
  firm stands in the address after `#` and survives a reload; Polier stands smaller on this page.
  Checked: full pytest, build, headless Chrome at 1500 wide without a console error: two firms side by side
  (9 rows), the sheet kept over a reload, the eight web finds under the gap, the price book by package (five
  groups, "terms differ" on five rows). **Not run**: "ask again" (no price of a real tender is out of date
  yet), "Take into the directory" from Coverage, and whether a firm taken there is then on the package
  without the plan being worked out again.
  **Fourth pass (2026-11-22)**, the structure, at the user's word ("I never understood this"): the "Today"
  line is gone. It stood on the directory only, sent to other tabs, and three of its five counts were the
  badges of those tabs again; the two it alone said moved to where they belong: prices that run out within 7
  days are the price book's badge and a shelf there, a missing name or e-mail of the firm is a "!" on "Your
  firm". A firm is a page under the directory, the full width, with "Directory › name" and "Previous / Next"
  above it; the narrow second list beside it is gone. Seen in headless Chrome at 1500 wide, no console error.
  **The table of firms written again (2026-11-22)**, at the user's word (hard to read, columns nobody could
  name): five columns in plain words (Firm, Sells or does, Answers our inquiries "5 of 6 / usually within 5
  days", Last contact, Right now "Your reply needed" or "Waiting for their
  reply"), three chips (All, Suppliers, Subcontractors). Taken out of the table: "Valid prices" (a price is asked for again at every tender,
  D-049, so a count of prices still within their validity said nothing to act on), the reply marks, "Lowest on",
  Polier's first sentence, the tick boxes and the side-by-side of firms, the key, "Let Polier read the N
  firms", "Find more firms on the web", the note about the examples. **Papers are out of the page
  altogether** (the chip, the red line in the table and on the firm's page, the form under "Terms and
  particulars"); `suppliers.more.documents` is still kept on the server and the example firms still carry
  theirs. Seen in headless Chrome at 1500 wide, no console error.
  **A firm's page written again (2026-11-22)**, at the user's word (nothing on it could be understood, the
  way back was not designed): one column to read from the top. A button "All firms" above the name; the name
  with kind and place; four boxes Contact, E-mail, Phone, Sells; "Right now" (your reply first, with
  "Answer"); "How this firm answers" (answers our inquiries, quotes received, cheapest on n of m items another
  firm priced too); "What Polier knows about this firm" (the sentences, a press shows the source under the
  sentence); "Prices" (the latest quote per item: price, the one before where there was one, day quoted and
  valid until, the tender); "Conversations". "Edit" opens name, contact, e-mail, phone, place, what it sells,
  preferred, do not ask, remove. **Gone from the page**: the four sheets, "How they write" and its button
  (the style kept for a firm is still used when an inquiry is written; it can no longer be read anew from the
  page), usual terms, web page, customer number, note, "do not phone", "offered before", the reply marks,
  the course of a price as a line, "ask again", previous / next, the open sheet in the address. Seen in
  headless Chrome at 1500 wide, no console error: a supplier with everything, a subcontractor without
  prices, a source opened, "Edit", back to the table and the browser's back.
  **A firm's page drawn, not written (2026-11-22)**, at the user's word ("a page of text"): as wide as the
  table (1320 px, same edges, measured). A yellow plate with the firm's initials beside the name; contact on
  one line with small signs, what it sells as tags. "Right now" (the firm's questions as a numbered list, the
  row inside the column) beside "How this firm answers" as three drawings: a square per inquiry, this firm's
  reply time as a mark on a line among all firms, a square per item both firms priced with the ones it is
  cheapest on filled. "What Polier knows" as cards, one per topic (terms, asks before quoting, reliability,
  products, price trend), the German passage shown on the card (`read_firm` asks for a `topic` per point; all
  six example firms were read again, 26 points kept, none dropped). Prices quote by quote (tender, day and
  validity once above the items), each item with "cheapest" or "+8,7 %" against the other firms' price,
  quotes out of date folded away. Conversations as a line of steps (Asked, Asked back, Quoted, "your reply is
  needed"), the messages behind a press, ours at the right, theirs at the left.
  Checked: build, full pytest; in headless Chrome without a console error: five cases (a supplier with
  everything at 1500, a subcontractor without prices, one with papers and quotes, 900 and 1920 wide), each
  measured for anything reaching outside the column: nothing.
  Another session took the voice agent out of the app the same hour; the page has no call and shows a phone
  number as text.
  **The other partner pages drawn the same way (2026-11-22).** Coverage: a bar of where the packages stand
  (in the bid, quotes to compare, your reply needed, not asked, nobody to ask), then one row per package that
  ends in its one next step (Compare the quotes, Answer, Write the inquiry, Search the web / Look at the N
  found); gone: "Every plan", the reason under each package (now a tooltip), the key, and the page of web
  searches with its list of 38 gaps and the settings of Polier's own looking (its address shows Coverage).
  Follow-ups: two groups, "Your reply is needed" and "Waiting for their reply"; per conversation the firm, the
  steps so far as a line, the firm's questions numbered or a bar of the days waited against the firm's usual
  time (red when over), and the next message one press away; gone: the column of the submission day, the
  note on examples, the intro. Prices (was Price book): what more than one firm priced, a bar per firm, the
  cheapest marked and the others with their distance, terms beside each; what one firm priced is folded
  away; gone: the six chips, the range line and its key. Your firm: the form beside a card "An inquiry names
  you as", name and e-mail marked where missing; mailbox, .eml and the examples are three small buttons
  under "For the demo".
  Checked: build; in headless Chrome at 1500 and 900 wide, every page measured for anything outside its
  column: nothing, no console error. Full pytest: 221 passed, 3 failed, all three in `tests/test_mockmail.py`
  (another session's new mail work, `src/boq/mockmail.py`, not this page). **Not run**: sending from
  Follow-ups or Coverage, "Search the web" from Coverage.
  **Coverage is gone from the partners page; "nobody to ask" is closed in the tender (2026-11-22)**, at the
  user's word (the packages and where they stand are the project's price inquiries already; a gap belongs
  there). In the price inquiries a package none of the firms can be asked for shows "Nobody to ask" with
  "Search the web for firms" and the firms found, each with "Add and ask" (it becomes one of the firms and is
  put on that package) and "Pass" (`web/src/WebFinds.tsx`, `webfinds.css`, one line in `Inquiries.tsx`).
  The partners page has three tabs: Firms, Follow-ups, Prices; the old addresses of Coverage and of the web
  searches open Firms. `partners.needs` is still worked out on the server and no longer shown.
  Seen in headless Chrome: project D's price inquiries with the eight firms found for "Tragwerksplanung /
  Statik" under that package, the three tabs, the old address; no console error; build clean. **Not run**:
  "Add and ask", "Pass", "Search the web for firms" (a Claude call with web search).
  **Follow-ups is no tab any more (2026-11-22)**, at the user's word (why a page of its own?): the open
  conversations stand at the top of the Firms page, above the table, as the same cards ("Your reply is
  needed" with the firm's questions and "Write the answer"; "Waiting for their reply" with the days waited
  against the firm's usual time and "Write a reminder"); nothing open, nothing shown. The partners page has
  two tabs, Firms and Prices, and "Your firm"; the Firms tab's badge is yellow while a reply is needed; the
  old address of Follow-ups opens Firms. Seen in headless Chrome at 1500 and 900 wide: three cards over
  twenty firms, nothing outside the column, no console error; build clean.
  **The Prices tab is gone too (2026-11-22)**, at the user's word: a tender's quotes are compared in its price
  inquiries, where a firm stands against the others is on the firm's page ("cheapest on n of m", "cheapest" /
  "+8,7 %" beside each price), and a price is asked for again at every tender. The partners page is the firms
  (the open conversations, the table, a firm's page) and "Your firm"; every old address opens the firms.
  "Add a firm" in the row of the chips is yellow and readable again (the chips' rule had made it a white box).
  Seen in headless Chrome, no console error; build clean.
  **The open conversations in plain sentences (2026-11-22)**, at the user's word (looking at "Your reply is
  needed" said nothing): each card now says what happened ("X asked 4 questions before it will quote", "X has
  not replied for 6 days"), for which package of which tender and when it was asked, then the firm's
  questions or the days waited against its usual time with the sentence that reads the bar; the button says
  who does what ("Let Polier draft the answer", with "you read and change the text before it is sent" under
  it), and the draft says that nothing has been sent. Headings: "A firm is waiting for your answer", "You are
  waiting for prices from 2 firms". "Let Polier draft the answer" pressed in headless Chrome with a real
  Claude call: the draft with its four points stood after 12 s; nothing was sent.
  **No tab, "partner" not "firm", "Your firm" a dialog, nothing for the demo (2026-11-22)**, at the user's
  word. The band shows "Partners" with the count (a press leads back to the list) and "Your firm"; the page
  is the list (open conversations, then the table) or one partner. Every text of the page, of the web finds
  and of the price inquiries says "partner" where it said "firm" ("Add a partner", "All partners", "A partner
  is waiting for your answer"); "Your firm" keeps its name, being the user's own. "Your firm" opens as a
  dialog (the sign of the other dialogs) over the page and no longer has an address of its own (the old one
  opens the dialog). Gone from the page altogether: the row "For the demo" (example firms in and out, read
  the mailbox, hand over .eml), "Put in six example firms" in the empty list, and .eml dropped on a partner's
  page; the server's endpoints for them stand, `uv run boq-seed` and the API are the way now.
  Seen in headless Chrome at 1500 and 900 wide: no tab, the word "firm" nowhere on the list or a partner's
  page, the dialog opened, closed, and opened from the old address, nothing outside the dialog; no console
  error; build clean.
  **Not built**: distance to site and freight (the places in the dataset are anonymised and no quote says its
  freight per unit), grouping the price book by material group proper (the package stands in for it). The
  countdown to the submission day shows only where the tender has one. Prices are compared net as quoted:
  ex works and free to site are not evened out, only marked.

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
  Nothing of the page is fetched while the app opens (2026-11-22): its code is its own piece of the build
  (`lazy` in `App.tsx`, 40 kB) and it and `GET /api/partners` are fetched in the background 1.5 s after
  the first page stands and nothing is being read (`warmPartners` in `api.ts`); pressed before that, the
  page loads then. Seen in headless Chrome: no partners request until the projects page stood.
  Known: the contact of a firm found is what the search reported, not checked against its page (the page
  says so); the example history (six made-up firms, "Your firm" → Examples) shares the price book with real
  quotes, marked "example"; the dev database has it in; a firm's widths under 1000px were not looked at.

- Planted-fault test of the checks (2026-11-22, `scripts/eval_planted.py`): 30 faults of five kinds planted
  into three tender LVs (projects D, B, A; fixed seed), checks run on the changed files.
  Rules only: 11 of 30 (size 5/6, reference 6/6; unit, magnitude, "supplied by the client" 0/18), no new
  finding on the 427 unchanged items. Rules + AI review (one run, 2026-11-22): **29 of 30**, all with a
  finding of the fitting category; the AI found 17 of the 18 faults that need reading (missed: one pipe
  item in m2) and the one size fault the rule missed. Also 22 of 427 unchanged items got a finding they
  did not have before: the changed file is read anew by the model, so this is partly the model's own
  variation and partly a planted quantity making its neighbours look wrong; not read one by one.
  Limits: the faults are ours and blunt (×100, m2 for a pipe); four of the six "supplied" hits rest on one
  finding per LV that names the second item as related; one run, not repeated; about 2 USD of API.
  Run: `uv run python scripts/eval_planted.py --llm -v`.

- Mailbox watched, record of what Polier did, hand-over sheet, hindsight test (2026-11-22, D-048):
  `sweep_inbox` + `/api/inbox/sweep` + the task in `lifespan`; `src/boq/events.py`, `/api/events`, "What
  Polier did" in the Pipeline dialog (`Runs.tsx`); `render_handover` and `/api/analyses/{id}/handover.html`,
  linked from the Bid view; `scripts/eval_findings.py`.
  Checked: `tests/test_events.py` (a sweep reads a supplier's reply from a stand-in inbox once and notes it;
  the hand-over page renders), the hand-over page on project D through the dev API (4 points under §2
  Abs. 5 with item values). Not checked: a sweep against a real mailbox (no IMAP in `.env`), the "What
  Polier did" list and the hand-over link in a browser (the web build is broken at the moment by the
  partners page another session is adding to `App.tsx`).
  Hindsight test result: weak, see D-048; `uv run python scripts/eval_findings.py [--llm] [-v]`.

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
  not checked yet". Files added to an intake project start no run. The tender page of an intake project
  (2026-11-22) opens only its Tender step (Map, Read, Items; no Pages, whose marks are findings): steps 2–6
  are locked, an address like /check falls back to the Tender step, nothing is analysed, and the strip of
  steps carries the card's "Take it on" / "Pass" (`intakeOpen` in `App.tsx`, `intake` prop of `TenderPage`).
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
  The yellow plate is the tender's number (2026-11-22); before, it was the first letter of the name, which
  two projects could share.
  On the card the plate now holds the tender's number as its files state it (`projects.number`, e.g.
  `8209.003`), as wide as the number, above the name (which then drops the number it begins with); a tender without a
  number has no plate on its card. Seen in headless Chrome. The number is the one in the file header; when
  that is empty or an anonymisation token, the number most file names begin with, else the one the title
  begins with (`intake.leading_number`, `number_in_names`: digits joined by . - / or four digits and more,
  never a date; "Angebot AN24-0305" gives nothing). Projects already kept get it on read (`catalog._project`).
  `eval_intake.py`: project number 5/6 (was 4/6; the sixth, B, has none by hand but 15145 in its file). The schedule
  row has the same plate before the name; on the line of all tenders a deadline is a plate with the number,
  as wide as the number (tiers by where the last plate ends), a bare square for a tender without one. No
  letters any more (`projects.plate` taken out again). Seen in headless Chrome: card, row, line.
  Not built (shown in the prototype with made-up data): worst item per project, "new version, not
  checked".

- Projects page, band (2026-11-21): two buttons at the top right, "Pipeline" and "New project" (moved up from the
  board's head, which keeps only the drop hint). The schedule is always open: its switch in the band
  (`ScheduleSwitch`) and the sliding wrapper are gone. Checked: type-check, the page in headless Chrome at 1440
  wide. Not checked: clicking the two buttons in the browser; the page with no project.
  Revised (2026-11-22, Atahan chose B of four proposals in `playground/home-nav/`): "Pipeline" and "Partners"
  are places, not buttons: two ink slabs filling the right end of the band from stripe to stripe, each with a
  sign, its name and a live line (Pipeline: "Checking 4/6 · project" with the tape at its foot, else the last
  run; Partners: open threads and firms, from the overview read in the background). "New project" is back at
  the right end of the board's head, in a dashed frame "Drop the files of a tender here, or", with "Check mail"
  beside it. Checked: type-check, the page in headless Chrome at 1440 wide. Not checked: a running run on the
  slab; clicking through.
  The partners page in the same manner (2026-11-22): no shutter onto it or off it, the page changes in place
  (View Transitions, `swapPage` in App.tsx: the sideways slide described below; a plain swap without the API;
  reduced motion is ignored, D-038). Its tabs (counts kept), the search with "Add a firm" and
  "Your firm" moved into the band: tabs are full-height cells, the open one ink; search and firm on an ink slab
  at the right end; the "Partners" title went (the open tab says it). Done by a portal into `.band-place`, the
  state stays in `PartnersPage`. Checked in headless Chrome at 1440 and 1280: click onto Partners, tab
  changes, "Your firm", back to Projects, no console errors.
  Then (2026-11-22): the brand on the projects page at 40 px with a 32 px hat, the band still 70 px high; the
  way back ("Projects" / "Project", on every band) is a full-height cell at the band's left end in the display
  face, ink with yellow when pointed at (styles.css, end). Measured: band 70 px on home, partners, a project.
  Then: projects ↔ partners slides sideways, the whole screen with the band, the new page pushing the old one
  (480 ms; onto Partners from the right, back from the left; only the Polier agent stays). The page's code is
  awaited first and drawn straight from the module (`ReadyPartners`), so the page sliding in is never blank.
  The jump on arrival is gone: the directory's entrance (`pt-fresh`) no longer replays when the warm copy
  already stood, `.pt` clips, and the scrolling parts keep a stable scroll-bar gutter. Measured with real
  scroll bars in headless Chrome: content width 1425 on both pages through the whole change, no document scroll.
  The pipeline is a page, no longer a dialog (2026-11-22): `/pipeline[/:project]` (router.ts `PipelinePlace`),
  `PipelinePage` in Runs.tsx, reached from the Pipeline slab on the projects page and from "Record" on a
  project's strip, with the same sideways slide as Partners; it lies over what was open and the way back
  returns there. Band: the way back, "Pipeline" as the open ink cell, what runs as a still slab at the right.
  Page: every project against the six stations at full width (a row opens that project's runs under the
  table, scrolled into sight: every run, the latest open with each file's steps, "Open the project", "Run
  again"), what each station does under the table, the Claude spend open at the foot; at the right the whole
  record of what Polier did. `RunsDialog` is gone. Checked in headless Chrome: slab → page, row → runs,
  back, deep link `/pipeline/:id`, "Record" on an archive project → page with it open → back; no errors.
  Polier is the same size on every page (2026-11-22, Atahan): the 60 % scale on the partners page is gone;
  its scrolling parts end with 150 px of room instead, so Polier lies over no row. Measured 134 px on home,
  partners and pipeline.

- Audit of what Claude costs (2026-11-21; `src/boq/spend.py`, table `llm_calls`, `GET /api/spend[?project=]`):
  one row per request to the Claude API (AI review, second look, chat, chat about all projects, reply
  read) with project, file, pipeline run, the model that answered, the token counts the API returned, the
  time it took, USD at list prices and the last four characters of the API key; an answer taken from the
  app's own cache is a row too, at 0 USD. What a request belongs to is said once around the call
  (`spend.scope`), not passed through the callers. UI: a line "Claude $x, n requests" at the top of the
  pipeline dialog (per project behind "Record" on the strip, all projects from the band), opening to the
  sums per purpose and the latest requests. 2026-11-22: web searches (server tool) are now in the USD figure
  ($0.01 each, read from `usage.server_tool_use`; before, only the tokens of a web search were counted).
  A project's audit also says what was spent on no project at all (`outside`: mail sorted before a project
  existed, partners read, searches from the partners page), one line under the sum.
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
- Voice agent concept and ElevenLabs research: dropped and deleted (D-059)
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
  In the Docker dev environment the app sent to Mailpit until 2026-11-22; now to the demo mail server
  (D-052, see "Demo mail server" at the top of Done). A real provider is still untried.
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
  deploy. Started 2026-11-22: Neon project "polier" (Frankfurt, free) seeded with A–F and 12 cached LLM answers
  (direct string, not `-pooler`). Render not set up yet: the team repo is private and Render's GitHub app is
  not installed on `melikek0se`; a private copy `atahankilc/construction-hackathon` exists (git remote `deploy`,
  `git push deploy origin/main:main`) but Render's GitHub app still needs access to it. Paused by choice.
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
