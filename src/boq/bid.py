"""The bid: the estimator's unit prices on the client's LV, and the file that goes back.

An LV comes without prices (GAEB phase 83). The bidder fills in a unit price per item and nothing else:
texts and quantities stay the client's (D-040). The sheet here is that work in progress. Per item it shows
the price suggested from past bids (boq.prices, with its sources — a suggestion is never a price until the
estimator takes it), the unit price entered, the risk allowance accepted for the item from an open point
of the client's answers (boq.amendments), and the resulting price and total.

The price that goes into the bid is `unit price × (1 + allowance)`, rounded to cents: a bidder cannot show
a risk as a line of its own in the client's LV, it sits in the unit price. A quantity the client corrected
in an answer is shown beside the file's quantity; totals and the exported file use the file's quantity,
because the bid must match the LV the client sent — the corrected LV has to come from the client.

`as_x84` writes the bid as GAEB DA XML phase 84 from the client's X83: the same file with the phase
changed and <UP> (unit price) and <IT> (item total) put into every priced item. It is checked by reading
it back with the app's own parser; it has not been validated against the GAEB schema or opened in another
GAEB program.
"""
import csv
import io
import re
import xml.etree.ElementTree as ET
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from sqlalchemy import delete, insert, select

from boq import db
from boq.model import BoQ

CENT = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def price_of(text) -> Decimal | None:
    """A unit price as typed: "12,50", "1.250,00", "12.5". None for empty; ValueError for anything else."""
    text = str(text if text is not None else "").replace("€", "").replace("EUR", "").replace(" ", "").strip()
    if not text:
        return None
    if "," in text:  # German: the dot groups thousands
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", text):  # "1.250" is one thousand two hundred fifty
        text = text.replace(".", "")
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError(f"„{text}“ is not a price.") from None
    if value < 0 or value > Decimal("100000000"):
        raise ValueError("A unit price is zero or more.")
    return value.quantize(Decimal("0.001")) if value != _money(value) else _money(value)


# ------------------------------------------------------------------ keeping

def _same(project_id: str | None, file: str):
    same_project = db.bid_prices.c.project_id.is_(None) if project_id is None else db.bid_prices.c.project_id == project_id
    return same_project, db.bid_prices.c.file == file


def entered(project_id: str | None, file: str) -> dict[str, dict]:
    """The unit prices kept for an LV file, by item number: price (decimal text) and where it came from."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.bid_prices).where(*_same(project_id, file))).all()
    return {r.item_oz: {"unit_price": r.unit_price, "source": r.source} for r in rows}


def keep(project_id: str | None, file: str, prices: dict[str, tuple[Decimal | None, str]]) -> None:
    """Set or clear (None) the unit price of items; `source` is "own" or "suggestion"."""
    with db.engine().begin() as conn:
        for oz, (price, source) in prices.items():
            conn.execute(delete(db.bid_prices).where(*_same(project_id, file), db.bid_prices.c.item_oz == oz))
            if price is not None:
                conn.execute(insert(db.bid_prices).values(project_id=project_id, file=file, item_oz=oz,
                                                          unit_price=str(price), source=source, updated=db.now()))


def tally(project_id: str) -> dict | None:
    """How far the bid of a project is, for its card: the items with a unit price entered, counted on the
    LV file that has the most (`priced`: the same LV in two formats is priced once) and over all files
    (`priced_all`: a project of several trade LVs), and how many were taken from past bids. None while no
    price is entered. Counted from the kept prices alone: the net needs the LV read, the bid view has it."""
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.bid_prices.c.file, db.bid_prices.c.source)
                            .where(db.bid_prices.c.project_id == project_id)).all()
    if not rows:
        return None
    per_file: dict[str, int] = {}
    for r in rows:
        per_file[r.file] = per_file.get(r.file, 0) + 1
    return {"priced": max(per_file.values()), "priced_all": len(rows),
            "from_suggestions": sum(1 for r in rows if r.source == "suggestion")}


# ------------------------------------------------------------------ the sheet

def sheet(boq: BoQ, suggestions: dict | None, amendments: list[dict], kept: dict[str, dict]) -> dict:
    """The bid as it stands: one row per item, and the sums.

    `suggestions`: boq.prices.suggest_prices for the LV, or None. `amendments`: of this file; only the
    accepted ones count. An item of the LV that carries a price already (a bid file) is shown with it."""
    suggested = {s["item_oz"]: s for s in (suggestions or {}).get("suggestions", [])}
    accepted = [a for a in amendments if a["status"] == "accepted"]
    rows, net, allowance_sum, missing, corrected = [], Decimal(0), Decimal(0), 0, 0
    for item in boq.items:
        mine = kept.get(item.oz)
        base = Decimal(mine["unit_price"]) if mine else item.up
        percent = sum((Decimal(str(a["value"]["percent"])) for a in accepted
                       if a["kind"] == "allowance" and a["item_oz"] == item.oz), Decimal(0))
        new_qty = next((a["value"].get("number") for a in reversed(accepted)
                        if a["kind"] == "quantity" and a["item_oz"] == item.oz), None)
        price = _money(base * (1 + percent / 100)) if base is not None else None
        total = _money(price * item.qty) if price is not None and item.qty is not None else None
        s = suggested.get(item.oz)
        if total is not None:
            net += total
            allowance_sum += total - _money(base * item.qty)
        elif item.qty is not None:
            missing += 1
        corrected += new_qty is not None
        rows.append({
            "item_oz": item.oz, "label": item.label, "section": item.path[0] if item.path else "",
            "qty": float(item.qty) if item.qty is not None else None, "unit": item.unit_raw or item.unit,
            "kind": item.kind,
            # the quantity the client gave in an answer; the file, and so the bid, still has `qty`
            "qty_answered": float(new_qty) if new_qty is not None else None,
            "suggestion": {"unit_price": s["unit_price"], "low": s["low"], "high": s["high"],
                           "confidence": s["confidence"], "sources": len(s["matches"]),
                           # "partners": the price book (quotes of other tenders); "past bids": learned from old bids
                           "basis": s.get("basis") or "past bids", "stale": bool(s.get("stale"))}
            if s and s["unit_price"] is not None else None,
            # a supplier's earlier price for the material: beside the unit price, never in its place
            "material": s.get("material") if s else None,
            "unit_price": float(base) if base is not None else None,
            "source": mine["source"] if mine else ("file" if item.up is not None else None),
            "allowance_percent": float(percent) if percent else None,
            "price": float(price) if price is not None else None,  # what goes into the bid
            "total": float(total) if total is not None else None,
        })
    return {"rows": rows, "items": len(rows), "priced": len(rows) - missing, "missing": missing,
            "net": float(net), "allowances": float(allowance_sum), "corrected_quantities": corrected,
            "from_suggestions": sum(1 for r in rows if r["source"] == "suggestion")}


# ------------------------------------------------------------------ the files that go out

def as_csv(boq: BoQ, bid: dict) -> bytes:
    """The price sheet for a spreadsheet: semicolons and decimal commas, as German Excel reads them."""
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";", lineterminator="\r\n")
    writer.writerow(["OZ", "Kurztext", "Menge", "Einheit", "EP", "GP"])

    def de(value) -> str:
        return "" if value is None else f"{value:.2f}".replace(".", ",")

    for row in bid["rows"]:
        qty = "" if row["qty"] is None else f"{row['qty']:.3f}".rstrip("0").rstrip(".").replace(".", ",")
        writer.writerow([row["item_oz"], row["label"], qty, row["unit"], de(row["price"]), de(row["total"])])
    writer.writerow(["", "Summe netto", "", "", "", de(bid["net"])])
    return ("﻿" + out.getvalue()).encode("utf-8")  # the mark makes Excel read UTF-8


def _local(el) -> str:
    return el.tag.rsplit("}", 1)[-1]


def as_x84(source: bytes, bid: dict) -> bytes:
    """The client's GAEB XML file as a bid (phase 84): unit price and total in every priced item, everything
    else as it came. Raises ValueError for a file that is not GAEB DA XML."""
    head = source[:2000].decode("utf-8", "replace")
    found = re.search(r'xmlns="(http://www\.gaeb\.de/GAEB_DA_XML/)(?:DA)?8\d(/[\d.]+)"', head)
    if found is None:
        raise ValueError("The bid can be written as X84 only from a GAEB XML file (X83).")
    old, new = found.group(0), f'xmlns="{found.group(1)}DA84{found.group(2)}"'
    ET.register_namespace("", new[7:-1])
    root = ET.fromstring(source.replace(old.encode(), new.encode(), 1))
    ns = root.tag.split("}")[0] + "}"
    prices = {r["item_oz"]: r for r in bid["rows"] if r["price"] is not None}
    from boq.parsers.common import norm_oz  # the item numbers as the sheet has them

    def walk(body, parts):
        for el in body:
            name = _local(el)
            if name == "BoQCtgy":
                inner = next((c for c in el if _local(c) == "BoQBody"), None)
                if inner is not None:
                    walk(inner, parts + [el.get("RNoPart", "")])
            elif name == "Itemlist":
                for item in el:
                    if _local(item) == "Item":
                        price(item, norm_oz(parts + [item.get("RNoPart", ""), item.get("RNoIndex", "")]))

    def price(item, oz):
        row = prices.get(oz)
        for old_el in [c for c in item if _local(c) in ("UP", "IT")]:
            item.remove(old_el)
        if row is None:
            return
        children = list(item)
        # after the unit (or the quantity), before the description: where a GAEB bid carries its prices
        after = max((n for n, c in enumerate(children) if _local(c) in ("Qty", "QU", "PredQty", "QtyTBD")), default=-1)
        up, it = ET.Element(f"{ns}UP"), ET.Element(f"{ns}IT")
        up.text = f"{row['price']:.2f}"
        up.tail = it.tail = children[after].tail if after >= 0 else item.text
        item.insert(after + 1, up)
        if row["total"] is not None:
            it.text = f"{row['total']:.2f}"
            item.insert(after + 2, it)

    for el in root.iter():
        if _local(el) == "DP":
            el.text = "84"
        elif _local(el) == "BoQ":
            body = next((c for c in el if _local(c) == "BoQBody"), None)
            if body is not None:
                walk(body, [])
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")
