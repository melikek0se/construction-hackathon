"""The audit of what Claude was asked and what it cost: one row per request (table `llm_calls`).

Every place that calls the Claude API notes the request here with `record`: what it was for, the model that
answered, the token counts the API reported, how long it took. An answer taken from the app's own cache
(`llm_cache`) is noted too, with no tokens and 0 USD, so a second run that cost nothing shows as such.

What a request belongs to (project, file, pipeline run) is not passed down through the callers: the code
around the call says it once with `scope(...)`, and `record` reads it.

The USD figure is an estimate at list prices from the token counts, not what the invoice says. The token
counts are what the API returned and are the figure to trust. `key`: the last four characters of the API
key the request went out with, to tell which account pays.
"""
import os
from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy import func, insert, select

from boq import db

# USD per million tokens: input, output, cache read. A cache write costs 1.25 × input for five minutes,
# 2 × for one hour (`write`). A model that is not here has no USD figure, only token counts.
PRICES = {"claude-opus-5-5": (4.0, 20.0, 0.20), "claude-sonnet-5-5": (2.0, 10.0, 0.10)}
SEARCH_USD = 0.01  # one web search (server tool), billed on top of the tokens
TOKENS = ("input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")

_about: ContextVar[dict] = ContextVar("spend_about", default={})


@contextmanager
def scope(**about):
    """What the requests made inside belong to: any of project_id, file, run_id."""
    token = _about.set({**_about.get(), **{k: v for k, v in about.items() if v is not None}})
    try:
        yield
    finally:
        _about.reset(token)


def usd(model: str | None, usage: dict, write: float = 1.25) -> float | None:
    """What these tokens cost at list prices; None for a model without a price here."""
    price = PRICES.get(model or "")
    if price is None:
        return None
    p_in, p_out, p_read = price
    return round((usage.get("input_tokens", 0) * p_in + usage.get("cache_write_tokens", 0) * p_in * write
                  + usage.get("cache_read_tokens", 0) * p_read + usage.get("output_tokens", 0) * p_out) / 1e6, 4)


def answered(purpose: str, response, asked: str, ms: int | None = None, write: float = 1.25) -> None:
    """Note a request the API has answered: the model that answered (a fallback model, if the request was
    re-run on one; `asked` where the answer does not name it) and the token counts it reports. Never
    raises, whatever the answer looks like: the audit must not break the request it notes."""
    try:
        u = getattr(response, "usage", None)
        usage = {"input_tokens": getattr(u, "input_tokens", 0) or 0, "output_tokens": getattr(u, "output_tokens", 0) or 0,
                 "cache_read_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
                 "cache_write_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0}
        model = getattr(response, "model", None)
        tools = getattr(u, "server_tool_use", None)
        searches = getattr(tools, "web_search_requests", 0) or 0
        record(purpose, model if isinstance(model, str) and model else asked, usage, ms, write=write,
               searches=searches if isinstance(searches, int) else 0)
    except Exception:
        pass


def record(purpose: str, model: str | None, usage: dict | None = None, ms: int | None = None,
           cached: bool = False, write: float = 1.25, searches: int = 0) -> None:
    """Note one request. `cached`: answered from the app's own cache, nothing was sent. `searches`: web
    searches the request ran, each billed on top of the tokens. Never raises: the audit must not break the
    request it notes."""
    usage = usage or {}
    about = _about.get()
    try:
        cost = 0.0 if cached else usd(model, usage, write)
        if cost is not None and searches:
            cost = round(cost + searches * SEARCH_USD, 4)
        with db.engine().begin() as conn:
            conn.execute(insert(db.llm_calls).values(
                created=db.now(), purpose=purpose, project_id=about.get("project_id"), file=about.get("file"),
                run_id=about.get("run_id"), model=model or "", cached=cached, ms=ms,
                key=(os.environ.get("ANTHROPIC_API_KEY") or "")[-4:] or None,
                usd=cost, **{t: int(usage.get(t, 0)) for t in TOKENS}))
    except Exception:
        pass


def _row(row) -> dict:
    return {"id": row.id, "created": row.created.isoformat(timespec="seconds"), "purpose": row.purpose,
            "project_id": row.project_id, "file": row.file, "run_id": row.run_id, "model": row.model,
            "cached": row.cached, "ms": row.ms, "usd": row.usd, "key": row.key, **{t: getattr(row, t) for t in TOKENS}}


def audit(project_id: str | None = None, limit: int = 200) -> dict:
    """What was spent, of one project or in all: the sum, the sum per purpose, and the latest requests."""
    c = db.llm_calls.c
    where = [c.project_id == project_id] if project_id else []
    sums = [func.count().label("calls"), func.sum(func.coalesce(c.usd, 0)).label("usd"),
            *(func.sum(getattr(c, t)).label(t) for t in TOKENS)]
    with db.engine().connect() as conn:
        groups = conn.execute(select(c.purpose, c.cached, *sums).where(*where).group_by(c.purpose, c.cached)).all()
        unpriced = conn.execute(select(func.count()).where(*where, c.usd.is_(None))).scalar() or 0
        keys = [k for (k,) in conn.execute(select(c.key).where(*where, c.cached.is_(False)).distinct()) if k]
        latest = conn.execute(select(db.llm_calls).where(*where).order_by(c.created.desc(), c.id.desc()).limit(limit)).all()
    by_purpose: dict[str, dict] = {}
    for g in groups:
        entry = by_purpose.setdefault(g.purpose, {"purpose": g.purpose, "requests": 0, "cached": 0, "usd": 0.0,
                                                  **dict.fromkeys(TOKENS, 0)})
        if g.cached:
            entry["cached"] += g.calls
        else:
            entry["requests"] += g.calls
            entry["usd"] = round(entry["usd"] + (g.usd or 0), 4)
            for t in TOKENS:
                entry[t] += getattr(g, t) or 0
    rows = sorted(by_purpose.values(), key=lambda e: -e["usd"])
    outside = None
    if project_id:  # what was spent on no project at all (mail sorted before a project existed, partners read,
        # searches made from the partners page): shown beside a project's sum so the whole bill stays in view
        with db.engine().connect() as conn:
            parts = conn.execute(select(c.purpose, func.count(), func.sum(func.coalesce(c.usd, 0)))
                                 .where(c.project_id.is_(None), c.cached.is_(False)).group_by(c.purpose)).all()
        outside = {"usd": round(sum(u or 0 for _, _, u in parts), 4), "requests": sum(n for _, n, _ in parts),
                   "purposes": [p for p, _, u in sorted(parts, key=lambda r: -(r[2] or 0))]}
    return {"outside": outside, "usd": round(sum(e["usd"] for e in rows), 4), "requests": sum(e["requests"] for e in rows),
            "cached": sum(e["cached"] for e in rows),
            "unpriced": unpriced,  # requests answered by a model without a list price here: tokens only
            "keys": keys, "by_purpose": rows, "calls": [_row(r) for r in latest]}
