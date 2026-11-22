# construction-hackathon

Challenge A: **AI Estimation and Bidding Assistant for Bills of Quantities.**
Upload a German LV (GAEB / PDF) → errors, risks and change-order potential per item → prices with provenance →
supplier inquiries for the price gaps.

Status: repository prepared, no application code yet. See [`docs/STATE.md`](docs/STATE.md).

## Docs

| File | Content |
|------|---------|
| [`docs/01-challenge-analysis.md`](docs/01-challenge-analysis.md) | The brief, what wins, product shape, check catalogue, pitch skeleton |
| [`docs/02-dataset.md`](docs/02-dataset.md) | What is in `dataset/`: six projects, three priced bids, formats, gotchas |
| [`docs/03-domain-primer.md`](docs/03-domain-primer.md) | German estimating, VOB, red-flag wording, tooling, competitors |
| [`docs/04-field-insights.md`](docs/04-field-insights.md) | A civil engineer's input, assessed |
| [`docs/06-architecture.md`](docs/06-architecture.md) | Proposed stack, data model, build order |
| [`docs/STATE.md`](docs/STATE.md) · [`DECISIONS.md`](docs/DECISIONS.md) · [`OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Living project memory |

## Quick start

```bash
python3 scripts/inspect_dataset.py   # inventory of the GAEB files, no dependencies
```
