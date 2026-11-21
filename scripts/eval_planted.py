#!/usr/bin/env python3
"""Planted errors: put known faults into clean tenders and count how many the checks find.

    uv run python scripts/eval_planted.py [--llm] [-v] [--per N]

The dataset holds no list of real LV defects (see eval_findings.py), so this test makes its own: into each
of three tender LVs it plants N faults per kind (default 2), at items picked by a fixed seed, and runs the
checks on the changed LV. A fault counts as found when the changed item carries a finding it did not carry
before; `right kind` also asks that the finding's category fits the fault.

  unit       a pipe or cable item measured in m gets the unit m2
  magnitude  the quantity of a piece or metre item is multiplied by 100
  supplied   an item that says "liefern" gets the sentence that the material is supplied by the client
  size       the DN in the short text is changed, the long text keeps the old one
  reference  the text points at "Position 99.99.99", which is not in the LV

size and reference are what the rules are written for; unit, magnitude and supplied need reading, so
they are the test of the AI review. --llm runs it (two reviews per LV, of the clean and of the changed
file: this asks Claude and costs money unless cached). Also reported: findings that appear on items that
were NOT changed (the changed file is read anew by the model, so some of these are noise of the model,
not false alarms about the planted faults). -v lists every planted fault with what was found.

Limits: the faults are ours, written to be found; real defects are subtler. A fault found says the checks
look there, and the finding is printed with -v to be read. Thirty faults are a small sample.
"""
import asyncio
import random
import re
import sys
from decimal import Decimal
from pathlib import Path

from boq.checks import run_checks
from boq.model import BoQ, Finding
from boq.parsers import parse_file

DATASET = Path(__file__).resolve().parent.parent / "dataset"
TENDERS = ["01_gaeb_xml/GAEB-[PROJEKT_004].X83", "01_gaeb_xml/[NUMMER_001]_leer.X83",
           "01_gaeb_xml/8209.003_Leistungsverzeichnis_leer.X83"]
DN = re.compile(r"DN\s*(\d{2,4})")
FITS = {"unit": {"error", "quantity", "unclear_scope"}, "magnitude": {"quantity", "error"},
        "supplied": {"error", "unclear_scope", "contract_risk"}, "size": {"error"}, "reference": {"error", "unclear_scope"}}


def _unit(item):
    item.unit, item.unit_raw = "m2", "m2"


def _magnitude(item):
    item.qty = item.qty * 100


def _supplied(item):
    item.long_text = (item.long_text + "\nDas Material wird bauseits gestellt und ist nicht zu liefern.").strip()


def _size(item):
    old = DN.search(item.short_text).group(1)
    item.short_text = DN.sub(f"DN {int(old) * 2 if int(old) < 400 else int(old) // 2}", item.short_text, count=1)


def _reference(item):
    item.long_text = (item.long_text + "\nAusführung wie Position 99.99.99.").strip()
    item.refs = [*item.refs, "99.99.99"]


KINDS = {
    "unit": (lambda i: i.unit == "m" and re.search(r"rohr|leitung|kabel", i.text, re.I), _unit),
    "magnitude": (lambda i: i.unit in ("St", "m") and i.qty is not None and Decimal(5) <= i.qty <= Decimal(500), _magnitude),
    "supplied": (lambda i: re.search(r"liefern", i.text, re.I) and "bauseits" not in i.text.lower(), _supplied),
    "size": (lambda i: DN.search(i.short_text) and DN.search(i.long_text), _size),
    "reference": (lambda i: not i.refs and i.long_text, _reference),
}


def plant(boq: BoQ, per: int, rng: random.Random) -> dict[str, str]:
    """Change the LV in place; returns the kind of fault per changed item."""
    planted: dict[str, str] = {}
    for kind, (fits, change) in KINDS.items():
        pool = [i for i in boq.items if i.oz not in planted and i.kind == "normal" and fits(i)]
        for item in rng.sample(pool, min(per, len(pool))):
            change(item)
            planted[item.oz] = kind
    return planted


def check(boq: BoQ, llm: bool) -> list[Finding]:
    found = run_checks(boq)
    if llm:
        from boq.checks.llm import run_llm_checks

        found = found + asyncio.run(run_llm_checks(boq, found))[0]
    return found


def main() -> None:
    llm, verbose = "--llm" in sys.argv, "-v" in sys.argv
    per = int(sys.argv[sys.argv.index("--per") + 1]) if "--per" in sys.argv else 2
    if llm:
        from boq.env import load_env

        load_env()
    rng = random.Random(11)
    by_kind: dict[str, list[int]] = {k: [0, 0, 0, 0] for k in KINDS}  # planted, found, right kind, found by the AI
    elsewhere = items_unchanged = 0
    for path in TENDERS:
        clean = parse_file(str(DATASET / path))
        before = {(f.check_id, f.item_oz) for f in check(clean, llm)}
        changed = clean.model_copy(deep=True)
        planted = plant(changed, per, rng)
        new = [f for f in check(changed, llm) if (f.check_id, f.item_oz) not in before]
        by_oz = {i.oz: i for i in changed.items}
        if verbose:
            print(f"\n{Path(path).name}: {len(planted)} planted")
        for oz, kind in planted.items():
            on = [f for f in new if f.item_oz == oz or oz in f.related_oz]
            row = by_kind[kind]
            row[0] += 1
            row[1] += bool(on)
            row[2] += any(f.category in FITS[kind] for f in on)
            row[3] += any(f.origin == "llm" for f in on)
            if verbose:
                print(f"  {'FOUND ' if on else 'missed'} {kind:<10} {oz:<10} {by_oz[oz].label[:50]}")
                for f in on[:2]:
                    print(f"         {f.origin:<4} {f.severity:<4} {f.category:<14} {f.title or f.check_id}")
        elsewhere += len({f.item_oz for f in new if f.item_oz and f.item_oz not in planted and not set(f.related_oz) & set(planted)})
        items_unchanged += len(changed.items) - len(planted)
    print(f"\nPlanted faults found ({'rules + AI review' if llm else 'rules only'}), {per} per kind and LV\n")
    print(f"{'kind':<12}{'planted':>8}{'found':>7}{'right kind':>12}{'by the AI':>11}")
    total = [0, 0, 0, 0]
    for kind, row in by_kind.items():
        print(f"{kind:<12}{row[0]:>8}{row[1]:>7}{row[2]:>12}{row[3]:>11}")
        total = [a + b for a, b in zip(total, row)]
    print(f"{'all':<12}{total[0]:>8}{total[1]:>7}{total[2]:>12}{total[3]:>11}   {total[1] / total[0]:.0%} found" if total[0] else "nothing planted")
    print(f"\nnew findings on items that were not changed: {elsewhere} of {items_unchanged} items")


if __name__ == "__main__":
    main()
