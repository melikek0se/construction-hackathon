"""The analysis pipeline: every check that is run on a project, in the order it is run.

This file is the one place that says what is checked. It holds no check itself: each step names a function
of another module and says what it is. `boq.runs` runs the steps in the background and records each one,
the pages show that record, and `boq.checks.run_checks` runs the deterministic ones when a file is opened.

To add a check: write the function where it belongs (`boq/checks/…`), then add a `Step` to `STEPS` below.
Nothing else has to change: the run, its record and the pages take it from here.

A step is
- deterministic (rules, no model, no network: the same answer every time) or agentic (asks Claude),
- about one document (it gets the parsed LV and what the steps before it found there) or about the
  project (it gets one LV per trade, and runs only when the project has more than one).
"""
import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from boq.checks import rules
from boq.checks.companion_rules import RULES as COMPANION_RULES
from boq.checks.companions import check_companions
from boq.checks.llm import CHECKS as LLM_CHECKS
from boq.checks.llm import LLMUnavailable, run_llm_checks
from boq.model import BoQ, Finding
from boq.project import analyse_project


class Skip(Exception):
    """Raised by a step that cannot run here (no API key, say). The run goes on; the reason is shown."""


@dataclass
class Context:
    """What a step gets."""
    boq: BoQ | None = None  # document steps: the LV
    findings: list[Finding] = field(default_factory=list)  # document steps: what the steps before found in it
    lvs: dict[str, BoQ] = field(default_factory=dict)  # project steps: one LV per trade, by its name
    tell: Callable[[str], None] = lambda _text: None  # says what the step is doing right now


@dataclass(frozen=True)
class Step:
    id: str
    title: str  # what is checked, as the pages show it
    kind: Literal["deterministic", "agentic"]
    scope: Literal["document", "project"]
    # a document step returns Findings; a project step returns the cross-LV findings (dicts with a severity)
    run: Callable[[Context], list]
    about: str = ""  # one line on what it looks for
    # Run on one file per LV only: the versions of an LV (tender, print-out, bid) say the same, and an
    # agentic step costs money and minutes per file.
    once_per_lv: bool = False


# ---------------------------------------------------------------- the functions the agentic steps call

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
    failed = f", {stats['failed']} failed" if stats.get("failed") else ""
    ctx.tell(f"{stats['requests']} sections read{failed}" if stats["requests"] else "nothing to read")
    return findings


def _interfaces(ctx: Context) -> list[dict]:
    return analyse_project(ctx.lvs)["findings"]


# ---------------------------------------------------------------- the pipeline

STEPS: list[Step] = [
    # per document, deterministic
    Step("R-ARITHMETIC", "Totals: quantity × unit price", "deterministic", "document", lambda c: rules.arithmetic(c.boq),
         about="A total that is not quantity × unit price."),
    Step("R-QTY", "Quantities: missing or zero", "deterministic", "document", lambda c: rules.quantities(c.boq),
         about="Items without a quantity, and items with quantity zero."),
    Step("R-UNIT-UNKNOWN", "Units", "deterministic", "document", lambda c: rules.units(c.boq),
         about="A unit that is none of the known spellings."),
    Step("R-DIM-MISMATCH", "Pipe sizes: short text against long text", "deterministic", "document",
         lambda c: rules.dimensions(c.boq), about="Short and long text of an item name different DN."),
    Step("R-REF-BROKEN", "References to other items", "deterministic", "document", lambda c: rules.references(c.boq),
         about="\"wie Position …\" pointing at an item that is not in the LV."),
    Step("R-WORDING", "Wording that shifts cost or scope", "deterministic", "document", lambda c: rules.wording(c.boq),
         about="Clauses like \"ohne gesonderte Vergütung\", \"nach Erfordernis\", \"inklusive aller …\"."),
    Step("R-LUMP-SUM-SCOPE", "Lump sums with a large scope", "deterministic", "document",
         lambda c: rules.lump_sums(c.boq), about="A long description paid as one lump sum."),
    # per document, deterministic: an item that normally comes with another item and is not there
    *(Step(rule.id, f"Missing item: {rule.name}", "deterministic", "document",
           lambda c, rule=rule: check_companions(c.boq, [rule]), about=rule.why)
      for rule in COMPANION_RULES),
    # per document, agentic
    Step("L-REVIEW", "AI review: " + ", ".join(name.replace("_", " ") for name in LLM_CHECKS), "agentic", "document",
         _ai_review, once_per_lv=True,
         about="Claude reads every section for unclear scope, contradictions, missing items, typos, risk "
               "shifted to the bidder and implausible quantities. Kept only with a passage found word for "
               "word in the LV."),
    # across the LVs of a project, deterministic
    Step("P-INTERFACES", "Between the LVs: work expected from others, work tendered twice", "deterministic",
         "project", _interfaces,
         about="What an LV expects from another trade and no LV contains; the same work in two LVs."),
]


def steps(scope: str, kind: str | None = None) -> list[Step]:
    return [s for s in STEPS if s.scope == scope and kind in (None, s.kind)]


def deterministic(boq: BoQ) -> list[Finding]:
    """The findings of every deterministic document step on one LV."""
    ctx = Context(boq=boq)
    return [finding for step in steps("document", "deterministic") for finding in step.run(ctx)]


def describe() -> list[dict]:
    """The pipeline as the pages list it."""
    return [{"id": s.id, "title": s.title, "kind": s.kind, "scope": s.scope, "about": s.about} for s in STEPS]
