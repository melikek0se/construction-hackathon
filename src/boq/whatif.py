"""What-if on a priced LV: change unit prices or quantities of a group of items, or drop optional items,
and see what the total does.

The file gives one unit price per item and no split into labour, material and equipment (docs/02-dataset.md,
finding 7). So a "material price" scenario is expressed as: unit prices of the items that match a section
or a word (e.g. "Guss", "Asphalt") change by x %. The result says how many items and how much money the
scenario touched, so the assumption stays visible.
"""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from boq.model import BoQ, Item

OPTIONAL_KINDS = ("alternative", "contingency")


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


def what_if(boq: BoQ, scenario: Scenario) -> dict:
    priced = [i for i in boq.items if i.total is not None]
    if not priced:
        return {"priced": False}
    excluded = set(scenario.exclude)
    rows, sections = [], {}
    touched = [{"items": 0, "value": Decimal(0)} for _ in scenario.adjustments]
    for item in priced:
        factor = Decimal(1)
        for n, adj in enumerate(scenario.adjustments):
            if adj.matches(item):
                factor *= 1 + Decimal(str(adj.percent)) / 100
                touched[n]["items"] += 1
                touched[n]["value"] += item.total
        after = Decimal(0) if item.oz in excluded else (item.total * factor).quantize(Decimal("0.01"))
        key = item.oz.split(".")[0]
        s = sections.setdefault(key, {"key": key, "title": item.path[0] if item.path else "",
                                      "before": Decimal(0), "after": Decimal(0)})
        s["before"] += item.total
        s["after"] += after
        if after != item.total:
            rows.append({"item_oz": item.oz, "label": item.label, "before": float(item.total), "after": float(after),
                         "delta": float(after - item.total), "excluded": item.oz in excluded})
    before = sum((i.total for i in priced), Decimal(0))
    after = sum((s["after"] for s in sections.values()), Decimal(0))
    return {
        "priced": True,
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
        "optional_items": [{"item_oz": i.oz, "label": i.label, "kind": i.kind, "total": float(i.total),
                            "excluded": i.oz in excluded} for i in priced if i.kind in OPTIONAL_KINDS and i.total],
    }
