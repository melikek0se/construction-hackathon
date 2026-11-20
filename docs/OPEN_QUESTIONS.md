# Open questions

Move answered questions to the bottom with the answer and date; turn them into a `DECISIONS.md` entry if they decide
something.

## For the team

- **Q1. Who is on the team and who is strong in what?** Decides stack (D-003) and how much runs in parallel.
- **Q2. How much time is left, and when is the code freeze / pitch?** Decides whether pricing and voice fit at all.
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

## For the brother (civil engineer)

See the list at the end of `04-field-insights.md`. Most important: would an indicative price obtained by phone be used
in a bid, and is his experience from Germany or Turkey?

## Technical

- **Q11. Does pyGAEB parse all four XML files of the dataset correctly?** If yes, skip writing the XML parser.
- **Q12. Do `Abgabe LV.pdf` and `HEM2301-2_Gesamt-LV.pdf` contain filled-in prices?**
- **Q13. Is `HEM2301-2_Gesamt-LV.pdf` really the tender package of project A?** (Inferred from client and date.)
- **Q14. Position flags `W`, `B`, `L` in GAEB 90 record 21** — confirm meaning (assumed Wahl-, Bedarfsposition, lump sum).
- **Q15. ElevenLabs: German recognition quality for numbers, units and product codes; cost in credits per minute.**
- **Q16. Does the Destatis GENESIS API need an account?** Only matters if we index old prices to today.

## Answered

- nothing yet
