# User flows: projects, LVs and versions

Research of 2026-11-21 into one question: does adding an LV create a project, or is an LV added to a project
that already exists? Sources are vendor manuals, public tender documents and trade guidance found by web
search, plus our own dataset. What is sourced and what is our conclusion is kept apart.

## What the sources say

1. **A bidder's work starts with files, not with a form.** The client sends the LV as a GAEB file (D83 / P83 /
   X83); the bidder imports it, checks it, prices it and returns a D84 / X84; alternative offers go out as
   X85. ([Offerte_L manual](https://www.kpluss.com/.downloads/suppliers/de-offerte-l.pdf),
   [Streit: GAEB interface](https://www.streit-software.de/schnittstellen/gaeb),
   [StEB Köln bidder notes](https://steb-koeln.de/download/2132107126/Bieterhinweise.pdf))
2. **Tender documents arrive electronically as a package and must be checked at once.** Completeness is checked
   immediately, missing parts are requested, unclear points are raised as bidder questions before submission —
   under the VHB this is a duty, not a courtesy.
   ([UniBw checklist](https://www.unibw.de/forschung/forschungs-service/links/checkliste-fuer-unternehmen.pdf),
   [bauprofessor: Bieterfragen](https://www.bauprofessor.de/bieterfragen-vor-angebot/),
   [bauprofessor: preparation of the estimate](https://www.bauprofessor.de/vorarbeiten-angebotskalkulation/))
3. **A tender changes while it is open.** Bidders are told to keep checking for answers and changed documents;
   a bid that ignores a change is at risk.
   ([SIB Sachsen question log](https://www.sib.sachsen.de/download/VVV/12_23D607002_Rueckfragenprotokoll_Stand_24_04_2025.pdf),
   [IHK Karlsruhe](https://www.ihk.de/karlsruhe/fachthemen/recht/oeffentliches-auftragswesen/ausschreibungspraxis/an-ausschreibungen-teilnehmen-5156030))
4. **The same LV exists in several representations, and they can disagree.** Where the data file and the
   written documents differ, the written version applies and the bidder has to mark the difference.
   ([Stadt Emsdetten, data exchange](https://www.emsdetten.de/pdfs/rathaus-politik-buergerservice/vergaben/bauleistungen/04-datenverarbeitung.pdf?cid=1vep))
5. **One tender can hold several LVs.** An LV is written per trade; public tenders are split into lots with
   their own rules on which lots one bidder may bid for.
   ([Baunetz Wissen: Leistungsverzeichnis](https://www.baunetzwissen.de/controlling-und-management/fachwissen/kosten-und-vertraege/leistungsverzeichnis-8494320),
   [Bremen: lots or one award](https://www.wirtschaft.bremen.de/sixcms/media.php/13/Themenblatt%20Los-%20oder%20Gesamtvergabe.pdf))
6. **The incumbent tools are project-first.** ORCA AVA: create a project (number, name), then create or import
   LVs into it. Procore: documents are uploaded to a project of the bid board. Cosuno: a project holds bid
   packages per trade, which go out to subcontractors.
   ([ORCA AVA getting started](https://baulinks.de/bkd_file/orca-software/ORCA_AVA_26_Startklar_in_10_Minuten_20250221.pdf),
   [Procore: upload to a bid board project](https://v2.support.procore.com/product-manuals/bid-board-company/tutorials/upload-documents-to-a-bid-board-project),
   [Cosuno for general contractors](https://www.cosuno.com/customers-general-contractors))

Not found: a source on how tools treat a re-issued LV during the bid phase (replace or keep both), and no
step-by-step of Cosuno's or ORCA's handling of several LVs in one project. Vendor pages are marketing; their
claims about speed or accuracy were not used.

## What our dataset shows

Six projects, two shapes: five are **one LV in several versions** (tender as X83 and D83, a PDF print-out, a
bid D84, an award D86), one is **27 trade LVs of one building**, each in one version. No project is a single
file with no context, and no file is useful without knowing which tender it belongs to.

## Conclusion (ours, not sourced)

The project — one tender — is the unit of work: it has a client, a deadline, and it collects files over weeks
(tender, answers, re-issued LV, our bid, the award). But the user never starts from an empty project; they
start from a folder of downloaded files. So:

- **Files first, project always.** Dropping files starts an intake; the result is always a project. There is no
  LV outside a project, also not for a single file.
- **The project is named by the LV, not by the user.** GAEB carries the project name; the user may correct it.
- **Later files go into the existing project.** A re-issued tender, the PDF print-out, the bid, the award and
  further trade LVs are added to the project they belong to. Adding is the second most common action after
  opening, so it sits on the project's row.
- **The app says what each file is.** GAEB phase 83 / 84 / 86 gives tender / bid / award; two files with the
  same item numbers are versions of one LV, different item numbers are different LVs. The user confirms, and
  does not fill it in.
- Structure: **project → LVs (trades, lots) → versions**. Dataset projects A–E are 1 LV × n versions, F is
  27 LVs × 1 version.

## The steps of a tender, and the documents each one leaves

"tender", "bid", "submitted bid", "award" in the UI are the roles `src/boq/catalog.py` gives the dataset
files. They are documents, grouped by the step of the tender they belong to:

| Step | GAEB exchange phase | Documents we have seen | Read by the app |
|------|---------------------|------------------------|-----------------|
| Tender | 83 request for bids (81 description and 82 cost estimate come before it, on the client's side) | X83 / D83, its PDF print-out, the tender package, an excerpt | yes |
| Bid | 84 bid, 85 alternative bid | D84, the submitted bid as PDF, an offer | 84 yes, 85 no |
| Award | 86 award | D86 | yes |
| After the award | 88 change order (Nachtrag), 89 invoice | none in the dataset | no |

Between tender and bid there are also bidder questions, the client's answers and re-issued documents; they
have no GAEB phase of their own and no file in the dataset. Phases 81 to 86 are confirmed by
[WEKA on the GAEB interface](https://www.weka.de/architekten-ingenieure/gaeb-schnittstelle/) and the
[dataflor GAEB documentation](https://en.wiki.dataflor.de/doku.php/de/produkte/business_2020/system/lv-austausch_gaeb);
88 and 89 are from memory and not checked. The number is the last two digits of the file extension, so
`.X83` is a tender and `.D86` an award whatever the file is called. The role names in the UI ("tender",
"bid", "award") are ours; the roles of the PDFs ("tender package", "excerpt", "submitted bid") were assigned
by hand from what each PDF contains (`02-dataset.md`), since a PDF carries no phase.
The app accepts the extensions 83, 84 and 86, PDF and Excel. Of the 44 dataset files it reads 43; the one it
does not is `LV-Positionen.docx`, a Word list of typical items, not an LV.

On the projects page every project lists the three steps in order. The files of one step stand side by side
as format buttons (GAEB XML, GAEB 90, PDF); one is selected and its items and findings are shown; a step
without a file says so. When two formats of the same step give different findings, the row says so.
The rule for this area: every project shows the same three lines, whatever it holds. A step holds files;
files of the same format are one choice. For a single LV that choice is one file; for a building it is all
its trade LVs together (project F: "PDF, 27 LVs" under Tender), with the LVs behind the stops and cautions
named. Splitting one project by step and another by LV was tried and rejected as inconsistent.

## Flows

| # | Flow | Trigger | Result |
|---|------|---------|--------|
| 1 | New tender | drop a folder of files on the page, or "New project" | intake lists the files with what they are; one confirm creates the project |
| 2 | More files for a running tender | drop on the project's row, or "Add files" on the row | the files join that project as new LVs or new versions |
| 3 | Open | click the row | one LV: the LV workspace with its versions; several LVs: the project view |
| 4 | Quick look at one file | same as 1 with one file | a project with one LV; nothing is thrown away |

## Built on the home page (2026-11-21)

Flows 1, 2 and 3: intake panel with detected role and LV grouping per file, name taken from the LV,
destination "new project" or an existing created project; "Add files" on created projects.

## Intake rebuilt around the tender (2026-11-21, D-028)

When the estimator comes to the app, and what the intake must do then:

| Moment | In hand | Wants |
|--------|---------|-------|
| The tender arrives (most uploads) | a folder from the portal or an e-mail: forms, LV as PDF and GAEB, plans; all from the client | which tender is this, what is in it, then the findings |
| An addendum arrives | a changed LV, answers | into the same tender |
| The bid has gone out | the own priced LV (D84, PDF) | kept; price history |
| The award comes | D86, an order | the contract version |

So the intake answers three questions from the files and shows what each answer rests on: which files are
the same LV, which tender they are (number, name, client), which step each one is. Rules and their order are
in D-028 and `src/boq/intake.py`. What the dataset showed first: none of the 34 PDFs has a metadata title, so
a PDF-only project used to be named "27 LVs, <date>" although every page header prints the project; the GAEB
field used for the name was the LV label (the trade), not the project; a PDF's step was "has any price".

## Not built

- Suggesting the destination by the items (it is suggested by project number or name, D-028).
- Deadline and client on the project. (A file's step is changed from the project row, "Move to…".)
- Adding files to the six dataset projects (they are a fixed mapping in `src/boq/catalog.py`).
- A project view that shows LVs × versions as a grid, and a comparison between two versions of one LV
  (what changed between the tender and the re-issued tender) — the flow the sources stress most (point 3).
- Deadline, client and bidder-question status on the project.
- ZIP upload; removing a file or a project.

## Home page as schedule and board (2026-11-21, D-029)

The board's columns were researched again the same day and changed (D-042): the full report with its
sources and their limits is `reports/Alman ihale teklif aşamaları.md`, the notes behind it are in
`research_notes/`.

Researched the same day: how a tender runs on the contractor's side and what bid tools show per project.
Hard dates under VOB/A are the submission deadline (§ 10), the question deadline (set by the client, in
practice 10 to 12 days before submission; above the EU threshold answers are due 6 days before, § 12a EU),
the end of the binding period, and the answer deadlines for clarification (§ 15) and missing documents
(§ 16a). Procore and BuildingConnected list bids as a table by status, sorted by due date, with a calendar
second; estimators check the nearest deadline first and name missed addenda as the worst failure. Sources:
[VOB/A § 10](https://lxgesetze.de/vob-a-2019/10), [§ 12a EU](https://lxgesetze.de/vob-a-2019/12a-EU),
[ibau on bidder questions](https://www.ibau.de/akademie/wissenswertes/bis-wann-muessen-bieterfragen-beantwortet-werden/),
[Procore bid board](https://v2.support.procore.com/product-manuals/bid-board-company/tutorials/view-the-bid-board),
[BuildingConnected opportunity fields](https://aps.autodesk.com/en/docs/buildingconnected/v2/reference/http/buildingconnected-opportunities-POST),
[ConstructConnect on tracking bids](https://www.constructconnect.com/blog/how-to-track-multiple-construction-bids-without-losing-your-mind).
What users want rests on vendor blogs only; no forum thread, survey or German practitioner was found.

Built from it: deadline and stage on the project (two of the "not built" points above); the dates are
read from the files where these state them (`src/boq/dates.py`, D-031). Still not built:
client on the project, bidder-question status, addenda and version comparison, ZIP upload.


## The tender page shows the tender, not a file (2026-11-22, decided as D-050; mock-ups in `playground/tender/`)

Question from Atahan: the page of an LV today lists files ("This LV as: tender GAEB XML, tender package PDF,
bid GAEB 90 ..."). Should the estimator see one tender whatever came, with the documents behind it?
Researched by web search and measured on the dataset; the full write-up with sources is the "Research" tab
of the mock-ups (`cd playground/tender && python3 -m http.server 5300 --bind 127.0.0.1`).

**Measured (German originals, our parsers):** the tender twins of A (X83, D83, PDF package), B (X83, PDF) and
D (X83, PDF) hold the same items with the same quantity and unit: 0 differences on 616 item pairs. Texts
under 90 % alike (exact character comparison, tokens and line breaks ignored; `boq.tender`): A 0, B 24,
D 17 (D: other short texts in the PDF; B: mostly longer texts in the print-out). A first count with
Python's default junk heuristic gave 2 / 28 / 28 and was wrong. Beyond that, B's print-out carries a
"STLB-Bau" catalogue line on 143 items that the X83 lacks: systematic, not flagged per item. The documents complete each other: B's PDF has 87 passages of
remarks, its X83 54; a D84 carries prices only, no texts or quantities.

**Sourced:**
- Every estimating tool reads all GAEB generations into its own LV model; nobody works in the file (ORCA,
  iTWO). Their screen: structure tree (project, LV, lot, title), item table, long text in a detail area,
  item type as an icon, dates as cover data of the LV.
- A lot is an LV is a file (VHF Bayern VI.6), or the top level inside one LV (ORCA, NEVARIS).
- The format comes back in four places: the bid must return in exactly the demanded form (OLG Köln
  11 U 118/20, OLG Düsseldorf Verg 54/21) and an X84 sits on the X83 received; the client's long-text LV
  alone is binding (VHB 212 Nr. 3.3); a bid on an outdated version was excluded (VK Bund VK 2-54/18);
  forms, description of works and plans are PDF only.
- First steps of the estimator (IHK/ABST checklist): is the package complete, read everything, bid or not,
  ask at once, plan the dates.
- GAEB XML is the stated standard, but GAEB 90 is still called widespread (WEKA, Dangl); no current share.

**Not found:** a general rule that the PDF outranks the GAEB file (each tender's conditions say); how often
the two differ in practice.

**Conclusion (ours):** one page per tender, merged from its documents (structure, quantities and units from
GAEB; pages and the extra remarks from the PDF); the source of every item one click away; a difference
between documents is a candidate bidder question, never decided by the app; the file the bid returns on is
named; a re-issued LV is a version in time, a separate axis from format; steps (tender, bid, award) are
where the tender stands, and a priced file is a price column over the same items, not a page of its own.
Project, LV, section, item: one LV is the case with one level less.

## The intake and the tender page as one document (researched 2026-11-22; decided as D-064, D-065, D-068)

Question from Atahan: a tender arrives, sometimes as several LVs, sometimes as one LV in several formats,
sometimes a new issue comes while it still stands in the intake. What would the estimator want to see?
Researched by web search and measured on our own data; five mock-ups were drawn (A register, B by arrival,
C only what needs a decision, D the three combined, E the tender as one document). E was chosen and built;
the mock-ups are gone. Each source below is marked **read** (the page was opened), **excerpt** (only the
search result's excerpt was seen) or **not found**.

**What the estimator asks at this stage** (ours): what tender is this and does it fit; how many LVs, and
which file is which; do the formats of one LV say the same; is this the latest issue; is the package
complete; on which file does the bid go back; what is expected of me. The stage has one outcome, "Take it
on" or "Pass", and nothing open may block it.

**German tools and tender portals**
- AI Bietercockpit (evergabe.de, HAD, several state portals): tender documents are kept as numbered
  versions, each file is "Ungelesen" or "Gelesen", a new version is announced in a window of its own.
  ([manual §7.2](https://www.had.de/pdf/AI-BC_Benutzerhandbuch.pdf), read)
- GAEB-Vergleich: compares two LVs item by item, matched by Ordnungszahl, by order, or each against each,
  with a share of what is alike; made for contractors who "erhalten eine neue Version der Ausschreibung".
  ([softguide](https://www.softguide.de/programm/gaeb-tester), read)
- BPS Bau: the LV comparison shows what changed between versions, and "bereits erstellte Kalkulationen
  lassen sich in neue LV-Versionen übernehmen". ([softguide, vendor listing](https://www.softguide.de/programm/bps-bau), read)
- DTVP / cosinex notices: the bidder has to watch the portal's messages "wie ein eigenes E-Mail-Postfach";
  one who is not registered has to look for news himself. ([TED notice](https://ted.europa.eu/de/notice/282701-2024/pdf), excerpt)
- iTWO, NEVARIS, ORCA, California.pro, Sidoun, BRZ, Nova, Dangl: no public description of how a re-issued
  tender is compared at intake. The term "Änderungspaket": no source. (not found)

**Bid tools elsewhere**
- Bluebeam Sets matches revisions by file name ("A-101 Rev 1", "Addendum 1") and stacks them; a renamed
  sheet does not match. ([manual](https://support.bluebeam.com/user-manual/menus/batch/auto-matching.html), excerpt)
- Autodesk Docs: version history, a "current" mark, any two versions compared.
  ([help](https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/view-files/Compare_Files.html), excerpt)
- Procore: an addendum is a "correspondence" mailed to the invited bidders.
  ([tutorial](https://support.procore.com/products/online/user-guide/project-level/bidding/tutorials/send-a-new-correspondence-in-the-bidding-tab), excerpt)
- BuildingConnected: subcontractors are not told by themselves when files are added.
  ([support](https://support.buildingconnected.com/hc/en-us/articles/4404733377171), excerpt; the page answered 403)

**Patterns from other fields**
- Dext keeps a suspected duplicate in "To review", side by side, and deletes nothing before someone decides.
  ([help](https://help.dext.com/en/s/article/how-does-dext-handle-duplicate-documents), excerpt)
- Lightroom hides the JPEG of a RAW+JPEG pair by default, and users are puzzled that they cannot see it.
  ([forum](https://community.adobe.com/questions-675/seeing-both-raw-and-jpeg-in-lr-classic-961759), excerpt)
- Zotero asks for a "master item" among duplicates. ([guide](https://library-guides.ucl.ac.uk/zotero/desktop-duplicates), excerpt)
- GitHub drops approvals when new commits arrive; users complain where nothing really changed.
  ([changelog](https://github.blog/changelog/2023-06-06-security-enhancements-to-required-approvals-on-pull-requests/), excerpt)
- Google PAIR: coarse levels in place of percentages; no confidence shown that changes no decision.
  ([guidebook](https://pair.withgoogle.com/chapter/explainability-trust/), read)

**What goes wrong at this stage**
- VK Bund, 17.07.2018, VK 2-54/18: a bidder priced the earlier LV version after the client had put up a
  new one; the bid was excluded "zwingend wegen Änderungen an den Vergabeunterlagen", although its price
  already held the change. ([GvW](https://www.gvw.com/aktuelles/blog/detail/verwendung-veralteter-vergabeunterlagen-fuehrt-zum-ausschluss), read)
- Later decisions of the VK Bund are reported as milder: clarification before exclusion. A risk, not a
  certainty. ([vergabeblog](https://vergabeblog.de/2023-06-19/wann-fuehren-aenderungen-der-vergabeunterlagen-zum-angebotsausschluss-vk-bund-beschl-v-04-01-2023-vk1-105-22/), excerpt)
- Whether the GAEB file or the PDF binds: no general rule in VOB/A was found; each tender's conditions say.
  Courts hold bidders to the demanded format (OLG Düsseldorf Verg 54/21, OLG Köln 11 U 118/20).
  ([Heuking](https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/pdf-lv-fehlt-ausschluss-keine-nachforderung.html), read)
- Addenda gather in the last one or two weeks before bid day; a large job can collect half a dozen.
  ([ConstructConnect](https://www.constructconnect.com/blog/how-often-do-drawings-specs-and-addenda-conflict-in-commercial-construction-bidding), vendor blog, read; United States)
- Figures or estimators' own words for Germany: not found.

**Measured on our data**
- T1 Birkenweg (demo mail world, as the dev API read it): issue 1 has 76 items, its X83 and its print-out
  differ on 6 (3 quantities, 3 wordings), and one passage, a penalty of 1.500 EUR per working day, stands
  only in the PDF. Issue 2 came three days later: 78 items; 5 quantities, 1 wording, 3 new, 1 dropped; the
  deadline moved from 07.12. to 10.12.; 4 of the 6 differences between X83 and print-out are gone.
- The same mail names plans, a manhole list and a ground report and does not send them; the second mail
  asks for a confirmation of receipt.
- Project F: 27 LVs, 1.076 items, all PDF, no GAEB file; the file numbers go from 15a to 17, so there is
  no LV 16.
- The app's own fault of this kind: until 2026-11-22 a run read the first file of an LV, also when the
  client had replaced it; T1's AI review ran on issue 1 while the page showed issue 2 (put right, D-065).

**Principles drawn from it** (ours): an LV is one thing with formats side by side and issues in order, one
of them current; a new issue is known by its content, the name and the mail only support it; nothing is
deleted, a replaced file stays struck through; the difference is the headline ("issue 2: 5 quantities,
1 wording, 3 new, 1 dropped", with the dates that moved); the work follows to the new issue and only what
changed is opened again; two states, "sorted" and "yours", no percentage, the passage under every point;
the app does not decide between two documents, the difference is a question for the client.

**Not built from it:** the client's mail as text with the passages marked (its body is not kept), documents
a mail names and does not send, the request to confirm receipt, the tick "bid for this LV", read / unread
per file.
