# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-20 (evening, hackathon day 1)

## Now

Repository prepared; no application code yet. Next step is the team agreeing on stack and scope
(`OPEN_QUESTIONS.md` Q1–Q4), then build step 1 in `06-architecture.md`.

## Done

- Dataset extracted to `data/raw/` and analysed → `02-dataset.md`
- `scripts/inspect_dataset.py`: inventory of all GAEB files, totals of the three priced bids verified
  (`EP × Qty = GP` holds for all 720 priced items)
- Challenge analysis, check catalogue, pitch skeleton → `01-challenge-analysis.md`
- Domain research (estimating, VOB, red flags, tooling, competitors) → `03-domain-primer.md`
- Brother's field insights assessed → `04-field-insights.md`
- Voice agent concept and ElevenLabs research → `05-voice-agent.md`
- Architecture proposal and data model → `06-architecture.md`

## In progress

- nothing

## Next (in order)

1. Decide stack, team split, demo LV
2. GAEB XML parser → normalised model → items table in the browser
3. GAEB 90 parser (unlocks priced history from projects A, B, C)
4. Rule checks + findings UI
5. LLM checks per title
6. Risk score, change-order classification, report
7. PDF parser · price suggestion + what-if · RFQ (email, then voice) — in parallel if people allow

## Not built / known gaps

- No parser, backend, frontend, or tests exist.
- PDFs `Abgabe LV.pdf` and `HEM2301-2_Gesamt-LV.pdf` not checked for filled-in prices.
- No benchmark price source; none is freely available.
- ElevenLabs: nothing configured; German speech recognition quality untested.
