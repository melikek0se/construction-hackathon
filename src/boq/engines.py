"""Which Claude model does which work: one choice per task, made on the Pipeline page and kept in the
database (table `settings`, key "models").

Every place that calls the Claude API asks `of(task, default)` at the moment of the request, so a choice
holds from the next request on, without a restart. Nothing chosen: the default, which is what the
environment says (`BOQ_LLM_MODEL`, for the chat `BOQ_CHAT_MODEL`) or Claude Opus 5.5.

The effort (how much the model thinks: low to max) is chosen the same way, per task, and asked with
`effort(task, default)`; kept under the key "efforts". Nothing chosen: the environment (`BOQ_LLM_EFFORT`,
`BOQ_CHAT_EFFORT`, `BOQ_REPLY_EFFORT`), else medium for the AI review and low for everything else.

A new call to the API gets a line in `TASKS` (or joins one) and asks `of` and `effort`.
"""
import os

from sqlalchemy import delete, insert, select

from boq import db

# The models that can be chosen. All of them take the requests as the code sends them (adaptive thinking,
# effort, JSON schema output, web search). List prices are in boq.spend.PRICES.
MODELS: list[dict] = [
    {"id": "claude-fable-5-2", "name": "Fable 5.2", "note": "most capable, slowest, twice the price of Opus"},
    {"id": "claude-opus-5-5", "name": "Opus 5.5", "note": "the default: strong judgement"},
    {"id": "claude-sonnet-5-5", "name": "Sonnet 5.5", "note": "faster, half the price of Opus"},
    {"id": "claude-haiku-5-5", "name": "Haiku 5.5", "note": "fastest and by far the cheapest; for sorting and reading out"},
]

DEFAULT = os.environ.get("BOQ_LLM_MODEL", "claude-opus-5-5")
EFFORTS = ["low", "medium", "high", "xhigh", "max"]  # every model above takes all five

# key -> name, what the model does there, the audit's purposes (boq.spend) it stands behind
TASKS: list[dict] = [
    {"key": "review", "name": "AI review", "purposes": ["AI review", "second look"],
     "what": "Reads the LV title by title for errors, risks and change-order potential, then its own findings a second time.",
     "note": "Answers are kept per model and effort: another one reads every LV afresh."},
    {"key": "chat", "name": "Questions about the project", "purposes": ["chat", "chat, all projects"],
     "what": "Answers in the chat and in Polier from the passages found in the documents."},
    {"key": "inbox", "name": "Mail sorted", "purposes": ["mail sorted"],
     "what": "Tells a tender invitation in the mailbox from everything else and reads out what it is."},
    {"key": "reply", "name": "Client's reply read", "purposes": ["reply read"],
     "what": "Matches the client's answers to the bidder questions that were asked."},
    {"key": "plan", "name": "Price inquiries planned", "purposes": ["price inquiries planned"],
     "what": "Sorts the items of an LV into packages for suppliers and subcontractors."},
    {"key": "quote", "name": "Quote read", "purposes": ["quote read"],
     "what": "Reads a supplier's quote back onto the items that were asked."},
    {"key": "answer", "name": "Answer to a supplier", "purposes": ["answer to a supplier drafted"],
     "what": "Drafts the reply to a supplier's question about an inquiry."},
    {"key": "partners", "name": "Partner read",
     "purposes": ["partner read", "partner's style read", "inquiry written in the partner's style", "partners found put into a list"],
     "what": "Reads what is known about a partner, how it writes, and words an inquiry that way."},
    {"key": "search", "name": "Partners looked for on the web", "purposes": ["partners looked for on the web"],
     "what": "Searches the web for suppliers and subcontractors: the one task where the model decides its own steps."},
]
_KEYS = {t["key"] for t in TASKS}
_IDS = {m["id"] for m in MODELS}


def _default(task: str) -> str:
    return os.environ.get("BOQ_CHAT_MODEL", DEFAULT) if task == "chat" else DEFAULT


def _default_effort(task: str) -> str:
    env = {"review": ("BOQ_LLM_EFFORT", "medium"), "chat": ("BOQ_CHAT_EFFORT", "low"), "reply": ("BOQ_REPLY_EFFORT", "low")}
    name, otherwise = env.get(task, ("", "low"))
    return os.environ.get(name, otherwise) if name else otherwise


def _kept(key: str) -> dict[str, str]:
    """One row of choices, task -> value. Never raises: a request must not fail on it."""
    try:
        with db.engine().connect() as conn:
            kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == key)).scalar()
    except Exception:
        return {}
    return {k: v for k, v in (kept or {}).items() if k in _KEYS and isinstance(v, str) and v}


def chosen() -> dict[str, str]:
    """What was chosen on the Pipeline page, task -> model id."""
    return _kept("models")


def effort(task: str, default: str | None = None) -> str:
    """The effort for this task now: the choice, else `default` (the caller's own constant), else the environment's."""
    return _kept("efforts").get(task) or default or _default_effort(task)


def of(task: str, default: str | None = None) -> str:
    """The model for this task now: the choice, else `default` (the caller's own constant), else the environment's."""
    return chosen().get(task) or default or _default(task)


def overview() -> dict:
    """The models on offer and every task with its model, for the page."""
    from boq.spend import PRICES  # here, not at the top: spend is imported by everything that calls the API

    picked, efforts = chosen(), _kept("efforts")
    models = [*MODELS]
    for extra in sorted({_default(t["key"]) for t in TASKS} | set(picked.values())):  # a model named in .env only
        if extra not in _IDS:
            models.append({"id": extra, "name": extra, "note": "set in the environment"})
    return {"models": [{**m, "input": PRICES.get(m["id"], (None, None))[0], "output": PRICES.get(m["id"], (None, None))[1]}
                       for m in models],
            "efforts": EFFORTS,
            "tasks": [{**t, "default": _default(t["key"]), "model": picked.get(t["key"]) or _default(t["key"]),
                       "default_effort": _default_effort(t["key"]),
                       "effort": efforts.get(t["key"]) or _default_effort(t["key"])}
                      for t in TASKS]}


def _keep(key: str, values: dict[str, str | None], default) -> None:
    new = {**_kept(key), **{k: v for k, v in values.items() if v}}
    new = {k: v for k, v in new.items() if values.get(k, v) and v != default(k)}
    with db.engine().begin() as conn:
        conn.execute(delete(db.settings).where(db.settings.c.key == key))
        if new:
            conn.execute(insert(db.settings).values(key=key, value=new))


def choose(models: dict[str, str | None] | None = None, efforts: dict[str, str | None] | None = None) -> dict:
    """Set the model and the effort of some tasks; None or the default puts a task back to its default."""
    models, efforts = models or {}, efforts or {}
    for task in [*models, *efforts]:
        if task not in _KEYS:
            raise ValueError(f"There is no task „{task}“.")
    for task, model in models.items():
        if model and model not in _IDS and model != _default(task):
            raise ValueError(f"„{model}“ is not a model that can be chosen here.")
    for level in efforts.values():
        if level and level not in EFFORTS:
            raise ValueError(f"„{level}“ is not an effort: {', '.join(EFFORTS)}.")
    if models:
        _keep("models", models, _default)
    if efforts:
        _keep("efforts", efforts, _default_effort)
    return overview()
