"""LVs kept as a spreadsheet (.xlsx, .xls).

There is no standard layout, so the parser looks for the header row: the first row that names an item
number column and at least a quantity or a description column, under any of the usual German headings
("OZ", "Pos.", "Kurztext", "Menge", "ME", "Einheitspreis (EUR)", …). Below it, a row with an item number
and a quantity is an item; a row with a number and no quantity is a title.
"""
import os
import re
from decimal import Decimal, InvalidOperation

from boq.model import BoQ, Item, Remark, SourceRef
from boq.parsers.common import classify, find_refs, norm_oz, tidy
from boq.units import LUMP_SUM, normalise_unit

# column -> headings that name it, compared after lower-casing and dropping everything but letters
_COLUMNS = {
    "oz": ["oz", "pos", "posnr", "position", "positionsnr", "positionsnummer", "positionskennung", "ordnungszahl", "nr", "lfdnr"],
    "short": ["kurztext", "kurzbezeichnung", "bezeichnung", "leistungsbeschreibung", "beschreibung", "leistung", "text"],
    "long": ["langtext", "langtextleistungsbeschreibung", "leistungsbeschreibunglangtext"],
    "qty": ["menge", "anzahl"],
    "unit": ["me", "einheit", "einh", "mengeneinheit"],
    "up": ["einheitspreis", "ep", "einzelpreis", "epeur", "einheitspreiseur", "einzelpreiseur"],
    "total": ["gesamtpreis", "gp", "gesamt", "gesamtbetrag", "positionsbetrag", "gpeur", "gesamtpreiseur", "positionsbetrageur"],
    "kind": ["posart", "art", "positionsart"],
}
_OZ = re.compile(r"^\d{1,4}(?:\.\d{1,4}){0,5}\.?$")
_TITLE = re.compile(r"^\s*(\d{1,3}(?:\.\d{1,3})*)\.?\s+(\S.*)$")  # "1   BAUSTELLENEINRICHTUNG" in one cell


def _key(heading) -> str:
    text = str(heading or "").split("\n")[0].split("(")[0]  # "Einheitspreis\n(EUR, netto)" -> "Einheitspreis"
    return re.sub(r"[^a-zäöü]", "", text.lower())


def _rows(path: str) -> list[tuple[str, list[list]]]:
    """(sheet name, rows of cell values) per sheet; formulas arrive as their last calculated value."""
    if path.lower().endswith(".xls"):
        import xlrd
        book = xlrd.open_workbook(path)
        return [(s.name, [[c.value if c.value != "" else None for c in s.row(i)] for i in range(s.nrows)])
                for s in book.sheets()]
    import openpyxl
    book = openpyxl.load_workbook(path, data_only=True, read_only=True)
    return [(ws.title, [[_shown(c) for c in r] for r in ws.iter_rows()]) for ws in book]


def _shown(cell):
    """Cell value; a decimal number with a fixed-decimals format becomes the text Excel shows, so that an
    item number 1.10 stored as the number 1.1 with format "0.00" is not read as 1.1."""
    value = getattr(cell, "value", None)
    fmt = getattr(cell, "number_format", "") or ""
    m = re.fullmatch(r"0\.(0+)", fmt)
    if isinstance(value, float) and m:
        return _Shown(value, f"{value:.{len(m.group(1))}f}")
    return value


class _Shown(float):
    """A float that remembers how Excel displays it; behaves as the number everywhere else."""
    def __new__(cls, value: float, text: str):
        obj = super().__new__(cls, value)
        obj.text = text
        return obj


def _header(rows: list[list]) -> tuple[int, dict[str, int]] | None:
    for n, row in enumerate(rows[:60]):
        columns: dict[str, int] = {}
        for i, cell in enumerate(row):
            key = _key(cell)
            if not key:
                continue
            for name, headings in _COLUMNS.items():
                if key in headings and name not in columns:
                    columns[name] = i
                    break
        if "oz" in columns and ("qty" in columns or "short" in columns) and len(columns) >= 3:
            return n, columns
    return None


def _decimal(value) -> Decimal | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(round(value, 6))).normalize() + 0  # 833.0000000000001 is a float artefact
    text = str(value).strip().replace("€", "").replace("EUR", "").strip()
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})*(,\d+)?|-?\d+,\d+", text):  # German: 1.234,56
        text = text.replace(".", "").replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _oz(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, _Shown):
        text = value.text
    elif isinstance(value, float) and value.is_integer():
        text = str(int(value))
    else:
        text = str(value).strip()
    return text if _OZ.match(text) else None


def parse_excel(path: str) -> BoQ:
    boq = BoQ(file=os.path.basename(path), format="excel", name=os.path.splitext(os.path.basename(path))[0])
    for sheet, rows in _rows(path):
        found = _header(rows)
        if found is None:
            continue
        start, col = found

        def cell(row, name):
            i = col.get(name)
            return row[i] if i is not None and i < len(row) else None

        # Above the header: "Projekt / BV | Umbau Verwaltungsgebäude" and the like. Kept as a remark.
        head = tidy("\n".join(" ".join(str(c) for c in r if c is not None) for r in rows[:start]))
        if head:
            boq.remarks.append(Remark(text=head))
        titles: dict[str, str] = {}
        seen: set[str] = set()
        for n, row in enumerate(rows[start + 1:], start + 2):
            if not any(c is not None and str(c).strip() for c in row):
                continue
            oz, qty = _oz(cell(row, "oz")), _decimal(cell(row, "qty"))
            short = str(cell(row, "short") or "").strip()
            if oz is None:
                first = next((str(c) for c in row if c is not None and str(c).strip()), "")
                m = _TITLE.match(first)
                if m and qty is None:  # a title written into one merged cell
                    titles[norm_oz(m.group(1).split("."))] = m.group(2).strip()
                continue
            numeric = isinstance(cell(row, "oz"), float) and not isinstance(cell(row, "oz"), _Shown)
            oz = norm_oz(oz.split("."))
            if numeric and oz in seen and f"{oz}0" not in seen:
                oz = f"{oz}0"  # the number 1.1 after 1.9 is item 1.10: Excel dropped the trailing zero
            unit_raw = str(cell(row, "unit") or "").strip()
            up, total = _decimal(cell(row, "up")), _decimal(cell(row, "total"))
            if qty is None:
                if normalise_unit(unit_raw) == LUMP_SUM:
                    qty = Decimal(1)  # "psch" with the quantity cell left empty: one lump sum
                elif not unit_raw and up is None and total is None:
                    if short:
                        titles[oz] = short
                    continue
                # otherwise an item without a quantity: kept, so the missing-quantity check reports it
            seen.add(oz)
            parts = oz.split(".")
            if total is None and up is not None and qty is not None:  # a formula that was never calculated: the file has no value
                total = (up * qty).quantize(Decimal("0.01"))
            item = Item(
                oz=oz, path=[titles[p] for i in range(1, len(parts)) if (p := ".".join(parts[:i])) in titles],
                short_text=short, long_text=tidy(str(cell(row, "long") or "")),
                qty=qty, unit_raw=unit_raw, unit=normalise_unit(unit_raw), up=up, total=total,
                source=SourceRef(file=boq.file, line=n),
            )
            item.refs = find_refs(item.text)
            kind = str(cell(row, "kind") or "").lower()
            item.kind = classify(item, alternative=bool(re.search(r"alternativ|wahl", kind)),
                                 contingency=bool(re.search(r"eventual|bedarf", kind)))
            boq.items.append(item)
        if boq.items:
            break  # the first sheet with items is the LV; later sheets are summaries
    boq.phase = "84" if any(i.total is not None for i in boq.items) else "83"
    return boq
