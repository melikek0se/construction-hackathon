# Bid / tender stages and statuses in existing software (bidder / contractor side)

Researched 2026-11-21. Status names are verbatim in the original language. "Fetched" = the page itself was read;
"snippet" = seen only in a search-result summary of the page (the page was not opened or returned 403), so the wording
is less certain. Anything marked "inferred" is not in a source.

Reference for comparison — our board: Check → Questions → Pricing → Submitted → Award.

## International bid boards and estimating tools (Procore, BuildingConnected, ConstructConnect, PlanHub, STACK, Trimble/Viewpoint, Pursuit, Buildertrend)

### Takeaway
Every international bid board that could be verified has the same skeleton: an inbox / undecided state, an explicit
intent decision (will bid / will not bid), an "estimating / bidding" working state, "submitted", and split outcomes
won / lost — plus a "declined / not bidding" exit and an "archived" flag that is separate from the outcome. None of
them has a stage for "checking the documents" or for "questions with the client"; those happen inside the working state.

### Cited Findings

**Procore — Bid Board (company level), fetched**

| # | Stage (tab), verbatim | Meaning per Procore | Transition | End state? |
|---|---|---|---|---|
| 0 | Invitations | "all bid invitations sent to your company" | arrives by invitation; cannot be renamed | no |
| 1 | To Do | "bids that have the status set to To Do" | Status drop-down on the row | no |
| 2 | Estimating | "status set to Estimating" | Status drop-down | no |
| 3 | Bid Submitted | "all bids that have been submitted" | Status drop-down / submit | no |
| 4 | Accepted | "all submitted bids that have been awarded" | Status drop-down | outcome (won), but the board continues |
| 5 | In Construction (status "Construction"; the stage-editing article calls it "In Progress") | post-award | Status drop-down | no |
| 6 | Complete | post-award | Status drop-down | yes |
| 7 | Delayed | — | Status drop-down | no (parking) |
| 8 | Lost | "all submitted bids that were not accepted" | Status drop-down | yes |
| 9 | Archived | "all bids that have been archived" | archive action; cannot be renamed | yes (flag) |

- Tab list and definitions — [Procore: View the Bid Board](https://v2.support.procore.com/en-gb/product-manuals/bid-board-company/tutorials/view-the-bid-board/)
- "The default project stages are: To Do, Estimating, Bid Submitted, Accepted, In Progress, Complete, Delayed, and Lost." Stages can be renamed and recoloured, with "Reset to Defaults"; "The Invitations and Archived tabs cannot be renamed." The article describes renaming only — it does not say stages can be added or removed. — [Procore: Edit Project Stages on the Bid Board](https://v2.support.procore.com/product-manuals/bid-board-company/tutorials/edit-project-stages-on-the-bid-board)
- Bid intent is a separate field from the stage: "Undecided" is shown when no response is selected; the response buttons are "Will Bid" and "Will Not Bid". — [Procore: View the Bid Board](https://v2.support.procore.com/en-gb/product-manuals/bid-board-company/tutorials/view-the-bid-board/)
- The list assumed in the brief (Undecided / Bidding / Submitted / Won / Lost / Declined) is NOT Procore's stage list; "Undecided" exists only as a bid-intent value. — same two sources.
- Note the two Procore docs disagree on stage 5's name ("In Construction" vs "In Progress"). — both sources above.

**Autodesk BuildingConnected — Bid Board / Bid Board Pro, API reference fetched; help-centre article returned 403**

Three orthogonal fields instead of one status column:

| Field | Enum values, verbatim | Notes |
|---|---|---|
| `submissionState` | `UNDECIDED` (default), `WILL_SUBMIT`, `SUBMITTED`, `DECLINED` | "`WILL_SUBMIT` is equivalent to 'accepted'" — i.e. the UI column "Accepted" means the bidder accepted the invitation, not that the client accepted the bid |
| `outcome.state` | `UNKNOWN` (default), `WON`, `LOST`, `OTHER` | |
| `outcome.otherReason` (only when `OTHER`) | `CANCELED`, `REBID`, `CLIENT_NOT_AWARDED`, `OTHER` | project-level end states that are neither won nor lost |
| `workflowBucket` | `{OUTCOME}_{ARCHIVE_STATUS}_{GROUP_ROLE}` with outcome `ACCEPTED`, `DECLINED`, `LOST`, `WON`, `UNKNOWN`, `OTHER`; archive `ACTIVE`, `ARCHIVED`; role `PARENT`, `CHILD`, `ORPHAN` | archive is a flag independent of outcome |
| `declineReasons` | `LOCATION`, `TRADE`, `CLIENT`, `UNION_STATUS`, `PREVAILING_WAGE_STATUS`, `BID_DUE_DATE`, `MISSING_INFO`, `PROJECT_SIZE`, `MARKET_SECTOR`, `TOO_BUSY`, `OTHER` | structured no-bid reasons |
| `winProbability` | `10`, `30`, `50`, `70`, `90`, null | |
| `priority` | `LOW`, `MEDIUM`, `HIGH`, null | |
| `requestType` | `PROPOSAL`, `BUDGET` | a budget request is a different kind of ask from a binding bid |
| `competitors[]` | `name`, `companyId`, `bidAmount`, `isWinner` (max 20) | competitor prices and the winner are recorded per opportunity |

- All enum values above — [Autodesk Platform Services: BuildingConnected GET opportunities](https://aps.autodesk.com/en/docs/buildingconnected/v2/reference/http/buildingconnected-opportunities-GET)
- Via the write API only `UNDECIDED`, `WILL_SUBMIT`, `DECLINED` can be set; `SUBMITTED` cannot be set through the API and the API does not post bids (snippet). — [APS: BuildingConnected POST opportunities](https://aps.autodesk.com/en/docs/buildingconnected/v2/reference/http/buildingconnected-opportunities-POST)
- A webhook `opportunity.status.updated` exists; opportunity endpoints need a Bid Board Pro subscription (snippet). — [APS: BuildingConnected developer's guide](https://aps.autodesk.com/en/docs/buildingconnected/v2/developers_guide)
- Opportunity `source` values (`BUILDINGCONNECTED`, `API`, `EMAIL`, `MANUAL`, `IMPORTED`, `DISCOVERED`, `DUPLICATE_*`) — fetched. — [APS: BuildingConnected field guide](https://aps.autodesk.com/en/docs/buildingconnected/v2/developers_guide/field_guide)
- A help-centre section "Managing bid statuses" exists but could not be read (403). — [BuildingConnected support: Managing bid statuses](https://support.buildingconnected.com/hc/en-us/sections/14603896281107-Managing-bid-statuses)

**ConstructConnect — Bid Center (subcontractor side), snippet only**

| # | Status, verbatim | Definition (as quoted in the search summary) | End state? |
|---|---|---|---|
| 1 | Under Review | "Projects you have reviewed and are interested in but have not yet decided if you will bid." | no |
| 2 | Bidding | "Projects for which you intend to submit a bid." | no |
| 3 | Bid Sent | "Projects for which you have submitted a bid." | no |
| 4 | Won | "Projects for which you have won your submitted bid." | yes |
| – | Not Bidding | "Projects on which you have chosen not to bid." (under the gear icon, with Archived) | yes |
| – | Archived | — | yes |

- Statuses and definitions — [ConstructConnect: Bid Center Cheat Sheet v3.3 (PDF)](https://www.constructconnect.com/hubfs/Project%20Intelligence%20User%20Guides/Bid%20Center%20Cheat%20Sheet%20v3.3.pdf) and [ConstructConnect help: Changing the Project Status](https://constructconnect-help.atlassian.net/wiki/x/QwVJOg) (the help page returned empty content on fetch; wording from search summary)
- A status change that affects bid intent notifies the inviting general contractor; the GC side sees bid intent as "No Response", "Under Review", "Bidding", "Not Bidding", "Bid Received" (snippet). — [ConstructConnect help: bidders list in Bid Management](https://help.constructconnect.com/constructconnect-bid-management-14/accessing-your-all-bidders-list-in-bid-management-1961)
- No "Lost" status was visible in the summary for Bid Center — not confirmed either way.

**PlanHub — Bid Tracker (subcontractor side), fetched**

| # | Status, verbatim | Meaning | Set by | End state? |
|---|---|---|---|---|
| 1 | Submitted | "You submitted your bid." | bidder, by submitting | no |
| 2 | Reviewing | "The GC (general contractor) has viewed your bid." | GC activity | no |
| 3 | Under Consideration | "The GC is actively considering your bid." | GC activity | no |
| 4 | Awarded | "The GC awarded you the project." | GC, or bidder by drag-and-drop | yes |
| 5 | Not Awarded | "The GC has decided against your bid." | GC, or bidder by drag-and-drop | yes |

- — [PlanHub knowledge base: How to use the Bid Tracker](https://knowledgebase.planhub.com/knowledge/how-to-use-the-bid-tracker-review-and-update-the-bid-status)
- Before submission the sub is "bidding", "decided not to bid" or "undecided" as seen by the GC (snippet; exact labels not verified). — [PlanHub: subcontractor activity and status reports](https://knowledgebase.planhub.com/knowledge/how-to-view-subcontractor-activity-and-status-reports)
- PlanHub is the only tool found that models the time after submission in more than one step (Reviewing → Under Consideration).

**STACK (takeoff & estimating) — project status, blog fetched; help article 403**

- Status options, verbatim: "Not Set, Bidding, Bid Submitted, Pending Bid Results, Won, Lost, In Progress, On Hold, Completed, Awaiting Approval, Awaiting Additional Information, Project Declined, and Project Requires Approval." — [STACK blog: Assign, color code & search projects by status](https://www.stackct.com/blog/assign-color-code-search-projects-by-status/)
- 13 standard statuses, each mapped to a workflow category "Undecided, In Progress, Not Bidding, Bid Completed, Won, or Lost"; admins can add custom statuses up to 25 in total (snippet; page returned 403). — [STACK help: Create a Custom Project Status](https://support.stackct.com/hc/en-us/articles/47345349049491)
- STACK is the only tool found with explicit internal-approval and waiting-for-information statuses ("Awaiting Approval", "Project Requires Approval", "Awaiting Additional Information") — the latter is the closest equivalent to our "Questions" stage.

**Trimble Viewpoint Estimating / ProContractor — bid stages, fetched**

- "Bid stages enable you to track the progression of a bid through the bidding process"; stages are user-defined (add / modify / delete); examples given: "Bid In Progress, On Hold, Lost Bid, Bid Submitted, Bid Withdrawn, and Bid Won". — [Trimble: Bid Stage screen](https://help.trimble.com/doc/viewpoint-estimating/viewpoint-estimating/screen-reference/estimating-module/setup/bid-stage-screen)
- Each user-defined stage maps to a fixed "Bid Status": "Template" ("Bid is used for creating other bids"), "Inactive" ("not actively being worked on"), "Open" ("actively being worked on"), "Submitted" ("submitted to prospect for review and acceptance"), "Won" ("Prospect accepted the bid"), "Lost" ("Prospect rejected the bid"), "Withdrawn" ("You decided not to pursue the bid"). Each stage also carries an "Acceptance Probability"; Potential Bid Amount = Bid Total × probability. — [Trimble: Bid Stage screen field reference](https://help.trimble.com/doc/viewpoint-estimating/viewpoint-estimating/screen-reference/estimating-module/setup/bid-stage-screen/bid-stage-screen-field-reference)
- End states lock the bid: "Once you set the bid stage status, you can no longer modify the bid." On a loss the user records "Date Won/Lost", "Lost To" and "Lost Reason". — [Trimble: Record the outcome of a bid](https://help.trimble.com/doc/viewpoint-estimating/viewpoint-estimating/estimating/estimating/bidding-tasks/record-the-outcome-of-a-bid)

**Vertigraph Pursuit — pipeline (kanban) board, fetched (vendor blog)**

- Six built-in statuses: "Pending, Submitted, Won, Lost, Bid Deadline Missed, and Not Bidding"; example board columns in order "Pending, Submitted, Won, Lost"; custom statuses possible (example "Likely-to-Award"); each status maps to exactly one pipeline outcome; dragging a card changes the status and logs who/when; a status can be set to require a reason ("Required change reason") — reason picker includes customer relationship, lowest price, location, past performance, qualifications. — [Vertigraph: Pipeline board, kanban bid tracking in Pursuit](https://www.vertigraph.com/blog/pipeline-board-kanban-bid-tracking-in-pursuit)

**Buildertrend — lead opportunities (residential), weak source**

- Lead statuses "Open", "In Progress", "Lost", "No Opportunity", "Sold" — from one customer's internal guide, not official Buildertrend documentation. — [Lead management guide (third party)](https://vinointernal.squarespace.com/lead-management)

### Inferences
- Common pattern: stage (where the work stands) is kept apart from intent (will we bid), outcome (won / lost / other) and archive. BuildingConnected does this most cleanly with three fields; Procore with stage + bid intent + archive; Trimble with user-named stages mapped to fixed statuses.
- "Accepted" is ambiguous across tools: in BuildingConnected it means the bidder accepted the invitation (`WILL_SUBMIT`), in Procore it means the bid was awarded. A label like "Award" is clearer than "Accepted".
- Tools that let users rename stages (Procore, Trimble, STACK, Pursuit) still pin each stage to a fixed outcome category, so analytics (hit rate) keep working.
- Our "Check" and "Questions" have no counterpart as separate stages in these tools; they are all folded into "Estimating" / "Bidding" / "Open". STACK's "Awaiting Additional Information" is the nearest match for "Questions".

### Gaps
- BuildingConnected's UI column names (Undecided / Accepted / Submitted / Won / Lost / Declined) could not be read from the help centre (403); the API enum is verified, the UI labels are inferred from it and from the API note that `WILL_SUBMIT` "is equivalent to accepted".
- ConstructConnect and STACK help pages were not readable; their lists come from search summaries.
- Sage Estimating, Bluebeam, Downtobid, Togal: not researched (Bluebeam and Togal are takeoff tools; no evidence found of a bid-status model). Buildertrend proposal statuses not found.

## German / DACH tools on the bidder's side (RIB iTWO, NEVARIS, BRZ, Sidoun, California.pro, craft-trade software)

### Takeaway
No verbatim status list for an "Angebot" could be found in public documentation of any German construction-estimating
or craft-trade tool; this is the main gap of this research. What is documented is the chain of calculation states
(offer → contract → working calculation), not a bid pipeline.

### Cited Findings
- RIB iTWO's brochure describes the calculation running from the offer through the working calculation into controlling, including subcontractor award; no project/offer status list with "verloren" or similar was found. — [RIB iTWO Broschüre Kalkulation Baumanagement (PDF)](https://www.rib-software.com/pdf/de/rib-itwo-broschuere-kalkulation-baumanagement.pdf) (snippet)
- NEVARIS Build: only general tendering/costing descriptions found; a public feature-request board has an entry "Bericht Angebotsübersicht mit ungeprüften Angebotssummen" (status "In Prüfung"), which suggests offer-overview reporting is thin or requested. — [NEVARIS Build featurebase](https://build.featurebase.app/p/bericht-angebotsubersicht-mit-ungepruften-angebotssummen) (snippet)
- BRZ 365 Nachunternehmer-Management (this is the buyer's side, noted for vocabulary): the overview counts participating bidders, open offers, rejections issued and binding offers. — [BRZ 365 Online-Hilfe: Bieterangebote verwalten](https://portal.brz365.eu/online-hilfe/numanagement/bieterangebote-verwalten) (snippet)
- Generic German quote-status vocabulary in small-business tools (not construction-specific): Lexware Office uses "Entwurf" → "Offen" → "Angenommen" / abgelehnt. — [Lexware Office help: Angebot erstellen](https://help.lexware.de/de-form/articles/616609-ein-neues-angebot-fur-kunden-in-lexware-office-erstellen) (snippet)
- Plancraft lets users create and manage their own project statuses (page title only; the article returned 404 on fetch, default list not seen). — [Plancraft: Create and manage your own project status](https://plancraft.de/en/tipp-der-woche/create-your-own-project-status)
- HERO is described as covering a project "vom Erstkontakt über das Angebot bis zur finalen Rechnung"; no status list found. — [softguide: HERO](https://www.softguide.de/programm/hero) (snippet)
- Market note: contractors use "Bausoftware mit Kalkulation, Aufmaß und Bauabrechnung" to bid on LVs, whereas AVA software (ORCA AVA etc.) is the client's/planner's side. — [Dr. Web: AVA-Software Vergleich](https://www.drweb.de/ava-software-vergleich/) (snippet)

### Inferences
- German estimating suites appear to model the bid as a document / calculation state inside a project, not as a pipeline with a board; a kanban of tenders is a differentiator on the German market rather than a copy of an existing pattern. (Inferred from absence of evidence — weak.)
- The German terms a user will expect, judging by the generic tools: Entwurf / in Bearbeitung, abgegeben (or "Offen"), beauftragt / angenommen, abgelehnt / verloren. None of these was verified in a construction tool.

### Gaps
- Not found, despite targeted searches: status values in RIB iTWO, NEVARIS Build, BRZ, Sidoun Globe, California.pro, Nova AVA, MWM-Libero, bau-mobil, 123erfasst, Streit V.1, PDS, Sander & Doll, WinWorker, HERO, Plancraft, craftnote, openHandwerk, TopKontor. Their manuals are mostly behind customer logins; a demo account or a user (e.g. the civil engineer contact) is needed.
- The Kalkulationsstände (Angebotskalkulation, Auftragskalkulation, Arbeitskalkulation) named in the brief are standard German practice but were not confirmed verbatim in a vendor source in this research.

## Tender-search and tender-CRM tools for German / European bidders (DTAD, ibau, Tendium, Altura, Brainial, Mercell, …)

### Takeaway
Public material of these tools names features (qualification, go/no-go, bid spaces, reporting) but not their stage
lists; the one consistent signal is that they treat qualification / go-no-go as a distinct step before work on the bid.

### Cited Findings
- Tendium names a distinct "Go/No-Go phase" and argues for a data-driven decision there. — [Tendium blog: Data-driven go/no-go phase](https://tendium.ai/blog/data-driven-go-no-go-phase/) (snippet)
- Tendium "Bid Spaces" hold each opportunity with an automatic summary and let teams move it through stages; tenders marked no-go move to a separate "Rejected Bid" view (2023 product update; snippet, the page redirected and was not read). — [Tendium: Product roundup February 2023](https://tendium.com/blog/product-roundup-february-2023/)
- Tendium's listed features: monitoring, a qualification tool, call-off management, bid spaces. — [Capterra: Tendium](https://www.capterra.com/p/252598/Tendium/) (snippet)
- Altura is listed as supporting qualification and go/no-go decisions, collaboration between bid, sales and leadership, proposal generation and bid performance reporting; stage names not published. — [Software Advice: Altura](https://www.softwareadvice.com/product/515579-Altura) (snippet)
- Brainial: tender discovery and qualification, "Tender Assist" extracting deadlines, requirements and risks, approval workflows; stage names not published. — [GetApp: Brainial](https://www.getapp.com/sales-software/a/brainial/) (snippet)
- DTAD: an aggregator of public and commercial tenders with "DTAD 360" marketed for sales/acquisition; no pipeline or processing-status documentation found. — [Capterra DE: DTAD 360](https://www.capterra.com.de/software/211190/dtad-360) (snippet)
- ibau publishes Submissionsergebnisse (bid-opening results) as a data service in its "InfoBau Xplorer". — [ibau: Submissionsergebnisse](https://www.ibau.de/services-und-leistungen/submissionsergebnisse/) (snippet)

### Inferences
- Tender-CRM tools start earlier than our board (discovery → qualification) and put the go/no-go gate before any analysis effort; in our app the "Check" stage produces exactly the evidence a go/no-go needs, so the decision would naturally sit at the end of "Check" rather than before it.

### Gaps
- No verbatim stage lists for DTAD, ibau, Vergabe24, evergabe.de, Deutsches Ausschreibungsblatt, cosinex/Vergabemarktplatz, subreport, Tenderfy, bidfix, forecheck, Tendium, Altura, Brainial, Mercell, Cube RM. The e-Vergabe platforms (cosinex, evergabe.de, subreport) are submission portals; whether they offer bidder-side pipelines beyond "Angebot abgegeben / zurückgezogen" was not established.

## Subcontractor-procurement tools seen from the invited bidder (Cosuno, BuildingConnected, PlanHub, ConstructConnect, Procore)

### Takeaway
An invitation has its own small state machine, separate from the bid: no response / undecided → will bid or will not
bid (with reason) → bid submitted → awarded / not awarded; the inviting party is notified of intent changes.

### Cited Findings
- BuildingConnected: `UNDECIDED` → `WILL_SUBMIT` | `DECLINED` → `SUBMITTED`, then outcome `WON` | `LOST` | `OTHER`; decline carries `declineReasons`. — [APS: BuildingConnected GET opportunities](https://aps.autodesk.com/en/docs/buildingconnected/v2/reference/http/buildingconnected-opportunities-GET)
- Procore: bid intent "Undecided" → "Will Bid" | "Will Not Bid". — [Procore: View the Bid Board](https://v2.support.procore.com/en-gb/product-manuals/bid-board-company/tutorials/view-the-bid-board/)
- ConstructConnect (GC's view of the bidder): "No Response", "Under Review", "Bidding", "Not Bidding", "Bid Received"; the GC is notified when the bidder's change affects bid intent (snippet). — [ConstructConnect help: bidders list](https://help.constructconnect.com/constructconnect-bid-management-14/accessing-your-all-bidders-list-in-bid-management-1961)
- PlanHub after submission: "Submitted" → "Reviewing" → "Under Consideration" → "Awarded" | "Not Awarded". — [PlanHub: Bid Tracker](https://knowledgebase.planhub.com/knowledge/how-to-use-the-bid-tracker-review-and-update-the-bid-status)
- Cosuno: the site lists marketplace, bid submission, messaging during the award process and "digital award & rejection"; no status labels published. — [Cosuno: subcontractor features](https://www.cosuno.com/subcontractor-features) (snippet)

### Inferences
- "Viewed" as a bidder state appears only from the other direction (PlanHub "Reviewing" = the GC viewed the bid); an "invitation viewed" state for the bidder was not seen in any verified list.

### Gaps
- Cosuno's and Compass/Bausoftware's invitation states for the bidder were not found (no public help centre located).

## Newer AI tender / estimating startups

### Takeaway
Where anything is public, AI tender tools present qualification / go-no-go as its own step fed by an AI summary of the
documents, ahead of drafting the response; none of the found material shows a construction-specific "check the LV" stage.

### Cited Findings
- Tendium: each procurement gets an AI-generated summary meant to support the go/no-go decision. — [Tendium blog: Data-driven go/no-go phase](https://tendium.ai/blog/data-driven-go-no-go-phase/) (snippet)
- Altura's CEO names answering requirements, mitigating risk and bid/no-bid decisions as the tasks for planned agent workflows. — [TechRound interview with Altura's CEO](https://techround.co.uk/interviews/a-conversation-with-matthijs-huiskamp-ceo-of-altura/) (snippet)
- A German AI-use-case description: the AI extracts key criteria from the tender documents (Eignungsnachweis, technical requirements, evaluation matrix), matches them against own references and certificates and "bewertet Go/No-Go" (vendor-style page, treat as marketing). — [KI-Syndikat: KI-unterstützte Ausschreibungsbearbeitung](https://www.ki-syndikat.de/usecases/allgemein/57-ki-unterstuetzte-ausschreibungsbearbeitung/) (snippet)
- AutoRFP's process guide lists capture/logging first, then qualification and the bid/no-bid decision as stage two. — [AutoRFP: Tender management](https://autorfp.ai/blog/tender-management) (snippet)

### Inferences
- These tools do separate "qualification / go-no-go" from the later work, but the analysis that feeds the decision is the same document analysis — so "analysis" is not a later stage, it is the input to the gate.

### Gaps
- No German AI Kalkulation / LV-analysis startup's workflow steps were found in a citable source. Stotles, Loopio, Mercell not examined in detail.

## Generic bid-management / capture process models (Shipley, APMP)

### Takeaway
The reference process is much longer than any construction tool: seven Shipley phases with decision gates and colour-team
reviews; construction tools keep only decide → estimate → submit → outcome and drop the reviews and post-submittal steps.

### Cited Findings
- Shipley Business Development Lifecycle, seven phases: "Market Segmentation", "Long-Term Positioning", "Opportunity Assessment", "Capture/Opportunity Planning", "Proposal Planning", "Proposal Development", "Post-Submittal Activities"; each phase has decision gates; the bid/no-bid decision sits in phase 3, scored on Pwin, capability/past performance, competitive positioning, pricing viability, strategic fit. — [GovEagle: Complete Shipley process guide](https://www.goveagle.com/blog/complete-shipley-process-guide) (secondary source, fetched)
- Colour-team reviews: Blue (pre-RFP, capture strategy), Pink (~30 % draft: structure, compliance), Red (~70 % draft: independent evaluation against the customer's criteria), Green (pricing/cost volume), Gold (final executive sign-off before submission), White (post-submission scoring and debrief). Post-submittal covers oral presentations, discussions, negotiations, lessons learned. — [GovEagle: Complete Shipley process guide](https://www.goveagle.com/blog/complete-shipley-process-guide)
- Shipley's own description: phases "include multiple steps that are separated by decision milestones". — [Shipley: Foundations for Proposal Development](https://www.shipleywins.com/courses/foundations-for-proposal-development) (snippet)
- APMP Body of Knowledge excerpt: with less than 90 % compliance of the solution one should revisit the bid/no-bid decision — i.e. the decision is re-checked during the work, not taken once. — [APMP BoK study guide (PDF)](https://www.apmp.org/assets/BoK-BW-M.pdf) (snippet)
- An older APMP-related sequence: pursuit decision, preliminary bid, bid decision, submit bid, approve deal, close (2005/2010 material; historical). — [APMP: Bid & Proposal Practitioner (PDF)](https://www.apmp.org/assets/APMP_Bid_Proposal_Practiti.pdf) (snippet)

### Inferences
- Mapping to construction tools: Opportunity Assessment + bid/no-bid = "Undecided → Will Bid / Declined"; Proposal Development = "Estimating"; Gold review = STACK's "Awaiting Approval" (the only tool that has it); Post-Submittal = "Pending Bid Results" (STACK), "Reviewing / Under Consideration" (PlanHub); lessons learned = lost reason + competitor amounts.
- For German public works under VOB/A, negotiation after submission is largely prohibited, so "negotiation" as a stage fits private clients only; a post-submission "Aufklärung" / waiting-for-award state is the realistic counterpart. (Domain inference, not from the sources above.)

### Gaps
- The full APMP BoK phase list is behind membership; only study-guide excerpts were seen. The "96-step" Shipley model was not found in a source.

## Reasons for loss / decline, competitors' prices, hit-rate analytics

### Takeaway
Yes — the verified tools record structured decline reasons, loss reasons, who won and competitors' bid amounts, and a win
probability; this is the data behind hit-rate reports and it is captured at the moment the bid enters an end state.

### Cited Findings
- BuildingConnected: `declineReasons` (11 fixed values), `competitors[]` with `bidAmount` and `isWinner`, `winProbability` (10/30/50/70/90), `outcome.otherReason` (`CANCELED`, `REBID`, `CLIENT_NOT_AWARDED`, `OTHER`). — [APS: BuildingConnected GET opportunities](https://aps.autodesk.com/en/docs/buildingconnected/v2/reference/http/buildingconnected-opportunities-GET)
- Trimble Viewpoint Estimating: on loss "Date Won/Lost", "Lost To", "Lost Reason"; per-stage "Acceptance Probability"; a Bid Dashboard and a "Bid Win/Loss by Estimator" report exist. — [Trimble: Record the outcome of a bid](https://help.trimble.com/doc/viewpoint-estimating/viewpoint-estimating/estimating/estimating/bidding-tasks/record-the-outcome-of-a-bid); [Trimble: Bid Win/Loss by Estimator screen](https://help.trimble.com/doc/viewpoint-estimating/viewpoint-estimating/screen-reference/estimating-module/estimating-reports-screens/bids--proposals-screens/bid-win-loss-by-estimator-screen) (report page: title only)
- Pursuit: a reason can be made mandatory for any status change; won/lost reasons include customer relationship, lowest price, location, past performance, qualifications. — [Vertigraph: Pipeline board](https://www.vertigraph.com/blog/pipeline-board-kanban-bid-tracking-in-pursuit)
- Germany: the Submissionsergebnis is the record of the bid opening listing all bids and bidders, without the award (§ 14 Abs. 3 VOB/A per ibau); the Ausschreibungsergebnis names all co-bidders and the checked final sums. ibau sells these results as a data service. — [ibau glossary: Submissionsergebnis](https://www.ibau.de/akademie/glossar/submissionsergebnis/); [ibau glossary: Ausschreibungsergebnis](https://www.ibau.de/akademie/glossar/ausschreibungsergebnis/); [ibau: Submissionsergebnisse](https://www.ibau.de/services-und-leistungen/submissionsergebnisse/) (snippets)

### Inferences
- In German public tenders the competitors' totals become known at the opening, before the award — so "Submitted" naturally splits into "submitted, result unknown" and "bid opened, rank known", which no international tool models (STACK's "Pending Bid Results" comes closest).

### Gaps
- Whether German estimating suites store the Submissionsergebnis per offer was not found.
- Procore Bid Board loss-reason fields and hit-rate reports were not checked.

## Cross-tool synthesis: standard stages, optional stages, end states — and our five stages against them

### Takeaway
Standard everywhere: undecided/inbox, working (estimating/bidding), submitted, won, lost, plus a declined/not-bidding
exit. Our board lacks the decision gate and every negative end state; "Check" and "Questions" are finer than anything
the established tools show and are our distinguishing detail, not a standard.

### Cited Findings
(All rows rest on the per-tool sources cited above.)

| Concept | Procore | BuildingConnected | ConstructConnect | PlanHub | STACK | Trimble | Pursuit | Ours |
|---|---|---|---|---|---|---|---|---|
| Inbox / undecided | Invitations; intent "Undecided" | `UNDECIDED` | Under Review | (undecided) | Not Set / category Undecided | Inactive | Pending | — |
| Go / no-go decision | "Will Bid" / "Will Not Bid" | `WILL_SUBMIT` / `DECLINED` | Bidding / Not Bidding | — | Project Declined | Withdrawn | Not Bidding | — |
| Working on the bid | To Do, Estimating | (accepted) | Bidding | — | Bidding, In Progress | Open | Pending | Check, Questions, Pricing |
| Waiting on client information | — | — | — | — | Awaiting Additional Information | — | — | Questions |
| Internal approval before submission | — | — | — | — | Awaiting Approval, Project Requires Approval | — | — | — |
| Submitted | Bid Submitted | `SUBMITTED` | Bid Sent | Submitted | Bid Submitted | Submitted | Submitted | Submitted |
| After submission, before award | — | — | — | Reviewing, Under Consideration | Pending Bid Results | — | (custom "Likely-to-Award") | — |
| Won | Accepted | `WON` | Won | Awarded | Won | Won | Won | Award |
| Lost | Lost | `LOST` | not seen | Not Awarded | Lost | Lost | Lost | — |
| Declined / withdrawn / missed | (Will Not Bid) | `DECLINED` + reasons | Not Bidding | — | Project Declined | Withdrawn | Not Bidding, Bid Deadline Missed | — |
| Cancelled / rebid by client | — | `OTHER`: `CANCELED`, `REBID`, `CLIENT_NOT_AWARDED` | — | — | — | — | — | — |
| On hold | Delayed | — | — | — | On Hold | (On Hold example) | — | — |
| Archive (flag) | Archived | `ARCHIVED` | Archived | — | — | — | — | — |
| After award | In Construction, Complete | — | — | — | In Progress, Completed | — | — | — |

### Inferences
- Nearly every tool: undecided → (will bid | declined) → estimating → submitted → (won | lost). Six of seven verified tools have an explicit not-bidding/declined exit; all seven have won; six have lost.
- Some tools: on hold (3), waiting between submission and award (2–3), archive as a separate flag (3), post-award stages (2), internal approval (1), waiting on client information (1), client cancelled / re-tendered (1), deadline missed (1).
- Typical end states: Won / Awarded; Lost / Not Awarded; Declined / Not Bidding / Withdrawn; less often Cancelled / Rebid / Client did not award, Bid Deadline Missed; Archived as a flag on top.
- Our five stages compared: "Submitted" and "Award" are standard. "Pricing" corresponds to "Estimating". "Check" and "Questions" are sub-steps that other tools hide inside "Estimating" — unusual, defensible because they are the product's core, but "Questions" is a waiting condition that can overlap with pricing (estimators keep pricing while questions are out), so tools that have it (STACK) treat it as a status, not a sequential stage.
- Missing in ours, in order of how standard they are: (1) a negative outcome — "Award" as a column cannot hold a lost bid; established tools split Won / Lost; (2) a no-bid / declined exit with reason, i.e. the go/no-go decision, most naturally taken after "Check"; (3) client cancelled / re-tendered (Aufhebung) as a third outcome; (4) a state between submission and award (bid opening result known, binding period running); (5) archive as a flag; (6) internal approval before submission; (7) loss reason, winner and competitor amounts recorded when the end state is set.
- Negotiation is not a stage in any verified construction bid board; it exists only in the generic Shipley model.

### Gaps
- The synthesis rests on seven international tools; no German construction tool's status list could be verified, so "standard" here means standard in North-American bid boards.
- Counts in the inferences are over the verified lists only and include snippet-level sources (ConstructConnect, parts of STACK).
