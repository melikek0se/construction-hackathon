"""Command line: parse an LV and print rule findings.

    uv run boq dataset/01_gaeb_xml/GAEB-[PROJEKT_004].X83
    uv run boq FILE --json > data/processed/findings.json
"""
import argparse
import asyncio
import collections
import json
import sys
import textwrap

from boq.checks import run_checks
from boq.env import load_env
from boq.parsers import parse_file


def main(argv=None):
    ap = argparse.ArgumentParser(description="Parse a GAEB LV and run the rule checks.")
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true", help="print items and findings as JSON")
    ap.add_argument("--min-severity", choices=["info", "warn", "high"], default="info")
    ap.add_argument("--llm", action="store_true", help="also run the LLM checks (needs ANTHROPIC_API_KEY)")
    ap.add_argument("--report", metavar="FILE.html", help="write the risk report (all findings, any severity)")
    ap.add_argument("--questions", metavar="FILE.txt", help="write the bidder questions (German)")
    ap.add_argument("--prices", action="store_true", help="suggest unit prices from the priced bids in dataset/")
    args = ap.parse_args(argv)

    boq = parse_file(args.file)
    keep = {"info": {"info", "warn", "high"}, "warn": {"warn", "high"}, "high": {"high"}}[args.min_severity]
    findings = run_checks(boq)
    if args.llm:
        from boq.checks import sort_findings
        from boq.checks.llm import LLMUnavailable, run_llm_checks
        load_env()
        try:
            llm_findings, stats = asyncio.run(run_llm_checks(boq, findings))
        except LLMUnavailable as exc:
            sys.exit(str(exc))
        print(f"LLM review: {stats['requests']} requests, {stats['kept']} findings kept, "
              f"{stats['dropped']} dropped for missing evidence", file=sys.stderr)
        findings = sort_findings(findings + llm_findings)
    prices = None
    if args.prices or args.report:
        from pathlib import Path

        from boq.prices import load_history, suggest_prices
        if not any(i.total is not None for i in boq.items):
            prices = suggest_prices(boq, load_history(Path(__file__).resolve().parents[2] / "dataset"))
    if args.prices:
        if prices is None:
            print("This file has prices already; nothing to suggest.")
        else:
            labels = {i.oz: i.label for i in boq.items}
            print(f"Prices from past bids: {prices['with_price']} of {prices['items']} items")
            for s in prices["suggestions"]:
                if s["unit_price"] is not None:
                    m = s["matches"][0]
                    print(f"  {s['item_oz']:10} {labels[s['item_oz']][:44]:44} {s['unit_price']:>10.2f} "
                          f"({s['low']:.2f}-{s['high']:.2f}, {s['confidence']}) <- {m['project']} {m['item_oz']} {m['source']}")
            print()
    if args.report or args.questions:
        from boq.report import build_report, render_html, render_questions
        report = build_report(boq, findings, prices)
        for path, text in ((args.report, render_html(report)), (args.questions, render_questions(report))):
            if path:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text)
                print(f"wrote {path}", file=sys.stderr)
    findings = [f for f in findings if f.severity in keep]

    if args.json:
        print(json.dumps({"boq": boq.model_dump(mode="json"),
                          "findings": [f.model_dump(mode="json") for f in findings]},
                         ensure_ascii=False, indent=1))
        return

    priced = [i.total for i in boq.items if i.total is not None]
    print(f"{boq.file} — {boq.name}")
    print(f"phase {boq.phase}, {len(boq.items)} items, {len(boq.remarks)} remark blocks"
          + (f", net total {sum(priced):,.2f} EUR" if priced else ", no prices"))
    by_check = collections.Counter(f.check_id for f in findings)
    print(f"{len(findings)} findings: " + ", ".join(f"{k} {v}" for k, v in by_check.most_common()))
    for f in findings:
        print(f"\n[{f.severity.upper()}] {f.check_id}  item {f.item_oz or '—'}"
              + (f"  (+ {', '.join(f.related_oz[:6])})" if f.related_oz else ""))
        for label, value in (("evidence", f.evidence), ("why", f.explanation), ("action", f.action)):
            print(textwrap.fill(value, 110, initial_indent=f"  {label + ':':10}", subsequent_indent=" " * 12))


if __name__ == "__main__":
    main()
