#!/usr/bin/env python3
"""Hindsight test of the findings: did the analysis of the TENDER point at the items that later moved?

    uv run python scripts/eval_findings.py [--llm] [-v]

Three projects of the dataset hold the tender and what came after it (a bid, an award). What changed
between the two is known only afterwards; the checks see the tender alone. An item of the tender is a
*target* when the later file
  quantity   carries another quantity for it,
  unit       carries another unit,
  removed    no longer has it,
  token      prices it at a token price (the bidder parked it: "included elsewhere", or a speculation).
Reported per project: how many targets carry at least one finding (recall), against how many of the other
items do (the base rate). A check that flags everything has recall 1 and lift 1: the lift is what counts.
Items that the later file ADDS have no item in the tender to carry a finding; they are counted and not scored.

--llm adds the AI review (answers come from the app's cache where the LV was reviewed before; otherwise
this asks Claude and costs money). -v lists the targets that carry no finding.

What this does not show: whether a finding is *right*. A flagged item that later changed may have been
flagged for another reason. It is a test of where the checks look, not of what they say.
"""
import asyncio
import sys
from pathlib import Path

from boq.checks import run_checks
from boq.model import BoQ, Finding
from boq.parsers import parse_file
from boq.prices import _TOKEN_PRICE

DATASET = Path(__file__).resolve().parent.parent / "dataset"
PAIRS = [
    ("A Maschinentechnik", "01_gaeb_xml/8209.003_Leistungsverzeichnis_leer.X83", ["02_gaeb_90/[ORT_024] LV24069.D86"]),
    ("B Ringschluss", "01_gaeb_xml/[NUMMER_001]_leer.X83", ["02_gaeb_90/StBALV23040.D84", "02_gaeb_90/StBALV23040.D86"]),
    ("C Fernleitung", "04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf", ["02_gaeb_90/Angebot AN24-0305.D84"]),
]


def targets(tender: BoQ, later: list[BoQ]) -> tuple[dict[str, set[str]], int]:
    """Per item of the tender, why it is a target; and how many items the later files add."""
    why: dict[str, set[str]] = {}
    added: set[str] = set()
    old = {i.oz: i for i in tender.items}
    for boq in later:
        new = {i.oz: i for i in boq.items}
        added |= set(new) - set(old)
        partial = len(set(old) - set(new)) * 2 >= len(old)  # an excerpt is not a list of deletions
        for oz, was in old.items():
            item = new.get(oz)
            if item is None:
                if not partial:
                    why.setdefault(oz, set()).add("removed")
                continue
            if item.qty is not None and was.qty is not None and item.qty != was.qty:
                why.setdefault(oz, set()).add("quantity")
            if item.unit and was.unit and item.unit != was.unit:
                why.setdefault(oz, set()).add("unit")
            if item.up is not None and item.up <= _TOKEN_PRICE.get(item.unit, 0):
                why.setdefault(oz, set()).add("token")
    return why, len(added)


def findings_of(tender: BoQ, llm: bool) -> list[Finding]:
    found = run_checks(tender)
    if llm:
        from boq.checks.llm import run_llm_checks
        from boq.env import load_env

        load_env()
        found += asyncio.run(run_llm_checks(tender, found))[0]
    return found


def main() -> None:
    llm, verbose = "--llm" in sys.argv, "-v" in sys.argv
    print(f"Findings of the tender against what changed later ({'rules + AI review' if llm else 'rules only'})\n")
    print(f"{'project':<20}{'items':>6}{'targets':>8}{'flagged':>8}{'recall':>8}{'base':>7}{'lift':>6}{'added':>7}   by reason")
    total = [0, 0, 0, 0]
    for name, tender_path, later_paths in PAIRS:
        tender = parse_file(str(DATASET / tender_path))
        why, added = targets(tender, [parse_file(str(DATASET / p)) for p in later_paths])
        flagged = {}
        for f in findings_of(tender, llm):
            for oz in [f.item_oz, *f.related_oz]:
                if oz:
                    flagged.setdefault(oz, []).append(f)
        items = {i.oz for i in tender.items}
        hit = [oz for oz in why if oz in flagged]
        others = items - set(why)
        base = sum(oz in flagged for oz in others) / len(others) if others else 0
        recall = len(hit) / len(why) if why else 0
        reasons = {}
        for oz, rs in why.items():
            for r in rs:
                a = reasons.setdefault(r, [0, 0])
                a[1] += 1
                a[0] += oz in flagged
        print(f"{name:<20}{len(items):>6}{len(why):>8}{len(hit):>8}{recall:>8.0%}{base:>7.0%}{(recall / base if base else 0):>6.1f}{added:>7}   "
              + ", ".join(f"{r} {a}/{b}" for r, (a, b) in sorted(reasons.items())))
        total = [total[0] + len(why), total[1] + len(hit), total[2] + len(others), total[3] + sum(oz in flagged for oz in others)]
        if verbose:
            by_oz = {i.oz: i for i in tender.items}
            for oz in sorted(set(why) - set(hit))[:25]:
                print(f"      missed {oz:<10} {'+'.join(sorted(why[oz])):<16} {by_oz[oz].label[:70]}")
    recall, base = total[1] / total[0] if total[0] else 0, total[3] / total[2] if total[2] else 0
    print(f"\n{'all':<20}{'':>6}{total[0]:>8}{total[1]:>8}{recall:>8.0%}{base:>7.0%}{(recall / base if base else 0):>6.1f}")
    print("\nrecall: targets with a finding · base: other items with a finding · lift: recall / base")


if __name__ == "__main__":
    main()
