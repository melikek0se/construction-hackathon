# Deploy: free hosting, chosen setup, steps

Researched 2026-11-21. Free tiers change often; most figures below come from third-party comparison pages and
were not checked against each vendor's own pricing page. Check before relying on a number.

## What the app needs from a host

- One container (Dockerfile in the repo root): FastAPI serves the API and the React build. About 130–170 MB
  of memory with project F opened (measured locally and in Docker).
- Requests up to about 90 s: the AI review of a large LV (project C: 90 s). Hosts that cut requests at 30–60 s
  (serverless functions, e.g. Vercel) do not fit.
- A Postgres database (`DATABASE_URL`). The server keeps nothing it needs on disk (D-026), so the host needs no volume; the PDF view writes project documents and drawn pages to `data/processed/pages/` as a cache it can rebuild.
- A public HTTPS URL, which the ElevenLabs webhooks will need as well.

## Options

| Host | Free offer | Fits? |
|------|-----------|-------|
| **Render** (web service) | free instance, 512 MB, 0.1 CPU, 750 h a month, no card; sleeps after 15 min idle, about 1 min to wake; 5 GB bandwidth a month | **yes**: chosen for the app |
| Render Postgres | 1 GB, **expires after 30 days**, no backups | no |
| **Neon** (Postgres) | 1 GB per project, 100 compute-hours a month, scales to zero, no expiry, no card | **yes**: chosen for the database |
| Supabase | 500 MB database, 1 GB files; **paused after a week without activity** | possible, but the pause can hit before a demo |
| Google Cloud Run | monthly free CPU/memory seconds and requests, timeout up to 60 min, scales to zero | good fit technically, but needs a billing account with a card |
| Railway | 30-day trial with 5 USD credit, then a small monthly credit (sources disagree) | trial only |
| Fly.io | no free tier for new accounts (1 USD trial credit, 7 days) | no |
| Koyeb | free instance withdrawn for new users after the Mistral deal (Feb 2026; sources conflict) | no |
| Hugging Face Spaces | docs still list free CPU Basic (16 GB); forum reports say it was restricted mid-2026; disk not persistent | unreliable |
| Oracle Cloud Always Free | Arm VM, up to 4 cores and 24 GB, unlimited time | strongest free machine, but card check at signup, capacity often unavailable, and we run the server ourselves |

## Chosen setup

**Render free web service (Docker) + Neon free Postgres, both in Frankfurt.** No card needed for either.
Cost: 0. What it costs us: the app sleeps after 15 minutes without visitors and needs about a minute to
wake. Open the URL a few minutes before a demo. Cloud Run + Neon is the upgrade path if a card is fine.

Files stay in the database: the whole dataset is 25 MB against Neon's 1 GB. If uploads grow past that, move the
file bytes to Cloudflare R2 (10 GB free) and keep only keys in `documents`.

## Locally, the same setup

- `docker compose up --watch`: the dev environment (`--watch` also rebuilds when `pyproject.toml` / `uv.lock`
  change and restarts the UI when `web/package-lock.json` changes). Postgres 17 (in place of Neon), the API with auto-reload (`src/`
  mounted, `dev` stage of the Dockerfile) on :8000, Vite with hot reload on http://localhost:5173.
- `docker compose --profile prod up --build`: the `prod` image, the one Render builds, on http://localhost:8080
  with password `demo`.

Both use the same database (volume `pgdata`; `docker compose down -v` wipes it). It starts empty: nothing is
put in automatically. The six dataset projects go in only on request: `docker compose exec api boq-seed`. Production differs only in its environment variables:
`DATABASE_URL` points to Neon, and `BOQ_PASSWORD` is a real password.

## Steps

1. **Neon**: create a project in region *Frankfurt (eu-central-1)*. Copy the **direct** connection string
   (not the `-pooler` one: psycopg prepares statements, which PgBouncer in transaction mode can break).
2. The database starts empty. To show the six dataset projects, put them in on purpose:
   `DATABASE_URL='postgresql://…' uv run boq-seed` (also copies the LLM answers in `data/cache/llm/`).
3. **Render**: New → Web Service → connect the GitHub repo (needs access to `melikek0se/construction-hackathon`)
   → runtime *Docker*, instance *Free*, region *Frankfurt*, health check path `/api/health`.
   Environment: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `BOQ_PASSWORD` (anyone with the link could otherwise
   spend API credit on the AI review), later `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID`.
4. Every push to `main` deploys again. The first build takes a few minutes (Node build + Python install).

## Open

- Whether Render's free instance lets a 90 s request finish. To be tested with the AI review on project C once
  it is deployed.
- Q9 in `OPEN_QUESTIONS.md`: may the dataset be public? The deployed demo shows it behind `BOQ_PASSWORD`. The
  GitHub repo holds it too.

## Sources

[Render free tier (agentdeals)](https://agentdeals.dev/vendor/render) ·
[Render free tier review (toolfreebie)](https://toolfreebie.com/render-hosting-review/) ·
[Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas) ·
[Supabase pricing](https://supabase.com/pricing) ·
[Cloud Run pricing](https://cloud.google.com/run/pricing) ·
[Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout) ·
[Railway free tier (kuberns)](https://kuberns.com/blogs/railway-free-tier/) ·
[Fly.io free trial](https://fly.io/docs/about/free-trial/) ·
[Koyeb free tier (srvrlss)](https://www.srvrlss.io/provider/koyeb/) ·
[Hugging Face Spaces overview](https://huggingface.co/docs/hub/en/spaces-overview) ·
[HF forum: CPU Basic quota](https://discuss.huggingface.co/t/free-cpu-basic-quota-is-0-on-new-account/180764) ·
[Oracle Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm) ·
[Cloudflare R2 free tier (agentdeals)](https://agentdeals.dev/vendor/cloudflare-r2)
