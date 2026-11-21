"""The dates of a tender, read from its files: when bids are due, until when questions can be asked,
how long the bid binds, when the work starts and has to be finished.

No file format has a field for them. They stand in the text: on the cover of an LV ("Einreichungstermin
und -ort / 21.07.2025 | 10:30 Uhr"), in the preliminary remarks, or filled into a contract form of the
package (VHB 211 "Ablauf der Angebotsfrist", VHB 214 "Mit der Ausführung ist zu beginnen am ..."). So every
file is read as text, every date in it is looked at, and a date is kept only when a label says what it is:
on the same line before it, after it ("bis Ende Juni 2026 abgeschlossen sein"), or, for a date that stands
alone, next to it. In a PDF "next to it" is geometric (left on the same row, else the nearest line above:
forms print the label and the filled-in value as separate pieces); elsewhere it is the lines before.

A date without a label is not a deadline (print dates, file dates, "DIN ... vom 05.12.1990") and is left
out. Every result carries the file, the place and the quoted label and line it was read from. No LLM.
Files that are not LVs (a cover letter as PDF or Word file) are read too: that is where dates often stand.
Scored against the dates found by hand in the dataset by `tests/test_dates.py`.
"""
import calendar
import io
import re
import zipfile
from datetime import date
from pathlib import Path

KINDS = ("sent_out", "questions_due", "due", "opening", "binding_until", "exec_start", "exec_end")
READABLE = {".pdf", ".x83", ".x84", ".x86", ".d83", ".d84", ".d86", ".docx", ".xlsx", ".txt"}

# What a label says the date next to it is. In this order: a line about questions often names the
# submission deadline too ("Fragen bis 6 Tage vor Ablauf der Angebotsfrist").
_LABELS = [(kind, re.compile(pattern, re.I)) for kind, pattern in (
    ("questions_due", r"Bieterfragen|Rückfragen|Fragefrist|Auskunftsersuchen|"
                      r"\bFragen\b[^.]{0,60}\b(bis|spätestens)|\bAuskünfte\b[^.]{0,60}\b(bis|spätestens)"),
    ("sent_out", r"Datum der Versendung|Versanddatum|Tag der Absendung"),
    ("binding_until", r"Bindefrist|Zuschlagsfrist|gebunden bis"),
    ("opening", r"\(?Er\)?öffnungstermin|\bÖffnungstermin|Angebotseröffnung|Öffnung der Angebote|Submission"),
    ("due", r"Angebotsfrist|Einreichungstermin|Einreichungsfrist|Abgabetermin|Abgabefrist|Angebotsabgabe|"
            r"Angebotsschluss|Schlusstermin|Abgabe des Angebot|Angebote?\b[^.]{0,60}\b(einzureichen|abzugeben)"),
    ("exec_start", r"Baubeginn|Ausführungsbeginn|Arbeitsbeginn|Beginn der (Ausführung|Arbeiten|Bauarbeiten)|"
                   r"Ausführung ist zu beginnen"),
    ("exec_end", r"Fertigstellung|Bauende|Ausführungsende|Vollendung|zu vollenden|fertig\s?zu\s?stellen|"
                 r"abgeschlossen sein|abzuschließen|fertiggestellt sein"),
)]
# after the date: "... bis spätestens Ende Juni 2026 abgeschlossen sein"
_AFTER = [(kind, re.compile(pattern, re.I)) for kind, pattern in (
    ("due", r"\b(einzureichen|abzugeben)\b"),
    ("exec_end", r"abgeschlossen|abzuschließen|fertig\s?zu\s?stellen|fertiggestellt|zu vollenden|beendet sein"),
)]
_ANY_LABEL = re.compile("|".join(p.pattern for _, p in _LABELS + _AFTER), re.I | re.S)
# between a label and a date these say the date belongs to something else: a standard, a law, an edition
_NOT_THIS = re.compile(r"\b(vom|DIN|Stand|Ausgabe|Fassung|Druckdatum|BGBl)\b", re.I)

_MONTHS = ("januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober",
           "november", "dezember")
_DAY = re.compile(r"(?<![\d.])(\d{1,2})\.\s?(\d{1,2})\.\s?((?:20)?\d{2})(?![\d.]|\s?(?:m|mm|cm|kg|St)\b)")
_MONTH = re.compile(rf"\b(?:(Anfang|Mitte|Ende)\s+)?({'|'.join(_MONTHS)})\s+(20\d{{2}})\b", re.I)
_TIME = re.compile(r"(?<![\d.:])([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:Uhr|h\b)|(?<![\d.:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])")
# what may stand on a line beside a date without making it a sentence: "bis 18.10.2023;", "am", "| 10:30 Uhr"
_FILLER = re.compile(r"\b(bis|am|um|ab|den|dem|zum|spätestens|Uhr|Datum|Uhrzeit|Mo|Di|Mi|Do|Fr|Sa|So|"
                     r"Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b|[\s|,;:.()/–-]", re.I)


class Line:
    """A line of text; in a PDF with its page and box (points from the top left of the page)."""
    __slots__ = ("text", "page", "x0", "y0", "x1", "y1")

    def __init__(self, text: str, page: int | None = None, box: tuple[float, float, float, float] | None = None):
        self.text, self.page = text, page
        self.x0, self.y0, self.x1, self.y1 = box or (0.0, 0.0, 0.0, 0.0)


# ---------------------------------------------------------------- the text of a file

def _pdf_lines(data: bytes) -> list[list[Line]]:
    import fitz  # PyMuPDF is only needed for PDFs

    pages = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for number, page in enumerate(doc, 1):
            text = page.get_text()
            # most pages of an LV carry a print date and no deadline: only a page with a date and a label
            # is worth laying out line by line
            if not (_DAY.search(text) or _MONTH.search(text)) or not _ANY_LABEL.search(text):
                pages.append([])
                continue
            lines = []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(span["text"] for span in line["spans"]).strip()
                    if text:
                        lines.append(Line(text, number, tuple(line["bbox"])))
            pages.append(lines)
    return pages


def _xml_lines(data: bytes) -> list[Line]:
    """GAEB XML as lines of text: one per paragraph or field. Formatting inside a paragraph (<span>) does
    not break the line; the header's own <Date> (the day the file was written) is not a line."""
    text = data.decode("utf-8", errors="replace")
    text = re.sub(r"<(Date|Time|VersDate)>[^<]*</\1>", "", text)
    text = re.sub(r"</?(span|b|i|u|strong|em)\b[^>]*>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#xA;", "\n")):
        text = text.replace(entity, char)
    return [Line(t) for t in (l.strip() for l in text.split("\n")) if t]


def _gaeb90_lines(data: bytes) -> list[Line]:
    """GAEB 90: the text columns of every record but the header's (00-08: file date, names, currency)."""
    from boq.parsers.gaeb90 import decode

    return [Line(t) for l in decode(data).splitlines()
            if not re.match(r"0[0-8]", l) and (t := l[2:72].strip())]


def _docx_lines(data: bytes) -> list[Line]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
    paragraphs = re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)
    lines = ("".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", p)).strip() for p in paragraphs)
    return [Line(t) for t in lines if t]


def _xlsx_lines(data: bytes) -> list[Line]:
    from openpyxl import load_workbook

    lines = []
    for sheet in load_workbook(io.BytesIO(data), read_only=True, data_only=True).worksheets:
        for row in sheet.iter_rows(values_only=True):
            cells = [f"{c:%d.%m.%Y}" if hasattr(c, "strftime") else str(c).strip() for c in row if c is not None]
            if text := "  ".join(c for c in cells if c):
                lines.append(Line(text))
    return lines


# ---------------------------------------------------------------- dates in a line

def _days(text: str) -> list[tuple[int, int, str, bool]]:
    """Every date in a line: where it starts and ends, the day as ISO, and whether it is only
    approximate ("Ende Juni 2026" is taken as the last day of the month)."""
    found = []
    for m in _DAY.finditer(text):
        year = int(m.group(3))
        try:
            day = date(year + 2000 if year < 100 else year, int(m.group(2)), int(m.group(1)))
        except ValueError:
            continue  # 1.1.10 as an item number passes the pattern only with a real month and day
        if 2000 <= day.year <= 2099:
            found.append((m.start(), m.end(), day.isoformat(), False))
    for m in _MONTH.finditer(text):
        year, month = int(m.group(3)), _MONTHS.index(m.group(2).lower()) + 1
        part = (m.group(1) or "ende").lower()
        day = 1 if part == "anfang" else 15 if part == "mitte" else calendar.monthrange(year, month)[1]
        found.append((m.start(), m.end(), date(year, month, day).isoformat(), True))
    return sorted(found)


def _time(text: str) -> str | None:
    m = _TIME.search(text)
    return f"{int(m.group(1) or m.group(3)):02d}:{m.group(2) or m.group(4)}" if m else None


def _label(text: str) -> tuple[str, str] | None:
    """The kind a label line names, and the label as it stands."""
    for kind, pattern in _LABELS:
        if pattern.search(text):
            return kind, text
    return None


def _alone(text: str) -> bool:
    """Nothing on the line but dates, times and words like "bis", "am": a value, not a sentence."""
    rest = _MONTH.sub("", _DAY.sub("", _TIME.sub("", text)))
    return not _FILLER.sub("", rest)


def _inline(text: str, start: int, end: int, before: int) -> tuple[str, str] | None:
    """What the line itself says the date at [start:end] is; `before`: where the date before it ends."""
    lead = text[max(before, start - 90):start]
    best = None
    for kind, pattern in _LABELS:
        for m in pattern.finditer(lead):
            gap = lead[m.end():]
            if len(gap) <= 45 and not _NOT_THIS.search(gap) and (best is None or m.end() > best[0]):
                best = (m.end(), kind)
    if best:
        return best[1], ""
    tail = text[end:end + 60]
    for kind, pattern in _AFTER:
        m = pattern.search(tail)
        # "Angebote sind bis zum 12.03.2025 einzureichen": the line has to say it is about the bid
        if m and not re.search(r"[.;]\s+[A-ZÄÖÜ]", tail[:m.start()]) and (kind != "due" or re.search(r"Angebot", text, re.I)):
            return kind, ""
    return None


def _beside(line: Line, lines: list[Line], index: int) -> list[Line]:
    """The lines that can label a date standing alone, nearest first. PDF: what is left of it on the same
    row, then what is above it; other formats: the two lines before."""
    if line.page is None:
        return lines[max(0, index - 2):index][::-1]
    mid = (line.y0 + line.y1) / 2
    row = [o for o in lines if o is not line and abs((o.y0 + o.y1) / 2 - mid) < 5 and o.x0 < line.x0
           and o.x1 <= line.x0 + 8]  # a filled-in value may start a little inside its label's box
    above = [o for o in lines if o not in row and o is not line and o.x0 <= line.x1
             and line.y0 - 45 <= o.y0 and o.y1 <= line.y0 + 3]
    return sorted(row, key=lambda o: -o.x1) + sorted(above, key=lambda o: -o.y1)[:3]


def _find(lines: list[Line], file: str, where: str) -> list[dict]:
    found = []
    for index, line in enumerate(lines):
        days = _days(line.text)
        if not days:
            continue
        near = None  # looked up once per line, and only for a line that is a bare value
        before = 0
        for start, end, day, approx in days:
            said = _inline(line.text, start, end, before)
            before = end
            label = ""
            if said is None and _alone(line.text):
                if near is None:
                    near = _beside(line, lines, index)
                hit = next((l for l in map(lambda o: _label(o.text), near) if l), None)
                if hit:
                    said, label = (hit[0], ""), hit[1]
            if said is None:
                continue
            time = _time(line.text[end:end + 20])
            if time is None and line.page is not None:  # a form prints the time in its own box on the row
                mid = (line.y0 + line.y1) / 2
                right = sorted((o for o in lines if o.x0 >= line.x1 - 2 and abs((o.y0 + o.y1) / 2 - mid) < 5
                                and _alone(o.text) and _time(o.text) and not _days(o.text)), key=lambda o: o.x0)
                time = _time(right[0].text) if right else None
            found.append({"kind": said[0], "date": day, "time": time, "approx": approx,
                          "label": label[:160], "text": line.text[:240], "file": file,
                          "where": f"page {line.page}" if line.page else where})
            if _alone(line.text) and label:
                break  # "08.08.2024 bis 31.08.2024" under one label: the label names the first date
    return found


# ---------------------------------------------------------------- a file, a set of files

def read(data: bytes, name: str) -> list[dict]:
    """The labelled dates in one file, in reading order. A file that cannot be read has none."""
    suffix = Path(name).suffix.lower()
    try:
        if suffix == ".pdf":
            return [d for page in _pdf_lines(data) for d in _find(page, name, "")]
        if suffix in (".x83", ".x84", ".x86"):
            return _find(_xml_lines(data), name, "GAEB text")
        if suffix in (".d83", ".d84", ".d86"):
            return _find(_gaeb90_lines(data), name, "GAEB text")
        if suffix == ".docx":
            return _find(_docx_lines(data), name, "document text")
        if suffix == ".xlsx":
            return _find(_xlsx_lines(data), name, "sheet")
        if suffix == ".txt":
            return _find([Line(t) for l in data.decode("utf-8", errors="replace").splitlines() if (t := l.strip())],
                         name, "text")
    except Exception:  # a broken or encrypted file: no dates, and the rest of the intake goes on
        return []
    return []


def merge(found: list[dict]) -> list[dict]:
    """One entry per kind and day, with every place it was read from: an LV and its print-out say the
    same thing twice. Ordered as a tender runs; two days for one kind both stay (see `plan_of`)."""
    merged: dict[tuple[str, str], dict] = {}
    for d in found:
        entry = merged.setdefault((d["kind"], d["date"]), {
            "kind": d["kind"], "date": d["date"], "time": None, "approx": d["approx"],
            "label": d["label"], "text": d["text"], "sources": []})
        entry["time"] = entry["time"] or d["time"]
        entry["approx"] = entry["approx"] and d["approx"]
        source = {"file": d["file"], "where": d["where"]}
        if source not in entry["sources"]:
            entry["sources"].append(source)
    return sorted(merged.values(), key=lambda d: (KINDS.index(d["kind"]), d["date"]))


def plan_of(dates: list[dict]) -> dict:
    """The dates a project is planned by (`projects.plan`), as far as the files give them without doubt:
    a kind the files state with two different days is left to the user, and so is an approximate one.
    The opening of the bids stands in for the deadline when only it is named (VOB/A: the deadline ends
    when the opening begins)."""
    def one(kind: str) -> str | None:
        days = {d["date"] for d in dates if d["kind"] == kind and not d["approx"]}
        return days.pop() if len(days) == 1 else None

    plan = {"due": one("due") or one("opening"), "questions_due": one("questions_due"),
            "binding_until": one("binding_until")}
    return {k: v for k, v in plan.items() if v}
