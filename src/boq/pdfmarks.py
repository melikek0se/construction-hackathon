"""Where each finding stands on the pages of the PDF it was read from.

The quoted evidence is searched only inside the stretch of the item the finding belongs to (from its number
line to the next item's number line), then in the preliminary remarks before the first item. A quote that is
not found there is not searched elsewhere: the item's number line is marked instead, because a highlight on
the wrong text is worse than none. Coordinates are PDF points from the top left of the page; pages count from 1.
"""
import re
from pathlib import Path

import pymupdf

from boq.model import BoQ, Finding

Clip = tuple[int, pymupdf.Rect]  # page number, area of that page

_ABOVE = 8  # an item's stretch starts this far above the centre of its number line
_ELLIPSIS = re.compile(r"…|\.{3,}")
_MIN_PART = 12  # shortest piece of a quote worth searching for, in characters …
_MIN_WORDS = 4  # … and in words
_MAX_WORDS = 24  # longer evidence is searched by its first words (the number of runs grows with the square)
_QUOTES = "\"'„“”‚‘’»«"


def _stretch(doc, start: tuple[int, float], end: tuple[int, float] | None) -> list[Clip]:
    """The page areas from one number line to the next (or to the end of the document)."""
    page, y = start
    last, stop = end if end else (doc.page_count, None)
    clips = []
    for n in range(page, last + 1):
        rect = doc[n - 1].rect
        top = y - _ABOVE if n == page else 0
        bottom = stop - _ABOVE if n == last and stop is not None else rect.height
        if bottom > top:
            clips.append((n, pymupdf.Rect(0, top, rect.width, bottom)))
    return clips


def _textpage(doc, n: int):
    """The page and its text, extracted once: a quote that is not found is tried as many shorter runs.
    The text page is only valid while its page object lives, so both are kept."""
    cache = doc.__dict__.setdefault("_boq_textpages", {})
    if n not in cache:
        page = doc[n - 1]
        cache[n] = (page, page.get_textpage(flags=pymupdf.TEXTFLAGS_SEARCH))  # joins line-end hyphens
    return cache[n]


def _find(doc, text: str, clips: list[Clip]) -> tuple[int, list[pymupdf.Rect]] | None:
    for n, clip in clips:
        page, textpage = _textpage(doc, n)
        # with a ready text page PyMuPDF ignores `clip`, so hits outside the stretch are dropped here
        rects = [r for r in page.search_for(text, textpage=textpage)
                 if clip.contains(pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))]
        if rects:
            return n, rects
    return None


def _runs(quote: str):
    """Shorter and shorter runs of the quote's words, longest first. Evidence is not always the page's
    text letter for letter: a rule's excerpt is cut mid-word at both ends, keeps a line-end hyphen as
    "unmittel- barem", or wraps the quoted text in words of its own (short text „…“ vs long text DN 500)."""
    words = [w for w in (w.strip(_QUOTES) for w in _ELLIPSIS.sub(" ", quote).split()) if w][:_MAX_WORDS]
    joined = []  # "Stahlum-" + "mantelung" is one word on the page once the hyphen is resolved
    for w in words:
        if joined and len(joined[-1]) > 1 and joined[-1].endswith("-") and w[:1].islower():
            joined[-1] = joined[-1][:-1] + w
        else:
            joined.append(w)
    for size in range(max(len(words), len(joined)), _MIN_WORDS - 1, -1):
        for variant in dict.fromkeys((tuple(joined), tuple(words))):
            for start in range(len(variant) - size + 1):
                text = " ".join(variant[start:start + size])
                if len(text) >= _MIN_PART:
                    yield text


def _search(doc, quote: str, clips: list[Clip]) -> tuple[int, list[pymupdf.Rect]] | None:
    """First page of the stretch that holds the quote, or failing that its longest run of words.
    PyMuPDF matches across line ends and joins words hyphenated there."""
    if not clips or len(quote) < 3:
        return None
    hit = _find(doc, quote, clips)
    if hit:
        return hit
    for text in _runs(quote):
        if text != quote and (hit := _find(doc, text, clips)):
            return hit
    return None


def _number_line(page, y: float) -> pymupdf.Rect:
    words = [pymupdf.Rect(w[:4]) for w in page.get_text("words") if abs((w[1] + w[3]) / 2 - y) <= 3]
    if not words:
        return pymupdf.Rect(36, y - 6, page.rect.width - 36, y + 6)
    box = words[0]
    for w in words[1:]:
        box |= w
    return box


def _rects(page, rects: list[pymupdf.Rect]) -> list[list[float]]:
    out = []
    for r in rects:
        r = r & page.rect
        if not r.is_empty:
            out.append([round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)])
    return out


def locate(pdf_path: str | Path, boq: BoQ, findings: list[Finding],
           positions: dict[str, tuple[int, float]] | None = None) -> dict:
    """{"pages": [{"width", "height"}, …], "marks": [{"finding", "key", "oz", "page", "rects", "located"}, …],
    "items": {oz: [page, y]}}:
    one mark per finding, in the order given; `located` is "quote", "item" or "none". `key` names the
    finding (check, item, evidence) for a caller whose list is in another order. `positions` says where
    each item's number line stands; without it the positions the PDF parser noted are used."""
    doc = pymupdf.open(str(pdf_path))
    try:
        if positions is None:  # a PDF the parser read: it noted where each item's number line stands
            positions = {}
            for i in boq.items:
                if i.source.page and i.source.y is not None:
                    positions.setdefault(i.oz, (i.source.page, i.source.y))
        return _locate(doc, findings, positions)
    finally:
        doc.__dict__.pop("_boq_textpages", None)  # the cached pages hold the document open
        doc.close()


def _locate(doc, findings: list[Finding], positions: dict[str, tuple[int, float]]) -> dict:
    placed = sorted((pos, oz) for oz, pos in positions.items() if pos[0] <= doc.page_count)
    starts = [pos for pos, _ in placed]
    stretch = {oz: _stretch(doc, pos, starts[n + 1] if n + 1 < len(starts) else None)
               for n, (pos, oz) in enumerate(placed)}
    position = {oz: pos for pos, oz in placed}
    if starts:
        first_page, first_y = starts[0]
        remarks = [(n, pymupdf.Rect(0, 0, doc[n - 1].rect.width,
                                    first_y - _ABOVE if n == first_page else doc[n - 1].rect.height))
                   for n in range(1, first_page + 1)]
        remarks = [(n, r) for n, r in remarks if r.height > 0]
    else:
        remarks = [(n, doc[n - 1].rect) for n in range(1, doc.page_count + 1)]

    marks = []
    for index, f in enumerate(findings):
        quote = " ".join(f.evidence.split()).strip(_QUOTES)
        mark = {"finding": index, "key": f"{f.check_id}|{f.item_oz or ''}|{f.evidence}", "oz": f.item_oz,
                "page": None, "rects": [], "located": "none"}
        hit = None
        if quote:
            # an item's finding is looked for in that item only; the remarks are for findings without a
            # place of their own (no item, or an item the PDF parser gave no position)
            hit = _search(doc, quote, stretch[f.item_oz] if f.item_oz in stretch else remarks)
        if hit:
            n, rects = hit
            mark.update(page=n, rects=_rects(doc[n - 1], rects), located="quote")
        if not mark["rects"] and f.item_oz in position:
            n, y = position[f.item_oz]
            mark.update(page=n, rects=_rects(doc[n - 1], [_number_line(doc[n - 1], y)]), located="item")
        if not mark["rects"]:
            mark.update(page=None, located="none")
        marks.append(mark)
    return {"pages": [{"width": round(p.rect.width, 1), "height": round(p.rect.height, 1)} for p in doc],
            "marks": marks,
            "items": {oz: [page, y] for oz, (page, y) in position.items()}}
