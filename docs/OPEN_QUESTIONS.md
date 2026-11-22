# Open questions

Move answered questions to the bottom with the answer and date; turn them into a `DECISIONS.md` entry if they decide
something.

## For the team

- **Q1. Who is on the team and who is strong in what?** Decides stack (D-003) and how much runs in parallel.
- **Q2. How much time is left, and when is the code freeze / pitch?** Decides whether pricing fits at all.
- **Q3. Which LV is the demo file?** Suggestion: project C (pipeline, 274 items, priced offer exists, PDF + GAEB 90)
  or project B (GAEB XML + PDF + bid + award).
- **Q4. Product name.**

## For the organisers / mentors

- **Q5. Judging criteria and weights?** Will the jury test with their own file, and in which format?
- **Q6. Is there more data?** The brief mentions historical planned-vs-actual costs, change-order summaries, "real-world
  examples of faulty BoQ items" and unit-price catalogues. None of these is in the zip. Especially the faulty-item
  examples would be our evaluation set.
- **Q7. Is `LV-Positionen.docx` meant as something specific** (measurement grouping for project C)?
- **Q8. Who is the target user** — the contractor's estimator (our assumption) or the planner writing the LV?
- **Q9. May the dataset be in a public repository?**
- **Q10. Any restrictions or sponsors on LLM / API choice?** Are API credits provided?

- **Q14. Price inquiries (2026-11-21, for the people who set the challenge; `docs/09-price-inquiries.md`
  found no source for any of these):** How many suppliers are asked per material group, and is it the
  same few every time? How long do they take to answer and how many never do? Is the list sent as Excel,
  GAEB or in the text of the mail? For a trade the firm does not do: is the whole trade LV forwarded to
  subcontractors, and what is done when none answers in time? Is a supplier ever written to cold?

## For the brother (civil engineer)

See the list at the end of `04-field-insights.md`. Most important: would an indicative price obtained by phone be used
in a bid, and is his experience from Germany or Turkey?

## Technical

- **Q14. Position flags `W`, `B`, `L` in GAEB 90 record 21** — confirm meaning (assumed Wahl-, Bedarfsposition, lump sum).
- **Q16. Does the Destatis GENESIS API need an account?** Only matters if we index old prices to today.

## Answered

- **Q11. pyGAEB?** Not needed (2026-11-20): own parsers for GAEB XML and GAEB 90 are written and tested on all
  nine files (`src/boq/parsers`).
- **Q12, first half** (2026-11-20): `Abgabe LV.pdf` has prices in its text layer, e.g. page 33: item 4.2.1
  "7,000 St 129,740 908,18". The earlier pattern search missed them because unit prices have three decimals.
- **Q12, second half, and Q13** (2026-11-20): `HEM2301-2_Gesamt-LV.pdf` is the tender package of project A — the
  PDF parser finds the same 159 items with identical quantities and units as `8209.003_…X83`. It has no prices
  (empty `EP....` / `GP....` fields).
- **Q7, partly** (2026-11-20): whatever the organisers meant, we use `LV-Positionen.docx` as the seed for the
  companion rules (D-009).
