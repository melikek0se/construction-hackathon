# Challenge analysis

Challenge A: **"AI Estimation and Bidding Assistant for Bills of Quantities"**.
The original brief is quoted at the bottom of this file.

## What they are really asking for

The user is an **estimator (Kalkulator) at a contractor** who receives a tender LV (Leistungsverzeichnis = BoQ) with
hundreds to thousands of items and has days, not weeks, to price it. Two things cost money:

1. **Before the bid:** not noticing that an item is unclear, incomplete, contradictory or carries hidden scope. The
   bidder either prices it too low (loses money) or too high (loses the bid).
2. **After the award:** not having spotted where the LV will produce change orders (Nachträge) — which is both a risk
   and, for the contractor, a margin opportunity.

The brief ranks the goals, and so should we:

| Priority | Goal in the brief | Our reading |
|----------|-------------------|-------------|
| Must | Import and parse long BoQs (PDF, GAEB, Excel) | GAEB XML and GAEB 90 are deterministic; PDF is the hard one. The dataset has no Excel. |
| **Must, "priority"** | Error detection: missing items, unclear descriptions, contradictions, typos | The core. Has to produce findings an estimator agrees with, tied to the exact item. |
| Must | Risk assessment: imprecise scope, unusual quantities | Score per item and per title, with a reason. |
| Must | Change-order potential and likely disputes | Map findings to the contract rule that makes them claimable (VOB/B §2). |
| Optional | Unit prices / markups from historical data | We have three real priced bids in the dataset (see `02-dataset.md`). |
| Milestone 5 | What-if analysis (material prices, alternatives) | Small once prices and a cost breakdown exist. |

Deliverables: a **web app demo with upload and risk report**, and a **pitch from the estimator's perspective** on how
the bidding process changes.

## How to win it

Judging criteria were not given to us (open question). Assumptions: the jury includes construction people who know
what a bad LV looks like, the pitch is short, and every team will show "upload file → LLM lists problems".

What separates teams:

- **Findings that are real, on their data.** Ten precise findings a Kalkulator nods at beat 300 generic warnings.
  False positives are the product killer in this domain. Rank by money at stake, not by count.
- **Every finding is traceable**: item number, quoted text, why it matters, what to do (ask a bidder question, add a
  risk surcharge, price an alternative, note for claim management).
- **Parsing that works on their ugly files**, shown live — including GAEB 90 and a PDF.
- **Closing the loop.** Most teams stop at a report. The estimator's actual outputs are (a) a list of bidder questions
  to the client (Bieterfragen), (b) a priced bid with risk surcharges, (c) price inquiries to suppliers. A tool that
  produces these artefacts changes the process; a tool that produces a report adds a reading task.
- **Honesty about uncertainty.** Prices are never 100 % known or current (see `04-field-insights.md`). Showing a
  price with source, date and confidence instead of a single confident number is itself a differentiator.

## Proposed product shape

Working name: TBD. One screen flow:

1. **Upload** an LV (GAEB XML / GAEB 90 / PDF) → normalised item tree.
2. **Review**: items table with risk score; findings panel grouped by type (error / unclear scope / quantity /
   change-order potential), sorted by money at stake. Click a finding → the item text with the trigger highlighted.
3. **Price**: per item a suggested unit price with source (own history / benchmark / supplier quote / model estimate),
   date and confidence band. Items with no reliable price are the **price gaps**.
4. **Close the gaps**: for the gaps with the biggest cost impact, request quotes by e-mail. The quote
   flows back into the table.
5. **What-if**: sliders for material price change, labour rate, risk surcharge → bid total as a range (P50 / P80).
6. **Export**: bidder-question list, risk report (PDF), priced GAEB X84 if time allows.

Steps 1–2 are the MVP and the judged priority. 3–5 are where we stand out. 6 is polish.

## Check catalogue (first cut)

Deterministic checks first (cheap, explainable, no hallucination), LLM checks second.

**Rule-based**

- Arithmetic: `EP × Qty = GP`, title sums, grand total (for priced files).
- Structure: gaps or duplicates in item numbering, empty titles, items without quantity or unit.
- Units: unknown or inconsistent unit spelling; unit that does not fit the text (e.g. text says "je m²", unit is `m`).
- Quantities: zero, 1.000 with a non-lump-sum unit on a large-scope item, suspiciously round numbers, order-of-magnitude
  outliers against sibling items (pipe delivered 500 m vs pipe laid 50 m).
- Position types: lump sum (`psch`) on large scope, contingency items (Bedarfsposition), alternative items
  (Wahlposition), hourly-rate items — count and share of total.
- Duplicate or near-duplicate items with different quantities or descriptions.
- Red-flag wording ("nach Wahl des AG", "bauseits", "komplett", "einschl. aller Nebenarbeiten", "soweit erforderlich",
  missing product named with no "oder gleichwertig", …) — list in `03-domain-primer.md`.
- For priced offers: unit-price outliers vs history, token prices (< 1 EUR), unbalanced bids.

**LLM-based** (per item or per title, with the preliminary remarks as context)

- Unclear / incomplete description: what must an estimator know to price this that the text does not say?
- Contradictions between short text and long text, between item and preliminary remarks, between dimensions in text
  and unit/quantity.
- Missing items: given the items in a title, which normally accompanying work is absent (delivery without
  installation, excavation without disposal, pipe without pressure test)?
- Typos that change meaning (dimensions, DN, material grades, standards) vs harmless spelling.
- Scope shifted to the contractor by the preliminary remarks (unusual risk).
- Change-order potential: classify the mechanism (quantity deviation, changed work, additional work, lump-sum risk).

## Pitch skeleton (estimator's perspective)

1. "It is Thursday. The bid is due Tuesday. 71 pages, 274 items." (use project C from the dataset)
2. Today: skim, copy last project's prices, phone three suppliers, hope.
3. With the tool: upload → in a minute the 12 items that decide whether this job makes or loses money.
4. Show one real finding of each type on their data. Show the money at stake.
5. The price gap: "we have no current price for this pipe." → the agent writes the inquiry to the supplier; the quote is read back into the table.
6. Before/after: review time, number of bidder questions sent, bid total as a range instead of a guess.
7. Honest limits and what comes next.

## Risks to our own plan

- **PDF parsing eats the day.** Mitigation: build on GAEB first; for PDF use the LLM on text-layer output and validate
  against the GAEB twin of the same project.
- **LLM cost/latency on long LVs.** Mitigation: rule checks first, LLM per title in parallel, cache by item hash.
- **Too many weak findings.** Mitigation: severity threshold, money-at-stake ranking, a curated demo file.
- **Live demo failure.** Mitigation: pre-computed results for the demo file.

---

## Original brief

> **Problem Statement.** Bills of quantities (BoQs) often contain thousands of line items, multiple cost groups and
> cross-trade dependencies. Companies lack the time and staff to review them in detail, identify risks and learn from
> past projects. Typos, calculation errors and overlooked change order potential can have major financial consequences.
>
> **Challenge Objective.** Build a prototype for intelligent BoQ analysis:
> import and parse long BoQs (PDF, GAEB, Excel) · error detection (priority): missing items, unclear descriptions,
> contradictions, typos · risk assessment: flag imprecise scope descriptions and unusual quantities · detect change
> order potential and likely disputes during execution · optional: suggest unit prices or markups from historical
> project data.
>
> **Milestones.** BoQ parsing and structured data extraction · error detection and plausibility checks · risk scoring
> and change order detection · integration of historical project data (optional) · what-if analyses (material prices,
> alternatives).
>
> **Data.** Anonymized sample BoQs from various trades and project sizes (GAEB preferred) · optional: historical
> project data (planned vs. actual costs, change order summaries) · real-world examples of faulty BoQ items · unit
> price catalogs or benchmarks (if available).
>
> **Deliverables.** Demo of a web app or assistant tool with upload and risk report · pitch from an estimator's
> perspective: how does the prototype change the bidding process?
