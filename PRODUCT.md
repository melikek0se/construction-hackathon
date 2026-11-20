# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

An estimator (Kalkulator) at a German construction contractor who has received a tender bill of quantities
(Leistungsverzeichnis, LV) and must decide what to price, what to question and where the risk sits before
submitting a bid. During the hackathon the second audience is a jury watching the demo on a projector from a
distance (confirmed by the team, 2026-11-20).

## Product Purpose

Upload an LV, get its errors, risks and change-order potential per item, each with quoted evidence, a reason and
a suggested action. Success: the estimator sees where in the LV the trouble is before reading a single row, and
can defend every finding to the client.

## Positioning

Findings are deterministic rules first, each tied to an item number and a quoted passage. No evidence, no
finding; "nothing found" and "no reliable price" are valid results.

## Operating Context

LVs arrive as GAEB XML (X83/X84/X86), GAEB 90 (D83/D84/D86) or PDF with a text layer. An LV is a tree: titles (sections)
containing numbered items (Ordnungszahl, e.g. 5.1.46) with quantity, unit, short and long text; bids and awards
also carry unit price and total. Estimators work item by item and send bidder questions to the client.

## Capabilities and Constraints

- Built: GAEB and PDF parsing, rule checks, missing-item check, LLM checks on the Claude API, API, web UI.
  Not built: prices, what-if, supplier inquiries, report export.
- LV text stays German and is never translated in place; UI text is English.
- Most findings carry no money amount yet (tender LVs are unpriced); the UI must not imply one.
- The dataset is anonymised; tokens such as `[FIRMA_044]` replace names and are not errors.
- Confirmed for the UI (2026-11-20): the first thing a loaded LV shows is a map of the whole LV — sections and
  items in one picture with the problem items visible in place — and the map is the way to navigate. A 3D
  version was built and rejected the same day as hard to read; the team asked for plain graphs and a picture of
  the selected item instead, and for the yellow "under construction" look to stay.

## Evidence on Hand

Nine GAEB files of four projects in `dataset/`; three priced bids. Two real short-text / long-text
contradictions (A 5.1.4 and 5.1.46 DN 125 vs DN 100; E 2.3.23). No customers, benchmarks or savings figures
exist and none may be invented.

## Product Principles

1. Where before what: show the location of trouble in the LV before the list of troubles.
2. Every finding is checkable: item number, quoted evidence, reason, action.
3. Fewer, well-founded findings beat many weak ones; rank by severity and money at stake.
4. Never show a number without its source; say so when something is not quantified.
