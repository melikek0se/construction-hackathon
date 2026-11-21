"""The database: projects, their documents (file bytes included), analyses and the LLM answer cache.

DATABASE_URL picks it: Postgres in production (e.g. Neon), a SQLite file in data/ when unset. File bytes live
in the database too, so the server keeps no state on disk and runs on any host that can reach the database.
Tables are created on first use. There are no migrations; a column added to a table here is added to an
existing database on start (`_add_new_columns`), any other change means a new database.
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (JSON, Column, DateTime, ForeignKey, Integer, LargeBinary, MetaData, String, Table, Text,
                        create_engine, inspect, text)
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parents[2]

metadata = MetaData()

projects = Table(
    "projects", metadata,
    Column("id", String(32), primary_key=True),
    Column("name", Text, nullable=False),
    Column("number", Text, nullable=False, default=""),
    Column("trade", Text, nullable=False, default=""),
    Column("note", Text, nullable=False, default=""),
    Column("kind", String(16), nullable=False),  # "versions" (one LV) or "trades" (several LVs)
    Column("source", String(16), nullable=False),  # "upload" or "demo" (seeded from dataset/)
    Column("created", DateTime(timezone=True), nullable=False),
    Column("summary", JSON),  # the projects-page numbers, worked out once; cleared when files change
    # where the tender stands and its dates, read from the files or set by the user: stage, questions_due, due,
    # opening, sent, binding_until, exec_start, exec_end
    Column("plan", JSON),
)

documents = Table(
    "documents", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("project_id", String(32), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("position", Integer, nullable=False),  # order within the project; the first one opens it
    Column("name", Text, nullable=False),  # file name as uploaded
    Column("role", String(32), nullable=False),  # tender, bid, award, ...
    Column("format", String(16), nullable=False),  # GAEB XML, GAEB 90, PDF, Excel
    Column("data", LargeBinary, nullable=False),
    Column("size", Integer, nullable=False),
    Column("sha256", String(64), nullable=False),
    Column("created", DateTime(timezone=True), nullable=False),
)

analyses = Table(
    "analyses", metadata,
    Column("id", String(32), primary_key=True),
    Column("created", DateTime(timezone=True), nullable=False, index=True),
    Column("boq", JSON, nullable=False),
    Column("findings", JSON, nullable=False),
    Column("llm_findings", JSON),  # set once the AI review has run
    Column("project_id", String(32)),  # the project the file was opened from, if any
)

# Mail the estimator writes from the app, and the answer that came back. One row is one message with what
# it is about: `kind` says which traffic it belongs to. Bidder questions to the client are the first kind;
# price inquiries to suppliers are meant to be the second, on the same columns (see boq.mail).
mails = Table(
    "mails", metadata,
    Column("id", String(32), primary_key=True),
    Column("kind", String(32), nullable=False),  # "bidder_questions"
    Column("project_id", String(32), index=True),  # no foreign key: a file opened on its own has none
    Column("file", Text, nullable=False),  # the LV file the message is about, by name
    Column("created", DateTime(timezone=True), nullable=False),
    Column("to", Text, nullable=False),
    Column("subject", Text, nullable=False),
    Column("body", Text, nullable=False),
    Column("via", String(16), nullable=False),  # "draft": opened in the user's mail program; "smtp": sent by the app
    Column("sent_at", DateTime(timezone=True)),  # unset: a draft the user has not confirmed as sent
    Column("items", JSON, nullable=False),  # what was asked, as it stood then (for questions: key, item, text)
    Column("reply", Text),  # the answer as it came back, pasted in
    Column("reply_at", DateTime(timezone=True)),
    Column("answers", JSON),  # the reply read against the items: per key a status and the passage of the reply
)

llm_cache = Table(
    "llm_cache", metadata,
    Column("key", String(64), primary_key=True),
    Column("value", JSON, nullable=False),
    Column("created", DateTime(timezone=True), nullable=False),
)

_engine: Engine | None = None


def url() -> str:
    raw = os.environ.get("DATABASE_URL") or f"sqlite:///{ROOT / 'data' / 'boq.db'}"
    # hosted Postgres hands out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver named
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


def engine() -> Engine:
    global _engine
    if _engine is None:
        target = url()
        if target.startswith("sqlite:///"):
            Path(target.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        # pre_ping: a serverless Postgres (Neon) closes idle connections; reconnect instead of failing
        _engine = create_engine(target, pool_pre_ping=True)
        if _engine.dialect.name == "sqlite":
            from sqlalchemy import event

            @event.listens_for(_engine, "connect")
            def _fk_on(conn, _record):  # SQLite ignores ON DELETE CASCADE unless asked
                conn.execute("PRAGMA foreign_keys=ON")
        metadata.create_all(_engine)
        _add_new_columns(_engine)
    return _engine


def _add_new_columns(target: Engine) -> None:
    """A database made by an earlier version lacks the nullable columns added since; add them."""
    for table in metadata.sorted_tables:
        have = {c["name"] for c in inspect(target).get_columns(table.name)}
        for column in table.columns:
            if column.name not in have and column.nullable:
                kind = column.type.compile(dialect=target.dialect)
                with target.begin() as conn:
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {kind}'))


def use(target: str) -> None:
    """Point the module at another database (tests)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None
    os.environ["DATABASE_URL"] = target


def now() -> datetime:
    return datetime.now(timezone.utc)
