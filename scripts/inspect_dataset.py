#!/usr/bin/env python3
"""Inventory of the challenge dataset (stdlib only).

    python3 scripts/inspect_dataset.py [dataset]

Prints, per GAEB file: format, item count, units, and (for priced D84/D86
files) the bid total plus a GP == EP * Qty self-check. This is a throwaway
reference for the real parser, not the parser itself.
"""
import collections
import os
import re
import sys
import xml.etree.ElementTree as ET


def local(tag):
    return tag.rsplit("}", 1)[-1]


def decode_gaeb90(raw: bytes) -> str:
    # Encoding differs per exporting program: DOS cp850/cp437 or latin-1.
    # Heuristic: cp850 umlaut bytes vs latin-1 umlaut bytes.
    dos = sum(raw.count(b) for b in (b"\x84", b"\x94", b"\x81", b"\xe1"))
    iso = sum(raw.count(b) for b in (b"\xe4", b"\xf6", b"\xfc", b"\xdf"))
    return raw.decode("cp850" if dos >= iso else "latin-1", "replace")


def inspect_xml(path):
    root = ET.parse(path).getroot()
    items = [e for e in root.iter() if local(e.tag) == "Item"]
    units = collections.Counter()
    for it in items:
        qu = [c.text for c in it if local(c.tag) == "QU"]
        units[qu[0] if qu else None] += 1
    version = next((e.text for e in root.iter() if local(e.tag) == "Version"), "?")
    print(f"  GAEB XML {version}  items={len(items)}  units={units.most_common(8)}")


def inspect_gaeb90(path):
    lines = decode_gaeb90(open(path, "rb").read()).splitlines()
    kinds = collections.Counter(l[:2] for l in lines)
    items, cur = {}, None
    for l in lines:
        kind = l[:2]
        if kind == "21":  # item header: OZ, flags, quantity (3 decimals), unit
            cur = l[2:11]
            items[cur] = {"qty": int(l[23:34]) / 1000, "unit": l[34:38].strip(),
                          "flags": l[11:23].strip()}
        elif kind == "23":  # prices: EP, GP (2 decimals). EP width/decimals vary!
            m = re.match(r"\s*(\d+)\s+(\d+)", l[11:])
            it = items.setdefault(l[2:11], {})
            it["ep_raw"], it["gp"] = m.group(1), int(m.group(2)) / 100
    print(f"  GAEB 90 phase {lines[[l[:2] for l in lines].index('00')][10:12]}  "
          f"items={kinds['21'] or kinds['23']}  records={dict(sorted(kinds.items()))}")
    priced = {k: v for k, v in items.items() if "gp" in v}
    if priced:
        total = sum(v["gp"] for v in priced.values())
        bad = 0
        for v in priced.values():
            if "qty" not in v:
                continue
            # EP has 2 decimals (10 digits) or 3 decimals (11 digits) depending on exporter
            ep = int(v["ep_raw"]) / (1000 if len(v["ep_raw"]) == 11 else 100)
            bad += abs(ep * v["qty"] - v["gp"]) > 0.011
        flags = collections.Counter(v.get("flags") for v in items.values())
        print(f"  priced items={len(priced)}  net total={total:,.2f} EUR  "
              f"EP*Qty!=GP: {bad}  flags={dict(flags)}")


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else "dataset"
    paths = sorted(os.path.join(root, f) for root, _, files in os.walk(d) for f in files)
    for path in paths:
        ext = path.rsplit(".", 1)[-1].lower()
        if ext == "x83":
            print(path); inspect_xml(path)
        elif ext in ("d83", "d84", "d86"):
            print(path); inspect_gaeb90(path)


if __name__ == "__main__":
    main()
