"""Completeness audit: compare every file of dataset/ with its English twin, looking for anything that got lost.

Run: uv run python scripts/translate/audit.py        (writes data/processed/translation/audit.json)

Two levels:
  A. File level, read back from the finished files (not from the pipeline's own tables):
     - GAEB XML / GAEB 90: per item, the text of both parses: present in both, same digit groups, same tokens.
       Remarks (preliminary texts) likewise. XML: no text node with words is byte-identical to the German.
     - DOCX: same number of paragraphs, none emptied, same digit groups per paragraph.
     - PDF: per page, every English segment is found in the text layer of the English page (nothing clipped or
       dropped while drawing), no translated German line is still there, every untouched piece of text (numbers,
       units, tokens) is still there.
  B. Segment level, every unique translation: things a translator could have dropped although digits match:
     length ratio, counts of sentences, list lines, brackets, quotes, fill-in dot runs, symbols, capitalised
     codes. Outliers go to the review list.
"""
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import fitz  # noqa: E402

from boq.parsers import parse_file  # noqa: E402
from common import DATASET, OUT, TOKEN, WORK, flat, load_translations, needs_translation  # noqa: E402
from pipeline import files, load_segs  # noqa: E402

DIG = re.compile(r"\d+")
CODE = re.compile(r"\b[A-ZÄÖÜ]{2,}[A-Z0-9ÄÖÜ/-]*\d[\w/.-]*|\b[A-Z]{1,4}\s?\d+(?:[.,/-]\d+)*\b")
SYMS = "%°§Ø±²³®/=<>+*"


def squash(t):
    # NFKC: the text layer of the English PDFs holds ligatures (fi, fl, ff, st) as single characters
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", t))


def sig(t):
    return Counter(DIG.findall(t)), Counter(TOKEN.findall(t))


def gaeb(src, dst):
    issues = []
    a, b = parse_file(str(src)), parse_file(str(dst))
    for x, y in zip(a.items, b.items):
        for field in ("short_text", "long_text"):
            de, en = getattr(x, field), getattr(y, field)
            if bool(de.strip()) != bool(en.strip()):
                issues.append(f"{x.oz} {field}: present in one file only")
            elif sig(de) != sig(en):
                d = (sig(de)[0] - sig(en)[0]) + (sig(en)[0] - sig(de)[0])
                issues.append(f"{x.oz} {field}: digits/tokens differ {sorted(d.elements())[:6]}")
    if len(a.items) != len(b.items):
        issues.append(f"item count {len(a.items)} vs {len(b.items)}")
    ra, rb = "\n".join(r.text for r in a.remarks), "\n".join(r.text for r in b.remarks)
    if len(a.remarks) != len(b.remarks):
        issues.append(f"remark blocks {len(a.remarks)} vs {len(b.remarks)}")
    if sig(ra) != sig(rb):
        d = (sig(ra)[0] - sig(rb)[0]) + (sig(rb)[0] - sig(ra)[0])
        issues.append(f"remarks: digits/tokens differ {sorted(d.elements())[:8]}")
    de_chars = sum(len(i.text) for i in a.items) + len(ra)
    en_chars = sum(len(i.text) for i in b.items) + len(rb)
    return issues, f"{len(a.items)} items, {len(a.remarks)} remark blocks, text {de_chars} -> {en_chars} chars"


def xml_same_nodes(src, dst):
    a = re.findall(r">([^<]+)<", src.read_bytes().decode())
    b = re.findall(r">([^<]+)<", dst.read_bytes().decode())
    same = [x.strip() for x, y in zip(a, b) if x == y and needs_translation(x) and len(x.strip()) > 3]
    return Counter(same)


def docx(src, dst):
    def paras(p):
        xml = zipfile.ZipFile(p).read("word/document.xml").decode()
        return ["".join(re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>", x)) for x in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)]
    a, b = paras(src), paras(dst)
    issues = []
    if len(a) != len(b):
        issues.append(f"paragraphs {len(a)} vs {len(b)}")
    for n, (x, y) in enumerate(zip(a, b)):
        if bool(x.strip()) != bool(y.strip()) or sig(x) != sig(y):
            issues.append(f"paragraph {n}: {x[:50]!r} -> {y[:50]!r}")
    return issues, f"{len(a)} paragraphs"


def pdf(src, dst, segs, tr):
    issues = []
    a, b = fitz.open(src), fitz.open(dst)
    by_page = {}
    for s in segs:
        by_page.setdefault(s["loc"]["page"], []).append(s)
    lost = german_left = 0
    words_de = words_en = 0
    for n in range(len(a)):
        ta, tb = a[n].get_text(), unicodedata.normalize("NFKC", b[n].get_text())
        sa, sb = squash(ta), squash(tb)
        words_de += len(ta.split())
        words_en += len(tb.split())
        for s in by_page.get(n, []):
            en = tr.get(s["key"])
            if en is None:
                issues.append(f"p.{n + 1}: untranslated segment {s['src'][:50]!r}")
                continue
            if squash(en) == squash(s["src"]):
                continue
            # every printed line of the English must be on the page
            for line in en.split("\n"):
                q = squash(line)
                if q and q not in sb:
                    # the text layer may hyphenate / reorder at wraps: fall back to the words
                    missing = [w for w in line.split() if squash(w) not in sb]
                    if missing:
                        lost += 1
                        issues.append(f"p.{n + 1}: English not found on page: {missing[:6]} of {line[:60]!r}")
            for line in s["src"].split("\n"):
                q = squash(line)
                if len(q) > 14 and needs_translation(line) and q in sb and q not in squash(en):
                    german_left += 1
                    issues.append(f"p.{n + 1}: German line still on page: {line[:60]!r}")
        # text that was never a segment (numbers, units, tokens, dotted lines) must still be there
        translated = {squash(l) for s in by_page.get(n, []) for l in s["src"].split("\n")}
        for line in ta.split("\n"):
            q = squash(line)
            if q and q not in sb and not any(q in t or t in q for t in translated if t):
                if not all(squash(w) in sb for w in line.split()):
                    issues.append(f"p.{n + 1}: untouched text missing: {line.strip()[:60]!r}")
    return issues, f"{len(a)} pages, {len(segs)} segments, words {words_de} -> {words_en}"


def segment_outliers(tr, segs_by_key):
    out = []
    for key, s in segs_by_key.items():
        if key not in tr:
            continue
        de, en = flat(s["src"]), flat(tr[key])
        if squash(de) == squash(en):
            continue
        why = []
        core_de = TOKEN.sub("", de)
        core_en = TOKEN.sub("", en)
        if len(core_de) >= 30:
            r = len(core_en) / max(1, len(core_de))
            if r < 0.62:
                why.append(f"English much shorter ({r:.2f})")
        n_de, n_en = len(re.findall(r"[.!?;:](?:\s|$)", de)), len(re.findall(r"[.!?;:](?:\s|$)", en))
        if n_de - n_en >= 2 and n_en < 0.7 * n_de:
            why.append(f"sentence marks {n_de} -> {n_en}")
        for a, b, name in (("(", ")", "brackets"), ("[", "]", "square brackets")):
            if de.count(a) != en.count(a) or de.count(b) != en.count(b):
                why.append(f"{name} {de.count(a)}/{de.count(b)} -> {en.count(a)}/{en.count(b)}")
        q_de = len(re.findall(r"[\"„“”»«]", de)) + len(re.findall(r"(?<!\w)'|'(?!\w)", de))
        q_en = len(re.findall(r"[\"„“”»«]", en)) + len(re.findall(r"(?<!\w)'|'(?!\w)", en))
        if q_de != q_en:
            why.append(f"quote marks {q_de} -> {q_en}")
        if len(re.findall(r"\.{4,}|_{3,}", de)) != len(re.findall(r"\.{4,}|_{3,}", en)):
            why.append("fill-in fields differ")
        for ch in SYMS:
            if de.count(ch) != en.count(ch):
                why.append(f"symbol {ch!r} {de.count(ch)} -> {en.count(ch)}")
        if isinstance(s["src"], str):
            li_de = len(re.findall(r"(?m)^\s*[-–•*]\s", de))
            li_en = len(re.findall(r"(?m)^\s*[-–•*]\s", en))
            if li_de != li_en:
                why.append(f"list lines {li_de} -> {li_en}")
        c_de, c_en = Counter(CODE.findall(de)), Counter(CODE.findall(en))
        gone = c_de - c_en
        if gone:
            why.append(f"codes not found again: {sorted(gone.elements())[:5]}")
        if why:
            out.append({"key": key, "file": s["file"], "where": s["loc"].get("page", s.get("oz", "")), "why": why,
                        "de": de, "en": en})
    return out


def main():
    tr = load_translations()
    report, segs_by_key = {}, {}
    for p in files([]):
        rel = p.relative_to(DATASET).as_posix()
        dst = OUT / rel
        segs = load_segs(p)
        for s in segs:
            segs_by_key.setdefault(s["key"], s)
        ext = p.suffix.lower()
        if ext == ".pdf":
            issues, note = pdf(p, dst, segs, tr)
        elif ext == ".docx":
            issues, note = docx(p, dst)
        else:
            issues, note = gaeb(p, dst)
            if ext == ".x83":
                same = xml_same_nodes(p, dst)
                note += f", {sum(same.values())} worded text nodes identical to German ({len(same)} distinct)"
                report.setdefault("_xml_identical", {})[rel] = same.most_common(40)
        report[rel] = {"issues": issues, "note": note}
        print(("OK   " if not issues else f"{len(issues):4d} ") + f"{rel}: {note}")
        for i in issues[:6]:
            print("       ", i[:170])
    outliers = segment_outliers(tr, segs_by_key)
    report["_segment_outliers"] = outliers
    kinds = Counter(w.split(" ")[0] + " " + w.split(" ")[1] if w.startswith(("symbol", "English", "sentence", "list", "quote", "codes", "square")) else w.split(" ")[0] for o in outliers for w in o["why"])
    print(f"\nsegment level: {len(segs_by_key)} unique segments, {len(outliers)} flagged for review")
    for k, n in kinds.most_common(30):
        print(f"   {n:5d}  {k}")
    (WORK / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
