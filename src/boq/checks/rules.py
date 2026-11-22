"""Per-item rule checks: arithmetic, structure, dimensions, references, wording."""
import re
from decimal import Decimal

from boq.model import BoQ, Finding, Item

_CENT = Decimal("0.011")
_DN = re.compile(r"\bDN\s*(\d{2,4})\b(?!\s*[-–/]\s*\d)")  # single sizes only, not "DN300-400"
_TOKEN = re.compile(r"\[?[A-Z]{3,}_?\d{2,}\]?")  # anonymiser placeholders

_NO_PAY = "work without separate payment"
# Phrases that move cost or risk to the contractor. Kept short on purpose: "ca.", "komplett" and
# similar hit hundreds of harmless items (docs/03-domain-primer.md, "Red-flag wording").
_WORDING = [
    (r"(ohne|keine)\s+(gesonderte|besondere|zusätzliche)\s+vergütung|nicht\s+(gesondert|besonders)\s+vergütet",
     _NO_PAY),
    (r"(sind|ist)\s+(in\s+(den|die)\s+(EP|einheitspreis\w*)\s+)?ein(zu)?kalkulier\w*|einzurechnen",
     "cost to be priced into the unit price"),
    (r"nach\s+wahl\s+des\s+(AG|auftraggebers)", "choice left to the client"),
    (r"nach\s+(angabe|weisung|anweisung)\s+der\s+(bauleitung|bauüberwachung)", "scope set later by site management"),
    (r"nach\s+erfordernis|soweit\s+erforderlich|je\s+nach\s+bedarf", "scope 'as required'"),
]


# "Futterrohr DN 200" for a DN 100 pipe: the size of the sleeve or core drilling around the item, not its own
_SLEEVE_DN = re.compile(r"\b\w*(futterrohr|mantelrohr|schutzrohr|hüllrohr|kernbohrung)\w*[^.\n]{0,25}?\bDN\s*\d{2,4}", re.I)


def _dn(text: str) -> set[str]:
    return set(_DN.findall(_SLEEVE_DN.sub(" ", _TOKEN.sub(" ", text))))


def _arithmetic(item: Item) -> Finding | None:
    if item.up is None or item.total is None or item.qty is None:
        return None
    expected = item.up * item.qty
    if abs(expected - item.total) < _CENT:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-ARITHMETIC", severity="high",
        title="Total does not equal unit price × quantity",
        evidence=f"{item.qty.normalize():f} {item.unit_raw} × {item.up} = {expected:.2f}, stated total {item.total}",
        explanation="Unit price times quantity does not equal the item total.",
        action="fix_typo", money_at_stake=abs(expected - item.total),
    )


def _quantity(item: Item, boq: BoQ) -> Finding | None:
    if item.qty is None:
        if boq.phase == "84" and not item.unit_raw:
            return None  # price-only bid file: quantities live in the tender file
        return Finding(item_oz=item.oz, category="error", check_id="R-QTY-MISSING", severity="high",
                       title="Item has no quantity",
                       evidence=f"„{item.label[:90]}“", explanation="The item has no quantity.",
                       action="ask_client",
                       question_de="Für diese Position ist keine Menge angegeben. Welche Menge ist anzusetzen?")
    if item.qty == 0:
        return Finding(
            item_oz=item.oz, category="quantity", check_id="R-QTY-ZERO", severity="warn",
            title="Quantity is zero",
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
                   title="Unknown unit",
                   evidence=f"unit „{item.unit_raw}“ in „{item.label[:70]}“",
                   explanation="Unit is not a known unit of measure; check for a typo before pricing.",
                   action="ask_client",
                   question_de=f"Die Abrechnungseinheit „{item.unit_raw}“ ist uns nicht geläufig. "
                               f"Welche Einheit ist gemeint?")


def _dimension(item: Item) -> Finding | None:
    short, long = _dn(item.short_text), _dn(item.long_text)
    if not short or not long or short & long:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-DIM-MISMATCH", severity="high",
        title="Short text and long text name different pipe sizes",
        evidence=f"short text „{item.short_text[:200]}“ vs long text DN {', DN '.join(sorted(long, key=int))}",
        explanation=f"The short text names DN {', '.join(sorted(short, key=int))}, the long text only DN "
                    f"{', '.join(sorted(long, key=int))}. Likely a copied description; the two sizes "
                    f"differ in price, so the client has to say which one is meant.",
        action="ask_client",
        question_de=f"Der Kurztext nennt DN {', '.join(sorted(short, key=int))}, der Langtext dagegen DN "
                    f"{', '.join(sorted(long, key=int))}. Welche Nennweite ist auszuführen und zu kalkulieren?",
    )


def _reference(item: Item, known: set[str]) -> Finding | None:
    broken = [r for r in item.refs if r not in known]
    if not broken:
        return None
    return Finding(
        item_oz=item.oz, category="error", check_id="R-REF-BROKEN", severity="high",
        title="Refers to an item that does not exist",
        evidence=f"„{item.label[:90]}“ refers to item {', '.join(broken)}",
        explanation="The description is 'as item …, but …' and the referenced item does not exist in "
                    "this LV, so the scope of this item is undefined.",
        action="ask_client",
        question_de=f"Die Leistungsbeschreibung verweist auf Position {', '.join(broken)}, die im "
                    f"Leistungsverzeichnis nicht enthalten ist. Auf welche Position bezieht sich der Verweis?",
    )


def _shifts(text: str) -> list[tuple[re.Match, str]]:
    """Every phrase of `_WORDING` in a text, in reading order, with what it means."""
    return sorted(((m, meaning) for pattern, meaning in _WORDING
                   for m in re.finditer(pattern, text, re.I)
                   # "soweit ... nicht gesondert vergütet wird" means the opposite. Only there: "soweit
                   # nicht separat ausgeschrieben, sind … einzukalkulieren" is exactly the risk shift.
                   if not (meaning == _NO_PAY and
                           re.search(r"\b(soweit|sofern)\b[^.;]{0,50}$", text[:m.start()], re.I))),
                  key=lambda x: x[0].start())


def _wording(item: Item) -> Finding | None:
    hits, quoted_until = [], -1
    matches = _shifts(item.text)
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
        title="Wording shifts cost or scope to the bidder",
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
        title="Large scope behind one lump sum",
        evidence=f"„{item.label[:90]}“ — 1 {item.unit_raw}, description of {len(item.long_text)} characters",
        explanation="A large scope is paid as one lump sum. Under VOB/B §2 Abs. 7 the price stays fixed "
                    "when quantities change, so every unstated quantity in this text is the bidder's risk.",
        action="add_surcharge",
    )


def _zero_group(zeros: list[Finding], by_oz: dict[str, Item]) -> Finding:
    """Many zero quantities are one fact about the LV (bidder-added offers, or an inquiry that leaves the
    quantities open), not one warning per item."""
    items = [by_oz[f.item_oz] for f in zeros]
    shown = "; ".join(f"{i.oz} „{i.label[:50]}“" for i in items[:5])
    priced = sum(1 for i in items if i.up)
    return Finding(
        item_oz=items[0].oz, related_oz=[i.oz for i in items[1:]], category="quantity", check_id="R-QTY-ZERO",
        severity="warn", title=f"{len(items)} items have quantity zero",
        evidence=shown + (f" (+{len(items) - 5} more)" if len(items) > 5 else ""),
        explanation=f"{len(items)} items carry a description but quantity 0, so they are not in the total"
                    + (f"; {priced} of them have a unit price" if priced else "")
                    + ". Typical for optional offers or open quantities; the executed quantity is open.",
        action="note_for_claims",
    )


def _each(boq: BoQ, rule) -> list[Finding]:
    return [f for item in boq.items if (f := rule(item))]


# One function per check, each over the whole LV. boq.pipeline lists them as its steps; nothing else calls
# the rules one by one.

def arithmetic(boq: BoQ) -> list[Finding]:
    return _each(boq, _arithmetic)


def quantities(boq: BoQ) -> list[Finding]:
    """Missing and zero quantities; more than three zero items are one finding, not a list of them."""
    found = _each(boq, lambda item: _quantity(item, boq))
    zeros = [f for f in found if f.check_id == "R-QTY-ZERO"]
    if len(zeros) > 3:
        zeros = [_zero_group(zeros, {i.oz: i for i in boq.items})]
    return [f for f in found if f.check_id != "R-QTY-ZERO"] + zeros


def units(boq: BoQ) -> list[Finding]:
    return _each(boq, _unit)


def dimensions(boq: BoQ) -> list[Finding]:
    return _each(boq, _dimension)


def references(boq: BoQ) -> list[Finding]:
    known = {i.oz for i in boq.items}
    return _each(boq, lambda item: _reference(item, known))


def wording(boq: BoQ) -> list[Finding]:
    return _each(boq, _wording)


def _sentence(text: str, start: int, end: int) -> str:
    """The sentence around a match in a text that is on one line; a long one is cut to the words around it."""
    a = start
    while a > 0 and start - a < 30:  # "… o. ä. sind einzurechnen": a stop that near is an abbreviation
        a = max(text.rfind(". ", 0, a - 2), text.rfind(": ", 0, a - 2)) + 2 if a > 2 else 0
        a = 0 if a < 2 else a
    b = text.find(". ", end)
    b = len(text) if b < 0 else b + 1
    if b - a > 280:  # cut at a space, so the quote stays a run of whole words of the LV
        if start - a > 120:
            a = text.find(" ", start - 120) + 1
        if b - end > 120:
            b = text.rfind(" ", 0, end + 120)
    return text[a:b].strip()


def remarks(boq: BoQ) -> list[Finding]:
    """The same wording in the preliminary remarks and in the notes between items. There it is worse than in
    an item: it holds for every item under that title, and no item says so. One finding per remark block;
    a block the LV repeats under several titles is reported where it stands first."""
    out, seen = [], set()
    for remark in boq.remarks:
        text = " ".join(remark.text.split())  # as the quotes of the AI review: found again whatever the line breaks
        matches = _shifts(text)
        if not matches:
            continue
        quotes, meanings = [], []
        for m, meaning in matches:
            quote = _sentence(text, m.start(), m.end())
            if quote not in quotes:
                quotes.append(quote)
            if meaning not in meanings:
                meanings.append(meaning)
        key = " | ".join(quotes)
        if key in seen:
            continue
        seen.add(key)
        depth = len(remark.path)
        covered = [i for i in boq.items if i.path[:depth] == remark.path]
        where = f"under „{' / '.join(remark.path)}“" if remark.path else "of the LV"
        value = sum((i.total for i in covered if i.total), Decimal(0))
        hard = any(m in (_NO_PAY, "cost to be priced into the unit price") for m in meanings)
        out.append(Finding(
            item_oz=None, category="contract_risk", check_id="R-REMARK-WORDING",
            title="Remark puts cost into the unit prices" if hard else "Remark leaves scope open",
            severity="warn" if hard and len(covered) > 1 else "info",
            evidence=" | ".join(f"„{q}“" for q in quotes[:3]),
            explanation=f"Stands in the remarks, not in an item: it holds for the {len(covered)} items {where}"
                        + (f" (together {value:,.2f} EUR in this file)" if value else "")
                        + ", and none of them says so. " + ", ".join(meanings).capitalize()
                        + ". Price it into those items, or ask for an item of its own.",
            action="add_surcharge",
        ))
    return out


def lump_sums(boq: BoQ) -> list[Finding]:
    return _each(boq, _lump_sum)


# ---------------------------------------------------------------- structure of the LV

def numbering(boq: BoQ) -> list[Finding]:
    """An item number used twice: prices and quantities are exchanged by number (GAEB), so one of the two
    is lost or overwritten on the way."""
    seen: dict[str, Item] = {}
    out = []
    for item in boq.items:
        first = seen.setdefault(item.oz, item)
        if first is not item:
            out.append(Finding(
                item_oz=item.oz, category="error", check_id="R-NUMBER-TWICE", severity="warn",
                title="Item number used twice",
                evidence=f"„{first.label[:70]}“ / „{item.label[:70]}“",
                explanation="Two items carry the same number. Bids are exchanged by item number, so the "
                            "price of one of them cannot be told from the other.",
                action="ask_client",
                question_de=f"Die Ordnungszahl {item.oz} ist zweimal vergeben. Wir bitten um Klarstellung, "
                            f"welche Position gemeint ist."))
    return out


def _same_words(item: Item) -> str:
    return re.sub(r"\s+", " ", _TOKEN.sub(" ", item.text.lower())).strip()


def repeats(boq: BoQ) -> list[Finding]:
    """The same description twice in one section, with the same unit: tendered twice, or two places of
    use that the text does not tell apart. Short texts and "wie Position" items are left out."""
    seen: dict[tuple, Item] = {}
    out = []
    for item in boq.items:
        words = _same_words(item)
        if len(words) < 40 or item.refs or item.kind != "normal":
            continue
        first = seen.setdefault((tuple(item.path), words, item.unit), item)
        if first is not item:
            out.append(Finding(
                item_oz=item.oz, related_oz=[first.oz], category="unclear_scope", check_id="R-REPEATED",
                severity="info", title=f"Same description as item {first.oz}",
                evidence=f"„{item.label[:90]}“",
                explanation=f"Items {first.oz} and {item.oz} of this section read the same word for word, "
                            f"with the same unit. Either the work is tendered twice, or the two differ in "
                            f"something the text does not say (place, depth, section of the route).",
                action="ask_client",
                question_de=f"Die Positionen {first.oz} und {item.oz} sind wortgleich beschrieben. Worin "
                            f"unterscheiden sich die beiden Leistungen?"))
    return out


_OPTIONAL = {"contingency": "contingency items (Bedarfspositionen)", "alternative": "alternative items (Wahlpositionen)"}


def position_types(boq: BoQ) -> list[Finding]:
    """A large share of items that may never be ordered: the client decides later, the bidder has to
    keep price and capacity ready. Said once for the LV (on the first such item, the others as related), from a
    tenth of its items and at least three."""
    out = []
    for kind, name in _OPTIONAL.items():
        items = [i for i in boq.items if i.kind == kind]
        if len(items) < 3 or len(items) * 10 < len(boq.items):
            continue
        out.append(Finding(
            item_oz=items[0].oz, related_oz=[i.oz for i in items[1:41]], category="contract_risk",
            check_id="R-OPTIONAL-SHARE", severity="warn",
            title=f"{len(items)} of {len(boq.items)} items are {name.split(' (')[0]}",
            evidence=f"{len(items)} of {len(boq.items)} items: {', '.join(i.oz for i in items[:8])}"
                     f"{' …' if len(items) > 8 else ''}",
            explanation=f"A tenth or more of this LV are {name}. They are priced now and ordered only if "
                        f"the client wants them: their share of site overheads is not earned if they stay out.",
            action="add_surcharge"))
    return out
