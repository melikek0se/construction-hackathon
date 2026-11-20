#!/usr/bin/env python3
"""Back-test the price suggestions on the three priced bids of the dataset.

    uv run python scripts/eval_prices.py [-v]

For each project, every priced item is priced from the OTHER two projects only (leave one project out),
which is the honest test: a new LV is never in the history. Reported per project and confidence level:
  items      items of the project (lump sums and zero-quantity items are counted but not suggested)
  suggested  items that got a price
  median err median of |suggested - actual| / actual
  ±25 / ±50  share of suggestions within 25 % / 50 % of the actual unit price
  in band    share of actual prices inside the suggested low-high band
-v lists the ten largest misses per project.
"""
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from boq.prices import load_history

DATASET = Path(__file__).resolve().parent.parent / "dataset"


def backtest(history):
    """rows[project] = list of (confidence, relative error, in band, history item, suggestion)."""
    rows = defaultdict(list)
    for e in history.entries:
        s = history.suggest(e.item, exclude_projects={e.project})
        if s.unit_price is None:
            rows[e.project].append((s.confidence, None, None, e, s))
            continue
        err = float(abs(s.unit_price - e.unit_price) / e.unit_price)
        rows[e.project].append((s.confidence, err, s.low <= e.unit_price <= s.high, e, s))
    return rows


def summary(rows) -> dict:
    hits = [r for r in rows if r[1] is not None]
    if not hits:
        return {"items": len(rows), "suggested": 0}
    errs = [r[1] for r in hits]
    return {"items": len(rows), "suggested": len(hits), "median_err": statistics.median(errs),
            "within_25": sum(e <= 0.25 for e in errs) / len(errs), "within_50": sum(e <= 0.5 for e in errs) / len(errs),
            "in_band": sum(r[2] for r in hits) / len(hits)}


def main():
    verbose = "-v" in sys.argv
    history = load_history(DATASET)
    rows = backtest(history)
    print(f"history: {len(history.entries)} priced items\n")
    print(f"{'':22} {'items':>5} {'suggested':>9} {'median err':>10} {'±25 %':>6} {'±50 %':>6} {'in band':>7}")

    def line(name, s):
        if not s["suggested"]:
            print(f"{name:22} {s['items']:5} {0:9}")
            return
        print(f"{name:22} {s['items']:5} {s['suggested']:9} {s['median_err']:10.0%} {s['within_25']:6.0%} "
              f"{s['within_50']:6.0%} {s['in_band']:7.0%}")

    for project in sorted(rows):
        line(f"project {project}", summary(rows[project]))
    everything = [r for p in rows.values() for r in p]
    line("all", summary(everything))
    print()
    for confidence in ("high", "medium"):
        line(f"confidence {confidence}", summary([r for r in everything if r[0] == confidence]))
    loose = sum(r[0] == "low" for r in everything)
    print(f"\n{loose} more items have only loosely similar matches; those are shown as references, not priced.")
    if verbose:
        for project in sorted(rows):
            print(f"\nlargest misses, project {project}:")
            for conf, err, _, e, s in sorted((r for r in rows[project] if r[1] is not None), key=lambda r: -r[1])[:10]:
                m = s.matches[0]
                print(f"  {e.item.oz:9} {e.item.label[:42]:42} actual {e.unit_price:>9} suggested {s.unit_price:>9} "
                      f"({conf}, {err:.0%}) <- {m.history.project} {m.history.item.oz} {m.history.item.label[:36]} sim {m.similarity}")


if __name__ == "__main__":
    main()
