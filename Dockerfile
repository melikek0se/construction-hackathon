# Stages: web (React build) → python (dependencies + src) → dev (docker compose, code mounted, auto-reload)
# → prod (the last stage, which Render builds: one stateless image, data in DATABASE_URL).
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS python
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ src/
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"

FROM python AS dev
# src/, dataset/ and data/ are mounted by docker-compose.yml; the package is installed editable, so edits count
RUN uv sync --frozen
CMD ["uvicorn", "boq.api:app", "--reload", "--reload-dir", "src", "--host", "0.0.0.0", "--port", "8000"]

FROM python AS prod
# the dataset is reference data at run time: price history, the sample picker, and the demo seed
COPY dataset/ dataset/
COPY --from=web /web/dist web/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn boq.api:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
