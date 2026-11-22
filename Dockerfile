# Stages: web (React build) → python (dependencies + src) → dev (docker compose, code mounted, auto-reload)
# → mail (the demo mail server and webmail) → prod (the last stage, which Render builds: one stateless image,
# data in DATABASE_URL).
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

# The mail server of the demo and its webmail (docker/mail.sh): Stalwart's binary, PHP with Roundcube, and
# boq-mail from the package above. The `mail` service of docker-compose.yml is this stage; prod builds on it.
FROM python AS mail
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
      php-cli php-sqlite3 php-mbstring php-intl php-xml php-curl php-zip php-gd \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://github.com/roundcube/roundcubemail/releases/download/1.6.21/roundcubemail-1.6.21-complete.tar.gz | tar xz -C /opt \
    && mv /opt/roundcubemail-1.6.21 /opt/roundcube && mkdir /opt/www && ln -s /opt/roundcube/public_html /opt/www/webmail
COPY --from=stalwartlabs/stalwart:v1 /usr/local/bin/stalwart /usr/local/bin/stalwart
COPY docker/roundcube.inc.php /opt/roundcube/config/config.inc.php
COPY docker/mail.sh docker/start.sh /app/
COPY mock/ mock/
CMD ["/app/mail.sh"]

FROM mail AS prod
# the dataset is reference data at run time: price history, the sample picker, and the demo seed
COPY dataset/ dataset/
COPY --from=web /web/dist web/dist
EXPOSE 8000
CMD ["/app/start.sh"]
