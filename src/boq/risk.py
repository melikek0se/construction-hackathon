"""How sure the bid's prices are, and what that is worth as a risk allowance.

A flat "add 5 % to be safe" is what everyone does (docs/04-field-insights.md, point 1). Here the buffer
follows where each price comes from: a supplier's quote that is binding and valid through the binding period
needs almost none, a price taken from an old bid needs more, an item priced although a question to the
client is still open needs the most. Every priced item gets a band from its basis (`BANDS`, rules of thumb
set here and shown with the result, not measured), the bid total is run through a simple simulation over
those bands, and the allowance proposed is what covers the total in four cases out of five (P80). The items
that cause most of it are listed: confirming their prices is what brings the allowance down.

The simulation is seeded, so the same bid gives the same numbers. Costs overrun more often and further than
they underrun: an item's price is drawn between half its band below and its whole band above.
"""
import random

# per cent the price of an item may be off by, by what it rests on
BANDS = {
    "quote": (2.0, "a supplier's quote, valid and not marked non-binding"),
    "quote_soft": (6.0, "a quote that is not binding, or runs out before the bid stops binding"),
    "quote_other": (8.0, "a quote for another product than tendered"),
    "own": (5.0, "typed in, no source on record"),
    "book": (8.0, "a partner's quote for the same thing in another tender, still valid"),
    "book_stale": (15.0, "a partner's quote from another tender that is out of date"),
    "history": (12.0, "taken from past bids"),
    "file": (0.0, "the price in the file"),
    "open_question": (20.0, "priced although a question to the client is open"),
}
DRAWS = 4000


def assess(rows: list[dict], sources: dict[str, dict], binding_until: str | None) -> dict:
    """`rows`: the bid sheet (boq.bid.sheet). `sources`: per item where its price comes from as the price
    inquiries have it (boq.supply.item_prices), {} where none are planned."""
    items, gaps = [], 0
    for row in rows:
        if row["price"] is None or row["qty"] is None:
            gaps += row["qty"] is not None
            continue
        value = row["price"] * row["qty"]
        src = sources.get(row["item_oz"]) or {}
        basis = "own"
        if row["source"] == "file":
            basis = "file"
        elif row["source"] == "suggestion":
            basis = "history"
            if (row.get("suggestion") or {}).get("basis") == "partners":
                basis = "book_stale" if row["suggestion"].get("stale") else "book"
        elif row["source"] == "quote" or (src.get("status") == "quoted" and src.get("taken")):
            soft = bool(src.get("valid_until") and binding_until and src["valid_until"] < binding_until)
            basis = "quote_other" if src.get("alternative") else "quote_soft" if soft else "quote"
        band = BANDS[basis][0]
        if basis == "history" and row.get("suggestion") and row["suggestion"]["low"] is not None and row["suggestion"]["unit_price"]:
            s = row["suggestion"]  # the spread of the past prices it was taken from, where that is wider
            band = max(band, round((s["high"] - s["low"]) / 2 / s["unit_price"] * 100, 1))
        why = BANDS[basis][1]
        if src.get("status") == "waits" and basis != "file":
            basis, band, why = "open_question", max(band, BANDS["open_question"][0]), BANDS["open_question"][1]
        items.append({"oz": row["item_oz"], "label": row["label"], "value": round(value, 2), "basis": basis,
                      "band": band, "why": why, "exposure": round(value * band / 100, 2)})
    total = sum(i["value"] for i in items)
    if not items or total <= 0:
        return {"priced": len(items), "gaps": gaps, "total": 0.0, "p50": 0.0, "p80": 0.0, "allowance": 0.0,
                "allowance_percent": 0.0, "by_basis": [], "top": [], "bands": {k: v[0] for k, v in BANDS.items()}}
    rng, sums = random.Random(7), []
    for _ in range(DRAWS):
        sums.append(sum(i["value"] * (1 + rng.triangular(-i["band"] / 200, i["band"] / 100, 0)) for i in items))
    sums.sort()
    p50, p80 = sums[DRAWS // 2], sums[int(DRAWS * 0.8)]
    by_basis = []
    for key, (_, label) in BANDS.items():
        mine = [i for i in items if i["basis"] == key]
        if mine:
            by_basis.append({"basis": key, "label": label, "items": len(mine), "value": round(sum(i["value"] for i in mine), 2),
                             "exposure": round(sum(i["exposure"] for i in mine), 2)})
    allowance = max(0.0, p80 - total)
    return {"priced": len(items), "gaps": gaps, "total": round(total, 2), "p50": round(p50, 2), "p80": round(p80, 2),
            "allowance": round(allowance, 2), "allowance_percent": round(allowance / total * 100, 1),
            "by_basis": by_basis, "top": sorted((i for i in items if i["exposure"] > 0), key=lambda i: -i["exposure"])[:8],
            "bands": {k: v[0] for k, v in BANDS.items()}}
