"""LLM checks: what the rules cannot see (unclear scope, contradictions, missing work, risk shifted
to the bidder). One request per title, run in parallel, results cached on disk.

Every finding must quote the LV verbatim. A quote that is not in the item text (or the preliminary
remarks) is dropped here, so the model cannot report something the document does not say.
"""
import asyncio
import hashlib
import json
import os
import re
from pathlib import Path

import anthropic

from boq.model import BoQ, Finding, Item


class LLMUnavailable(RuntimeError):
    """No working Claude API credentials."""


_NO_CREDENTIALS = (anthropic.CredentialsError, anthropic.AuthenticationError, anthropic.PermissionDeniedError)

MODEL = os.environ.get("BOQ_LLM_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("BOQ_LLM_EFFORT", "medium")
CACHE_DIR = Path(os.environ.get("BOQ_CACHE_DIR", Path(__file__).resolve().parents[3] / "data" / "cache")) / "llm"
PROMPT_VERSION = "2"
MAX_ITEMS_PER_REQUEST = 60
CONCURRENCY = 4
# One title takes well under a minute. The SDK default of 10 minutes would leave a request that lost its
# connection (laptop went to sleep, network dropped) hanging that long before it is retried.
REQUEST_TIMEOUT_S = 180.0

CHECKS = {  # check name in the model's answer -> (check_id, category)
    "unclear_scope": ("L-UNCLEAR-SCOPE", "unclear_scope"),
    "contradiction": ("L-CONTRADICTION", "error"),
    "missing_item": ("L-MISSING-ITEM", "change_order"),
    "typo": ("L-TYPO", "error"),
    "risk_shift": ("L-RISK-SHIFT", "contract_risk"),
    "quantity": ("L-QUANTITY", "quantity"),
}
ACTIONS = ["ask_client", "add_surcharge", "get_quote", "note_for_claims", "fix_typo"]

SCHEMA = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item_oz": {"type": "string", "description": "Item number exactly as given, e.g. 3.2.60"},
                    "check": {"type": "string", "enum": list(CHECKS)},
                    "severity": {"type": "string", "enum": ["high", "warn", "info"]},
                    "title": {"type": "string", "description": "One line, English, at most 80 characters"},
                    "evidence": {"type": "string", "description": "Verbatim German quote from the LV"},
                    "explanation": {"type": "string", "description": "English, two or three sentences"},
                    "action": {"type": "string", "enum": ACTIONS},
                    "question_de": {"type": "string",
                                    "description": "German bidder question for action ask_client, else empty"},
                },
                "required": ["item_oz", "check", "severity", "title", "evidence", "explanation", "action",
                             "question_de"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["findings"],
    "additionalProperties": False,
}

SYSTEM = """\
You are reviewing a German bill of quantities (Leistungsverzeichnis, LV) for an estimator at a \
contractor who has to price it within days. Your review runs after a set of deterministic rule checks; \
you look for what rules cannot see. The estimator will act on each finding: send a question to the \
client (Bieterfrage), add a risk surcharge, ask a supplier for a quote, or keep a note for later claims. \
A wrong or vague finding costs the estimator time and costs this tool their trust, so a short list of \
findings they would agree with is worth more than a long one. If a title has nothing worth their time, \
return an empty list.

What to look for, in the items listed under "Items to review":

- unclear_scope: the description leaves out something the estimator must know to price the item \
(material, dimension, thickness, depth, location, disposal class, who supplies what), or the scope \
depends on a later decision by the client.
- contradiction: two statements that cannot both hold: short text against long text, item against \
preliminary remarks, a dimension against the unit or quantity, an item against a neighbouring item.
- missing_item: work that the items in this title make necessary but that has no item anywhere in the \
LV and is not mentioned as included. Check the full item index before reporting; work listed in \
another title is not missing.
- typo: a mistake that changes meaning or price (a dimension, DN, material grade, standard, unit). \
Ignore harmless spelling.
- risk_shift: wording that moves an unusual or unquantifiable risk to the contractor (ground, existing \
structures, weather, quantities), beyond what VOB/C treats as included ancillary work.
- quantity: a quantity that does not fit the description or the related items (delivered against \
installed, area against length times width, order of magnitude).

Background you need:

- Under VOB/B §2 a quantity deviation above 10 %, changed work and additional work are paid on top; a \
lump sum (psch) stays fixed. That is why vague scope behind a lump sum, and work that is needed but \
not listed, matter financially.
- The LV quantity is the installed quantity set by the client. Do not report missing waste allowances.
- The files are anonymised. Tokens such as [FIRMA_044], [PERSON_132], [ORT_024], PER000115 or \
TELEFON_084 replace names, and sometimes product names, standards or ordinary words. Never report a \
token, or text that only looks wrong because of a token, as an error or as unclear.
- Fill-in fields for the bidder ('........', "Angebotenes Fabrikat") are normal and not a finding.
- "Rule findings already reported" lists what the estimator already has. Do not repeat those.

For each finding:

- item_oz is the number of the item it belongs to (for missing_item: the item that makes the work \
necessary).
- evidence is one passage copied character for character from that item's text or from the preliminary \
remarks, at most 250 characters, in German, without ellipses or your own words. Findings whose \
evidence cannot be found in the document are discarded automatically.
- title and explanation are in English; say what is wrong and what it can cost, concretely.
- question_de: when the action is ask_client, the bidder question (Bieterfrage) exactly as the estimator \
would send it to the client: German, formal and neutral, one or two sentences, naming what the LV says and \
asking for the one decision or figure that is needed. It is sent together with the item number and the \
quoted passage, so do not repeat those. No greeting, no reasoning about cost. For any other action leave \
it empty.
- severity: high if the estimator cannot price the item without an answer or the money at stake is \
large; warn for a real risk they should price; info for something worth knowing.
"""


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _fmt_qty(item: Item) -> str:
    return f"{item.qty.normalize():f} {item.unit_raw}" if item.qty is not None else "no quantity"


def _context(boq: BoQ) -> str:
    """Shared, cacheable part of every request: preliminary remarks and the index of all items."""
    remarks = "\n\n".join(r.text for r in boq.remarks if not r.path)
    index = "\n".join(f"{i.oz} | {i.label} | {_fmt_qty(i)}" + (f" | {i.kind}" if i.kind != "normal" else "")
                      for i in boq.items)
    return (f"LV: {boq.name or boq.file} ({len(boq.items)} items)\n\n"
            f"<preliminary_remarks>\n{remarks or '(none)'}\n</preliminary_remarks>\n\n"
            f"<item_index>\n{index}\n</item_index>")


def _chunks(boq: BoQ) -> list[list[Item]]:
    """Items grouped by top-level title; large titles are split along the second level."""
    groups: dict[str, list[Item]] = {}
    for item in boq.items:
        groups.setdefault(item.oz.split(".")[0], []).append(item)
    chunks = []
    for items in groups.values():
        if len(items) <= MAX_ITEMS_PER_REQUEST:
            chunks.append(items)
            continue
        sub: dict[str, list[Item]] = {}
        for item in items:
            sub.setdefault(".".join(item.oz.split(".")[:2]), []).append(item)
        cur: list[Item] = []
        for part in sub.values():
            if cur and len(cur) + len(part) > MAX_ITEMS_PER_REQUEST:
                chunks.append(cur)
                cur = []
            cur.extend(part)
        if cur:
            chunks.append(cur)
    return chunks


def _task(boq: BoQ, items: list[Item], known: list[Finding]) -> str:
    paths = {tuple(i.path[:n]) for i in items for n in range(1, len(i.path) + 1)}
    remarks = "\n\n".join(r.text for r in boq.remarks if r.path and tuple(r.path) in paths)
    body = "\n\n".join(
        f"<item oz=\"{i.oz}\" title=\"{' / '.join(i.path)}\" qty=\"{_fmt_qty(i)}\" kind=\"{i.kind}\">\n"
        f"<short_text>{i.short_text}</short_text>\n<long_text>\n{i.long_text}\n</long_text>\n</item>"
        for i in items)
    ozs = {i.oz for i in items}
    reported = "\n".join(f"{f.item_oz}: {f.title}" for f in known if f.item_oz in ozs) or "(none)"
    return (f"<title_remarks>\n{remarks or '(none)'}\n</title_remarks>\n\n"
            f"<rule_findings_already_reported>\n{reported}\n</rule_findings_already_reported>\n\n"
            f"Items to review:\n\n{body}")


async def _ask(client: anthropic.AsyncAnthropic, context: str, task: str, usage: dict | None = None) -> list[dict]:
    """One request, or the cached answer for exactly this model, prompt and text.

    Token counts of real requests are added to `usage`; answers from the disk cache cost nothing.
    """
    key = hashlib.sha256("\x00".join([MODEL, EFFORT, PROMPT_VERSION, SYSTEM, context, task]).encode()).hexdigest()
    cached = CACHE_DIR / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    response = await client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # a declined request is re-run on Anthropic's recommended fallback model
        thinking={"type": "adaptive"},
        output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": [
            # the context is identical for every title of this LV: cache it once, read it for the rest
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": task},
        ]}],
    )
    if usage is not None:
        u = response.usage
        usage["input_tokens"] += u.input_tokens or 0
        usage["cache_write_tokens"] += u.cache_creation_input_tokens or 0
        usage["cache_read_tokens"] += u.cache_read_input_tokens or 0
        usage["output_tokens"] += u.output_tokens or 0
        usage["api_requests"] += 1
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"LLM review stopped with {response.stop_reason}")
    text = next(b.text for b in response.content if b.type == "text")
    findings = json.loads(text)["findings"]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(findings, ensure_ascii=False), encoding="utf-8")
    return findings


def _validate(raw: dict, by_oz: dict[str, Item], remarks: str) -> Finding | None:
    """Turn a model answer into a Finding, or None if it does not hold up against the document."""
    item = by_oz.get(raw.get("item_oz", ""))
    quote = _squash(raw.get("evidence", "")).strip("…. \"„“'")
    if item is None or raw.get("check") not in CHECKS or len(quote) < 8:
        return None
    if quote not in _squash(item.text) and quote not in remarks:
        return None
    check_id, category = CHECKS[raw["check"]]
    return Finding(
        item_oz=item.oz, category=category, check_id=check_id, title=raw["title"][:120],
        severity=raw["severity"], evidence=f"„{quote}“", explanation=raw["explanation"],
        action=raw["action"], origin="llm",
        question_de=_squash(raw.get("question_de", "")) if raw["action"] == "ask_client" else "",
    )


async def run_llm_checks(boq: BoQ, rule_findings: list[Finding],
                         client: anthropic.AsyncAnthropic | None = None) -> tuple[list[Finding], dict]:
    """Returns the findings and a small report: requests made, findings kept and dropped."""
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    context = _context(boq)
    tasks = [_task(boq, items, rule_findings) for items in _chunks(boq)]  # one per chunk, same order
    if not tasks:
        return [], {"requests": 0, "kept": 0, "dropped": 0}
    limit = asyncio.Semaphore(CONCURRENCY)
    usage = dict.fromkeys(["api_requests", "input_tokens", "cache_write_tokens", "cache_read_tokens",
                           "output_tokens"], 0)

    chunks = _chunks(boq)
    failures: list[str] = []

    async def ask(n: int) -> list[dict]:
        """One title. A title that fails (refusal, max tokens, network) is reported and skipped, so the
        findings of the other titles still arrive; missing credentials end the whole review."""
        try:
            async with limit:
                return await _ask(client, context, tasks[n], usage)
        except _NO_CREDENTIALS:
            raise
        except Exception as exc:
            failures.append(f"items {chunks[n][0].oz}–{chunks[n][-1].oz}: {exc}")
            return []

    try:
        first = await ask(0)  # writes the prompt cache that the parallel requests then read
        rest = await asyncio.gather(*(ask(n) for n in range(1, len(tasks))))
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable(
            "No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
            "root (see .env.example) and restart the server.") from exc
    if len(failures) == len(tasks):
        raise RuntimeError(f"every request failed; first: {failures[0]}")
    by_oz = {i.oz: i for i in boq.items}
    remarks = _squash(" ".join(r.text for r in boq.remarks))
    raw = [f for answer in [first, *rest] for f in answer]
    valid = [f for f in (_validate(r, by_oz, remarks) for r in raw) if f]
    findings: dict[tuple[str, str], Finding] = {}
    for f in valid:  # the same clause quoted for several items is one finding with related items
        first = findings.setdefault((f.check_id, f.evidence), f)
        if first is not f and f.item_oz != first.item_oz and f.item_oz not in first.related_oz:
            first.related_oz.append(f.item_oz)
    return list(findings.values()), {"requests": len(tasks), "kept": len(findings), "dropped": len(raw) - len(valid),
                                     "failed": len(failures), "failures": failures, "model": MODEL, **usage}
