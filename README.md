# Polier

🥈 **2nd place at the tum.ai Construction Hackathon**: Challenge A, *AI Estimation and Bidding Assistant for Bills of Quantities*.

Polier is a web app for the estimator (Kalkulator) at a German contractor. Drop in a tender's bill of quantities
(Leistungsverzeichnis, LV) and it reads it, finds errors, risks and change-order potential per item, writes the
bidder questions to the client, and helps price the bid, with a source, date and confidence on every price.

**Demo video:** https://youtu.be/2p-mdkDk9NY · **Pitch deck:** [`docs/pitch/deck.pdf`](docs/pitch/deck.pdf)

## What it does

- **Reads LVs** in GAEB XML (X83/X84/X86), GAEB 90 (D83/D84/D86), PDF with a text layer, and Excel.
  It works out which files belong together and the tender's dates (deadline, binding period, execution).
- **Finds problems**: deterministic rule checks per item, missing companion items, checks across several trade LVs
  of one project, and Claude API checks. Every finding has the item number, the quoted text, why it matters
  and what to do. Findings are ranked by the money at stake and marked on the original PDF pages.
- **Bidder questions**: written from the findings and sent by e-mail. The client's answer is read back,
  and the app proposes what it changes in the LV.
- **Prices**: unit-price suggestions from earlier priced bids, a what-if on the total, the bid's price risk and the
  allowance that covers it, and the bid exported as GAEB X84 and CSV.
- **Supplier inquiries**: material and subcontractor packages per LV, inquiries by e-mail with an Excel sheet,
  quotes read back and compared, and a register of partners kept across tenders.
- **Pipeline**: each step (read, rules, AI, compare, questions, prices) runs in the background when a tender
  arrives in the mailbox and waits for the estimator where a person has to decide.
- **Ask Polier**: a chat that answers questions about one project or about all of them, with the passages it used.

## Stack

Python 3.12 (FastAPI, `uv`), Postgres or SQLite, React + Vite, the Claude API, and a demo mail server (Stalwart).

## Quick start

```bash
cp .env.example .env            # add ANTHROPIC_API_KEY
docker compose up --watch       # UI :5173, API :8000, Postgres :5432, webmail :8025/webmail/ (password "demo")
uv run boq-seed                 # load the six dataset projects
```

Without Docker:

```bash
uv sync
uv run uvicorn boq.api:app --reload          # API
cd web && npm install && npm run dev         # UI, proxies /api to :8000
uv run boq dataset/<file>                    # CLI: parse an LV and print its findings (--report out.html, --llm, --prices)
uv run pytest -q
```

All commands are listed in [`CLAUDE.md`](CLAUDE.md).

## Docs

| File | Content |
|------|---------|
| [`docs/01-challenge-analysis.md`](docs/01-challenge-analysis.md) | The brief, what wins, product shape, check catalogue, pitch skeleton |
| [`docs/02-dataset.md`](docs/02-dataset.md) | What is in `dataset/`: six projects, three priced bids, formats, gotchas |
| [`docs/03-domain-primer.md`](docs/03-domain-primer.md) | German estimating, VOB, red-flag wording, tooling, competitors |
| [`docs/04-field-insights.md`](docs/04-field-insights.md) | A civil engineer's input, assessed |
| [`docs/06-architecture.md`](docs/06-architecture.md) | Stack, data model, build order |
| [`docs/07-user-flows.md`](docs/07-user-flows.md) | Projects, LVs and versions |
| [`docs/08-deploy.md`](docs/08-deploy.md) | Hosting and deploy steps |
| [`docs/09-price-inquiries.md`](docs/09-price-inquiries.md) | Asking suppliers and subcontractors for prices |
| [`docs/10-demo-video.md`](docs/10-demo-video.md) | The demo video |
| [`docs/STATE.md`](docs/STATE.md) · [`DECISIONS.md`](docs/DECISIONS.md) · [`OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Project memory |
