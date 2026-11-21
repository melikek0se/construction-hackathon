"""Helpers shared by the GAEB parsers."""
import re

from boq.model import Item
from boq.units import HOURLY, LUMP_SUM

# "Wie Position 3.2.4, jedoch ..." / "wie Pos. 01.02.0030". GAEB 90 pads the parts: "3. 2.   4."
_REF = re.compile(r"wie\s+(?:vor\s+)?pos(?:ition|\.)?\s*(?:nr\.?\s*)?((?:\d+\s*\.\s*)+\d+)", re.I)


def norm_oz(parts) -> str:
    """Join OZ segments into the dotted form without leading zeros or blanks."""
    out = []
    for p in parts:
        p = p.strip()
        if p:
            out.append(p.lstrip("0") or "0")
    return ".".join(out)


def find_refs(text: str) -> list[str]:
    refs = []
    for m in _REF.finditer(text):
        oz = norm_oz(re.split(r"\s*\.\s*", m.group(1)))
        if oz not in refs:
            refs.append(oz)
    return refs


def classify(item: Item, *, alternative=False, contingency=False, lump_sum=False) -> str:
    if alternative:
        return "alternative"
    if contingency:
        return "contingency"
    if lump_sum or item.unit == LUMP_SUM:
        return "lump_sum"
    if item.unit == HOURLY:
        return "hourly"
    if re.match(r"\s*(zulage|mehrpreis|mehrkosten)\b", item.label, re.I):
        return "surcharge"
    return "normal"


def tidy(text: str) -> str:
    """Collapse runs of blanks, keep paragraph breaks as single newlines."""
    lines = [re.sub(r"[ \t\xa0]+", " ", l).strip() for l in text.split("\n")]
    out = []
    for l in lines:
        if l or (out and out[-1]):
            out.append(l)
    return "\n".join(out).strip()


# An e-mail address, or the token the dataset's anonymisation left in its place.
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\[EMAIL_\d+\]")


def email_in(text: str) -> str:
    m = EMAIL.search(text or "")
    return m.group(0).rstrip(".") if m else ""
