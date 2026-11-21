"""Unit-price suggestions from past priced bids ("own history").

For every item of an LV, look for similar items in the priced bids of other projects: same unit, similar
text, same nominal size where the texts name one. A suggestion always carries its sources (project, item,
date, price) and a band, and "no reliable price" is a normal result (CLAUDE.md, D-005). How well this
works is measured by scripts/eval_prices.py, not assumed.

Matching is lexical (TF-IDF over words and word fragments), not semantic: it needs no API and is
reproducible, and German LV texts repeat the same technical terms.
"""
import math
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from boq.model import BoQ, Item
from boq.parsers import parse_file

MIN_SIMILARITY = 0.45  # below this a match is not shown at all
TOP_K = 5
_TOKEN = re.compile(r"\[?[A-Z]{3,}_?\d{2,}\]?")  # anonymiser placeholders
_WORD = re.compile(r"[a-zäöüß]+|\d+(?:[.,]\d+)?")
_SIZE = re.compile(r"\b(?:DN\s*/\s*OD|DN|OD|DA|Da|da)\s*=?\s*(\d{2,4})\b")  # as boq.checks.companions
# Unit prices this low are token prices: bidders park speculative or "included elsewhere" items there
# (docs/02-dataset.md, finding 2). They say nothing about what the work costs.
_TOKEN_PRICE = {"m3": Decimal(1), "t": Decimal(1), "St": Decimal(1), "h": Decimal(1), "kg": Decimal("0.05"),
                "m": Decimal("0.1"), "m2": Decimal("0.1"),
                # rental per week or day: bid B keeps a fence "vorhalten" at 0.03 EUR per metre-week
                "mWo": Decimal("0.1"), "m2Wo": Decimal("0.1"), "m2d": Decimal("0.1"), "md": Decimal("0.1"),
                "StWo": Decimal(1), "Wo": Decimal(1), "d": Decimal(1)}
_STOP = set("und oder der die das den dem des ein eine einer eines mit für von zu zur zum im in an auf aus bei "
            "nach wie vor jedoch sowie ist sind wird werden als bis je inkl einschl einschließlich".split())


@dataclass(frozen=True)
class HistoryItem:
    project: str  # "A", "B", "C"
    source: str  # what kind of price this is, e.g. "award 13.03.2024"
    date: str  # ISO date of the bid
    file: str
    item: Item

    @property
    def unit_price(self) -> Decimal:
        return self.item.up


@dataclass
class Match:
    history: HistoryItem
    similarity: float
    same_size: bool | None  # None when neither text names a nominal size


@dataclass
class Suggestion:
    item_oz: str
    unit_price: Decimal | None  # None = no reliable price ("price gap")
    low: Decimal | None = None
    high: Decimal | None = None
    confidence: str = "none"  # high | medium | low | none
    reason: str = ""  # why there is no price, or what the price rests on
    matches: list[Match] = field(default_factory=list)


def _terms(item: Item) -> Counter:
    """Words and word fragments of an item; the short text counts three times as much as the long text."""
    def tokens(text: str) -> list[str]:
        out = []
        for w in _WORD.findall(_TOKEN.sub(" ", text).lower()):
            if w in _STOP or len(w) < 2:
                continue
            out.append(w)
            if w.isalpha() and len(w) > 6:  # German compounds: "muffendruckrohr" shares fragments with "druckrohr"
                out.extend(f"#{w[i:i + 5]}" for i in range(len(w) - 4))
        return out

    terms = Counter()
    for t in tokens(item.label):
        terms[t] += 3
    for t in tokens(item.long_text[:800]):
        terms[t] += 1
    return terms


_GENERIC = _STOP | set("position sämtliche kosten zuschläge liefern herstellen einbauen verlegen montieren "
                       "zulage leistung beschrieben wortlaut zuletzt vollem".split())


def _head(item: Item) -> set[str]:
    """What the item is: the first two naming words of its label, cut to a stem.

    Two hourly-rate items share most of their text ("sämtliche Kosten/Zuschläge …") whether they pay a
    foreman or an excavator with driver; the head word is what tells them apart.
    """
    words = [w for w in re.findall(r"[a-zäöüß]{4,}", _TOKEN.sub(" ", item.label).lower()) if w not in _GENERIC]
    return {w[:7] for w in words[:2]}


def _sizes(item: Item) -> set[str]:
    return set(_SIZE.findall(item.label)) or set(_SIZE.findall(item.long_text[:400]))


class History:
    """Priced items of past bids with a TF-IDF index over their texts."""

    def __init__(self, entries: list[HistoryItem]):
        self.entries = [e for e in entries if e.item.up and e.item.unit
                        and e.item.up > _TOKEN_PRICE.get(e.item.unit, Decimal(0))]
        counts = [_terms(e.item) for e in self.entries]
        df = Counter(t for c in counts for t in c)
        n = max(len(self.entries), 1)
        self.idf = {t: math.log(1 + n / d) for t, d in df.items()}
        self.vectors = [self._vector(c) for c in counts]
        self.heads = [_head(e.item) for e in self.entries]
        self.postings: dict[str, list[int]] = defaultdict(list)
        for i, v in enumerate(self.vectors):
            for t in v:
                self.postings[t].append(i)

    def _vector(self, counts: Counter) -> dict[str, float]:
        v = {t: (1 + math.log(c)) * self.idf.get(t, 0.0) for t, c in counts.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items() if x}

    def matches(self, item: Item, exclude_projects: set[str] = frozenset()) -> list[Match]:
        """Similar priced items with the same unit, best first."""
        if not item.unit:
            return []
        q = self._vector(_terms(item))
        scores: dict[int, float] = defaultdict(float)
        for t, x in q.items():
            for i in self.postings.get(t, ()):
                scores[i] += x * self.vectors[i][t]
        sizes, head, out = _sizes(item), _head(item), []
        for i, score in scores.items():
            e = self.entries[i]
            if e.item.unit != item.unit or e.project in exclude_projects or not head & self.heads[i]:
                continue
            other = _sizes(e.item)
            same_size = None if not sizes and not other else bool(sizes & other) if sizes and other else False
            if same_size is False:
                score *= 0.6  # a DN 100 fitting does not price a DN 300 fitting
            if score >= MIN_SIMILARITY:
                out.append(Match(e, round(score, 3), same_size))
        return sorted(out, key=lambda m: -m.similarity)[:TOP_K]

    def own_project(self, boq: BoQ) -> str | None:
        """The history project this LV belongs to, if any: its own bid must not price it."""
        by_project: dict[str, dict[str, Item]] = defaultdict(dict)
        for e in self.entries:
            by_project[e.project][e.item.oz] = e.item
        for project, items in by_project.items():
            same = sum(1 for i in boq.items if i.oz in items and items[i.oz].unit == i.unit and items[i.oz].qty == i.qty)
            if boq.items and same / len(boq.items) > 0.5:
                return project
        return None

    def suggest(self, item: Item, exclude_projects: set[str] = frozenset()) -> Suggestion:
        if item.kind == "lump_sum":
            return Suggestion(item.oz, None, reason="Lump sum: the price depends on this project's scope, "
                                                    "not on what another project paid.")
        matches = self.matches(item, exclude_projects)
        usable = [m for m in matches if m.same_size is not False]
        if not usable:
            reason = ("Similar items exist only in another nominal size." if matches
                      else "No similar item with the same unit in the priced bids.")
            return Suggestion(item.oz, None, reason=reason, matches=matches)
        best = usable[0].similarity
        close = [m for m in usable if m.similarity >= best - 0.15]  # the group the price is taken from
        prices = sorted(m.history.unit_price for m in close)
        price = statistics.median(prices)
        spread = (prices[-1] - prices[0]) / price if price else Decimal(0)
        if best >= 0.8 and (len(close) == 1 or spread <= Decimal("0.5")):
            confidence = "high"
        elif best >= 0.62:
            confidence = "medium"
        else:
            # Back-testing: matches this loose are within 25 % of the real price in about one case in
            # three. That is not a price. The items stay visible as references.
            return Suggestion(item.oz, None, confidence="low", matches=matches,
                              reason="Only loosely similar items in the priced bids; shown for reference, not as a price.")
        # The band: the range of the prices found, and never narrower than what back-testing shows
        # for this confidence (scripts/eval_prices.py): prices of similar items differ between projects.
        margin = {"high": Decimal("0.25"), "medium": Decimal("0.4")}[confidence]
        low, high = min(prices[0], price * (1 - margin)), max(prices[-1], price * (1 + margin))
        projects = sorted({m.history.project for m in close})
        return Suggestion(item.oz, price.quantize(Decimal("0.01")), low.quantize(Decimal("0.01")),
                          high.quantize(Decimal("0.01")), confidence,
                          f"Median of {len(close)} similar item{'s' if len(close) > 1 else ''} "
                          f"from project{'s' if len(projects) > 1 else ''} {', '.join(projects)}.", matches)


def _history_files(dataset: Path) -> list[tuple[str, str, str, Path, Path | None]]:
    """(project, source, date, priced file, file with the long texts if the priced file has none)."""
    g90, pdf = dataset / "02_gaeb_90", dataset / "04_pdf_tiefbau_sonstige"
    return [
        ("A", "award 13.03.2024", "2024-03-13", g90 / "[ORT_024] LV24069.D86", None),
        ("B", "award 15.03.2023", "2023-03-15", g90 / "StBALV23040.D86", None),
        ("C", "offer 25.11.2024", "2024-11-25", pdf / "Angebot AN24-0305.pdf", pdf / "Leistungsverzeichnis.pdf"),
    ]


@lru_cache(maxsize=2)
def load_history(dataset: Path) -> History:
    """The three priced bids of the challenge dataset (docs/02-dataset.md)."""
    entries = []
    for project, source, date, priced, texts in _history_files(Path(dataset)):
        if not priced.exists():
            continue
        boq = parse_file(str(priced))
        long_texts = {i.oz: i for i in parse_file(str(texts)).items} if texts and texts.exists() else {}
        for item in boq.items:
            full = long_texts.get(item.oz)
            if full is not None:  # the offer prints short texts only; the tender LV has the descriptions
                item = item.model_copy(update={"long_text": full.long_text, "short_text": item.short_text or full.short_text})
            entries.append(HistoryItem(project, source, date, priced.name, item))
    return History(entries)


def suggest_prices(boq: BoQ, history: History) -> dict:
    """Suggestions for every item plus the LV-level picture: coverage, estimated total as a range, gaps."""
    own = history.own_project(boq)
    exclude = {own} if own else set()
    suggestions = [history.suggest(item, exclude) for item in boq.items]
    by_oz = {i.oz: i for i in boq.items}
    priced = [s for s in suggestions if s.unit_price is not None and by_oz[s.item_oz].qty is not None]

    def total(attr: str) -> float:
        return float(sum((getattr(s, attr) * by_oz[s.item_oz].qty for s in priced), Decimal(0)))

    return {
        "history": {"items": len(history.entries),
                    "projects": sorted({(e.project, e.source, e.file) for e in history.entries}),
                    "excluded_project": own},
        "items": len(boq.items),
        "with_price": len(priced),
        "by_confidence": dict(Counter(s.confidence for s in suggestions)),
        "estimate": {"mid": total("unit_price"), "low": total("low"), "high": total("high")} if priced else None,
        "suggestions": [_dump(s, by_oz[s.item_oz]) for s in suggestions],
    }


def _dump(s: Suggestion, item: Item) -> dict:
    value = float(s.unit_price * item.qty) if s.unit_price is not None and item.qty is not None else None
    return {
        "item_oz": s.item_oz, "unit_price": float(s.unit_price) if s.unit_price is not None else None,
        "low": float(s.low) if s.low is not None else None, "high": float(s.high) if s.high is not None else None,
        "confidence": s.confidence, "reason": s.reason, "value": value,
        "matches": [{"project": m.history.project, "source": m.history.source, "date": m.history.date,
                     "file": m.history.file, "item_oz": m.history.item.oz, "label": m.history.item.label,
                     "qty": float(m.history.item.qty) if m.history.item.qty is not None else None,
                     "unit": m.history.item.unit_raw, "unit_price": float(m.history.unit_price),
                     "similarity": m.similarity, "same_size": m.same_size} for m in s.matches],
    }
