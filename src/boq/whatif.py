"""What-if on a priced LV: change unit prices or quantities of a group of items, or drop optional items,
and see what the total does.

The file gives one unit price per item and no split into labour, material and equipment (docs/02-dataset.md,
finding 7). So a "material price" scenario is expressed as: unit prices of the items that match a section
or a word (e.g. "Guss", "Asphalt") change by x %. The result says how many items and how much money the
scenario touched, so the assumption stays visible.

The total that is varied is the bid as it stands (boq.bid.sheet): the unit prices the estimator entered,
with the accepted allowances in them, on an LV that came without prices; the file's own prices where it is
a bid or an award. Items without a price count as nothing, and the result says how many those are. A
quantity the client corrected in an answer is not in the bid (the bid keeps the file's quantity, D-040);
the scenario can count with it, to show what the corrected LV would come to at the same prices.
"""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from boq.model import BoQ, Item

OPTIONAL_KINDS = ("alternative", "contingency")
CENT = Decimal("0.01")


class Adjustment(BaseModel):
    kind: Literal["price", "quantity"]
    percent: float = Field(ge=-100, le=1000)  # +15 means 15 % more
    section: str | None = None  # top-level title number, e.g. "3"; None = whole LV
    keyword: str = ""  # case-insensitive, matched in short and long text; empty = every item

    def matches(self, item: Item) -> bool:
        if self.section and item.oz.split(".")[0] != self.section:
            return False
        return not self.keyword.strip() or self.keyword.strip().lower() in item.text.lower()


class Scenario(BaseModel):
    adjustments: list[Adjustment] = Field(default_factory=list, max_length=20)
    exclude: list[str] = Field(default_factory=list)  # item numbers left out of the total
    answered_quantities: bool = False  # count with the quantities the client corrected in its answers


def what_if(boq: BoQ, scenario: Scenario, bid: dict | None = None) -> dict:
    """`bid`: boq.bid.sheet of the LV; without it the prices of the file alone."""
    sheet = {r["item_oz"]: r for r in (bid or {}).get("rows", [])}
    totals: dict[str, Decimal] = {}  # what each priced item stands at
    from_bid = 0  # items whose figure is the estimator's, not the file's
    for item in boq.items:
        row = sheet.get(item.oz)
        mine = row is not None and row["total"] is not None and (row["source"] != "file" or row["allowance_percent"])
        if mine or (item.total is None and row is not None and row["total"] is not None):
            totals[item.oz] = Decimal(str(row["total"])).quantize(CENT)
            from_bid += mine
        elif item.total is not None:
            totals[item.oz] = item.total
    priced = [i for i in boq.items if i.oz in totals]
    if not priced:
        return {"priced": False}
    excluded = set(scenario.exclude)
    rows, sections, answered = [], {}, []
    touched = [{"items": 0, "value": Decimal(0)} for _ in scenario.adjustments]
    for item in priced:
        total = totals[item.oz]
        factor = Decimal(1)
        for n, adj in enumerate(scenario.adjustments):
            if adj.matches(item):
                factor *= 1 + Decimal(str(adj.percent)) / 100
                touched[n]["items"] += 1
                touched[n]["value"] += total
        new_qty = (sheet.get(item.oz) or {}).get("qty_answered")
        if new_qty is not None and item.qty:
            share = Decimal(str(new_qty)) / item.qty
            answered.append({"item_oz": item.oz, "label": item.label, "unit": item.unit_raw or item.unit,
                             "qty": float(item.qty), "qty_answered": float(new_qty), "total": float(total),
                             "delta": float((total * share).quantize(CENT) - total)})
            if scenario.answered_quantities:
                factor *= share
        after = Decimal(0) if item.oz in excluded else (total * factor).quantize(CENT)
        key = item.oz.split(".")[0]
        s = sections.setdefault(key, {"key": key, "title": item.path[0] if item.path else "",
                                      "before": Decimal(0), "after": Decimal(0)})
        s["before"] += total
        s["after"] += after
        if after != total:
            rows.append({"item_oz": item.oz, "label": item.label, "before": float(total), "after": float(after),
                         "delta": float(after - total), "excluded": item.oz in excluded})
    before = sum(totals.values(), Decimal(0))
    after = sum((s["after"] for s in sections.values()), Decimal(0))
    return {
        "priced": True,
        # whose prices: "bid" as soon as one figure is the estimator's (a price entered, an allowance)
        "basis": "bid" if from_bid else "file",
        "priced_items": len(priced),
        # items with a quantity and no price: they count as nothing, so the total is short by them
        "unpriced_items": sum(1 for i in boq.items if i.oz not in totals and i.qty is not None),
        "allowances": float((bid or {}).get("allowances", 0)),
        "answered_quantities": scenario.answered_quantities,
        "answered": answered,
        # corrected quantities on items that have no price yet: they cannot move the total
        "answered_unpriced": sum(1 for r in sheet.values()
                                 if r.get("qty_answered") is not None and r["item_oz"] not in totals),
        "before": float(before), "after": float(after), "delta": float(after - before),
        "delta_percent": float((after - before) / before * 100) if before else 0.0,
        "changed_items": len(rows),
        "adjustments": [{**adj.model_dump(), "items": t["items"], "value": float(t["value"])}
                        for adj, t in zip(scenario.adjustments, touched)],
        # VOB/B §2 Abs. 3: beyond 10 % the unit price itself is renegotiated, so a straight line is a first guess.
        "quantity_beyond_10_percent": any(a.kind == "quantity" and abs(a.percent) > 10 for a in scenario.adjustments),
        "sections": [{**s, "before": float(s["before"]), "after": float(s["after"]),
                      "delta": float(s["after"] - s["before"])} for s in sections.values()],
        "top_items": sorted(rows, key=lambda r: -abs(r["delta"]))[:15],
        "optional_items": [{"item_oz": i.oz, "label": i.label, "kind": i.kind, "total": float(totals[i.oz]),
                            "excluded": i.oz in excluded} for i in priced if i.kind in OPTIONAL_KINDS and totals[i.oz]],
    }
