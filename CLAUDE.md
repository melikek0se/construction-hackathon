# Construction hackathon — Challenge A: AI BoQ analysis and bidding assistant

Hackathon prototype: a web app where a contractor's estimator uploads a German bill of quantities
(Leistungsverzeichnis, LV), gets errors / risks / change-order potential per item, and price support.
Deliverables are a live demo and a pitch. Speed and a convincing demo matter more than completeness.

## Read first

- `docs/STATE.md` — what exists, what is next. **Read at the start of every session.**
- `docs/DECISIONS.md` — decided vs proposed. Do not re-argue decided entries.
- `docs/OPEN_QUESTIONS.md` — unknowns; check before assuming.

Read when relevant:

- `docs/01-challenge-analysis.md` — brief, priorities, check catalogue, pitch skeleton
- `docs/02-dataset.md` — the six projects in `dataset/`, format notes, gotchas (read before touching a parser)
- `docs/03-domain-primer.md` — glossary, how unit prices are built, VOB rules, red-flag wording, tooling
- `docs/04-field-insights.md` — a civil engineer's input and what it means for the design
- `docs/05-voice-agent.md` — supplier-call voice agent (ElevenLabs): concept, API plan, legal
- `docs/06-architecture.md` — proposed stack, data model, build order

## Keeping state

- After finishing, starting or dropping something: update `docs/STATE.md`.
- After a choice that constrains later work: append to `docs/DECISIONS.md`.
- New unknown: add to `docs/OPEN_QUESTIONS.md`; when answered, move it to "Answered" with the answer.

## Priorities

1. Upload → parse → findings → risk report, end to end. This is the judged core.
2. Prices with provenance, what-if.
3. Supplier inquiry loop (email, then voice). Time-boxed.

Build the thinnest end-to-end path first, then widen. No auth, no multi-tenancy, no premature abstractions.
Tests only where they protect the demo (parsers).

## Domain rules that are easy to get wrong

- The LV quantity is the installed quantity, set by the client. Waste goes into material cost and order quantity,
  never onto the LV quantity.
- A unit price is labour + material + equipment + other, plus overheads. A supplier quote covers only the material part.
- Never present a price without source, date and confidence. "No reliable price" is a valid result.
- A finding needs: item number, quoted evidence, why it matters, suggested action. No evidence, no finding.
- Fewer, well-founded findings beat many weak ones. Rank by money at stake.
- UI and report text for the user may be English; LV content stays German and is never translated in place.

## Data gotchas (details in `docs/02-dataset.md`)

- GAEB 90 files: encoding differs per file (cp850 vs latin-1); unit-price decimals differ per file (2 or 3).
  Verify with `EP × Qty = GP`.
- GAEB XML: two namespaces (3.1, 3.2) — match by local element name.
- Anonymisation tokens like `[FIRMA_044]`, `[ORT_016]`, `TELEFON_084` also replaced product names and standards.
  Checks must ignore them; tell the LLM about them.
- Units are spelled many ways (`St`/`Stk.`, `m3`/`m³`, `h`/`Std.`). Normalise first.
- `dataset/` is read-only input (subfolders by format: GAEB XML, GAEB 90, PDF building project, PDF civil, item lists). Derived files go to `data/processed/` (git-ignored).

## Commands

```bash
uv sync                                # install (Python 3.12/3.13 via uv)
uv run boq FILE                        # parse a GAEB file, print rule findings; --json, --min-severity warn
uv run uvicorn boq.api:app --reload    # API on :8000 (POST /api/analyze, GET /api/samples)
cd web && npm install && npm run dev   # UI on :5173, proxies /api to :8000
cd web && npm run build                # type-check + build; the API then serves web/dist at /
uv run pytest -q                       # parsers, checks and API against dataset/
python3 scripts/inspect_dataset.py     # dataset inventory, priced totals (stdlib only)
```

Code: `src/boq/parsers` (GAEB XML, GAEB 90) → `boq.model` → `src/boq/checks` (`rules.py` per item,
`companions.py` + `companion_rules.py` for missing items) → `src/boq/api.py` → `web/` (Vite + React, one screen:
`web/src/App.tsx`).

## Conventions

- Secrets in `.env` (see `.env.example`); never commit them.
- Python via `uv` (system Python is 3.9 — too old; pin 3.12).
- When writing Claude API or ElevenLabs code, check current docs instead of relying on memory.
