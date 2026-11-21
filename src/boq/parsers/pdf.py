"""LV printouts as PDF (text layer, no OCR).

AVA programs print the same structure in different layouts:

    OZ   short text                      <- OZ in the left column, often bold
         long text line                  <- text column
         ...
              12,000 St  ......  ......  <- quantity, unit, price fields (dots or numbers)

One layout (contractor offers) puts quantity and prices on the OZ line and the text below it.
The parser works on positioned lines, not on a fixed template: it finds the OZ column, strips page
furniture, and treats every OZ entry that owns a quantity as an item and every other one as a title.
Accuracy is measured against the GAEB version of the same LV: scripts/eval_pdf_parser.py.
"""
import collections
import os
import re
from dataclasses import dataclass, field
from decimal import Decimal

import pymupdf

from boq.model import BoQ, Item, Remark, SourceRef
from boq.parsers.common import classify, email_in, find_refs, norm_oz, tidy
from boq.units import normalise_unit

_NUM = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?"
_OZ = re.compile(r"^(?:\d{1,3})?(?:\.\d{1,4}){1,4}\.?$")  # 02.0001, 5.3.1, 1.1.10., and ".2"
_TITLE_OZ = re.compile(r"^\d{1,3}\.?$")  # 02, 1.
_TITLE_WORD = re.compile(r"^(LV|Los|Titel|Bereich|Abschnitt|Gewerk|Untertitel)$")
_NUMBER = re.compile(rf"^(?:{_NUM})$")
_UNIT = re.compile(r"^(?:[^\W\d][^\s.…]{0,5}\.?|%)$")
_DOTS = "…"  # an empty price field, printed as a row of dots
_FILLER = {_DOTS, "EP", "GP", "Nur", "nur", "Einh.-Pr.", "Einh.-Preis"}
_COLUMN_HEAD = re.compile(r"Menge")
_COLUMN_HEAD_WORDS = re.compile(r"Leistungsbeschreibung|Pos|Einh|Ordnungszahl|\bOZ\b|\bME\b")
_NOISE = re.compile(r"^(Übertrag|-\s*Fortsetzung auf nächster Seite|Summe\b|(Nr\.\)\s*)?(in\s+)?EUR(\s+(in\s+)?EUR)*$)")
_ALTERNATIVE = re.compile(r"\b(Wahl|Alternativ)position\b", re.I)
_CONTINGENCY = re.compile(r"\b(Bedarfs|Eventual)position\b|\bnur\s+Einh(eits)?\.?-?\s?preis", re.I)
_BEZUG = re.compile(r"Bezugs-OZ\s+((?:\d+\.)*\d+)")


@dataclass
class Qty:
    qty: Decimal
    unit: str
    prices: list[Decimal]
    marked: bool  # dots or prices follow the unit, so this is certainly the quantity line
    unit_price_only: bool  # "Nur Einh.-Pr.": no total, i.e. a contingency or alternative item


def _tokens(text: str) -> list[str]:
    return re.sub(r"\.{3,}", f" {_DOTS} ", text).split()


def _qty(text: str) -> Qty | None:
    """Parse "12,000 St ...... ......" / "1,000 psch 72.000,00 72.000,00" / "25 St EP.... GP...."."""
    tokens = _tokens(text)
    if len(tokens) < 2 or not _NUMBER.match(tokens[0]) or not _UNIT.match(tokens[1]) or tokens[1] in _FILLER:
        return None
    rest = tokens[2:]
    if not all(t in _FILLER or _NUMBER.match(t) for t in rest):
        return None
    return Qty(_decimal(tokens[0]), tokens[1], [_decimal(t) for t in rest if _NUMBER.match(t)],
               marked=bool(rest), unit_price_only="Nur" in rest or "nur" in rest)


def _fields_only(text: str) -> bool:
    tokens = _tokens(text)
    return _DOTS in tokens and all(t in _FILLER or _NUMBER.match(t) for t in tokens)


@dataclass
class Line:
    page: int
    y: float
    spans: list[tuple[float, str, bool]]  # x, text, bold

    @property
    def x(self) -> float:
        return self.spans[0][0]

    @property
    def text(self) -> str:
        return " ".join(t for _, t, _ in self.spans)

    @property
    def bold(self) -> bool:
        return all(b for _, _, b in self.spans)


@dataclass
class Entry:
    """An OZ line and everything up to the next OZ line."""
    oz: str
    label: str
    label_bold: bool
    page: int
    inline: Qty | None = None  # quantity on the OZ line itself
    y: float = 0.0  # centre of the OZ line on its page
    lines: list[Line] = field(default_factory=list)


def _lines(page, number: int) -> tuple[list[Line], float]:
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = " ".join(span["text"].split())
                if text:
                    x0, y0, _, y1 = span["bbox"]
                    bold = bool(span["flags"] & 16) or "bold" in span["font"].lower()
                    spans.append(((y0 + y1) / 2, x0, text, bold))
    rows: list[list] = []
    for span in sorted(spans):  # spans whose centres are within 3 pt form one visual line
        if rows and span[0] - rows[-1][0][0] <= 3:
            rows[-1].append(span)
        else:
            rows.append([span])
    out = [Line(number, row[0][0], [(x, t, b) for _, x, t, b in sorted(row, key=lambda s: s[1])])
           for row in rows]
    return out, page.rect.height


def _decimal(text: str) -> Decimal:
    return Decimal(text.replace(".", "").replace(",", "."))


def _furniture(pages: list[tuple[list[Line], float]]) -> set[str]:
    """Header and footer lines: same text (digits aside) at the page edge on many pages."""
    seen = collections.Counter()
    for lines, height in pages:
        keys = {re.sub(r"\d+", "#", l.text) for l in lines if (l.y < height * 0.2 or l.y > height * 0.88)
                and len(re.findall(r"[^\W\d]", l.text)) >= 4 and not _OZ.match(l.text.split()[0])}
        seen.update(keys)
    limit = max(3, len(pages) * 0.4)
    return {k for k, n in seen.items() if n >= limit}


def _body(pages: list[tuple[list[Line], float]]) -> tuple[list[Line], dict[str, str]]:
    """Lines below the column header of each page, plus titles named in the page headers."""
    furniture = _furniture(pages)
    heads = []
    for lines, _ in pages:
        heads.append(next((i for i, l in enumerate(lines[:25]) if _COLUMN_HEAD.search(l.text)
                           and _COLUMN_HEAD_WORDS.search(l.text)), None))
    has_heads = any(h is not None for h in heads)
    body, titles = [], {}
    for (lines, _), head in zip(pages, heads):
        if head is None:
            if has_heads:
                continue  # cover sheet or contract form inside a tender package
            head = -1
        for l in lines[:head + 1]:  # "03.02 Bereich Pumpen" above the column header
            words = l.text.split()
            if len(words) >= 3 and re.match(r"^\d[\d.]*$", words[0]) and _TITLE_WORD.match(words[1]):
                titles[norm_oz(words[0].split("."))] = " ".join(words[2:])
        for l in lines[head + 1:]:
            text = l.text
            if re.sub(r"\d+", "#", text) in furniture or _NOISE.match(text) or _fields_only(text):
                continue
            body.append(l)
    return body, titles


_FIELD = re.compile(r"^(Projekt|Bauvorhaben|Baumaßnahme|LV|Bauherr|Auftraggeber|Projekt-Nr\.?|DV-Nr\. AG|"
                    r"Vergabenummer|Vergabe-Nr\.?)\s*:\s*(.*)$")
_FIELD_KEY = {"Projekt": "project", "Bauvorhaben": "project", "Baumaßnahme": "project", "LV": "lv",
              "Bauherr": "client", "Auftraggeber": "client"}  # every other label is a number
_OTHER_FIELD = re.compile(r"^[^\s:]+(\s[^\s:]+)?:|^(Seite|Datum)\b")  # "Währung: EUR", "Seite 4"
_NUMBER_TOKEN = re.compile(r"^[\w./-]*\d[\w./-]*$")
# The word a document is headed with, alone on its line or followed by its number ("Angebot AN24-0305",
# "Auftrag Nr. 4711"). Which step each word means is decided in boq.intake.
_HEADING = re.compile(
    r"^(Anfrage|Preisanfrage|Angebotsaufforderung|Angebotsanfrage|Ausschreibung|Ausschreibungs-LV|"
    r"Angebot|Angebots-LV|Nachtragsangebot|Preisangebot|"
    r"Auftrag|Auftrags-LV|Auftragsbestätigung|Auftragsleistungsverzeichnis|Auftragserteilung|Auftragsschreiben|"
    r"Bestellung|Zuschlag|Zuschlagsschreiben)"
    r"(?:\s+(?:Nr\.?|No\.?|Nummer)?\s*:?\s*[\w./-]*\d[\w./-]*)?$")
_CALL_FOR_BIDS = "Aufforderung zur Abgabe eines Angebots"  # VHB form 211, the cover of a public tender
_PRINTED_FOR = re.compile(r"^(.*?)\s*\(([\w./-]*\d[\w./-]*)\)$")  # "<project> (8209.003)"


def _heads(pages: list[tuple[list[Line], float]]) -> list[int | None]:
    return [next((i for i, l in enumerate(lines[:25]) if _COLUMN_HEAD.search(l.text)
                  and _COLUMN_HEAD_WORDS.search(l.text)), None) for lines, _ in pages]


def _about(boq: BoQ, pages: list[tuple[list[Line], float]]) -> None:
    """What the print-out says about itself above the column header: project, number, LV, client and
    the word it is headed with. Read from the first LV pages; the value most pages agree on wins."""
    heads = _heads(pages)
    found: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    lv_pages = [(lines, head) for (lines, _), head in zip(pages, heads) if head is not None][:3]
    for lines, head in lv_pages:
        for l in lines[:head]:
            texts = [t for _, t, _ in l.spans]
            if m := _HEADING.match(l.text):
                found["heading"][m.group(1)] += 1
            if texts[0] == "Leistungsverzeichnis" and len(texts) == 2 and (m := _PRINTED_FOR.match(texts[1])):
                found["project"][m.group(1)] += 1
                found["number"][m.group(2)] += 1
            for i, t in enumerate(texts):
                m = _FIELD.match(t)
                if not m:
                    continue
                parts = [m.group(2)] if m.group(2) else []
                for nxt in texts[i + 1:]:
                    if _OTHER_FIELD.match(nxt):
                        break
                    parts.append(nxt)
                key = _FIELD_KEY.get(m.group(1), "number")
                if key in ("project", "lv") and len(parts) > 1 and _NUMBER_TOKEN.match(parts[0]):
                    if key == "project":
                        found["number"][parts[0]] += 2  # the number printed with the project, before any other
                    parts = parts[1:]
                if parts:
                    found[key][" ".join(parts)] += 1

    def best(key: str) -> str:
        return max(found[key].items(), key=lambda kv: (kv[1], len(kv[0])))[0] if found[key] else ""

    boq.project, boq.project_no, boq.lv_label, boq.client = best("project"), best("number"), best("lv"), best("client")
    boq.heading = best("heading")
    if not boq.heading:
        # not above the LV's column header: then on the cover, the letter before the LV begins
        cover = [m.group(1) for lines, _ in pages[:2] for l in lines[:15] if (m := _HEADING.match(l.text))]
        boq.heading = cover[0] if cover else ""
    forms = [lines for (lines, _), head in zip(pages, heads) if head is None and any("VHB" in l.text for l in lines)]
    boq.forms = len(forms)
    if not boq.heading and any(_CALL_FOR_BIDS in l.text for lines in forms[:10] for l in lines):
        boq.heading = _CALL_FOR_BIDS
    if boq.heading not in _OWN_PAPER:
        boq.client_email = _sender_email(pages, heads)


# Headed with one of these, the print-out is the contractor's own paper: its letterhead is not the client's.
_OWN_PAPER = {"Angebot", "Angebots-LV", "Nachtragsangebot", "Preisangebot", "Auftragsbestätigung"}


def _sender_email(pages: list[tuple[list[Line], float]], heads: list[int | None]) -> str:
    """The e-mail address of the party the print-out is from: the one in the letterhead of most pages,
    else the first on a page that is not LV (cover letter, contract form). An address inside the LV's own
    text is a manufacturer's and is left alone."""
    on: dict[str, list[int]] = {}
    for n, (lines, _) in enumerate(pages):
        for address in dict.fromkeys(a for l in lines if (a := email_in(l.text))):
            on.setdefault(address, []).append(n)
    if not on:
        return ""
    address, where = max(on.items(), key=lambda kv: len(kv[1]))
    if len(where) * 2 >= len(pages):
        return address
    first = sorted((where[0], address) for address, where in on.items())
    return next((address for n, address in first if heads[n] is None), "")


def _oz_column(body: list[Line]) -> float | None:
    """x of the item-number column: the leftmost position where item numbers start lines."""
    xs = collections.Counter(round(l.x / 4) for l in body if _OZ.match(l.spans[0][1].split()[0]))
    if not xs:
        return None
    floor = max(2, xs.most_common(1)[0][1] * 0.25)  # numbers inside running text are rare and further right
    frequent = [x for x, n in xs.items() if n >= floor]
    return (min(frequent) if frequent else xs.most_common(1)[0][0]) * 4


def _entries(body: list[Line], oz_x: float) -> tuple[list[Entry], list[Line]]:
    entries, preface, cur = [], [], None
    for l in body:
        words = l.text.split()
        if abs(l.x - oz_x) <= 8:
            while len(words) > 1 and _TITLE_WORD.match(words[0]):  # "Abschnitt 1.1. Baustelleneinrichtung"
                words = words[1:]
            first, rest = words[0], " ".join(words[1:])
            if _OZ.match(first) or (_TITLE_OZ.match(first) and rest and not _qty(l.text)):
                label_spans = [s for s in l.spans if s[0] > l.x + 1]
                cur = Entry(oz=norm_oz(first.split(".")), label=rest, page=l.page,
                            label_bold=bool(label_spans) and all(b for _, _, b in label_spans),
                            inline=_qty(rest) if _OZ.match(first) else None, y=l.y)
                if cur.inline:
                    cur.label = ""
                entries.append(cur)
                continue
        (cur.lines if cur else preface).append(l)
    return entries, preface


def _text(lines: list[Line]) -> str:
    return tidy("\n".join(l.text for l in lines))


def _item(e: Entry, qty: Qty, text_lines: list[Line], path: list[str], file: str) -> Item:
    # "*** Bedarfsposition ohne GB", "*** Wahlposition 1.1 zu 1.0": position type notes, not text
    lines = [Line(e.page, 0, [(0, e.label, e.label_bold)])] + list(text_lines) if e.label else list(text_lines)
    markers = " ".join(l.text for l in lines if l.text.startswith("***"))
    lines = [l for l in lines if not l.text.startswith("***")]
    label = e.label if e.label and not e.label.startswith("***") else ""
    if label:
        lines = lines[1:]
    e = Entry(e.oz, label, e.label_bold and bool(label), e.page, y=e.y)
    short = [e.label] if e.label else []
    rest = lines
    if e.label_bold or not e.label:  # a bold short text may wrap onto the next lines
        while rest and rest[0].bold:
            short.append(rest.pop(0).text)
    if not short and rest:  # no label on the OZ line and nothing bold: the first line is the short text
        short.append(rest[0].text)
    elif e.label and not e.label_bold:
        # Not set apart typographically: the label may be a real short text or just the first line of
        # the description. Keep it in the long text too, so no check sees a text that lacks its start.
        rest.insert(0, Line(e.page, 0, [(0, e.label, False)]))
    item = Item(
        oz=e.oz, path=path,
        short_text=" ".join(short).strip(),
        long_text=_text(rest),
        qty=qty.qty,
        unit_raw=qty.unit, unit=normalise_unit(qty.unit),
        up=qty.prices[0] if len(qty.prices) == 2 or (qty.prices and qty.unit_price_only) else None,
        total=qty.prices[-1] if qty.prices and not qty.unit_price_only else None,
        source=SourceRef(file=file, page=e.page, y=round(e.y, 1)),
    )
    item.refs = find_refs(item.text)
    for m in _BEZUG.finditer(markers):
        ref = norm_oz(m.group(1).split("."))
        if ref not in item.refs:
            item.refs.append(ref)
    item.kind = classify(item, alternative=bool(_ALTERNATIVE.search(markers)),
                         contingency=bool(_CONTINGENCY.search(markers)) or qty.unit_price_only)
    return item


def parse_pdf(path: str) -> BoQ:
    doc = pymupdf.open(path)
    pages = [_lines(page, n) for n, page in enumerate(doc, 1)]
    boq = BoQ(file=os.path.basename(path), format="pdf",
              name=(doc.metadata or {}).get("title") or os.path.splitext(os.path.basename(path))[0])
    body, titles = _body(pages)
    oz_x = _oz_column(body)
    if oz_x is None:
        return boq
    _about(boq, pages)
    entries, preface = _entries(body, oz_x)
    if preface and _text(preface):
        boq.remarks.append(Remark(text=_text(preface)))

    def path_of(oz: str) -> list[str]:
        parts = oz.split(".")
        return [titles[p] for i in range(1, len(parts)) if (p := ".".join(parts[:i])) in titles]

    seen = set()
    for e in entries:
        qty, text_lines, after = e.inline, e.lines, []
        if qty is None:  # quantity closes the item: take the last quantity line before the next OZ
            for i in range(len(e.lines) - 1, -1, -1):
                m = _qty(e.lines[i].text)
                if m and (normalise_unit(m.unit) or m.marked):
                    qty, text_lines, after = m, e.lines[:i], e.lines[i + 1:]
                    break
        if qty is None or e.oz in seen:
            if e.label and e.oz not in titles:
                titles[e.oz] = e.label
            after = e.lines
        else:
            seen.add(e.oz)
            boq.items.append(_item(e, qty, text_lines, path_of(e.oz), boq.file))
        if after and _text(after):
            boq.remarks.append(Remark(path=path_of(e.oz), text=_text(after)))

    boq.phase = "84" if any(i.total is not None for i in boq.items) else "83"
    return boq
