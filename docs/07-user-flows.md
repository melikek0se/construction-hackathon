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
