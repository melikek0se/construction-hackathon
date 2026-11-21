"""Write dataset/en/TRANSLATION_NOTES.md from the translators' notes, the validation residue and the PDF fit report.

Run after `pipeline.py rebuild`: uv run python scripts/translate/build_notes.py
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import OUT, WORK, flat, load_translations, validate  # noqa: E402
from pipeline import SEG_DIR, files, load_segs  # noqa: E402

HEAD = """# Translation notes

Per file: every error, typo, contradiction or oddity noticed in the German source while translating, and how it was
carried over. Nothing listed here was fixed: the English copy has the same defect in the same place. The notes come
from the translators (one pass over every segment) and from the automatic checks; they are observations, not a
complete audit. "Where" is the item number (OZ) for GAEB files and the page for PDFs.

General, valid for all files:

- File names are unchanged, including their misspellings: `LV_00_Roh_und_Erdauarbeiten.pdf` (Erd**au**arbeiten,
  "earthwroks"), `LV_10_Stahlbetonfertigeile_Stuetzen_Binder.pdf` and `LV_11_Stahlbetonfertigeile_Sandwichsockel.pdf`
  (Fertig**eile**, "precast concrete elemnts").
- Anonymisation tokens (`[FIRMA_044]`, `[PERSON_167]`, `[ORT_016]` …) replaced not only names but also product
  names, standards and ordinary words, often in the middle of a sentence (`VOB [ORT_016] C`). They are copied
  byte-identical, so such sentences are as damaged in English as in German.
- GAEB 90 files cut some lines at the field width (in the middle of a word). The English line is cut at the
  corresponding word.

"""


def cell(text, n=160):
    text = re.sub(r"\s+", " ", str(text)).strip().replace("|", "\\|")
    return text if len(text) <= n else text[: n - 1] + "…"


def where(seg):
    loc = seg["loc"]
    if "page" in loc:
        return f"p. {loc['page'] + 1}"
    if seg.get("oz"):
        return f"OZ {seg['oz'].strip()}" + (f" ({seg['what']})" if seg.get("what") else "")
    return seg.get("what", "")


def main():
    tr = load_translations()
    notes = {}
    for f in sorted((WORK / "notes").glob("*.json")):
        try:
            for n in json.loads(f.read_text()):
                if isinstance(n, dict) and n.get("id"):
                    notes.setdefault(n["id"], []).append(n)
        except json.JSONDecodeError:
            print("unreadable notes file", f.name)
    # notes written for a segment that was re-cut later (PDF paragraphs were split again after the first round)
    # are attached by their German quote to the segment that now holds that text
    norm = lambda t: re.sub(r"\W+", "", str(t)).lower()
    all_segs = [s for p in files([]) for s in load_segs(p)]
    live = {s["key"] for s in all_segs}
    index = [(norm(flat(s["src"])), s["key"]) for s in all_segs]
    moved = 0
    for key in [k for k in notes if k not in live]:
        for n in notes.pop(key):
            q = norm(n.get("german", ""))[:40]
            hit = next((k for text, k in index if len(q) >= 12 and q in text), None)
            if hit:
                notes.setdefault(hit, []).append(n)
                moved += 1
    print(f"{moved} notes re-attached to re-cut segments")
    tight = json.loads((WORK / "pdf_tight.json").read_text()) if (WORK / "pdf_tight.json").exists() else {}
    out = [HEAD]
    total = 0
    for p in files([]):
        rel = p.relative_to(OUT.parent).as_posix()
        segs = load_segs(p)
        rows, seen = [], set()
        for s in segs:
            for n in notes.get(s["key"], []):
                key = (s["key"], n.get("note"))
                if key in seen:
                    continue
                seen.add(key)
                rows.append(f"| {where(s)} | {cell(n.get('german', ''))} | {cell(n.get('english', ''))} | {cell(n.get('note', ''), 260)} |")
        residue = []
        for s in segs:
            if s["key"] in tr and s["key"] not in seen:
                errs = [e for e in validate(s, tr[s["key"]]) if not e.startswith("German words")]
                if errs:
                    residue.append(f"| {where(s)} | {cell(flat(s['src']))} | {cell(flat(tr[s['key']]))} | accepted although the automatic check reported: {cell('; '.join(errs), 200)} |")
                    seen.add(s["key"])
        missing = sum(1 for s in segs if s["key"] not in tr)
        out.append(f"## `{rel}`\n")
        if missing:
            out.append(f"**{missing} segments are not translated and are still German in the English file.**\n")
        if rows or residue:
            out.append("| Where | German original | English rendering | Note |\n|---|---|---|---|")
            out.extend(rows + residue)
            out.append("")
        else:
            out.append("Nothing noted.\n")
        if rel in tight:
            out.append(f"Text boxes where the English had to be shrunk below 72 % of the original size ({len(tight[rel])}):\n")
            for t in tight[rel]:
                out.append(f"- p. {t['page']}, scale {t['scale']}: {cell(t['text'], 90)}")
            out.append("")
        total += len(rows) + len(residue)
    (OUT / "TRANSLATION_NOTES.md").write_text("\n".join(out))
    print(f"{total} notes written")


if __name__ == "__main__":
    main()
