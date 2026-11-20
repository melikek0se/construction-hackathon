"""Per-item rule checks: arithmetic, structure, dimensions, references, wording."""
import re
from decimal import Decimal

from boq.model import BoQ, Finding, Item

_CENT = Decimal("0.011")
_DN = re.compile(r"\bDN\s*(\d{2,4})\b(?!\s*[-–/]\s*\d)")  # single sizes only, not "DN300-400"
_TOKEN = re.compile(r"\[?[A-Z]{3,}_?\d{2,}\]?")  # anonymiser placeholders

# Phrases that move cost or risk to the contractor. Kept short on purpose: "ca.", "komplett" and
# similar hit hundreds of harmless items (docs/03-domain-primer.md, "Red-flag wording").
_WORDING = [
    (r"(ohne|keine)\s+(gesonderte|besondere|zusätzliche)\s+vergütung|nicht\s+(gesondert|besonders)\s+vergütet",
     "work without separate payment"),
    (r"(sind|ist)\s+(in\s+(den|die)\s+(EP|einheitspreis\w*)\s+)?ein(zu)?kalkulier\w*|einzurechnen",
     "cost to be priced into the unit price"),
    (r"nach\s+wahl\s+des\s+(AG|auftraggebers)", "choice left to the client"),
    (r"nach\s+(angabe|weisung|anweisung)\s+der\s+(bauleitung|bauüberwachung)", "scope set later by site management"),
    (r"nach\s+erfordernis|soweit\s+erforderlich|je\s+nach\s+bedarf", "scope 'as required'"),
]


def _dn(text: str) -> set[str]:
    return set(_DN.findall(_TOKEN.sub(" ", text)))


def _arithmetic(item: Item) -> Finding | None:
    if item.up is None or item.total is None or item.qty is None:
        return None
    expected = item.up * item.qty
    if abs(expected - item.total) < _CENT:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-ARITHMETIC", severity="high",
        evidence=f"{item.qty.normalize():f} {item.unit_raw} × {item.up} = {expected:.2f}, stated total {item.total}",
        explanation="Unit price times quantity does not equal the item total.",
        action="fix_typo", money_at_stake=abs(expected - item.total),
    )


def _quantity(item: Item, boq: BoQ) -> Finding | None:
    if item.qty is None:
        if boq.phase == "84" and not item.unit_raw:
            return None  # price-only bid file: quantities live in the tender file
        return Finding(item_oz=item.oz, category="error", check_id="R-QTY-MISSING", severity="high",
                       evidence=f"„{item.label[:90]}“", explanation="The item has no quantity.",
                       action="ask_client")
    if item.qty == 0:
        return Finding(
            item_oz=item.oz, category="quantity", check_id="R-QTY-ZERO", severity="warn",
            evidence=f"„{item.label[:90]}“ — quantity 0 {item.unit_raw}",
            explanation="Quantity is zero, so the item is not in the total although it carries a description"
                        + (f" and a unit price of {item.up}" if item.up else "")
                        + ". Typical for optional or alternative offers; the executed quantity is open.",
            action="note_for_claims",
        )
    return None


def _unit(item: Item) -> Finding | None:
    if item.unit or not item.unit_raw:
        return None
    return Finding(item_oz=item.oz, category="error", check_id="R-UNIT-UNKNOWN", severity="info",
                   evidence=f"unit „{item.unit_raw}“ in „{item.label[:70]}“",
                   explanation="Unit is not a known unit of measure; check for a typo before pricing.",
                   action="ask_client")


def _dimension(item: Item) -> Finding | None:
    short, long = _dn(item.short_text), _dn(item.long_text)
    if not short or not long or short & long:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-DIM-MISMATCH", severity="high",
        evidence=f"short text „{item.short_text[:200]}“ vs long text DN {', DN '.join(sorted(long, key=int))}",
        explanation=f"The short text names DN {', '.join(sorted(short, key=int))}, the long text only DN "
                    f"{', '.join(sorted(long, key=int))}. Likely a copied description; the two sizes "
                    f"differ in price, so the client has to say which one is meant.",
        action="ask_client",
    )


def _reference(item: Item, known: set[str]) -> Finding | None:
    broken = [r for r in item.refs if r not in known]
    if not broken:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-REF-BROKEN", severity="high",
        evidence=f"„{item.label[:90]}“ refers to item {', '.join(broken)}",
        explanation="The description is 'as item …, but …' and the referenced item does not exist in "
                    "this LV, so the scope of this item is undefined.",
        action="ask_client",
    )


def _wording(item: Item) -> Finding | None:
    hits, quoted_until = [], -1
    matches = sorted(((m, meaning) for pattern, meaning in _WORDING
                      for m in re.finditer(pattern, item.text, re.I)
                      # "soweit ... nicht gesondert vergütet wird" means the opposite
                      if not re.search(r"\b(soweit|sofern)\b[^.;]{0,50}$", item.text[:m.start()], re.I)),
                     key=lambda x: x[0].start())
    seen = set()
    matches = [(m, meaning) for m, meaning in matches if not (meaning in seen or seen.add(meaning))]
    for m, meaning in matches:
        start, end = max(0, m.start() - 50), min(len(item.text), m.end() + 50)
        quote = " ".join(item.text[start:end].split()) if m.start() > quoted_until else ""
        quoted_until = max(quoted_until, end)
        hits.append((meaning, quote))
    if not hits:
        return None
    return Finding(
        item_oz=item.oz, category="contract_risk", check_id="R-WORDING",
        severity="warn" if len(hits) > 1 or item.kind == "lump_sum" else "info",
        evidence=" | ".join(f"…{quote}…" for _, quote in hits if quote),
        explanation="Wording that shifts cost or scope risk to the contractor: "
                    + ", ".join(dict.fromkeys(m for m, _ in hits)) + ".",
        action="add_surcharge",
    )


def _lump_sum(item: Item) -> Finding | None:
    if item.kind != "lump_sum" or len(item.long_text) < 1500:
        return None
    return Finding(
        item_oz=item.oz, category="unclear_scope", check_id="R-LUMP-SUM-SCOPE", severity="warn",
        evidence=f"„{item.label[:90]}“ — 1 {item.unit_raw}, description of {len(item.long_text)} characters",
        explanation="A large scope is paid as one lump sum. Under VOB/B §2 Abs. 7 the price stays fixed "
                    "when quantities change, so every unstated quantity in this text is the bidder's risk.",
        action="add_surcharge",
    )


def check_items(boq: BoQ) -> list[Finding]:
    known = {i.oz for i in boq.items}
    findings = []
    for item in boq.items:
        for f in (_arithmetic(item), _quantity(item, boq), _unit(item), _dimension(item),
                  _reference(item, known), _wording(item), _lump_sum(item)):
            if f:
                findings.append(f)
    return findings
