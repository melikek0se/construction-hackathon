"""A project: several LVs of one building, one per trade, and what they expect from each other.

Trade LVs state their interfaces in the item text: "Vorleistung (baus.): Estrich", "Folgeleistung:
Bodenbelag keramisch", "bauseitig gelieferte Dachabläufe einbauen". This module collects those statements,
works out which other LV of the project delivers the work, and builds a graph of trades (held in memory;
a few dozen nodes need no database). Two things fall out of the graph:

- interface gaps: work one LV expects from others that no LV in the project contains;
- the same work described in two LVs.

Everything here is deterministic and quotes the LV; nothing is inferred by a model.
"""
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from boq.model import BoQ, Item

# trade -> (name, words that mean it in an interface statement, words that mean it in an LV or section title)
# Titles are matched more narrowly than statements: "Abdichtung Bodenplatte" is a waterproofing LV, although a
# statement "Vorleistung: Bodenplatte" means concrete work.
TRADES: dict[str, tuple[str, str, str]] = {
    "erdarbeiten": ("Erdarbeiten", r"aushub|baugrund|erdarbeit|verfüll|planum", r"erdarbeit|erdbau|\berd\b"),
    "beton": ("Beton- und Stahlbetonarbeiten",
              r"(?<!poren)beton(?!kernaktiv)|\bstb\b|bodenplatte|sauberkeitsschicht|bewehrung|schalung|rohdecke|rohboden",
              r"(?<!poren)betonarbeit|rohbau|\broh\b|stahlbeton(?!fertig)"),
    "mauerwerk": ("Mauerarbeiten", r"mauerwerk|mauerarbeit", r"mauerwerk|mauerarbeit"),
    "fertigteile": ("Betonfertigteile", r"fertigteil|fertigeil", r"fertigteil|fertigeil"),
    "porenbeton": ("Porenbeton", r"porenbeton", r"porenbeton"),
    "abdichtung": ("Abdichtung", r"(?<!dach)abdichtung|dampfsperre", r"(?<!dach)abdichtung"),
    "dach": ("Dachabdichtung", r"dachabdichtung|dachdecke|dachkonstruktion|dachbahn", r"dachabdichtung"),
    "estrich": ("Estrich", r"estrich", r"estrich"),
    "bodenbelag": ("Bodenbelag", r"bodenbel[aä]g|kautschuk|teppich|\bpvc\b|vinyl|textil|linoleum|elastisch",
                   r"bodenbel[aä]g|fu[sß]+bodenbelag|kautschuk|teppich"),
    "fliesen": ("Fliesen und Naturstein", r"fliese|keramisch|naturstein|plattenarbeit", r"fliese|naturstein"),
    "maler": ("Malerarbeiten", r"anstrich|maler|gespachtelt|spachtelung|tapezier", r"maler"),
    "putz": ("Putz", r"putz", r"putzarbeit"),
    "trockenbau": ("Trockenbau", r"trockenbau|gipskarton|\bgk\b|abhangdecke|ständerwand", r"trockenbau"),
    "elektro": ("Elektro", r"elektro|\belt\b|starkstrom|schwachstrom", r"elektro|\belt\b|starkstrom"),
    "sanitaer": ("Sanitär", r"sanit[aä]r|trinkwasser|abwasser", r"sanit[aä]ranlage|abwasser"),
    "heizung": ("Heizung", r"heizung|heizregister|betonkernaktivierung", r"heizung|betonkernaktivierung"),
    "entwaesserung": ("Dachentwässerung", r"dachentw[aä]sserung|dachabl[aä]uf|fallrohr|notüberlauf", r"dachentw[aä]sserung"),
    "tueren": ("Türen und Tore", r"sektionaltor|stahlt[uü]r|\btor\b|zarge|\btüre?n?\b", r"sektionaltor|stahlt[uü]r"),
    "schreiner": ("Schreinerarbeiten", r"schreiner|tischler|fensterbank", r"schreiner|tischler"),
}

_FIELD = re.compile(r"^\s*(Vorleistung|Folgeleistung)\s*(\(baus\.\))?\s*:\s*(.+)$", re.M | re.I)
_BY_OTHERS = re.compile(r"[^.\n;:]*\bbauseit\w*[^.\n;]*", re.I)
# a word broken at a line end and continued in lower case on the next line
_HYPHEN_BREAK = re.compile(r"([A-Za-zÄÖÜäöüß])-\n([a-zäöüß])")
_TOKEN = re.compile(r"\[?[A-Z]{3,}_?\d{2,}\]?")
# words that say how something is provided, not what it is
_FILLER = set("bauseits bauseitig bauseitige bauseitigen bauseitiger bauseitigem vorhanden vorhandene vorhandenen "
              "vorhandenem vorhandener gelieferte gelieferten gelieferter geliefert liefern einbauen montage "
              "anschluss anschließen herstellen einschließlich inklusive zwischen unterer oberer beidseitig "
              "planebenem planebenen rechtzeitig überprüfung eignung vorleistungen vorleistung leistung "
              "konstruktion aussparung zulage beschichtung montieren abdichten abgerechnet endfertig endfertige "
              "oberfläche sichtbar bleibend verbleibend fertige herstellervorschriften fachgerecht geräte anlagen".split())


@dataclass
class Statement:
    """One sentence of an item that says what comes before it, after it, or from someone else."""
    lv: str
    item_oz: str
    kind: str  # "prior" | "following" | "by_others"
    quote: str
    trades: set[str] = field(default_factory=set)
    nouns: set[str] = field(default_factory=set)
    explicit: bool = False  # the LV itself says "by others" (bauseits / "(baus.)")
    ambiguous: bool = False  # the thing it names turns up in many LVs: no edge and no finding
    providers: list[str] = field(default_factory=list)  # other LVs of the project that contain it
    internal: bool = False  # the LV that states it also contains it


def _trades_in(text: str, title: bool = False) -> set[str]:
    return {key for key, patterns in TRADES.items() if re.search(patterns[2 if title else 1], text, re.I)}


def _nouns(text: str) -> set[str]:
    """Stems of the naming words: 'Dachabläufe' and 'Dachablauf' meet at 'dachabl'."""
    words = re.findall(r"[A-Za-zÄÖÜäöüß]{6,}", _TOKEN.sub(" ", text))
    return {w.lower()[:7] for w in words if w.lower() not in _FILLER and w[0].isupper()}


def lv_name(boq: BoQ) -> str:
    """'LV_18_Estrich.pdf' -> '18 Estrich'; otherwise the LV's own name."""
    m = re.match(r"LV[_ ](\d+\w?)[_ ](.+?)\.\w+$", boq.file)
    if m:
        return f"{m.group(1)} {m.group(2).replace('_', ' ')}"
    return boq.name or boq.file


def provides(boq: BoQ) -> set[str]:
    """Trades an LV contains, as named in its file name and its section titles."""
    head = " ".join([boq.file.replace("_", " ")] + sorted({p for i in boq.items for p in i.path[:1]}))
    return _trades_in(head, title=True)


def _unhyphenate(text: str) -> str:
    """PDF lines break words: 'bauseitige Stahlum-\\nfassungszargen' -> 'bauseitige Stahlumfassungszargen'."""
    return _HYPHEN_BREAK.sub(r"\1\2", text)


def statements(name: str, boq: BoQ) -> list[Statement]:
    out = []
    for item in boq.items:
        seen = set()
        long_text, text = _unhyphenate(item.long_text), _unhyphenate(item.text)
        for m in _FIELD.finditer(long_text):
            value = " ".join(m.group(3).split())
            kind = "prior" if m.group(1).lower() == "vorleistung" else "following"
            out.append(Statement(name, item.oz, kind, f"{m.group(1)}{' (baus.)' if m.group(2) else ''}: {value}",
                                 _trades_in(value), _nouns(value), explicit=bool(m.group(2))))
            seen.add(value)
        for m in _BY_OTHERS.finditer(text):
            quote = " ".join(m.group(0).split())
            if any(value in quote for value in seen) or len(quote) < 12:
                continue  # already taken as the Vorleistung field
            out.append(Statement(name, item.oz, "by_others", quote, _trades_in(quote), _nouns(quote), explicit=True))
    return out


def _vector(item: Item, idf: dict[str, float]) -> dict[str, float]:
    words = Counter(w for w in re.findall(r"[a-zäöüß]{3,}|\d+", _TOKEN.sub(" ", item.text[:1200]).lower()))
    v = {w: (1 + math.log(c)) * idf.get(w, 0.0) for w, c in words.items()}
    norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
    return {w: x / norm for w, x in v.items() if x}


def _duplicates(lvs: dict[str, BoQ], threshold: float = 0.9) -> list[dict]:
    """Items of different LVs with the same unit and nearly the same text."""
    # hourly rates and day-work read the same in every LV and are not shared scope
    items = [(name, i) for name, boq in lvs.items() for i in boq.items
             if len(i.text) > 60 and i.kind != "hourly" and not re.search(r"stundenlohn|monteurstunde|regie", i.label, re.I)]
    df = Counter(w for _, i in items for w in set(re.findall(r"[a-zäöüß]{3,}|\d+", _TOKEN.sub(" ", i.text[:1200]).lower())))
    idf = {w: math.log(1 + len(items) / n) for w, n in df.items()}
    vectors = [_vector(i, idf) for _, i in items]
    postings = defaultdict(list)
    for n, v in enumerate(vectors):
        for w in v:
            postings[w].append(n)
    pairs = {}
    for a, va in enumerate(vectors):
        scores = defaultdict(float)
        for w, x in va.items():
            for b in postings[w]:
                if b > a:
                    scores[b] += x * vectors[b][w]
        for b, score in scores.items():
            (la, ia), (lb, ib) = items[a], items[b]
            if score >= threshold and la != lb and ia.unit == ib.unit:
                pairs[(a, b)] = score
    out = []
    for (a, b), score in sorted(pairs.items(), key=lambda p: -p[1]):
        (la, ia), (lb, ib) = items[a], items[b]
        out.append({"similarity": round(score, 2), "a": {"lv": la, "item_oz": ia.oz, "label": ia.label, "qty": float(ia.qty or 0), "unit": ia.unit_raw},
                    "b": {"lv": lb, "item_oz": ib.oz, "label": ib.label, "qty": float(ib.qty or 0), "unit": ib.unit_raw}})
    return out


def analyse_project(lvs: dict[str, BoQ]) -> dict:
    """`lvs` maps a display name to its parsed LV. Returns graph, interface statements and cross-LV findings."""
    offered = {name: provides(boq) for name, boq in lvs.items()}
    # what each LV's items are called, for interfaces that name a thing ("Dachablauf") rather than a trade
    labels = {name: [(i, _nouns(i.label)) for i in boq.items if not re.search(r"bauseit", i.label, re.I)]
              for name, boq in lvs.items()}
    all_statements = [s for name, boq in lvs.items() for s in statements(name, boq)]

    # LVs that repeat another LV: a general contractor asks the same package again from a specialist
    # ("11 Sandwichsockel" is part of "00 Rohbau"). The larger LV stands for both in the graph.
    duplicates = _duplicates(lvs)
    covered: dict[tuple[str, str], set[str]] = defaultdict(set)  # (small LV, large LV) -> items of the small one
    for d in duplicates:
        small, large = sorted((d["a"], d["b"]), key=lambda x: len(lvs[x["lv"]].items))
        covered[(small["lv"], large["lv"])].add(small["item_oz"])
    shared = {pair: len(items) for pair, items in covered.items()}
    part_of: dict[str, str] = {}
    for (small, large), n in sorted(shared.items(), key=lambda p: -p[1]):
        if n >= 4 and n >= 0.6 * len(lvs[small].items) and small not in part_of:
            part_of[small] = large

    for s in all_statements:
        # "Vorleistung: Untergrundvorbereitung" usually names the item before it in the same LV. Only a
        # statement that says "by others" itself is taken out of its own LV without looking.
        if not s.explicit:
            own_thing = any(s.nouns & nouns for i, nouns in labels[s.lv] if i.oz != s.item_oz)
            if own_thing or s.trades & offered[s.lv]:
                s.internal = True
                continue
        by_thing = [n for n in lvs if n != s.lv and s.nouns and any(s.nouns & nouns for _, nouns in labels[n])]
        by_trade = [n for n in lvs if n != s.lv and s.trades & offered[n]]
        # The LV that names the thing itself beats every LV of the right trade. A thing alone decides only
        # for "bauseits" statements and only when it points to one or two LVs; more is a common word.
        candidates = [n for n in by_thing if n in by_trade] or by_trade
        if not candidates and s.kind == "by_others" and 0 < len(by_thing) <= 2:
            candidates = by_thing
        s.ambiguous = not candidates and bool(by_thing)
        s.providers = [n for n in candidates if part_of.get(n) not in candidates and part_of.get(n) != s.lv
                       and part_of.get(s.lv) != n]

    edges: dict[tuple[str, str], dict] = {}
    for s in all_statements:
        for other in s.providers:
            pair = (s.lv, other) if s.kind == "following" else (other, s.lv)  # (before, after)
            e = edges.setdefault(pair, {"source": pair[0], "target": pair[1], "count": 0, "examples": []})
            e["count"] += 1
            if len(e["examples"]) < 6:
                e["examples"].append({"lv": s.lv, "item_oz": s.item_oz, "kind": s.kind, "quote": s.quote})

    findings = []
    open_things: dict[frozenset, list[Statement]] = defaultdict(list)
    for s in all_statements:
        if s.providers or s.internal or s.ambiguous or not (s.trades or s.nouns):
            continue
        if s.kind == "following":
            continue  # nobody in the project builds on it: not a gap for this LV's price
        key = frozenset(s.trades) if s.trades else frozenset(sorted(s.nouns)[:2])
        open_things[key].append(s)
    for key, group in open_things.items():
        lv_names = sorted({s.lv for s in group})
        what = ", ".join(TRADES[t][0] for t in sorted(key) if t in TRADES) or group[0].quote
        several = len(lv_names) > 1
        findings.append({
            "check_id": "P-BOTH-EXPECT-OTHERS" if several else "P-INTERFACE-GAP",
            "severity": "high" if several else "warn",
            "title": (f"{len(lv_names)} LVs expect this from others, none contains it: {what}" if several
                      else f"Expected from others, in no LV of the project: {what}"),
            "lvs": lv_names,
            "statements": [{"lv": s.lv, "item_oz": s.item_oz, "kind": s.kind, "quote": s.quote} for s in group[:8]],
            "explanation": ("Each of these LVs describes the work as done or supplied by someone else, and no LV "
                            "of the project contains it. Either it is in a trade that was not tendered yet, or "
                            "it is the client's, or it has fallen between the trades — in which case it ends up "
                            "as a change order for whoever is on site."),
            "action": "ask_client",
        })
    for (small, large), n in sorted(shared.items(), key=lambda p: -p[1]):
        if part_of.get(small) != large:
            continue
        examples, seen = [], set()
        for d in duplicates:  # one example per item of the smaller LV
            x = d["a"] if d["a"]["lv"] == small else d["b"]
            if {d["a"]["lv"], d["b"]["lv"]} == {small, large} and x["item_oz"] not in seen:
                seen.add(x["item_oz"])
                examples.append(d)
        same_qty = sum(d["a"]["qty"] == d["b"]["qty"] for d in examples)
        findings.append({
            "check_id": "P-SAME-SCOPE", "severity": "warn",
            "title": f"{n} of {len(lvs[small].items)} items of „{small}“ are also in „{large}“",
            "lvs": [small, large],
            "statements": [{"lv": x["lv"], "item_oz": x["item_oz"], "kind": "item",
                            "quote": f"{x['label'][:90]} ({x['qty']:g} {x['unit']})"}
                           for d in examples[:4] for x in (d["a"], d["b"])],
            "explanation": f"The two LVs describe the same work; {same_qty} of the {n} shared items have the same "
                           f"quantity. If both are awarded, the work is paid twice. If the smaller LV is an "
                           f"inquiry for part of the larger one, the bid for the larger LV must not be counted "
                           f"on top of it.",
            "action": "ask_client",
        })
    loose = [d for d in duplicates
             if part_of.get(d["a"]["lv"]) != d["b"]["lv"] and part_of.get(d["b"]["lv"]) != d["a"]["lv"]]
    for d in loose[:15]:
        findings.append({
            "check_id": "P-DUPLICATE-SCOPE", "severity": "info",
            "title": f"Same work in two LVs: {d['a']['label'][:60]}",
            "lvs": sorted({d["a"]["lv"], d["b"]["lv"]}),
            "statements": [{"lv": x["lv"], "item_oz": x["item_oz"], "kind": "item",
                            "quote": f"{x['label'][:90]} ({x['qty']:g} {x['unit']})"} for x in (d["a"], d["b"])],
            "explanation": "Two trade LVs describe nearly the same item. If they cover the same areas, the work "
                           "is tendered twice; if they cover different areas, the quantities should add up to "
                           "the plan.",
            "action": "ask_client",
        })
    rank = {"high": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: (rank[f["severity"]], -len(f["statements"])))

    gaps = Counter(lv for f in findings if f["check_id"].startswith(("P-INTERFACE", "P-BOTH")) for lv in f["lvs"])
    nodes = [{"id": name, "name": name, "items": len(boq.items), "provides": sorted(offered[name]),
              "part_of": part_of.get(name),
              "statements": sum(s.lv == name for s in all_statements), "gaps": gaps.get(name, 0)}
             for name, boq in lvs.items()]
    return {
        "nodes": nodes, "edges": list(edges.values()), "findings": findings,
        "statements": {"total": len(all_statements), "resolved": sum(bool(s.providers) for s in all_statements),
                       "internal": sum(s.internal and not s.providers for s in all_statements),
                       "by_kind": dict(Counter(s.kind for s in all_statements))},
    }
