#!/usr/bin/env python3
"""Score the PDF parser against the GAEB version of the same LV.

    uv run python scripts/eval_pdf_parser.py [-v]

For every (PDF, GAEB) pair of the dataset the GAEB file is the ground truth. Per pair:
  recall     share of GAEB items found in the PDF under the same item number
  extra      PDF items that do not exist in the GAEB file (false items)
  qty, unit  share of matched items with the same quantity / normalised unit
  price      share of matched items with the same unit price and total (priced pairs only)
  short      mean text similarity of the short text (pairs where the GAEB file has texts)
  long       mean similarity of the long text, whitespace ignored
  text       mean similarity of everything printed for the item (short + long); the fair number for
             layouts that do not print a separate short text
-v lists every item that is missing, extra or different.
"""
import difflib
import re
import sys
from pathlib import Path

from boq.parsers import parse_file

DATA = Path(__file__).resolve().parent.parent / "dataset"
PDF, XML, G90 = DATA / "04_pdf_tiefbau_sonstige", DATA / "01_gaeb_xml", DATA / "02_gaeb_90"
PAIRS = [  # project, PDF, ground truth
    ("A tender", PDF / "HEM2301-2_Gesamt-LV.pdf", XML / "8209.003_Leistungsverzeichnis_leer.X83"),
    ("B tender", PDF / "Leistungsverzeichnis_leer.pdf", XML / "[NUMMER_001]_leer.X83"),
    ("B bid", PDF / "Abgabe LV.pdf", G90 / "StBALV23040.D86"),
    ("C tender", PDF / "Leistungsverzeichnis.pdf", G90 / "Angebot AN24-0305.D84"),
    ("C offer", PDF / "Angebot AN24-0305.pdf", G90 / "Angebot AN24-0305.D84"),
    ("D tender", PDF / "LV-Ausdruck-[PROJEKT_004].pdf", XML / "GAEB-[PROJEKT_004].X83"),
]


def _squash(text: str) -> str:
    """Compare texts without layout: no whitespace, no hyphenation, no anonymiser tokens."""
    return re.sub(r"\[?[A-Z]{3,}_?\d+\]?|[\s\-]+", "", text).lower()


def _similar(a: str, b: str) -> float:
    a, b = _squash(a), _squash(b)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def score(pdf_path, truth_path, verbose=False) -> dict:
    pdf = {i.oz: i for i in parse_file(str(pdf_path)).items}
    truth = {i.oz: i for i in parse_file(str(truth_path)).items}
    both = [oz for oz in truth if oz in pdf]
    has_text = any(i.short_text for i in truth.values())
    priced = any(i.total is not None for i in pdf.values()) and any(i.total is not None for i in truth.values())
    diffs = {"missing": [oz for oz in truth if oz not in pdf], "extra": [oz for oz in pdf if oz not in truth],
             "qty": [], "unit": [], "price": []}
    short, long, full = [], [], []
    for oz in both:
        p, t = pdf[oz], truth[oz]
        if p.qty != t.qty:
            diffs["qty"].append(f"{oz} pdf {p.qty} / gaeb {t.qty}")
        if (p.unit or p.unit_raw) != (t.unit or t.unit_raw):
            diffs["unit"].append(f"{oz} pdf {p.unit_raw!r} / gaeb {t.unit_raw!r}")
        if priced and (p.up, p.total) != (t.up, t.total):
            diffs["price"].append(f"{oz} pdf {p.up} {p.total} / gaeb {t.up} {t.total}")
        if has_text:
            short.append(_similar(p.short_text, t.short_text))
            long.append(_similar(p.long_text, t.long_text))
            full.append(max(_similar(p.text, t.text), _similar(p.long_text, t.text), _similar(p.long_text, t.long_text)))
    n = len(both) or 1
    result = {
        "items": len(truth), "recall": len(both) / (len(truth) or 1), "extra": len(diffs["extra"]),
        "qty": 1 - len(diffs["qty"]) / n, "unit": 1 - len(diffs["unit"]) / n,
        "price": 1 - len(diffs["price"]) / n if priced else None,
        "short": sum(short) / len(short) if short else None,
        "long": sum(long) / len(long) if long else None,
        "text": sum(full) / len(full) if full else None,
    }
    if verbose:
        for kind, rows in diffs.items():
            if rows:
                print(f"    {kind} ({len(rows)}): " + "; ".join(rows[:12]) + (" …" if len(rows) > 12 else ""))
    return result


def main():
    verbose = "-v" in sys.argv
    pct = lambda v: "   –  " if v is None else f"{v:6.1%}"
    print(f"{'pair':10} {'items':>5} {'recall':>6} {'extra':>5} {'qty':>6} {'unit':>6} {'price':>6} {'short':>6} {'long':>6} {'text':>6}")
    for name, pdf_path, truth_path in PAIRS:
        r = score(pdf_path, truth_path)
        print(f"{name:10} {r['items']:5} {pct(r['recall'])} {r['extra']:5} {pct(r['qty'])} {pct(r['unit'])} "
              f"{pct(r['price'])} {pct(r['short'])} {pct(r['long'])} {pct(r['text'])}")
        if verbose:
            score(pdf_path, truth_path, verbose=True)


if __name__ == "__main__":
    main()
