"""Verify dataset/en against dataset/. Run: uv run python scripts/translate/verify.py [NAME ...] [--render]

GAEB (XML and GAEB 90): parse both with boq.parsers; OZ, quantity, unit, unit price and total of every item must be
  identical and EP x Qty = GP must hold. GAEB 90: every line 80 chars, sequence consecutive, same encoding, numeric
  records identical. XML: after blanking the text nodes both files must be byte-identical.
PDF: same page count; per page the same multiset of digit sequences and of anonymisation tokens.
DOCX: every zip entry except the translated parts byte-identical; XML with texts blanked identical.
--render writes PNGs of three pages per PDF (original and English side by side) to data/processed/translation/render/.
"""
import json
import re
import sys
import zipfile
from collections import Counter
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import fitz  # noqa: E402

from boq.parsers import parse_file  # noqa: E402
from common import DATASET, OUT, TOKEN, WORK  # noqa: E402
from gaeb90_fmt import codec_of  # noqa: E402
from pipeline import FORMATS, files  # noqa: E402


def items_of(path):
    boq = parse_file(str(path))
    return [(i.oz, i.qty, i.unit_raw, i.unit, i.up, i.total) for i in boq.items], boq


def check_gaeb(src, dst):
    errs = []
    a, _ = items_of(src)
    b, boq = items_of(dst)
    if a != b:
        diff = [(x, y) for x, y in zip(a, b) if x != y][:3]
        errs.append(f"parsed items differ ({len(a)} vs {len(b)}): {diff}")
    bad = 0
    for it in boq.items:
        if it.up is not None and it.total is not None and it.qty:
            if abs(it.up * it.qty - it.total) > Decimal("0.011"):
                bad += 1
    if bad:
        errs.append(f"EP x Qty != GP on {bad} items")
    return errs, f"{len(b)} items identical"


def check_gaeb90(src, dst):
    errs, note = check_gaeb(src, dst)
    ra, rb = src.read_bytes(), dst.read_bytes()
    if codec_of(ra) != codec_of(rb):
        errs.append("encoding differs")
    codec = codec_of(ra)
    la, lb = ra.decode(codec).split("\r\n"), rb.decode(codec).split("\r\n")
    if any(len(l) != 80 for l in lb[:-1]) or lb[-1] != "":
        errs.append("line length / line ending")
    if any(int(l[74:80]) != n for n, l in enumerate(lb[:-1], 1)):
        errs.append("sequence numbers not consecutive")
    text_types = ("01", "06", "07", "08", "11", "12", "20", "25", "26", "41", "42", "T0", "T1", "T9")
    na = [l[:74] for l in la[:-1] if l[:2] not in text_types]
    nb = [l[:74] for l in lb[:-1] if l[:2] not in text_types]
    if na != nb:
        errs.append("non-text records differ")
    return errs, note + f", {len(lb) - 1} records (source {len(la) - 1}), {codec}"


def _blank_xml(s):
    return re.sub(r">[^<]+<", "><", s)


def check_xml(src, dst):
    errs, note = check_gaeb(src, dst)
    a, b = src.read_bytes().decode("utf-8"), dst.read_bytes().decode("utf-8")
    if _blank_xml(a) != _blank_xml(b):
        errs.append("markup differs outside text nodes")
    ta, tb = re.findall(r">([^<]+)<", a), re.findall(r">([^<]+)<", b)
    changed = sum(x != y for x, y in zip(ta, tb))
    # text nodes without letters must be untouched
    if any(x != y and not re.search(r"[A-Za-zÄÖÜäöüß]", x) for x, y in zip(ta, tb)):
        errs.append("a non-text node changed")
    import xml.etree.ElementTree as ET
    ET.fromstring(dst.read_bytes())
    return errs, note + f", {changed} of {len(ta)} text nodes changed, markup identical, well-formed"


def check_docx(src, dst):
    errs = []
    with zipfile.ZipFile(src) as za, zipfile.ZipFile(dst) as zb:
        if [i.filename for i in za.infolist()] != [i.filename for i in zb.infolist()]:
            errs.append("zip entries differ")
        same = 0
        for i in za.infolist():
            x, y = za.read(i), zb.read(i.filename)
            if x == y:
                same += 1
            elif i.filename != "word/document.xml":
                errs.append(f"{i.filename} changed")
            else:
                strip = lambda s: re.sub(r"<w:t(?: [^>]*)?>[^<]*</w:t>", "<w:t/>", s.decode())
                if strip(x) != strip(y):
                    errs.append("document.xml differs outside <w:t>")
                da = Counter(re.findall(r"\d+", "".join(re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>", x.decode()))))
                db = Counter(re.findall(r"\d+", "".join(re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>", y.decode()))))
                if da != db:
                    errs.append("digits differ")
    return errs, f"{same} zip entries byte-identical, document.xml differs only inside <w:t>"


def page_counts(page):
    t = page.get_text()
    return Counter(re.findall(r"\d+", t)), Counter(TOKEN.findall(t))


def check_pdf(src, dst, render):
    errs, bad_pages = [], []
    a, b = fitz.open(src), fitz.open(dst)
    if len(a) != len(b):
        errs.append(f"page count {len(a)} -> {len(b)}")
    for n in range(min(len(a), len(b))):
        (da, ta), (db, tb) = page_counts(a[n]), page_counts(b[n])
        if da != db or ta != tb:
            miss, extra = (da - db) + (ta - tb), (db - da) + (tb - ta)
            la, lb = a[n].get_text().split("\n"), b[n].get_text().split("\n")
            pat = lambda d: re.compile(rf"(?<!\d){re.escape(d)}(?!\d)")
            bad_pages.append({"page": n + 1, "missing": sorted(miss.elements())[:8], "extra": sorted(extra.elements())[:8],
                              "source_lines": [l.strip()[:70] for l in la if any(pat(d).search(l) for d in miss) and l not in lb][:4],
                              "english_lines": [l.strip()[:70] for l in lb if any(pat(d).search(l) for d in extra) and l not in la][:4]})
    if bad_pages:
        errs.append(f"{len(bad_pages)} pages with different numbers/tokens: {bad_pages[:4]}")
    if render:
        out = WORK / "render"
        out.mkdir(exist_ok=True)
        pages = sorted({0, len(a) // 2, len(a) - 1})
        for n in pages:
            pa, pb = a[n].get_pixmap(dpi=70), b[n].get_pixmap(dpi=70)
            both = fitz.Pixmap(fitz.csRGB, (0, 0, pa.width + pb.width, max(pa.height, pb.height)), False)
            both.clear_with(255)
            pa.set_origin(0, 0)
            pb.set_origin(pa.width, 0)
            both.copy(pa, pa.irect)
            both.copy(pb, pb.irect)
            both.save(out / f"{src.stem[:40]}_p{n + 1}.png")
    return errs, f"{len(b)} pages, numbers and tokens equal on {len(b) - len(bad_pages)}"


def main():
    args = sys.argv[1:]
    render = "--render" in args
    names = [a for a in args if not a.startswith("--")]
    results, failed = {}, 0
    for p in files(names):
        dst = OUT / p.relative_to(DATASET)
        if not dst.exists():
            print("MISSING", dst.relative_to(DATASET))
            failed += 1
            continue
        ext = p.suffix.lower()
        errs, note = (check_xml(p, dst) if ext == ".x83" else check_docx(p, dst) if ext == ".docx"
                      else check_pdf(p, dst, render) if ext == ".pdf" else check_gaeb90(p, dst))
        failed += bool(errs)
        results[p.relative_to(DATASET).as_posix()] = {"ok": not errs, "note": note, "errors": errs}
        print(("OK   " if not errs else "FAIL ") + f"{p.relative_to(DATASET)}: {note}")
        for e in errs:
            print("      ", str(e)[:600])
    (WORK / "verify.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(f"{len(results) - failed} ok, {failed} failed")


if __name__ == "__main__":
    main()
