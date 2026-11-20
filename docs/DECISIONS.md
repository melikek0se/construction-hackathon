# Decisions

Append-only log. One entry per decision: what, why, and what would make us revisit it.
Status is **decided** (team agreed) or **proposed** (recommendation, waiting for the team).

## D-001 — Error detection and risk report are the core; pricing and voice come second
Status: proposed · 2026-11-20

The brief marks error detection as "priority" and asks for a risk report as the deliverable. Pricing is "optional".
Upload → findings → report must work end to end before anyone starts on prices or voice.
Revisit if: the organisers publish judging criteria that weight innovation over the stated priorities.

## D-002 — Build on GAEB first, PDF later
Status: proposed · 2026-11-20

GAEB parsing is deterministic and the dataset has GAEB for four of six projects. Three projects exist as GAEB and PDF,
so the GAEB version is the ground truth for testing the PDF parser.
Revisit if: the jury's demo file turns out to be PDF only (ask — Q5).

## D-003 — Stack: Python/FastAPI backend, React frontend, Claude API, SQLite or JSON
Status: proposed · 2026-11-20

Python has the best PDF and data tooling; details in `06-architecture.md`.
Revisit if: the team is stronger in TypeScript end to end.

## D-004 — Rule-based checks before LLM checks
Status: proposed · 2026-11-20

Rules are fast, free, explainable and cannot hallucinate. The LLM is used for what rules cannot do (unclear scope,
missing items, contradictions). Every finding carries its origin (`rule` / `llm`) and quoted evidence.

## D-005 — A price is never shown without source, date and confidence
Status: proposed · 2026-11-20

From the field insights: no price is fully reliable or current. Items without a reliable price are shown as price
gaps instead of receiving a confident-looking estimate. See `04-field-insights.md` #4.

## D-006 — Voice agent: yes, time-boxed, browser role-play on stage, ElevenLabs
Status: proposed · 2026-11-20

Differentiator, but not the judged core. Starts only after D-001 is met; about four hours for one person; email RFQ is
built first as the fallback sharing the same data model; no real supplier is called. See `05-voice-agent.md`.

## D-007 — Repository docs in English, German domain terms kept and glossed
Status: proposed · 2026-11-20

The brief and the pitch are in English; the data is German. Team conversation can be in any language.

## D-008 — Raw dataset is committed under `data/raw/`
Status: proposed · 2026-11-20

It is anonymised, 25 MB, and every teammate needs it. The original zip is redundant.
Revisit if: the organisers restrict redistribution and the repository is public (Q9).
