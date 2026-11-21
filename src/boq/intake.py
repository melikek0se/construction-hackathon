"""What a set of dropped files is, read from the files themselves (docs/07-user-flows.md).

Three questions, each answered with the evidence it rests on so the user can check and correct it:
which files are the same LV, which tender they belong to (number, name, client), and which step of the
tender each one is (tender, bid, award). No LLM: GAEB files carry these as fields, PDFs print them above
the column header (read by `parsers.pdf._about`). Scored against the hand mapping of the dataset by
`scripts/eval_intake.py`.
"""
import re
from collections import Counter
from pathlib import Path

from boq.model import BoQ

ROLE = {"83": "tender", "84": "bid", "86": "award"}  # GAEB exchange phase -> what the file is in a tender
STEPS = ("tender", "bid", "award")
ROLES = ("tender", "tender package", "excerpt", "trade LV", "bid", "submitted bid", "offer", "award")
_TOKEN = re.compile(r"\[[A-ZÄÖÜ]+(?:_\d+)?\]")  # anonymisation: [PROJEKT_004], [FIRMA_0000006]
# what a PDF is headed with (read by parsers.pdf._HEADING); every other heading there is a request for bids
_BID_WORDS = re.compile(r"^(Angebot|Angebots-LV|Nachtragsangebot|Preisangebot)$")
_AWARD_WORDS = re.compile(r"^(Auftrag|Auftrags-LV|Auftragsbestätigung|Auftragsleistungsverzeichnis|Auftragserteilung|"
                          r"Auftragsschreiben|Bestellung|Zuschlag|Zuschlagsschreiben)$")


def step_of(role: str) -> str:
    """The step of the tender a role belongs to; the same grouping as `stepOf` in web/src/Projects.tsx."""
    return "award" if role == "award" else "bid" if role in ("bid", "submitted bid", "offer") else "tender"


# ---------------------------------------------------------------- the same LV

def shared(a: BoQ, b: BoQ) -> int:
    """Items of `a` that `b` has under the same number with the same unit and quantity. A field one file
    lacks does not count against it: a GAEB 84 bid carries prices only, no units or quantities."""
    other = {i.oz: i for i in b.items}
    return sum(1 for i in a.items if (o := other.get(i.oz)) is not None
               and (i.qty is None or o.qty is None or i.qty == o.qty)
               and (not i.unit or not o.unit or i.unit == o.unit))


def versions(a: BoQ, b: BoQ, whole: bool = False) -> bool:
    n, m = len(a.items), len(b.items)
    if not n or not m:
        return False
    if a.lv_label and b.lv_label and a.lv_label != b.lv_label:
        return False  # two print-outs headed as different LVs (F: 01 Fertigteiltreppen, all of it also in 00 Rohbau)
    common = shared(a, b) if n <= m else shared(b, a)
    return common >= 0.7 * (max(n, m) if whole else min(n, m))


def same_lv(boqs: list[BoQ], whole: bool = False) -> list[int]:
    """Which files are the same LV: files that share most items (number, unit and quantity) are versions
    of one LV (tender, print-out, bid, award); others are other LVs (trades, lots).

    Item numbers alone are not enough: the trade LVs of one building restart at 1.1.10 each (project F
    has 8 of 27 that would pair up). Each file is compared with every file of a group, not with the
    group's union, so pairs cannot chain. `whole` asks for most of BOTH files: an LV that repeats part
    of another (F: 01 Fertigteiltreppen inside 00 Rohbau) is then a separate LV, which the comparison
    between LVs must see; otherwise an excerpt (C: LV-Schachtbauwerk) belongs to its LV."""
    groups: list[list[BoQ]] = []
    index = []
    for boq in boqs:
        for g, members in enumerate(groups):
            if any(versions(boq, m, whole) for m in members):
                members.append(boq)
                index.append(g)
                break
        else:
            groups.append([boq])
            index.append(len(groups) - 1)
    return index


# ---------------------------------------------------------------- which tender

def _real(text: str) -> bool:
    """Says something once the anonymisation tokens are taken out."""
    return len(re.findall(r"[^\W\d_]", _TOKEN.sub("", text))) >= 3


def _clean(text: str) -> str:
    """A label without the tokens and punctuation at its ends: '[FIRMA_006] - Fernleitung' -> 'Fernleitung'."""
    edge = r"[\s,;:/*-]*"
    text = re.sub(rf"^(?:{edge}{_TOKEN.pattern})+{edge}", "", text.strip())
    return re.sub(rf"{edge}(?:{_TOKEN.pattern}{edge})+$", "", text).strip()


def _lv_label(boq: BoQ) -> str:
    return boq.lv_label or ("" if boq.name == Path(boq.file).stem else boq.name)


def _most(values: list[tuple[str, BoQ]]) -> tuple[str, BoQ] | None:
    """The value most files agree on, and the first file that has it."""
    if not values:
        return None
    best = Counter(v for v, _ in values).most_common(1)[0][0]
    return next((v, b) for v, b in values if v == best)


def identity(boqs: list[BoQ]) -> dict:
    """The tender these files belong to: number, name, client, and where the name was read.

    The project's own name before the LV's label (which names the trade, and only fits a project of one
    LV); a label that is nothing but an anonymisation token only when there is nothing else."""
    number = _most([(b.project_no, b) for b in boqs if b.project_no and not _TOKEN.search(b.project_no)])
    one_lv = len(set(same_lv(boqs))) == 1
    label = where = None
    for values, said in (
        ([(_clean(b.project), b) for b in boqs if _real(b.project)], "project name"),
        ([(_clean(_lv_label(b)), b) for b in boqs if _real(_lv_label(b))] if one_lv else [], "LV title"),
        ([(b.project, b) for b in boqs if b.project], "project name"),
        ([(_lv_label(b), b) for b in boqs if _lv_label(b)] if one_lv else [], "LV title"),
    ):
        if found := _most(values):
            label, where = found, said
            break
    no = number[0] if number else ""
    text = label[0] if label else ""
    name = text if not no or text.startswith(no) else f"{no} {text}".strip()
    client = _most([(b.client, b) for b in boqs if _real(b.client)])
    source = label[1] if label else number[1] if number else None
    return {"number": no, "name": name[:80], "client": client[0] if client else "",
            "source": None if source is None else {
                "file": source.file,
                "where": (f"{where}, " if label else "project number, ")
                         + ("page header" if source.format == "pdf" else "GAEB file header")}}


def suggest(found: dict, projects: list[dict]) -> dict | None:
    """The project these files most likely belong to: the one with the same number, else the same name."""
    for p in projects:
        if found["number"] and p.get("number") == found["number"]:
            return {"id": p["id"], "reason": f"same project number {found['number']}"}
    for p in projects:
        if found["name"] and p["name"].casefold() == found["name"].casefold():
            return {"id": p["id"], "reason": "same project name"}
    return None


# ---------------------------------------------------------------- which step

def _priced(boq: BoQ) -> int:
    return sum(1 for i in boq.items if i.up is not None or i.total is not None)


def _same_prices(a: BoQ, b: BoQ) -> bool:
    other = {i.oz: i.up for i in b.items if i.up is not None}
    both = [(i.up, other[i.oz]) for i in a.items if i.up is not None and i.oz in other]
    return len(both) >= 0.5 * len(a.items) and sum(x == y for x, y in both) >= 0.9 * len(both)


def classify(boq: BoQ, others: list[BoQ]) -> dict:
    """What a file is in its tender: `role` (one of ROLES), its `step`, the `evidence` in words, and
    `certain` — False when the step is only inferred and the user should look.

    In order: the GAEB phase; a GAEB twin of the same LV with the same prices; the word the document is
    headed with; and last whether it carries prices at all. An LV without prices is a tender whatever
    else it says; a priced PDF that names nothing is taken for a bid and marked as inferred."""
    others = [o for o in others if o is not boq]
    n, priced = len(boq.items), _priced(boq)
    evidence: list[str] = []
    certain = True
    if boq.format in ("gaeb_xml", "gaeb_90") and boq.phase in ROLE:
        step = ROLE[boq.phase]
        evidence.append(f"GAEB phase {boq.phase}")
    elif priced < 0.5 * n:
        step = "tender"
        evidence.append(f'headed "{boq.heading}"' if boq.heading and not _BID_WORDS.match(boq.heading)
                        and not _AWARD_WORDS.match(boq.heading) else "")
        evidence.append("no prices: an empty LV, as the client sends it out" if not priced
                        else f"prices in only {priced} of {n} items")
        certain = priced < 0.05 * n
    else:
        twins = [o for o in others if o.format in ("gaeb_xml", "gaeb_90") and o.phase in ("84", "86")
                 and versions(boq, o) and _same_prices(boq, o)]
        twin = min(twins, key=lambda o: o.phase, default=None)  # a bid and its award often carry the same prices
        if _AWARD_WORDS.match(boq.heading):
            step = "award"
            evidence.append(f'headed "{boq.heading}"')
        elif _BID_WORDS.match(boq.heading):
            step = "bid"
            evidence.append(f'headed "{boq.heading}"')
        elif twin:
            step = ROLE[twin.phase]
            evidence.append(f"same prices as {twin.file}")
        else:
            step, certain = "bid", False
            evidence.append("priced, but the document does not say whether as a bid or as the award, "
                            "and no GAEB file here has the same prices")
        evidence.append(f"prices in {priced} of {n} items")

    role = step
    if step == "tender":
        whole = next((o for o in others if len(o.items) >= 1.5 * n and versions(boq, o)), None)
        if boq.forms:
            role = "tender package"
            evidence.append(f"{boq.forms} pages of contract forms")
        elif whole is not None:
            role = "excerpt"
            evidence.append(f"{shared(boq, whole)} of the {len(whole.items)} items of {whole.file}")
    elif step == "bid" and boq.forms:
        role = "submitted bid"
        evidence.append(f"{boq.forms} pages of contract forms")
    return {"role": role, "step": step, "certain": certain, "evidence": [e for e in evidence if e]}


def with_step(role: str, step: str) -> str:
    """The role a file has once the user says it belongs to another step: its qualifier goes."""
    return role if step_of(role) == step else step
