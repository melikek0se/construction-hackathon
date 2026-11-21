"""The checks. Which of them run, and in what order, is said in one place: boq.pipeline."""
from boq.model import BoQ, Finding

_RANK = {"high": 0, "warn": 1, "info": 2}


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (_RANK[f.severity], -(f.money_at_stake or 0)))


def run_checks(boq: BoQ) -> list[Finding]:
    """Every deterministic check of the pipeline on one LV (no model, no network)."""
    from boq import pipeline  # here, not at the top: the pipeline imports the check modules of this package

    return sort_findings(pipeline.deterministic(boq))
