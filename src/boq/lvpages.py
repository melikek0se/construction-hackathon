"""Pages for an LV that came without a PDF (GAEB, Excel): the LV drawn as a plain A4 print-out.

The PDF view shows findings on pages. A GAEB file has no pages, so the app draws its own: titles, item
number, short text, long text, quantity and unit, prices where the file has them, in LV order. The text is
the file's text, unchanged; the layout is ours and is not the client's print-out, which every page says.
Because the app lays the pages out itself it knows where each item's number line stands, and returns that
with the PDF: `positions[oz] = (page, y)`, page counted from 1, y in points from the top of the page.
"""
from decimal import Decimal

import pymupdf

from boq.model import BoQ, Item

WIDTH, HEIGHT = 595.0, 842.0  # A4
LEFT, RIGHT = 48.0, 547.0
TOP, BOTTOM = 78.0, 792.0
TEXT_X = 118.0  # item numbers stand left of this, everything else right of it
TEXT_W = 300.0
QTY_X, UP_X, TOTAL_X = 330.0, 470.0, RIGHT  # quantity starts here; prices end at these
SIZE = 9.0
LEADING = 11.0  # close enough that a paragraph is one text block, so a quote is found across its lines
CENTRE = 0.39 * SIZE  # a line's vertical centre lies this far above its baseline

_KIND = {"contingency": "Bedarfsposition", "alternative": "Wahlposition", "surcharge": "Zuschlagsposition"}
_GREY = (0.42, 0.44, 0.41)
_DATA = 400  # a "word" longer than this is embedded data (project E carries an image as 192,356 characters)


def _number(value: Decimal, places: int) -> str:
    """1234.5 -> "1.234,500": the way a German LV prints quantities and prices."""
    whole, _, frac = f"{value:,.{places}f}".partition(".")
    return whole.replace(",", ".") + ("," + frac if frac else "")


class _Sheet:
    """The growing document: a cursor that moves down the page and starts a new page when it is full."""

    def __init__(self, boq: BoQ):
        self.doc = pymupdf.open()
        self.regular, self.bold = pymupdf.Font("helv"), pymupdf.Font("hebo")
        self.boq = boq
        self._advance: dict[tuple[int, str], float] = {}  # glyph widths: asking the font each time is slow
        self.page_no = 0
        self.writer = self.grey = None
        self.y = TOP
        self._new_page()

    def _flush(self):
        if self.writer is not None:
            page = self.doc[-1]
            self.writer.write_text(page)
            self.grey.write_text(page, color=_GREY)
            page.draw_line((LEFT, TOP - 12), (RIGHT, TOP - 12), color=_GREY, width=0.5)

    def _new_page(self):
        self._flush()
        page = self.doc.new_page(width=WIDTH, height=HEIGHT)
        self.page_no += 1
        self.writer, self.grey = pymupdf.TextWriter(page.rect), pymupdf.TextWriter(page.rect)
        name = self.boq.name or self.boq.file
        while self._width(name, self.bold) > RIGHT - LEFT - 60:  # room for the page number
            name = name[:-2].rstrip() + "…"
        self.grey.append((LEFT, 36), name, font=self.bold, fontsize=SIZE)
        note = f"Drawn by LV Check from {self.boq.file} · not the client's print-out"
        self.grey.append((LEFT, 47), note, font=self.regular, fontsize=7.5)
        self._right(self.grey, RIGHT, 36, f"Seite {self.page_no}", self.regular)
        y = TOP - 17
        for x, label in ((LEFT, "OZ"), (TEXT_X, "Leistungsbeschreibung"), (QTY_X, "Menge  Einheit")):
            self.grey.append((x, y), label, font=self.bold, fontsize=7.5)
        if any(i.total is not None or i.up is not None for i in self.boq.items):
            self._right(self.grey, UP_X, y, "EP", self.bold, 7.5)
            self._right(self.grey, TOTAL_X, y, "GP", self.bold, 7.5)
        self.y = TOP

    def _width(self, text: str, font, size: float = SIZE) -> float:
        key, total = id(font), 0.0
        for ch in text:
            if (key, ch) not in self._advance:
                self._advance[key, ch] = font.glyph_advance(ord(ch))
            total += self._advance[key, ch]
        return total * size

    def _right(self, writer, x: float, y: float, text: str, font, size: float = SIZE):
        writer.append((x - self._width(text, font, size), y), text, font=font, fontsize=size)

    def room(self, lines: float):
        """Start a new page unless this many lines still fit."""
        if self.y + lines * LEADING > BOTTOM:
            self._new_page()

    def gap(self, lines: float = 1.0):
        if self.y > TOP:  # no blank space at the top of a page
            self.y += lines * LEADING

    def _wrap(self, text: str, font, width: float) -> list[str]:
        out, space = [], self._width(" ", font)
        for paragraph in text.split("\n"):
            line, used = "", 0.0
            words = []
            for word in paragraph.split():
                if len(word) > _DATA:  # an embedded image, not LV text
                    words += f"[… {len(word)} characters of embedded data, not printed]".split()
                    continue
                while self._width(word, font) > width:  # a word wider than the column is cut, not lost
                    fit = next(n for n in range(len(word), 0, -1) if self._width(word[:n], font) <= width or n == 1)
                    words.append(word[:fit])
                    word = word[fit:]
                words.append(word)
            for word in words:
                w = self._width(word, font)
                if line and used + space + w > width:
                    out.append(line)
                    line, used = word, w
                else:
                    line, used = (f"{line} {word}", used + space + w) if line else (word, w)
            out.append(line)  # an empty paragraph is a blank line, as in the LV
        return out

    def text(self, text: str, bold: bool = False, x: float = TEXT_X, grey: bool = False):
        font = self.bold if bold else self.regular
        for line in self._wrap(text, font, TEXT_W - (x - TEXT_X)):
            self.room(1)
            if line:
                (self.grey if grey else self.writer).append((x, self.y), line, font=font, fontsize=SIZE)
            self.y += LEADING

    def item(self, item: Item) -> tuple[int, float]:
        self.gap(1.5)
        self.room(4)  # a number line is never left alone at the foot of a page
        self.writer.append((LEFT, self.y), item.oz, font=self.bold, fontsize=SIZE)
        place = (self.page_no, round(self.y - CENTRE, 1))
        short, long = item.short_text.strip(), item.long_text.strip()
        if short:
            self.text(short, bold=True)
        else:
            self.y += LEADING
        if item.kind in _KIND:
            self.text(_KIND[item.kind], grey=True)
        if long and long != short:
            self.text(long)
        if item.qty is not None or item.up is not None or item.total is not None:
            self.gap(0.5)
            self.room(1)
            if item.qty is not None:
                unit = item.unit_raw or item.unit
                self.writer.append((QTY_X, self.y), f"{_number(item.qty, 3)} {unit}".strip(),
                                   font=self.regular, fontsize=SIZE)
            if item.up is not None:
                self._right(self.writer, UP_X, self.y, _number(item.up, 2), self.regular)
            if item.total is not None:
                self._right(self.writer, TOTAL_X, self.y, _number(item.total, 2), self.regular)
            self.y += LEADING
        return place

    def finish(self) -> bytes:
        self._flush()
        self.writer = None
        data = self.doc.tobytes(deflate=True, garbage=3)
        self.doc.close()
        return data


def render(boq: BoQ) -> tuple[bytes, dict[str, tuple[int, float]]]:
    """The LV as a PDF, and where each item's number line stands in it."""
    sheet = _Sheet(boq)
    positions: dict[str, tuple[int, float]] = {}
    by_section: dict[tuple[str, ...], list[str]] = {}
    for remark in boq.remarks:
        by_section.setdefault(tuple(remark.path), []).append(remark.text)

    def remarks(path: tuple[str, ...]):
        for text in by_section.pop(path, []):
            sheet.gap()
            sheet.text(text)

    remarks(())
    section: tuple[str, ...] = ()
    for item in boq.items:
        path = tuple(item.path)
        if path != section:
            shared = next((n for n, (a, b) in enumerate(zip(path, section)) if a != b), min(len(path), len(section)))
            for depth in range(shared, len(path)):
                sheet.gap(1.5)
                sheet.room(5)
                sheet.text(path[depth], bold=True)
                remarks(path[:depth + 1])
            section = path
        place = sheet.item(item)
        positions.setdefault(item.oz, place)  # a repeated number keeps its first place
    for texts in by_section.values():  # remarks of a section no item belongs to: at the end, not lost
        for text in texts:
            sheet.gap()
            sheet.text(text)
    return sheet.finish(), positions
