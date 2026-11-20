"""Command line: parse an LV and print rule findings.

    uv run boq dataset/01_gaeb_xml/GAEB-[PROJEKT_004].X83
    uv run boq FILE --json > data/processed/findings.json
"""
import argparse
import collections
import json
import textwrap

from boq.checks import run_checks
from boq.parsers import parse_file


def main(argv=None):
    ap = argparse.ArgumentParser(description="Parse a GAEB LV and run the rule checks.")
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true", help="print items and findings as JSON")
    ap.add_argument("--min-severity", choices=["info", "warn", "high"], default="info")
    args = ap.parse_args(argv)

    boq = parse_file(args.file)
    keep = {"info": {"info", "warn", "high"}, "warn": {"warn", "high"}, "high": {"high"}}[args.min_severity]
    findings = [f for f in run_checks(boq) if f.severity in keep]

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
