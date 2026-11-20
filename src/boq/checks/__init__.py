"""Rule-based checks (D-004). LLM checks come later and add to the same Finding list."""
from boq.checks.companions import check_companions
from boq.checks.rules import check_items
from boq.model import BoQ, Finding

_RANK = {"high": 0, "warn": 1, "info": 2}


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (_RANK[f.severity], -(f.money_at_stake or 0)))


def run_checks(boq: BoQ) -> list[Finding]:
    return sort_findings(check_items(boq) + check_companions(boq))
