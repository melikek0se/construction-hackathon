"""GAEB 90 (.D83 / .D84 / .D86): fixed-width records, type in columns 1-2.

Record layout as observed in the dataset, see docs/02-dataset.md.
"""
import os
import re
from decimal import Decimal

from boq.model import BoQ, Item, Remark, SourceRef
from boq.parsers.common import classify, find_refs, norm_oz, tidy
from boq.units import normalise_unit

_CENT = Decimal("0.011")


def decode(raw: bytes) -> str:
    """Encoding differs per exporting program: DOS cp850 or latin-1. Decide by umlaut bytes."""
    dos = sum(raw.count(b) for b in (b"\x84", b"\x94", b"\x81", b"\xe1"))
    iso = sum(raw.count(b) for b in (b"\xe4", b"\xf6", b"\xfc", b"\xdf"))
    return raw.decode("cp850" if dos >= iso else "latin-1", "replace")


def _oz_widths(header: str) -> list[int]:
    """Segment widths from the OZ mask in record 00, e.g. "1122PPPPI" -> [2, 2, 4, 1]."""
    m = re.search(r"1+[2-9]*P+I*", header)
    mask = m.group(0) if m else "1122PPPPI"
    return [len(run.group(0)) for run in re.finditer(r"(.)\1*", mask)]


def _split_oz(raw: str, widths: list[int]) -> str:
    parts, pos = [], 0
    for w in widths:
        parts.append(raw[pos:pos + w])
        pos += w
    return norm_oz(parts)


def _unit_price(ep_raw: str, gp: Decimal, qty: Decimal | None) -> Decimal:
    """EP has 2 or 3 implied decimals depending on the exporter; pick the one where EP*Qty = GP."""
    candidates = [Decimal(ep_raw) / 100, Decimal(ep_raw) / 1000]
    if len(ep_raw) == 11:
        candidates.reverse()
    if qty:
        for ep in candidates:
            if abs(ep * qty - gp) < _CENT:
                return ep
    return candidates[0]


def parse_gaeb90(path: str) -> BoQ:
    lines = decode(open(path, "rb").read()).splitlines()
    boq = BoQ(file=os.path.basename(path), format="gaeb_90")
    widths = [2, 2, 4, 1]
    titles: dict[str, str] = {}  # raw OZ prefix -> label
    open_titles: list[str] = []
    by_oz: dict[str, Item] = {}
    cur: Item | None = None
    texts: dict[str, tuple[list[str], list[str]]] = {}  # oz -> (short lines, long lines)
    remark: list[str] | None = None  # collecting a text block that is not an item
    pending_title: str | None = None

    def path_now():
        return [titles[t] for t in open_titles if titles.get(t)]

    def close_remark():
        nonlocal remark
        if remark:
            text = tidy("\n".join(remark))
            if text:
                boq.remarks.append(Remark(path=path_now(), text=text))
        remark = None

    def get_item(oz_raw: str, line_no: int) -> Item:
        oz = _split_oz(oz_raw, widths)
        if oz not in by_oz:
            by_oz[oz] = Item(oz=oz, path=path_now(), source=SourceRef(file=boq.file, line=line_no))
            boq.items.append(by_oz[oz])
            texts[oz] = ([], [])
        return by_oz[oz]

    flags: dict[str, str] = {}
    for no, l in enumerate(lines, 1):
        kind = l[:2]
        if kind == "00":
            boq.phase = l[10:12]
            widths = _oz_widths(l[50:74])
        elif kind == "01":
            boq.name = l[2:42].strip()
        elif kind in ("T0", "T1", "20", "41", "42"):  # text block before or between items
            if kind != "T1":
                close_remark()
                remark, cur = [], None
            elif remark is None:
                remark = []
            if kind == "T1":
                remark.append(l[2:72].rstrip())
        elif kind == "T9":
            close_remark()
        elif kind == "11":
            close_remark()
            cur = None
            pending_title = l[2:11].strip()
            open_titles.append(pending_title)
        elif kind == "12" and pending_title is not None:
            titles[pending_title] = (titles.get(pending_title, "") + l[2:72].rstrip()).strip()
        elif kind == "31":
            close_remark()
            cur = None
            if open_titles:
                open_titles.pop()
        elif kind == "21":
            close_remark()
            pending_title = None
            cur = get_item(l[2:11], no)
            cur.qty = Decimal(int(l[23:34])) / 1000
            cur.unit_raw = l[34:38].strip()
            cur.unit = normalise_unit(cur.unit_raw)
            flags[cur.oz] = l[11:23]
        elif kind == "23":
            m = re.match(r"\s*(\d+)\s+(\d+)(?:\s+(\d+))?", l[11:72])
            if m:
                it = get_item(l[2:11], no)
                it.total = Decimal(m.group(2)) / 100
                if it.qty is None and m.group(3):
                    it.qty = Decimal(m.group(3)) / 1000
                it.up = _unit_price(m.group(1), it.total, it.qty)
        elif kind in ("25", "26"):
            text = l[2:72].rstrip() if kind == "25" else l[5:72].rstrip()
            if remark is not None:
                remark.append(text)
            elif cur is not None:
                texts[cur.oz][0 if kind == "25" else 1].append(text)
    close_remark()

    for it in boq.items:
        short, long = texts[it.oz]
        it.short_text = " ".join(s.strip() for s in short if s.strip())
        it.long_text = tidy("\n".join(long))
        it.refs = find_refs(it.text)
        f = flags.get(it.oz, "")
        it.kind = classify(it, alternative="W" in f[3:], contingency="B" in f[3:], lump_sum="L" in f[:3])
    return boq
