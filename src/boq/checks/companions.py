"""Deterministic missing-item check driven by companion_rules.RULES."""
import re
from decimal import Decimal

from boq.checks.companion_rules import RULES, CompanionRule
from boq.model import BoQ, Finding, Item

_SIZE = re.compile(r"\b(?:DN\s*/\s*OD|DN|OD|DA|da)\s*=?\s*(\d{2,4})\b")


def sizes(text: str) -> set[str]:
    """Nominal sizes named in a text: DN 250, DN/OD63, da 50 -> {"250", "63", "50"}."""
    return set(_SIZE.findall(text))


def _words(label: str) -> set[str]:
    """Distinctive words of a label, used to pair items that carry no size."""
    return {w for w in re.findall(r"[a-zäöüß]{6,}", label.lower())
            if not re.match(r"liefer|verleg|einbau|montier|herstell", w)}


def _quote(item: Item) -> str:
    return f"{item.oz} „{item.label[:90]}“"


def _snippet(text: str, pattern: str) -> str:
    m = re.search(pattern, text, re.I)
    if not m:
        return ""
    start, end = max(0, m.start() - 60), min(len(text), m.end() + 60)
    return "…" + " ".join(text[start:end].split()) + "…"


def _finding(rule: CompanionRule, triggers: list[Item], *, mentioned: Item | None = None,
             size: str | None = None) -> Finding:
    what = rule.name + (f" (DN/da {size})" if size else "")
    evidence = "; ".join(_quote(t) for t in triggers[:3])
    if len(triggers) > 3:
        evidence += f" (+{len(triggers) - 3} more)"
    if mentioned is not None:
        return Finding(
            item_oz=mentioned.oz,
            related_oz=[t.oz for t in triggers if t.oz != mentioned.oz],
            category="contract_risk",
            check_id=rule.id,
            severity="info",
            evidence=f"{_quote(mentioned)}: {_snippet(mentioned.long_text, rule.companion)}",
            explanation=f"No separate item for {what}. It is only mentioned inside the description of "
                        f"item {mentioned.oz}, so it has to be priced into that unit price. {rule.why}",
            action="add_surcharge",
        )
    return Finding(
        item_oz=triggers[0].oz,
        related_oz=[t.oz for t in triggers[1:]],
        category="change_order",
        check_id=rule.id,
        severity=rule.severity,
        evidence=evidence,
        explanation=f"No item and no mention of {what} anywhere in the LV. {rule.why}",
        action="ask_client",
    )


def _qty_finding(rule: CompanionRule, size: str, supplied: list[Item], installed: list[Item]) -> Finding | None:
    def total(items):
        units = {i.unit for i in items}
        if len(units) != 1 or any(i.qty is None for i in items):
            return None, None
        return sum((i.qty for i in items), Decimal(0)), units.pop()

    q_sup, u_sup = total(supplied)
    q_ins, u_ins = total(installed)
    if q_sup is None or q_ins is None or u_sup != u_ins or q_sup == q_ins:
        return None
    if abs(q_sup - q_ins) / max(q_sup, q_ins) < Decimal("0.01"):
        return None
    return Finding(
        item_oz=supplied[0].oz,
        related_oz=[i.oz for i in supplied[1:] + installed],
        category="quantity",
        check_id=rule.id + "-QTY",
        severity="warn",
        evidence="; ".join(f"{_quote(i)} {i.qty.normalize():f} {i.unit}" for i in (supplied + installed)[:4]),
        explanation=f"DN/da {size}: {q_sup.normalize():f} {u_sup} supplied but {q_ins.normalize():f} {u_ins} "
                    f"installed. One of the quantities is wrong; the difference is either surplus material "
                    f"or a quantity overrun (VOB/B §2 Abs. 3).",
        action="ask_client",
    )


def check_companions(boq: BoQ, rules: list[CompanionRule] = RULES) -> list[Finding]:
    findings = []
    items = [i for i in boq.items if i.label]
    for rule in rules:
        triggers = [i for i in items if rule.triggers(i)]
        if not triggers:
            continue
        groups: dict[str | None, list[Item]] = {}
        if rule.same_size:
            for t in triggers:
                for s in sizes(t.label) or {None}:
                    groups.setdefault(s, []).append(t)
        else:
            groups[None] = triggers

        for size, group in groups.items():
            def has_size(text):
                return size is None or size in sizes(text)

            def same_object(item):
                # sized rule but no size in the label: pair on a shared noun ("Steuerkabel")
                if not rule.same_size or size is not None:
                    return True
                return any(_words(t.label) & _words(item.label) for t in group)

            partners = [i for i in items if i not in group and re.search(rule.companion, i.label, re.I)
                        and has_size(i.label) and same_object(i)]
            if partners:
                if rule.compare_qty and size is not None:
                    f = _qty_finding(rule, size, group, partners)
                    if f:
                        findings.append(f)
                continue
            mentioned = next((i for i in items
                              if re.search(rule.companion, i.long_text, re.I) and has_size(i.text)
                              and same_object(i)), None)
            findings.append(_finding(rule, group, mentioned=mentioned, size=size))
    return findings
