"""The database: projects, their documents (file bytes included), analyses and the LLM answer cache.

DATABASE_URL picks it: Postgres in production (e.g. Neon), a SQLite file in data/ when unset. File bytes live
in the database too, so the server keeps no state on disk and runs on any host that can reach the database.
Tables are created on first use. There are no migrations; a column added to a table here is added to an
existing database on start (`_add_new_columns`), any other change means a new database.
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (JSON, Float, Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, MetaData, String, Table, Text,
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
    Column("message_id", Text),  # Message-ID of a message the app sent: a reply names it (In-Reply-To)
    Column("reply_via", String(16)),  # "pasted" by the user, or "imap": found in the inbox
    Column("meta", JSON),  # price inquiries: the package and the supplier the message went to
)

# What an answer of the client changes on our side, proposed by the app and decided by the estimator. The
# client's file is never changed: an accepted amendment is laid over the LV as the app shows and prices it.
amendments = Table(
    "amendments", metadata,
    Column("id", String(32), primary_key=True),
    Column("project_id", String(32), index=True),
    Column("file", Text, nullable=False),
    Column("item_oz", Text),
    Column("kind", String(16), nullable=False),  # "settle", "quantity", "unit", "text", "allowance"
    Column("value", JSON, nullable=False),  # what it does: note, findings closed, new quantity, percent ...
    Column("quote", Text, nullable=False, default=""),  # the passage of the reply it rests on
    Column("mail_id", String(32), index=True),
    Column("key", String(32)),  # the question it answers
    Column("status", String(16), nullable=False),  # "proposed", "accepted", "rejected"
    Column("created", DateTime(timezone=True), nullable=False),
    Column("decided", DateTime(timezone=True)),
)

# The estimator's unit prices on an LV file: the bid in progress (boq.bid).
bid_prices = Table(
    "bid_prices", metadata,
    Column("n", Integer, primary_key=True, autoincrement=True),
    Column("project_id", String(32), index=True),
    Column("file", Text, nullable=False),
    Column("item_oz", Text, nullable=False),
    Column("unit_price", Text, nullable=False),  # decimal as text: the price before any allowance
    Column("source", String(16), nullable=False),  # "own": typed in; "suggestion": taken from past bids
    Column("updated", DateTime(timezone=True), nullable=False),
)

# The directory of who sells what (boq.supply): suppliers of material and subcontractors for whole trades.
# Filled by the estimator, by the quotes that come in (what a supplier offered) and by a web search the
# estimator confirms; an LV does not say who sells a product.
suppliers = Table(
    "suppliers", metadata,
    Column("id", String(32), primary_key=True),
    Column("created", DateTime(timezone=True), nullable=False),
    Column("name", Text, nullable=False),
    Column("kind", String(16), nullable=False),  # "supplier" (material) or "subcontractor" (a whole trade)
    Column("email", Text, nullable=False, default=""),
    Column("contact", Text, nullable=False, default=""),
    Column("phone", Text, nullable=False, default=""),
    Column("place", Text, nullable=False, default=""),
    Column("groups", JSON, nullable=False),  # material groups or trades, as words: ["Rohre", "Armaturen"]
    Column("products", JSON, nullable=False),  # what it offered or is known to sell: [{"name", "maker"}]
    Column("note", Text, nullable=False, default=""),
    Column("source", String(16), nullable=False),  # "user", "quote" (learned from a reply), "web", "demo"
    # what else the agent knows about the firm (boq.partners.MORE): website, our customer number there, more
    # contact persons, flags (preferred, blocked, not to be phoned), a subcontractor's documents with their
    # expiry, where a web search found it, and how it writes (`style`, worked out from its messages)
    Column("more", JSON),
)

# Mail to and from a partner that is no inquiry of the app: the history found in the mailbox or handed over as
# .eml files (boq.partners). It is what the way a partner writes is read from.
partner_messages = Table(
    "partner_messages", metadata,
    Column("id", String(32), primary_key=True),
    Column("supplier_id", String(32), nullable=False, index=True),
    Column("at", DateTime(timezone=True), nullable=False),
    Column("direction", String(4), nullable=False),  # "in": the partner wrote; "out": we wrote
    Column("subject", Text, nullable=False, default=""),
    Column("text", Text, nullable=False, default=""),
    Column("via", String(16), nullable=False),  # "imap", "eml", "demo"
    Column("message_id", Text),
)

# A look into the web for suppliers or subcontractors (boq.partners.discover): what was looked for and why,
# the queries the model ran, and the firms found, each with the page it was found on. A firm found is a
# candidate until the estimator takes it into the directory; nobody is written to from here.
partner_searches = Table(
    "partner_searches", metadata,
    Column("id", String(32), primary_key=True),
    Column("created", DateTime(timezone=True), nullable=False, index=True),
    Column("what", Text, nullable=False),  # the material group or trade, in German
    Column("kind", String(16), nullable=False),  # "supplier" or "subcontractor"
    Column("region", Text, nullable=False, default=""),
    Column("reason", Text, nullable=False, default=""),  # "asked for", or the gap that set it off
    Column("by", String(16), nullable=False),  # "you" or "polier" (on its own)
    Column("project_id", String(32)),
    Column("queries", JSON, nullable=False),
    Column("candidates", JSON, nullable=False),
    Column("note", Text, nullable=False, default=""),
    Column("usd", Float),
)

# What the agent worked out for the price inquiries of one LV file (boq.supply): the packages of items, who
# is to be asked about each, the items that wait for the client; and what the estimator chose per package.
supply_plans = Table(
    "supply_plans", metadata,
    Column("id", String(32), primary_key=True),
    Column("project_id", String(32), index=True),
    Column("file", Text, nullable=False),
    Column("created", DateTime(timezone=True), nullable=False),
    Column("plan", JSON, nullable=False),
    Column("chosen", JSON),  # per package id: {"mode": "single" | "split" | "assume", "quote": id}
)

# A quote as it came back and was read: its terms and one line per item it prices. Kept for good: the next
# tender with the same item finds the price here, with its date and validity.
quotes = Table(
    "quotes", metadata,
    Column("id", String(32), primary_key=True),
    Column("created", DateTime(timezone=True), nullable=False),
    Column("project_id", String(32), index=True),
    Column("file", Text, nullable=False),
    Column("mail_id", String(32), index=True),
    Column("supplier_id", String(32), index=True),
    Column("package", String(16), nullable=False),
    Column("terms", JSON, nullable=False),  # basis, freight, discount_pct, skonto, valid_until, binding, note
    Column("lines", JSON, nullable=False),  # per item: oz, unit_price, unit, product, alternative, note, label
    Column("text", Text, nullable=False, default=""),  # the reply as it arrived
)

# What Polier did, one row per thing (boq.events): read by the estimator after being away.
events = Table(
    "events", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("created", DateTime(timezone=True), nullable=False, index=True),
    Column("project_id", String(32), index=True),
    Column("kind", String(16), nullable=False),  # tender, answer, quote, asks, decline, released, run, call
    Column("text", Text, nullable=False),
    Column("move", String(16), nullable=False, default=""),  # whose move it leaves: you, client, supplier, ""
)

# Small facts about the firm itself that every inquiry carries (boq.supply.company): one row per key.
settings = Table(
    "settings", metadata,
    Column("key", String(32), primary_key=True),
    Column("value", JSON, nullable=False),
)

# A run of the pipeline (boq.pipeline) on a project, in the background (boq.runs). `state` is the record the
# pages show: status, and one row per step and document with what it found. `results` holds what the run
# worked out and a later request needs: the AI findings per document.
runs = Table(
    "runs", metadata,
    Column("id", String(32), primary_key=True),
    Column("project_id", String(32), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("created", DateTime(timezone=True), nullable=False, index=True),
    Column("status", String(16), nullable=False),  # queued, running, done, failed
    Column("state", JSON, nullable=False),
    Column("results", JSON),
)

# The audit of the requests to the Claude API (boq.spend): one row per request, and one per answer taken from
# llm_cache instead (cached, no tokens). No foreign keys: a row outlives its project and its run.
llm_calls = Table(
    "llm_calls", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("created", DateTime(timezone=True), nullable=False, index=True),
    Column("purpose", String(48), nullable=False),  # "AI review", "second look", "chat", "chat, all projects", "reply read"
    Column("project_id", String(32), index=True),
    Column("file", Text),
    Column("run_id", String(32)),
    Column("model", String(64), nullable=False),  # the model that answered
    Column("key", String(8)),  # last four characters of the API key
    Column("cached", Boolean, nullable=False),
    Column("input_tokens", Integer, nullable=False),
    Column("output_tokens", Integer, nullable=False),
    Column("cache_read_tokens", Integer, nullable=False),
    Column("cache_write_tokens", Integer, nullable=False),
    Column("ms", Integer),
    Column("usd", Float),  # estimate at list prices; unset for a model without one
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
