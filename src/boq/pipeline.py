"""The pipeline: everything that is done with a project's files, in the order an estimator does it.

This file is the one place that says what is done. It holds no check itself: each step names a function of
another module and says what it is. `boq.runs` runs the steps in the background and records each one, the
pages show that record, and `boq.checks.run_checks` runs the rules when a file is opened.

The steps stand at six stations (`STAGES`), which are the estimator's own order of work:

  read       the file is read, the tender's dates are taken from it
  rules      the rules: totals, quantities, units, wording, missing items, the structure of the LV
  ai         Claude reads the LV, then looks at its own findings a second time
  compare    a later version against the tender; the LVs of a building against each other
  questions  what has to be asked of the client is drafted; the station stays open (waiting) until the
             questions are out and answered, the person closes them, or the last day for them is over
  prices     beside the questions, not after them: unit prices from past bids, and what has no reliable
             price. A bidder can ask until shortly before the bid, so the prices do not wait (D-042)

To add a step: write the function where it belongs, then add a `Step` to `STEPS` below. Nothing else has to
change: the run, its record and the pages take it from here.

A step is
- deterministic (no model, no network: the same answer every time), agentic (asks Claude) or human (a gate:
  it passes or raises `Wait` with what the person has to do),
- about one document, about a later version of an LV against its tender ("versions"), or about the
  project (one LV per trade; runs only when the project has more than one).
"""
import asyncio
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Literal

from boq import dates as tender_dates
from boq import intake
from boq import mail, supply
from boq.checks import llm, rules
from boq.checks.companion_rules import RULES as COMPANION_RULES
from boq.checks.companions import check_companions
from boq.checks.llm import CHECKS as LLM_CHECKS
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.model import BoQ, Finding
from boq.prices import load_history, suggest_prices
from boq.project import analyse_project
from boq.report import build_report

STAGES: list[tuple[str, str]] = [("read", "Read"), ("rules", "Rules"), ("ai", "AI review"), ("compare", "Compare"),
                                 ("questions", "Questions"), ("prices", "Prices")]
DATASET = Path(os.environ.get("BOQ_DATASET_DIR", Path(__file__).resolve().parents[2] / "dataset"))


class Skip(Exception):
    """Raised by a step that cannot run here (no API key, say). The run goes on; the reason is shown."""


class Wait(Exception):
    """Raised by a human step that is not passed yet: the run stops here, with these words, until the
    person has done it (boq.runs.nudge) or goes on without (boq.runs.go_on)."""


@dataclass
class Context:
    """What a step gets."""
    boq: BoQ | None = None  # document steps: the LV
    findings: list[Finding] = field(default_factory=list)  # document steps: what the steps before found in it
    ai: list[Finding] = field(default_factory=list)  # the AI findings among them; the second look rewrites this list
    lvs: dict[str, BoQ] = field(default_factory=dict)  # project steps: one LV per trade, by its name
    base: BoQ | None = None  # version steps: the tender this file is a later version of
    data: bytes = b""  # the file as it was uploaded
    project: dict = field(default_factory=dict)  # the project (boq.catalog): id, name, plan, files
    waived: bool = False  # the person said: go on without waiting (human steps)
    tell: Callable[[str], None] = lambda _text: None  # says what the step is doing right now
    keep: Callable[[str, object], None] = lambda _key, _value: None  # a fact for the record besides findings
    spent: Callable[[dict], None] = lambda _usage: None  # the tokens an agentic step used


@dataclass(frozen=True)
class Step:
    id: str
    title: str  # what is done, as the pages show it
    kind: Literal["deterministic", "agentic", "human"]
    scope: Literal["document", "versions", "project"]
    stage: str  # one of STAGES
    # a document step returns Findings; a project step returns the cross-LV findings (dicts with a severity)
    run: Callable[[Context], list]
    about: str = ""  # one line on what it looks for
    # Run on one file per LV only: the versions of an LV (tender, print-out, bid) say the same, and an
    # agentic step costs money and minutes per file.
    once_per_lv: bool = False
    report: bool = False  # it states a fact (dates read, questions drafted) instead of looking for faults


# ---------------------------------------------------------------- read

_DATE_NAMES = {"sent_out": "sent out", "questions_due": "questions until", "due": "submission", "opening": "opening",
               "binding_until": "binding until", "exec_start": "work starts", "exec_end": "work ends"}


def _dates(ctx: Context) -> list:
    found = tender_dates.merge(tender_dates.read(ctx.data, ctx.boq.file))
    ctx.keep("dates", found)
    said = [f"{_DATE_NAMES.get(d['kind'], d['kind'])} {date.fromisoformat(d['date']):%d.%m.%Y}" for d in found]
    ctx.tell(", ".join(said[:4]) + (f" and {len(said) - 4} more" if len(said) > 4 else "") if said
             else "the file states no date")
    return []


# ---------------------------------------------------------------- ai

def _ai_review(ctx: Context) -> list[Finding]:
    """Claude reads the LV title by title (boq.checks.llm). Answers are cached, so a second run is free."""
    def progress(state: dict) -> None:
        found = sum(state["found"].values())
        reading = f": {state['reading'][0]}" if state["reading"] else ""
        ctx.tell(f"{state['read']} of {state['total']} sections read, {found} found so far{reading}")

    try:
        findings, stats = asyncio.run(run_llm_checks(ctx.boq, ctx.findings, progress=progress))
    except LLMUnavailable as exc:
        raise Skip(str(exc)) from exc
    ctx.spent(stats)
    failed = f", {stats['failed']} failed" if stats.get("failed") else ""
    ctx.tell(f"{stats['requests']} sections read{failed}" if stats["requests"] else "nothing to read")
    ctx.ai[:] = findings
    return findings


def _second_look(ctx: Context) -> list[Finding]:
    """Claude reads all findings of the LV once more, side by side (boq.checks.llm.second_look): an AI
    finding that says what a rule finding or another AI finding already says is taken out."""
    if len(ctx.ai) < 2:
        raise Skip("fewer than two AI findings: nothing to compare")
    try:
        dropped, usage = asyncio.run(llm.second_look(ctx.boq, [f for f in ctx.findings if f.origin == "rule"], ctx.ai))
    except LLMUnavailable as exc:
        raise Skip(str(exc)) from exc
    ctx.spent(usage)
    before = len(ctx.ai)
    ctx.ai[:] = [f for n, f in enumerate(ctx.ai) if n not in dropped]
    ctx.keep("second_look", {"before": before, "dropped": [{"item_oz": ctx_f.item_oz, "title": ctx_f.title, "why": why}
                                                           for ctx_f, why in dropped.values()]})
    ctx.tell(f"{before} AI findings read again: {len(dropped)} said twice and taken out, {len(ctx.ai)} kept")
    return []


# ---------------------------------------------------------------- compare

def _money(value: Decimal) -> str:
    return f"{value:,.2f}".replace(",", " ")


def _version_diff(ctx: Context) -> list[Finding]:
    """What a later file of the same LV (a re-issued tender, a bid, the award) says differently from the
    tender: items that came or went, changed quantities and units; changed wording only between two GAEB
    files of the same format (a PDF never reads word for word like its GAEB file, or like another PDF)."""
    base, boq = ctx.base, ctx.boq
    old = {i.oz: i for i in base.items}
    new = {i.oz: i for i in boq.items}
    out: list[Finding] = []

    def add(oz: str | None, check: str, severity: str, title: str, evidence: str, why: str, related=()):
        out.append(Finding(item_oz=oz, related_oz=list(related), category="quantity" if check == "V-QUANTITY" else "change_order",
                           check_id=check, severity=severity, title=title, evidence=evidence, explanation=why,
                           action="note_for_claims"))

    for oz, item in new.items():
        if oz not in old:
            add(oz, "V-ADDED", "warn", f"Not in the tender ({base.file})", f"„{item.label[:90]}“",
                "This item is in this file and not in the tender it follows. Its price was never asked for "
                "in competition: check who added it and on what terms.")
            continue
        was = old[oz]
        if item.qty is not None and was.qty is not None and item.qty != was.qty:
            add(oz, "V-QUANTITY", "warn", f"Quantity changed: {was.qty.normalize():f} → {item.qty.normalize():f} {item.unit_raw}",
                f"{base.file}: {was.qty.normalize():f} {was.unit_raw} · {boq.file}: {item.qty.normalize():f} {item.unit_raw}",
                "The quantity is not the tender's. A unit price was calculated for the tendered quantity "
                "(VOB/B §2 (3): beyond 10 % either side can ask for a new price).")
        elif item.unit and was.unit and item.unit != was.unit:
            add(oz, "V-UNIT", "warn", f"Unit changed: {was.unit_raw} → {item.unit_raw}",
                f"{base.file}: {was.unit_raw} · {boq.file}: {item.unit_raw}",
                "The unit is not the tender's: the unit price means something else.")
        elif (boq.format == base.format != "pdf" and item.text and was.text
              and rules._same_words(item) != rules._same_words(was)):
            add(oz, "V-TEXT", "info", "Wording changed against the tender", f"„{item.label[:90]}“",
                f"The description differs from {base.file}. Read both: a changed text can change the scope "
                f"at an unchanged price.")
    gone = [i for oz, i in old.items() if oz not in new]
    # a bid file that carries only part of the LV (an excerpt, one lot) is not a list of deletions
    if gone and len(gone) * 2 < len(old):
        for item in gone[:60]:
            add(None, "V-REMOVED", "warn", f"Item {item.oz} of the tender is not in this file", f"„{item.label[:90]}“",
                f"{base.file} has item {item.oz}; this file does not. Taken out, or lost on the way.",
                related=[item.oz])
    ctx.keep("against", base.file)
    ctx.tell(f"against {base.file}: " + (", ".join(
        f"{n} {word}" for n, word in ((sum(f.check_id == "V-ADDED" for f in out), "added"),
                                      (sum(f.check_id == "V-REMOVED" for f in out), "removed"),
                                      (sum(f.check_id == "V-QUANTITY" for f in out), "quantities changed"),
                                      (sum(f.check_id == "V-UNIT" for f in out), "units changed"),
                                      (sum(f.check_id == "V-TEXT" for f in out), "texts changed")) if n) or "the same"))
    return out


def _interfaces(ctx: Context) -> list[dict]:
    return analyse_project(ctx.lvs)["findings"]


# ---------------------------------------------------------------- questions

def _questions(ctx: Context) -> list[dict]:
    """The bidder questions of this LV with where each stands (new, drafted, sent, partly, answered)."""
    asked = build_report(ctx.boq, ctx.findings)["questions"]
    return mail.standing(asked, mail.about(mail.BIDDER_QUESTIONS, ctx.project.get("id"), ctx.boq.file))


def _tally(questions: list[dict]) -> dict:
    count = lambda *status: sum(q["status"] in status for q in questions)  # noqa: E731
    return {"total": len(questions), "to_send": count("new", "drafted"), "out": count("sent", "partly"),
            "answered": count("answered")}


def _draft_questions(ctx: Context) -> list:
    tally = _tally(_questions(ctx))
    ctx.keep("questions", tally)
    ctx.tell(f"{tally['total']} question{'' if tally['total'] == 1 else 's'} to the client drafted in German, "
             f"each from a finding" if tally["total"] else "no finding needs the client: nothing to ask")
    return []


def _questions_gate(ctx: Context) -> list:
    """Whether the questions to the client are still open. Closed when there is nothing to ask, everything
    is answered, the day for questions is over, the project already holds a bid or an award (questions are
    asked before the bid), or the person closes them. While they are open the run waits here; the prices
    are worked out beside it."""
    tally = _tally(_questions(ctx))
    ctx.keep("questions", tally)
    waiting = tally["to_send"] + tally["out"]
    last_day = (ctx.project.get("plan") or {}).get("questions_due")
    bid_out = any(intake.step_of(f["role"]) != "tender" for f in ctx.project.get("files") or [])
    if not tally["total"]:
        ctx.tell("nothing to ask")
    elif bid_out and waiting:
        ctx.tell(f"the bid is out: {waiting} question{'' if waiting == 1 else 's'} can no longer be asked")
    elif not waiting:
        ctx.tell(f"all {tally['total']} answered by the client")
    elif ctx.waived:
        ctx.tell(f"closed without the client's answer to {waiting} question{'' if waiting == 1 else 's'}: priced as a risk")
    elif last_day and last_day < date.today().isoformat():
        ctx.tell(f"the last day for questions ({date.fromisoformat(last_day):%d.%m.%Y}) is over: "
                 f"{waiting} stay open and have to be priced as a risk")
    else:
        parts = [f"{tally['to_send']} to send" if tally["to_send"] else "",
                 f"{tally['out']} sent, no answer yet" if tally["out"] else "",
                 f"{tally['answered']} answered" if tally["answered"] else ""]
        raise Wait(", ".join(p for p in parts if p))
    return []


# ---------------------------------------------------------------- prices

def _prices(ctx: Context) -> list:
    boq = ctx.boq
    totals = [i.total for i in boq.items if i.total is not None]
    if totals:
        ctx.keep("prices", {"priced": len(totals), "items": len(boq.items), "net": float(sum(totals))})
        ctx.tell(f"the file carries its prices: {len(totals)} of {len(boq.items)} items, net {_money(sum(totals))} EUR")
        return []
    if not DATASET.is_dir():
        raise Skip("no past bids at hand to take prices from")
    found = suggest_prices(boq, load_history(DATASET))
    without = found["items"] - found["with_price"]
    ctx.keep("prices", {"with_price": found["with_price"], "items": found["items"], "without": without,
                        "estimate": found["estimate"], "by_confidence": found["by_confidence"]})
    ctx.tell(f"{found['with_price']} of {found['items']} items with a unit price from past bids; "
             f"{without} without a reliable price: ask suppliers")
    return []


def _inquiries(ctx: Context) -> list:
    """The price inquiries of this LV planned: which items are asked for outside, in which packages, of
    whom in the directory. Items that cannot be priced as written wait for the client; items a quote at
    hand still prices are not asked for again. Nothing is sent: the estimator reads and sends each one."""
    boq, project_id = ctx.boq, ctx.project.get("id")
    if any(i.total is not None for i in boq.items):
        raise Skip("the file carries its prices")
    wait, _ = supply.held(_questions(ctx))
    hand = supply.at_hand(boq, project_id)
    old = supply.find_plan(project_id, boq.file)
    if old and old["plan"].get("hash") == supply.lv_hash(boq) and set(old["plan"].get("held") or {}) == set(wait):
        packages = old["plan"]["packages"]  # nothing changed: the plan stands, and what was chosen with it
    else:
        try:
            packages = asyncio.run(supply.plan(boq, set(wait) | set(hand)))
        except llm.LLMUnavailable as exc:
            raise Skip(str(exc)) from exc
        supply.keep_plan(project_id, boq.file, {"hash": supply.lv_hash(boq), "packages": packages, "held": wait,
                                                "at_hand": sorted(hand)}, old)
    asked = sum(len(p["items"]) for p in packages)
    nobody = sum(1 for p in packages if not p["ask"])
    ctx.keep("inquiries", {"packages": len(packages), "items": asked, "held": len(wait), "at_hand": len(hand)})
    ctx.tell(f"{len(packages)} package{'' if len(packages) == 1 else 's'} for {asked} items to ask outside"
             + (f"; {nobody} with nobody in the directory to ask" if nobody else "")
             + (f"; {len(wait)} item{' waits' if len(wait) == 1 else 's wait'} for the client" if wait else "")
             + (f"; {len(hand)} priced by quotes at hand" if hand else "") if packages
             else "nothing has to be asked outside")
    return []


# ---------------------------------------------------------------- the pipeline

def _rule(step_id: str, title: str, run: Callable[[BoQ], list[Finding]], about: str) -> Step:
    return Step(step_id, title, "deterministic", "document", "rules", lambda c: run(c.boq), about=about)


STEPS: list[Step] = [
    # read
    Step("D-DATES", "The tender's dates", "deterministic", "document", "read", _dates, report=True,
         about="Submission deadline, last day for questions, binding period, start and end of the work, "
               "where the file states them."),
    # rules, per document
    _rule("R-ARITHMETIC", "Totals: quantity × unit price", rules.arithmetic, "A total that is not quantity × unit price."),
    _rule("R-QTY", "Quantities: missing or zero", rules.quantities, "Items without a quantity, and items with quantity zero."),
    _rule("R-UNIT-UNKNOWN", "Units", rules.units, "A unit that is none of the known spellings."),
    _rule("R-DIM-MISMATCH", "Pipe sizes: short text against long text", rules.dimensions,
          "Short and long text of an item name different DN."),
    _rule("R-REF-BROKEN", "References to other items", rules.references,
          "\"wie Position …\" pointing at an item that is not in the LV."),
    _rule("R-WORDING", "Wording that shifts cost or scope", rules.wording,
          "Clauses like \"ohne gesonderte Vergütung\", \"nach Erfordernis\", \"inklusive aller …\"."),
    _rule("R-LUMP-SUM-SCOPE", "Lump sums with a large scope", rules.lump_sums, "A long description paid as one lump sum."),
    _rule("R-NUMBER-TWICE", "Item numbers used twice", rules.numbering, "Two items under one number."),
    _rule("R-REPEATED", "The same description twice in a section", rules.repeats,
          "Two items of one section that read the same word for word, with the same unit."),
    _rule("R-OPTIONAL-SHARE", "Share of items that may never be ordered", rules.position_types,
          "A tenth or more of the LV as contingency or alternative items."),
    # rules, per document: an item that normally comes with another item and is not there
    *(Step(rule.id, f"Missing item: {rule.name}", "deterministic", "document", "rules",
           lambda c, rule=rule: check_companions(c.boq, [rule]), about=rule.why)
      for rule in COMPANION_RULES),
    # ai, per LV
    Step("L-REVIEW", "AI review: " + ", ".join(name.replace("_", " ") for name in LLM_CHECKS), "agentic", "document",
         "ai", _ai_review, once_per_lv=True,
         about="Claude reads every section for unclear scope, contradictions, missing items, typos, risk "
               "shifted to the bidder and implausible quantities. Kept only with a passage found word for "
               "word in the LV."),
    Step("L-SECOND", "Second look: the same thing said twice", "agentic", "document", "ai", _second_look,
         once_per_lv=True, report=True,
         about="Claude reads all findings of the LV side by side and takes out an AI finding that repeats "
               "a rule finding or another AI finding. Nothing is added here."),
    # compare
    Step("V-DIFF", "Against the tender: what this version changed", "deterministic", "versions", "compare",
         _version_diff, about="Items added or gone, quantities, units and wording changed since the tender."),
    Step("P-INTERFACES", "Between the LVs: work expected from others, work tendered twice", "deterministic",
         "project", "compare", _interfaces,
         about="What an LV expects from another trade and no LV contains; the same work in two LVs."),
    # questions: a thread that stays open beside the prices
    Step("Q-DRAFT", "Bidder questions drafted", "deterministic", "document", "questions", _draft_questions,
         once_per_lv=True, report=True, about="One question in German per finding that only the client can settle."),
    Step("Q-GATE", "Questions sent and answered, or closed", "human", "document", "questions",
         _questions_gate, once_per_lv=True, report=True,
         about="You send the questions; the client's answers are read back in. Open until all are answered, "
               "the last day for questions is over, or you close them."),
    # prices: beside the questions
    Step("P-PRICES", "Unit prices from past bids", "deterministic", "document", "prices", _prices,
         once_per_lv=True, report=True,
         about="A unit price per item from the priced bids at hand, with its source; and the items that "
               "have no reliable price and go to suppliers."),
    Step("P-INQUIRIES", "Price inquiries planned", "agentic", "document", "prices", _inquiries,
         once_per_lv=True, report=True,
         about="Which items are asked for outside, in packages per material group (suppliers) or trade "
               "(subcontractors), and whom in the directory to ask. Items that wait for the client are held back."),
]


def steps(scope: str, kind: str | None = None, stages: tuple[str, ...] | None = None) -> list[Step]:
    return [s for s in STEPS if s.scope == scope and kind in (None, s.kind) and (stages is None or s.stage in stages)]


def deterministic(boq: BoQ) -> list[Finding]:
    """The findings of every rule on one LV (the station "rules": no model, no network)."""
    ctx = Context(boq=boq)
    return [finding for step in steps("document", stages=("rules",)) for finding in step.run(ctx)]


def describe() -> list[dict]:
    """The pipeline as the pages list it."""
    return [{"id": s.id, "title": s.title, "kind": s.kind, "scope": s.scope, "stage": s.stage, "about": s.about}
            for s in STEPS]
