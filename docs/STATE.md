# Project state

**Update this file whenever something is finished, started or dropped.** Keep it short; history lives in git.

Last updated: 2026-11-20 (evening, hackathon day 1)

## Now

Backend core exists as a Python package (`src/boq`) with a CLI: GAEB XML and GAEB 90 parsers, the normalised
model, rule checks and the deterministic missing-item check. No web app, no LLM checks, no PDF parser yet.
Next step is putting an API and the items/findings table in front of it.

## Done

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

## In progress

- nothing

## Next (in order)

1. Decide team split, demo LV
2. FastAPI upload endpoint + items/findings table in the browser (the CLI's `--json` output is the payload)
3. More companion rules for building trades (project F) once the PDF parser exists
4. Money at stake for findings on unpriced LVs (needs the price history)
5. LLM checks per title
6. Risk score, change-order classification, report
7. PDF parser · price suggestion + what-if · RFQ (email, then voice) — in parallel if people allow

## Not built / known gaps

- No PDF parser, API or frontend. Project C has item texts only as PDF, so its companion rules are tested on
  the item list of `LV-Positionen.docx`, not on the real LV.
- Companion rules look at the whole LV, not per section: an item missing in section 5 is masked if section 3
  has one. They cover pipeline and civil work only.
- X83 files do not mark alternative / contingency items the way the D86 does (B: 14 `W`, 4 `B` only in the D86).
- No benchmark price source; none is freely available.
- ElevenLabs: nothing configured; German speech recognition quality untested.
