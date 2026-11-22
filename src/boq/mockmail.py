"""The mock world of the demo mail server: who writes to whom, with which files.

`mock/mail/` holds a made-up but coherent history as data (TOML): our firm, clients who send tenders,
suppliers and subcontractors, and the mail between them, with the files attached. `fill()` puts it into the
mailboxes of the demo server (boq.demomail): every message into the sender's "Sent Items" and each
recipient's inbox, so every party sees its side when it logs into the webmail. Run it as often as wanted:
what is there already is left alone, and a fill made on an earlier day is replaced, because every date is
relative to today (a message of "day -3" was sent three days ago, a deadline of "{+12}" is in twelve days),
so the tenders are always open ones. The files (LVs as GAEB XML, GAEB 90, Excel, PDF; letters; price
sheets) are made here at fill time from their descriptions, with those dates in them.

Layout of the data: `world.toml` (the parties and their people), every other `*.toml` a bundle of
`[[lv]]`, `[[doc]]`, `[[sheet]]` and `[[mail]]` (see mock/mail/README.md for the fields).
Mail made here carries the header X-Polier-Mock and a Message-ID ending in `.mock@…`.
"""
from __future__ import annotations

import email.policy
import hashlib
import imaplib
import io
import os
import re
import sys
import textwrap
import time
import tomllib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import format_datetime, formataddr
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(os.environ.get("BOQ_MOCK_DIR", "") or Path(__file__).resolve().parents[2] / "mock" / "mail")
HEADER = "X-Polier-Mock"
SENT, INBOX = "Sent Items", "INBOX"
_WEEKDAYS = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")


class MockError(ValueError):
    pass


# ------------------------------------------------------------------ dates

def _workday(day: date, forward: bool) -> date:
    while day.weekday() >= 5:
        day += timedelta(days=1 if forward else -1)
    return day


def day_of(offset: int, today: date) -> date:
    """The day `offset` days from today, moved off a weekend: back for the past, forward for what is ahead."""
    return _workday(today + timedelta(days=offset), forward=offset > 0)


_PLACE = re.compile(r"\{(kw)?([+-]\d+)(?:\|(long|iso|month))?\}")


def dated(text: str, today: date) -> str:
    """Fill the dates in: {+12} -> 03.12.2026, {+12|long} -> Donnerstag, 03.12.2026, {+12|iso} -> 2026-12-03,
    {+40|month} -> Januar 2027, {kw+3} -> 49 (the calendar week)."""
    def put(m: re.Match) -> str:
        day = day_of(int(m.group(2)), today)
        if m.group(1):
            return str(day.isocalendar().week)
        if m.group(3) == "iso":
            return day.isoformat()
        if m.group(3) == "month":
            return f"{('Januar Februar März April Mai Juni Juli August September Oktober November Dezember').split()[day.month - 1]} {day.year}"
        return (f"{_WEEKDAYS[day.weekday()]}, " if m.group(3) == "long" else "") + f"{day:%d.%m.%Y}"
    return _PLACE.sub(put, text or "")


# ------------------------------------------------------------------ the world

@dataclass
class Person:
    key: str
    name: str
    email: str
    sign: str
    party: "Party"


@dataclass
class Party:
    key: str
    kind: str  # us, client, supplier, subcontractor, other
    name: str
    raw: dict
    people: dict[str, Person] = field(default_factory=dict)

    @property
    def first(self) -> Person:
        return next(iter(self.people.values()))


def _world(root: Path) -> dict[str, Party]:
    data = tomllib.loads((root / "world.toml").read_text("utf-8"))
    parties = {}
    for raw in data.get("party", []):
        party = Party(raw["key"], raw.get("kind", "other"), raw["name"], raw)
        for p in raw.get("person") or [{"key": "office", "name": raw["name"], "email": raw["email"]}]:
            address = p["email"] if "@" in p["email"] else f"{p['email']}@{raw['domain']}"
            sign = p.get("sign") or "\n".join(x for x in (p["name"], raw["name"], raw.get("street", ""), raw.get("place", ""),
                                                        f"Tel. {raw['phone']}" if raw.get("phone") else "", address) if x)
            party.people[p["key"]] = Person(p["key"], p["name"], address.lower(), sign.strip(), party)
        parties[party.key] = party
    if "us" not in parties:
        raise MockError("world.toml names no party with key \"us\"")
    return parties


def _who(ref: str, parties: dict[str, Party]) -> Person:
    key, _, person = ref.partition(".")
    if key not in parties:
        raise MockError(f"unknown party {ref!r}")
    party = parties[key]
    if person and person not in party.people:
        raise MockError(f"unknown person {ref!r}")
    return party.people[person] if person else party.first


# ------------------------------------------------------------------ an LV as the data describes it

@dataclass
class Row:
    kind: str  # title, item, remark
    oz: str = ""
    label: str = ""  # title label, item short text, remark text
    long: str = ""
    qty: str = ""  # as written: "420", "12,5", "" where the LV leaves it out
    unit: str = ""
    flags: str = ""  # E: Bedarfsposition, A: Wahlposition
    up: str = ""  # unit price, in a bid or an award: "12,50"


def _rows(text: str, where: str) -> list[Row]:
    rows = []
    for n, line in enumerate((text or "").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            rows.append(Row("remark", label=line[1:].strip().replace(" // ", "\n")))
            continue
        cells = [c.strip() for c in line.lstrip("#").split(" | ")]
        if line.startswith("#"):
            if len(cells) != 2:
                raise MockError(f"{where}, line {n}: a title is '# 1 | Label'")
            rows.append(Row("title", oz=cells[0], label=cells[1]))
            continue
        if len(cells) < 3:
            raise MockError(f"{where}, line {n}: an item is 'oz | qty unit | short | long | flags': {line[:60]}")
        flags = cells.pop() if len(cells) > 3 and re.fullmatch(r"[EA]+", cells[-1]) else ""
        qty, _, unit = cells[1].partition(" ")
        if qty == "-":
            qty = ""
        elif not re.fullmatch(r"\d+(,\d+)?", qty):
            qty, unit = "", cells[1]  # no quantity given, only a unit
        rows.append(Row("item", oz=cells[0], label=cells[2], long=(cells[3] if len(cells) > 3 else "").replace(" // ", "\n"),
                        qty=qty, unit=unit.strip(), flags=flags))
    return rows


@dataclass
class LV:
    key: str
    file: str
    format: str  # x83, x83-31, d83, xlsx, pdf
    name: str
    project: str
    number: str
    client: Party
    remarks: str
    rows: list[Row]
    phase: str = "83"  # 83 the tender, 84 our bid with unit prices, 86 the award
    issuer: Party | None = None  # whose paper a print-out is: the client's, for a bid ours

    @property
    def items(self) -> list[Row]:
        return [r for r in self.rows if r.kind == "item"]

    @property
    def filename(self) -> str:
        return self.file + {"x83": f".X{self.phase}", "x83-31": f".x{self.phase}", "d83": f".D{self.phase}", "xlsx": ".xlsx", "pdf": ".pdf"}[self.format]


def _lv(raw: dict, known: dict[str, LV], parties: dict[str, Party], where: str) -> LV:
    if raw.get("base"):
        base = known[raw["base"]]
        rows = [Row(**vars(r)) for r in base.rows if r.oz not in set(raw.get("drop", []))]
        for change in _rows("\n".join(raw.get("set", [])), where):  # same number: the row is replaced
            at = next((i for i, r in enumerate(rows) if r.oz == change.oz and r.kind == change.kind), None)
            if at is None:
                raise MockError(f"{where}: lv {raw['key']} changes {change.oz}, which its base does not have")
            rows[at] = change
        for new in _rows(raw.get("add", ""), where):  # behind the last row of its title
            prefix = new.oz.rsplit(".", 1)[0]
            at = max((i for i, r in enumerate(rows) if r.oz == prefix or r.oz.startswith(prefix + ".")), default=len(rows) - 1)
            rows.insert(at + 1, new)
        inherit = vars(base)
    else:
        rows, inherit = _rows(raw["items"], f"{where}: lv {raw['key']}"), {}
    client = parties[raw["client"]] if raw.get("client") else inherit.get("client")
    if client is None:
        raise MockError(f"{where}: lv {raw['key']} names no client")
    phase = str(raw.get("phase") or inherit.get("phase") or "83")
    if phase not in ("83", "84", "86"):
        raise MockError(f"{where}: lv {raw['key']} has phase {phase}; it is 83, 84 or 86")
    by_oz = {r.oz: r for r in rows if r.kind == "item"}
    for n, line in enumerate((raw.get("prices") or "").strip().splitlines(), 1):
        oz, _, price = (c.strip() for c in line.partition(" | "))
        if oz not in by_oz or not re.fullmatch(r"\d+(,\d{1,3})?", price):
            raise MockError(f"{where}: lv {raw['key']}, prices line {n}: 'number | 12,50' for an item of the LV: {line[:50]}")
        by_oz[oz].up = price
    if phase == "83" and any(r.up for r in rows):
        raise MockError(f"{where}: lv {raw['key']} has prices but is the tender (phase 83)")
    issuer = parties[raw["issuer"]] if raw.get("issuer") else parties["us"] if phase == "84" else client
    return LV(raw["key"], raw.get("file") or inherit["file"], raw.get("format") or inherit["format"],
              raw.get("name") or inherit["name"], raw.get("project") or inherit.get("project") or raw.get("name") or inherit["name"],
              raw.get("number") or inherit.get("number", ""), client,
              raw["remarks"] if "remarks" in raw else inherit.get("remarks", ""), rows, phase, issuer)


def _number(qty: str) -> float | None:
    return float(qty.replace(",", ".")) if qty else None


def _total(r: Row) -> float | None:
    """Quantity times unit price, to the cent; None where either is missing or the item is priced per unit only."""
    if not r.up or not r.qty or "E" in r.flags:
        return None
    return round(_number(r.qty) * _number(r.up) + 1e-9, 2)


def _paragraphs(text: str) -> str:
    return "".join(f"<p><span>{escape(line)}</span></p>" for line in text.split("\n") if line.strip()) or "<p><span></span></p>"


def gaeb_xml(lv: LV, today: date) -> bytes:
    """GAEB DA XML, exchange phase 83, version 3.2 (or 3.1 for format x83-31)."""
    version = "3.1" if lv.format == "x83-31" else "3.2"
    ids = iter(range(1, 100000))

    def item(r: Row) -> str:
        part = r.oz.rsplit(".", 1)[-1]
        qty = f"<Qty>{_number(r.qty):.3f}</Qty>" if r.qty else ""
        extra = ("<Provis>WithoutTotal</Provis>" if "E" in r.flags else "") + ("<ALNGroupNo>1</ALNGroupNo><ALNSerNo>1</ALNSerNo>" if "A" in r.flags else "")
        priced = (f"<UP>{_number(r.up):.2f}</UP>" if r.up else "") + (f"<IT>{_total(r):.2f}</IT>" if _total(r) is not None else "")
        return (f'<Item ID="I{next(ids)}" RNoPart="{part.zfill(4)}">{extra}{qty}<QU>{escape(r.unit)}</QU>{priced}'
                + ("<LumpSumItem>Yes</LumpSumItem>" if r.unit.lower() in ("psch", "pausch", "pauschal") else "")
                + f"<Description><CompleteText><DetailTxt><Text>{_paragraphs(dated(r.long, today) or r.label)}</Text></DetailTxt>"
                  f"<OutlineText><OutlTxt><TextOutlTxt>{_paragraphs(r.label)}</TextOutlTxt></OutlTxt></OutlineText>"
                  f"</CompleteText></Description></Item>")

    def remark(text: str) -> str:
        return (f'<Remark ID="R{next(ids)}"><Description><CompleteText><DetailTxt><Text>{_paragraphs(dated(text, today))}</Text></DetailTxt>'
                f"</CompleteText></Description></Remark>")

    def body(prefix: str, rows: list[Row]) -> str:
        """The rows under one title, in their order: sub-titles become categories, items an item list."""
        out, loose, i = [], [], 0
        depth = len(prefix.split(".")) if prefix else 0

        def flush():
            if loose:
                out.append("<Itemlist>" + "".join(loose) + "</Itemlist>")
                loose.clear()
        while i < len(rows):
            r = rows[i]
            if r.kind == "title" and len(r.oz.split(".")) == depth + 1:
                flush()
                j = i + 1
                while j < len(rows) and not (rows[j].kind == "title" and len(rows[j].oz.split(".")) <= depth + 1):
                    j += 1
                out.append(f'<BoQCtgy ID="C{next(ids)}" RNoPart="{r.oz.rsplit(".", 1)[-1].zfill(2)}"><LblTx>{_paragraphs(r.label)}</LblTx>'
                           f"<BoQBody>{body(r.oz, rows[i + 1:j])}</BoQBody></BoQCtgy>")
                i = j
                continue
            loose.append(item(r) if r.kind == "item" else remark(r.label))
            i += 1
        flush()
        return "".join(out)

    client, address = lv.client, lv.client.first.email
    xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA{lv.phase}/{version}">'
           f"<GAEBInfo><Version>{version}</Version><VersDate>{'2009-12' if version == '3.1' else '2013-10'}</VersDate>"
           f"<Date>{day_of(-6, today).isoformat()}</Date><ProgSystem>AVA-Programm</ProgSystem></GAEBInfo>"
           f"<PrjInfo><NamePrj>{escape(lv.number)}</NamePrj><LblPrj>{escape(lv.project)}</LblPrj><Cur>EUR</Cur></PrjInfo>"
           f"<Award><DP>{lv.phase}</DP><AwardInfo><Cur>EUR</Cur><CurLbl>Euro</CurLbl></AwardInfo>"
           f"<OWN><Address><Name1>{escape(client.name)}</Name1><Street>{escape(client.raw.get('street', ''))}</Street>"
           f"<City>{escape(client.raw.get('place', ''))}</City><Email>{escape(address)}</Email></Address></OWN>"
           f'<BoQ ID="B1"><BoQInfo><Name>{escape(lv.number or lv.key)}</Name><LblBoQ>{escape(lv.name)}</LblBoQ>'
           f"<Date>{day_of(-6, today).isoformat()}</Date></BoQInfo><BoQBody>"
           + (remark(lv.remarks) if lv.remarks.strip() else "") + body("", lv.rows) + "</BoQBody></BoQ></Award></GAEB>\n")
    return xml.encode("utf-8")


_PLAIN = str.maketrans({"–": "-", "—": "-", "„": '"', "“": '"', "”": '"', "‚": "'", "’": "'", "€": "EUR", "…": "...", "≥": ">=", "≤": "<=", "×": "x", " ": " ", "•": "-"})


def gaeb90(lv: LV, today: date) -> bytes:
    """GAEB 90, exchange phase 83: records of 80 characters, cp850, as the old AVA programs write them."""
    depth = max(len(r.oz.split(".")) for r in lv.items)
    if depth not in (2, 3) or any(len(r.oz.split(".")) != depth for r in lv.items):
        raise MockError(f"lv {lv.key}: GAEB 90 here needs item numbers of one depth, 2 or 3 parts")
    mask = "11PPPPI" if depth == 2 else "1122PPPPI"
    out: list[str] = []

    def put(record: str):
        out.append(f"{record[:74]:<74}{len(out) + 1:06d}")

    def raw_oz(oz: str, item: bool) -> str:
        parts = oz.split(".")
        heads = "".join(p.zfill(2) for p in (parts[:-1] if item else parts))
        return heads + (f"{parts[-1]:>4} " if item else "")

    def text_block(text: str):
        put("T0")
        for line in dated(text, today).split("\n"):
            for piece in textwrap.wrap(line, 68) or [""]:
                put("T1" + piece)
        put("T9")

    put(f"00        {lv.phase}{'L' if lv.phase == '83' else 'K'}               {lv.number:<34}{mask}90")
    put(f"01{lv.name[:40]:<40}{day_of(-6, today):%d.%m.%y}")
    put(f"02{lv.project[:60]}")
    put(f"03{lv.client.name[:60]}")
    put("08EUR   EUR")
    if lv.remarks.strip():
        text_block(lv.remarks)
    opened: list[str] = []
    for r in lv.rows:
        if r.kind == "title":
            while opened and not r.oz.startswith(opened[-1] + "."):
                put("31" + raw_oz(opened.pop(), False))
            opened.append(r.oz)
            put(f"11{raw_oz(r.oz, False):<9}  N    {'Titel' if '.' not in r.oz else 'Bereich'}")
            put("12" + r.label[:70])
        elif r.kind == "remark":
            text_block(r.label)
        else:
            flags = ("A" if "A" in r.flags else "N") + ("E" if "E" in r.flags else "N") + "N"
            put(f"21{raw_oz(r.oz, True):<9}{flags:<12}{round((_number(r.qty) or 0) * 1000):011d}{r.unit[:4]:<4}")
            if r.up and r.qty:
                put(f"23{raw_oz(r.oz, True):<9}  {round(_number(r.up) * 1000):011d} {round((_total(r) or 0) * 100):012d} {round(_number(r.qty) * 1000):011d}")
            for piece in textwrap.wrap(r.label, 70):
                put("25" + piece)
            for line in dated(r.long, today).split("\n"):
                for piece in textwrap.wrap(line, 66):
                    put("26   " + piece)
    while opened:
        put("31" + raw_oz(opened.pop(), False))
    put("99")
    return ("\r\n".join(out) + "\r\n").translate(_PLAIN).encode("cp850", "replace")


def excel_list(lv: LV, today: date) -> bytes:
    """An item list as a spreadsheet, the way a private client or a general contractor sends one."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    book = Workbook()
    page = book.active
    page.title = "LV"
    page.append(["Bauvorhaben", lv.project])
    page.append(["Leistungsverzeichnis", lv.name + (f" ({lv.number})" if lv.number else "")])
    page.append(["Auftraggeber", lv.client.name])
    for line in dated(lv.remarks, today).split("\n"):
        if line.strip():
            page.append([line.strip()])
    page.append([])
    page.append(["Pos.", "Kurztext", "Langtext", "Menge", "ME", "EP (EUR)", "GP (EUR)", "Art"])
    for cell in page[page.max_row]:
        cell.font = Font(bold=True)
    for r in lv.rows:
        if r.kind == "title":
            page.append([r.oz, r.label])
            page.cell(page.max_row, 2).font = Font(bold=True)
        elif r.kind == "item":
            page.append([r.oz, r.label, dated(r.long, today), _number(r.qty), r.unit, _number(r.up), _total(r),
                         "Bedarfsposition" if "E" in r.flags else "Wahlposition" if "A" in r.flags else None])
    for column, width in zip("ABCDEFGH", (10, 46, 70, 11, 8, 12, 14, 16)):
        page.column_dimensions[column].width = width
    for row in page.iter_rows(min_col=1, max_col=1):
        row[0].number_format = "@"
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def _latin(text: str) -> str:
    return text.translate(_PLAIN).encode("latin-1", "replace").decode("latin-1")


class _Pages:
    """A plain A4 document written line by line (PyMuPDF), with a head on every page."""

    def __init__(self, title: str, head: list[str], columns: bool = False):
        import pymupdf
        self.doc = pymupdf.open()
        self.doc.set_metadata({"title": title})
        self.head, self.columns, self.page, self.y, self.n = head, columns, None, 0.0, 0

    def new_page(self, bare: bool = False):
        self.page = self.doc.new_page(width=595, height=842)
        self.n += 1
        self.y = 60.0
        if bare:
            return
        for line in self.head:
            self.text(50, line, size=8)
        self.page.insert_text((500, 60), f"Seite {self.n}", fontsize=8, fontname="helv")
        if self.columns:
            self.y += 6
            for x, word in ((50, "Pos."), (110, "Leistungsbeschreibung"), (392, "Menge"), (436, "Einh."), (470, "EP in EUR"), (525, "GP in EUR")):
                self.page.insert_text((x, self.y), word, fontsize=8, fontname="hebo")
            self.y += 4
            self.page.draw_line((50, self.y), (565, self.y), width=0.5)
            self.y += 14

    def room(self, lines: int = 1, size: float = 9):
        if self.page is None or self.y + lines * (size + 3) > 790:
            self.new_page()

    def text(self, x: float, line: str, size: float = 9, bold: bool = False, advance: bool = True):
        self.page.insert_text((x, self.y), _latin(line), fontsize=size, fontname="hebo" if bold else "helv")
        if advance:
            self.y += size + 3

    def paragraph(self, x: float, text: str, width: int, size: float = 9, bold: bool = False):
        for line in text.split("\n"):
            for piece in textwrap.wrap(line, width) or [""]:
                self.room(1, size)
                self.text(x, piece, size, bold)

    def bytes(self) -> bytes:
        return self.doc.tobytes(deflate=True)


def pdf_lv(lv: LV, today: date) -> bytes:
    """An LV as the print-out of an AVA program: a cover with the dates, then the items in columns."""
    if any(not r.qty for r in lv.items):
        raise MockError(f"lv {lv.key}: a printed LV cannot leave a quantity out here (the PDF parser needs one to see an item)")
    client, issuer = lv.client, lv.issuer or lv.client
    heading = {"83": "Leistungsverzeichnis", "84": "Angebot", "86": "Auftrag"}[lv.phase]
    pages = _Pages(lv.name, [f"Auftraggeber: {client.name}", f"Bauvorhaben: {lv.project}", f"LV: {lv.name}", f"Projekt-Nr.: {lv.number}"], columns=True)
    pages.new_page(bare=True)
    pages.y = 110
    pages.text(50, issuer.name, 11, bold=True)
    for line in (issuer.raw.get("street", ""), issuer.raw.get("place", ""), issuer.first.email):
        if line:
            pages.text(50, line)
    pages.y += 40
    pages.text(50, heading, 16, bold=True)
    pages.y += 8
    pages.paragraph(50, f"Bauvorhaben: {lv.project}\nLV: {lv.name}\nProjekt-Nr.: {lv.number}\nDatum: {day_of(-6, today):%d.%m.%Y}", 90, 10)
    pages.new_page()
    if lv.remarks.strip():  # under the column head, before the first item: where a print-out has its Vorbemerkungen
        pages.paragraph(110, dated(lv.remarks, today), 78)
        pages.y += 8
    for r in lv.rows:
        if r.kind == "title":
            pages.room(3)
            pages.y += 4
            pages.text(50, r.oz, bold=True, advance=False)
            pages.text(110, r.label, bold=True)
            pages.y += 2
        elif r.kind == "remark":
            pages.paragraph(110, dated(r.label, today), 78)
            pages.y += 4
        else:
            short = textwrap.wrap(r.label, 62) or [""]
            pages.room(len(short) + 3)
            pages.text(50, r.oz, advance=False)
            for piece in short:
                pages.text(110, piece, bold=True)
            if "E" in r.flags:
                pages.text(110, "*** Bedarfsposition ohne GB")
            if "A" in r.flags:
                pages.text(110, "*** Wahlposition")
            pages.paragraph(110, dated(r.long, today), 78)
            pages.room(2)
            if r.qty:
                qty = f"{_number(r.qty):,.3f}".replace(",", " ").replace(".", ",").replace(" ", ".")
                pages.page.insert_text((392 - 0, pages.y), qty, fontsize=9, fontname="helv")
            pages.page.insert_text((436, pages.y), _latin(r.unit), fontsize=9, fontname="helv")
            money = lambda v: f"{v:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".")  # noqa: E731
            pages.page.insert_text((470, pages.y), money(_number(r.up)) if r.up else "............", fontsize=9, fontname="helv")
            if r.up and _total(r) is None:
                pages.page.insert_text((525, pages.y), "Nur Einh.-Pr.", fontsize=9, fontname="helv")
            else:
                pages.page.insert_text((525, pages.y), money(_total(r)) if r.up else "............", fontsize=9, fontname="helv")
            pages.y += 20
    return pages.bytes()


def pdf_letter(sender: Party, title: str, text: str, today: date) -> bytes:
    """A letter, an offer, an invoice: the sender's letterhead, a title, the text."""
    pages = _Pages(title, [sender.name, title])
    pages.new_page(bare=True)
    pages.text(50, sender.name, 13, bold=True)
    for line in (sender.raw.get("street", ""), sender.raw.get("place", ""),
                 " · ".join(x for x in (f"Tel. {sender.raw['phone']}" if sender.raw.get("phone") else "", sender.first.email) if x)):
        if line:
            pages.text(50, line, 8)
    pages.y += 36
    pages.text(50, title, 12, bold=True)
    pages.y += 10
    for line in dated(text, today).split("\n"):
        if " | " in line:  # a table row: cells at fixed places
            pages.room()
            cells = [c.strip() for c in line.split(" | ")]
            for x, cell in zip((50, 95, 330, 390, 440, 500), cells):
                pages.page.insert_text((x, pages.y), _latin(cell)[:52 if x == 95 else 14], fontsize=8.5, fontname="helv")
            pages.y += 12
        else:
            pages.paragraph(50, line, 104)
    return pages.bytes()


def price_sheet(raw: dict, today: date, blank: bool) -> bytes:
    """The Excel sheet of a price inquiry (the layout of supply.sheet): empty as we send it, or filled in as
    the supplier sends it back. Rows: 'oz | qty unit | label | price | product | ja | note'."""
    from openpyxl import Workbook

    from boq.supply import SHEET_HEAD, TERMS_ROWS

    book = Workbook()
    page = book.active
    page.title = "Positionen"
    page.append(SHEET_HEAD)
    for line in raw["items"].strip().splitlines():
        cells = [c.strip() for c in re.split(r"\s*\|\s*", line.strip())] + [""] * 7  # an empty cell may be written "| |"
        qty, _, unit = cells[1].partition(" ")
        price = None if blank or not cells[3] else float(cells[3].replace(".", "").replace(",", "."))
        page.append([cells[0], cells[2], _number(qty), unit, price] + ([None] * 3 if blank else [cells[4] or None, cells[5] or None, cells[6] or None]))
    for column, width in zip("ABCDEFGH", (12, 60, 12, 10, 24, 34, 30, 40)):
        page.column_dimensions[column].width = width
    terms, said = book.create_sheet("Konditionen"), raw.get("terms") or {}
    for key, label in TERMS_ROWS:
        value = None if blank else said.get(key)
        terms.append([label, dated(value, today) if isinstance(value, str) else value])
    terms.column_dimensions["A"].width = 60
    terms.column_dimensions["B"].width = 30
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def lv_file(lv: LV, today: date) -> bytes:
    return {"x83": gaeb_xml, "x83-31": gaeb_xml, "d83": gaeb90, "xlsx": excel_list, "pdf": pdf_lv}[lv.format](lv, today)


# ------------------------------------------------------------------ the messages

@dataclass
class Mail:
    key: str  # "<bundle>.<id>"
    at: datetime
    sender: Person
    to: list[Person]
    cc: list[Person]
    message: EmailMessage

    @property
    def message_id(self) -> str:
        return str(self.message["Message-ID"])


def _message_id(key: str, sender: Person) -> str:
    return f"<{re.sub(r'[^a-z0-9.]+', '-', key.lower())}.{hashlib.sha1(key.encode()).hexdigest()[:8]}.mock@{sender.email.split('@')[1]}>"


def _quoted(of: Mail) -> str:
    said = of.message.get_body(preferencelist=("plain",)).get_content().strip()
    return (f"\n\nAm {of.at:%d.%m.%Y} um {of.at:%H:%M} schrieb {of.sender.name} <{of.sender.email}>:\n"
            + "\n".join("> " + line for line in said.split("\n")[:40]))


def build(root: Path = ROOT, today: date | None = None) -> tuple[dict[str, Party], list[Mail], dict[str, LV]]:
    """Everything the data describes, made for today: the parties, the messages in the order they were
    sent, and the LVs by key. Raises MockError where the data does not hold together."""
    today = today or date.today()
    parties = _world(root)
    mails: dict[str, Mail] = {}
    lvs: dict[str, LV] = {}
    for path in sorted(p for p in root.rglob("*.toml") if p.name != "world.toml"):
        bundle = path.stem
        data = tomllib.loads(path.read_text("utf-8"))
        docs = {d["key"]: d for d in data.get("doc", [])}
        sheets = {s["key"]: s for s in data.get("sheet", [])}
        local: dict[str, LV] = {}
        for raw in data.get("lv", []):
            local[raw["key"]] = lvs[f"{bundle}.{raw['key']}"] = _lv(raw, local, parties, path.name)
        for raw in data.get("mail", []):
            key, where = f"{bundle}.{raw['id']}", f"{path.name}: mail {raw['id']}"
            if key in mails:
                raise MockError(f"{where}: the id is used twice")
            sender = _who(raw["from"], parties)
            to = [_who(r, parties) for r in ([raw["to"]] if isinstance(raw["to"], str) else raw["to"])]
            cc = [_who(r, parties) for r in raw.get("cc", [])]
            hour, minute = (int(x) for x in raw.get("time", "09:30").split(":"))
            at = datetime.combine(day_of(int(raw["day"]), today), datetime.min.time()).replace(hour=hour, minute=minute).astimezone()
            answers = None
            if raw.get("reply_to"):
                ref = raw["reply_to"] if "." in raw["reply_to"] else f"{bundle}.{raw['reply_to']}"
                if ref not in mails:
                    raise MockError(f"{where}: answers {ref}, which does not come before it")
                answers = mails[ref]
                if answers.at >= at:
                    raise MockError(f"{where}: is dated before the message it answers ({ref})")
            message = EmailMessage()
            message["From"] = formataddr((sender.name if sender.name != sender.party.name else sender.party.name, sender.email))
            message["To"] = ", ".join(formataddr((p.name, p.email)) for p in to)
            if cc:
                message["Cc"] = ", ".join(formataddr((p.name, p.email)) for p in cc)
            message["Subject"] = dated(raw["subject"], today)
            message["Date"] = format_datetime(at)
            message["Message-ID"] = _message_id(key, sender)
            if answers is not None:
                message["In-Reply-To"] = answers.message_id
                message["References"] = f"{answers.message.get('References', '')} {answers.message_id}".strip()
            message[HEADER] = today.isoformat()
            body = dated(raw["body"], today).strip()
            if raw.get("sign", True):
                body += "\n\n" + sender.sign
            if answers is not None and raw.get("quote", True):
                body += _quoted(answers)
            message.set_content(body + "\n")
            for ref in raw.get("attach", []):
                kind, _, name = ref.partition(":")
                name, _, option = name.partition(":")
                if kind == "lv" and name in local:
                    filename, payload = local[name].filename, lv_file(local[name], today)
                elif kind == "doc" and name in docs:
                    d = docs[name]
                    author = _who(d["from"], parties).party if d.get("from") else sender.party
                    filename, payload = d["file"], pdf_letter(author, dated(d["title"], today), d["text"], today)
                elif kind == "sheet" and name in sheets:
                    s = sheets[name]
                    filename, payload = s["file"], price_sheet(s, today, blank=option == "blank")
                else:
                    raise MockError(f"{where}: attaches {ref!r}, which this file does not describe")
                main, _, sub = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}.get(
                    filename.rsplit(".", 1)[-1].lower(), "application/octet-stream").partition("/")
                message.add_attachment(payload, maintype=main, subtype=sub, filename=filename)
            mails[key] = Mail(key, at, sender, to, cc, message)
    return parties, sorted(mails.values(), key=lambda m: m.at), lvs


# ------------------------------------------------------------------ into the mailboxes

def _box(address: str):
    from boq import demomail, mail
    box = mail.inbox()
    if box is None:
        raise MockError("No mail server is set (IMAP_HOST).")
    server = mail.open_inbox(box)
    server.login(address, demomail.PASSWORD)
    return server


def _mock_in(server, folder: str) -> tuple[set[str], set[str], list[bytes]]:
    """Of the mock messages in a folder: their Message-IDs, the days they were filled on, their numbers.
    Every head of the folder is looked at: a search for the header is not something every server does."""
    if server.select(f'"{folder}"')[0] != "OK":
        return set(), set(), []
    _, data = server.uid("SEARCH", None, "ALL")
    uids = (data[0] or b"").split()
    ids, days, mock = set(), set(), []
    for start in range(0, len(uids), 200):
        _, got = server.uid("FETCH", b",".join(uids[start:start + 200]).decode(), f"(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID {HEADER})])")
        for part in got:
            found = isinstance(part, tuple) and re.search(rb"UID (\d+)", part[0])
            if not found:
                continue
            head = email.message_from_bytes(part[1], policy=email.policy.default)
            if head.get(HEADER):
                ids.add(str(head.get("Message-ID") or "").strip())
                days.add(str(head.get(HEADER)).strip())
                mock.append(found.group(1))
    return ids, days, mock


def fill(root: Path = ROOT, reset: bool = False, say=print) -> dict:
    """Put the mock world into the mailboxes of the demo server. Messages that are there are left alone; a
    fill of an earlier day (or `reset`) is taken out first and put in again with today's dates. Mail that
    is not mock mail (what the app or a person sent) is never touched."""
    from boq import demomail

    today = date.today()
    parties, mails, _ = build(root, today)
    people = {p.email: p for party in parties.values() for p in party.people.values() if party.raw.get("mailbox", True)}
    made = demomail.ensure(*people)
    wanted: dict[str, dict[str, list[Mail]]] = {address: {INBOX: [], SENT: []} for address in people}
    for m in mails:
        if m.sender.email in wanted:
            wanted[m.sender.email][SENT].append(m)
        for p in {p.email: p for p in m.to + m.cc}.values():
            if p.email in wanted:
                wanted[p.email][INBOX].append(m)
    added = removed = 0
    for address, folders in wanted.items():
        server = _box(address)
        try:
            for folder, messages in folders.items():
                have, days, uids = _mock_in(server, folder)
                if uids and (reset or days - {today.isoformat()}):
                    server.uid("STORE", b",".join(uids).decode(), "+FLAGS", "(\\Deleted)")
                    server.expunge()
                    removed += len(uids)
                    have = set()
                for m in messages:
                    if m.message_id in have:
                        continue
                    seen = folder == SENT or (today - m.at.date()).days > 3  # the last days' mail is still unread
                    server.append(f'"{folder}"', "(\\Seen)" if seen else "", imaplib.Time2Internaldate(m.at),
                                  m.message.as_bytes(policy=email.policy.SMTP))
                    added += 1
        finally:
            try:
                server.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    out = {"accounts": len(people), "accounts_made": len(made), "messages": len(mails), "put": added, "replaced": removed}
    say(f"mock mail: {out['messages']} messages for {out['accounts']} mailboxes; {added} put in" + (f", {removed} of an earlier fill taken out" if removed else ""))
    return out


def empty(root: Path = ROOT, say=print) -> int:
    """Take the mock mail out of every mailbox of the mock world again: the stage as it was before a fill.
    Accounts stay, and so does every message that is not mock mail."""
    parties = _world(root)
    removed = 0
    for address in sorted({p.email for party in parties.values() if party.raw.get("mailbox", True) for p in party.people.values()}):
        try:
            server = _box(address)
        except imaplib.IMAP4.error:
            continue  # no such account yet: nothing of ours can be in it
        try:
            for folder in (INBOX, SENT):
                _, _, uids = _mock_in(server, folder)
                if uids:
                    server.uid("STORE", b",".join(uids).decode(), "+FLAGS", "(\\Deleted)")
                    server.expunge()
                    removed += len(uids)
        finally:
            try:
                server.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    say(f"mock mail: {removed} messages taken out")
    return removed


def directory(root: Path = ROOT, say=print) -> int:
    """The suppliers and subcontractors of the mock world as entries of the app's directory, and our firm's
    own details where none are set: without them the history in the mailbox belongs to nobody. Entries are
    found by their address; one that is there is left as it is."""
    from boq import supply

    parties = _world(root)
    us = parties["us"]
    if not supply.company()["name"]:
        supply.set_company({"name": us.name, "contact": us.first.name, "email": us.first.email, "phone": us.raw.get("phone", ""),
                            "place": us.raw.get("place", ""), **({"own_trades": us.raw["own_trades"]} if us.raw.get("own_trades") else {})})
    have = {s["email"].lower() for s in supply.suppliers()}
    new = 0
    for party in parties.values():
        if party.kind not in supply.KINDS or party.first.email in have:
            continue
        contacts = [{"name": p.name, "role": "", "email": p.email, "phone": ""} for p in list(party.people.values())[1:]]
        supply.save_supplier({"name": party.name, "kind": party.kind, "email": party.first.email, "contact": party.raw.get("contact", party.first.name),
                              "phone": party.raw.get("phone", ""), "place": party.raw.get("place", ""), "groups": party.raw.get("groups", []),
                              "note": party.raw.get("note", ""), "source": "mock",
                              "more": {"contacts": contacts, **{k: party.raw[k] for k in ("customer_no", "preferred", "website") if k in party.raw}}})
        new += 1
    say(f"mock mail: {new} firms put into the directory" if new else "mock mail: the directory has the firms already")
    return new


def check(root: Path = ROOT, say=print) -> dict:
    """Build everything without a mail server and read every LV back with the app's own parsers: the
    numbers of what the data holds. Raises MockError where an LV does not come back as it was written."""
    import tempfile

    from boq.parsers import parse_file

    today = date.today()
    parties, mails, lvs = build(root, today)
    for key, lv in lvs.items():
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / lv.filename
            path.write_bytes(lv_file(lv, today))
            read = parse_file(str(path))
        if [i.oz for i in read.items] != [r.oz for r in lv.items]:
            wrong = sorted(set(i.oz for i in read.items) ^ set(r.oz for r in lv.items))[:8]
            raise MockError(f"lv {key} ({lv.format}): {len(lv.items)} items written, {len(read.items)} read back; differ at {wrong}")
        for item, row in zip(read.items, lv.items):
            if (float(item.qty) if item.qty is not None else None) != _number(row.qty) and not (row.qty == "" and lv.format == "d83"):
                raise MockError(f"lv {key}: item {row.oz} has quantity {row.qty!r}, read back {item.qty}")
            if not item.short_text:
                raise MockError(f"lv {key}: item {row.oz} came back without its short text")
            if (float(item.up) if item.up is not None else None) != _number(row.up):
                raise MockError(f"lv {key}: item {row.oz} has unit price {row.up!r}, read back {item.up}")
    out = {"parties": len(parties), "messages": len(mails), "lvs": len(lvs), "items": sum(len(lv.items) for lv in lvs.values()),
           "with_files": sum(1 for m in mails if any(True for _ in m.message.iter_attachments())),
           "first": min(m.at for m in mails).date().isoformat() if mails else "", "last": max(m.at for m in mails).date().isoformat() if mails else ""}
    say(f"mock mail: {out['parties']} parties, {out['messages']} messages ({out['with_files']} with files) from {out['first']} to {out['last']}, "
        f"{out['lvs']} LVs with {out['items']} items; every LV reads back")
    return out


def main(args: list[str]) -> None:
    """boq-mail --fill [--reset]   the mock world into the mailboxes and the directory
    boq-mail --empty            take the mock mail out of the mailboxes again
    boq-mail --check            build it and read every LV back, without a server"""
    try:
        if args[:1] == ["--check"]:
            check()
        elif args[:1] == ["--empty"]:
            empty()
        else:
            fill(reset="--reset" in args)
            try:
                directory()
            except Exception as exc:  # the mail server's own container may not reach the app's database
                print(f"mock mail: the directory was left alone ({type(exc).__name__}: {exc})"[:200])
    except MockError as exc:
        sys.exit(f"mock mail: {exc}")
