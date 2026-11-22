"""The tender as one thing, whatever files it came in (D-050).

A client sends the same LV as a GAEB file and as a print-out; a building comes as one LV per trade. The
estimator reads a tender, not a file: this module puts the documents of the tender step together. Per LV
one document carries the items (GAEB before PDF: its structure, quantities and units are data, not read
off a page); every other document of that LV says where each item stands in it (the page) and is compared
with the carrier. Where two documents say different things the app does not decide which is right: the
difference is listed, as a point for the client. Remarks that stand in one document only are set in after
the carrier's. Bid and award files are named and left out: they belong to later steps.

A tender changes while it is open (D-058): the client sends the LV again. The documents of an LV are
therefore put into issues by the order they came in; the latest issue is the tender, the one before it is
held against it and gives the list of what changed. The work done on the earlier issue (questions, inquiries,
prices) follows to the new one (`follow`).
"""
import difflib
import re
from decimal import Decimal

from sqlalchemy import delete, insert, select, update

from boq import db, intake
from boq.model import BoQ, Finding, Item
from boq.project import lv_name

_FORMATS = {"gaeb_xml": "GAEB XML", "gaeb_90": "GAEB 90", "excel": "Excel", "pdf": "PDF"}
_RANK = {"gaeb_xml": 0, "gaeb_90": 1, "excel": 2, "pdf": 3}
_TOKEN = re.compile(r"\[?[A-ZÄÖÜ]{3,}_?0*\d+\]?")  # anonymisation tokens, written differently per file
_LV_NO = re.compile(r"LV[_ ](\d+\w?)[_ ]")
ALIKE = 0.9  # below this share of the same characters, two texts of one item count as different
_MAX_LISTED = 20


def _norm(text: str) -> str:
    """A text without what differs between formats for no reason: tokens, ligatures, case, spacing, line
    breaks and punctuation (a PDF breaks lines where the page ends them)."""
    text = _TOKEN.sub("", text or "").replace("ﬂ", "fl").replace("ﬁ", "fi").lower()
    return re.sub(r"[\W_]+", "", text)


def _only_here(other: Item, carrier: Item) -> list[str]:
    """Lines of `other` whose words stand nowhere in the carrier's text of the item."""
    whole = _norm(carrier.text)
    out = []
    for line in other.text.split("\n"):
        n = _norm(line)
        if len(n) > 3 and n not in whole and line.strip() not in out:
            out.append(line.strip())
    return out[:4]


def _states_quantities(boq: BoQ) -> bool:
    return sum(1 for i in boq.items if i.qty is not None) > len(boq.items) / 2


_SENTENCE = re.compile(r"(?<=[.!?:;])\s+")


def _only_in(text: str, known: str) -> list[str]:
    """What of a remark stands nowhere in `known` (the normalised remarks of the carrier). A print-out
    gives the remarks as one block with other line breaks than the GAEB file's, so a block that is not
    known as a whole is taken sentence by sentence: neighbouring sentences that are missing make one
    passage, and a clause added at the end of a long block shows as that clause, not as the block."""
    if len(_norm(text)) <= 20 or _norm(text) in known:
        return []
    out, run = [], []
    for sentence in _SENTENCE.split(" ".join(text.split())):
        n = _norm(sentence)
        if n and n not in known:
            run.append(sentence)
        elif run and len(n) > 3:  # a known sentence ends the passage; a stray "z." or "Nr." does not
            out.append(" ".join(run))
            run = []
        elif run:
            run.append(sentence)
    if run:
        out.append(" ".join(run))
    return [t for t in out if len(_norm(t)) > 20]


def _compare(carrier: BoQ, other: BoQ) -> tuple[dict, dict[str, dict]]:
    """`other` against the carrier: the counts, and per item number what differs. A quantity one of the
    two leaves out counts as another quantity, unless the file leaves most of them out (a D84 carries
    prices only): then nothing can be said."""
    mine = {i.oz: i for i in carrier.items}
    theirs = {i.oz: i for i in other.items}
    both = [oz for oz in mine if oz in theirs]
    diffs: dict[str, dict] = {}
    qty = unit = text = 0
    gaps = _states_quantities(carrier) and _states_quantities(other)
    for oz in both:
        a, b = mine[oz], theirs[oz]
        d: dict = {}
        if a.qty != b.qty and (gaps or (a.qty is not None and b.qty is not None)):
            qty += 1
            d["qty"] = str(b.qty) if b.qty is not None else None
        if a.unit != b.unit and a.unit and b.unit:
            unit += 1
            d["unit"] = b.unit_raw
        # a file without texts (a D84 carries prices only) has nothing to compare
        if a.text and b.text and _norm(a.text) != _norm(b.text):
            alike = difflib.SequenceMatcher(None, _norm(a.text), _norm(b.text), autojunk=False).ratio()
            if alike < ALIKE:
                text += 1
                d |= {"alike": round(alike, 2), "only": _only_here(b, a)}
        if d:
            diffs[oz] = d
    only_carrier = [oz for oz in mine if oz not in theirs]
    only_other = [oz for oz in theirs if oz not in mine]
    counts = {"both": len(both), "qty": qty, "unit": unit, "text": text,
              "only_carrier": len(only_carrier), "only_other": len(only_other),
              "only_carrier_items": only_carrier[:_MAX_LISTED], "only_other_items": only_other[:_MAX_LISTED]}
    return counts, diffs


def _back(carrier: BoQ, name: str) -> dict:
    """What the bid goes back as. An X84 is written onto the X83 received (boq.bid); other forms are not
    written by the app, and a PDF says nothing about the form the client wants."""
    if carrier.format == "gaeb_xml":
        return {"form": "X84", "file": name, "written": True}
    if carrier.format == "gaeb_90":
        return {"form": "D84", "file": name, "written": False}
    return {"form": None, "file": None, "written": False}


def _award(index: int, boqs: list[BoQ | None], docs: list[dict], lvs: list[dict]) -> dict | None:
    """An award file held against the tender it answers and the bid that went out: which items it changed
    (another quantity or unit, dropped, added), what it comes to, and where its unit prices are not the
    bid's. The LV is the one it shares most item numbers with; the bid is the priced file of that LV,
    a GAEB file before a PDF."""
    award = boqs[index]
    theirs = {i.oz: i for i in award.items}
    shared = [(sum(1 for i in lv["items"] if i["oz"] in theirs), lv) for lv in lvs]
    most, lv = max(shared, key=lambda x: x[0], default=(0, None))
    if not most:
        return None
    carrier = boqs[lv["carrier"]]
    _, diffs = _compare(carrier, award)
    changes: dict[str, dict] = {}
    for oz, d in diffs.items():
        if "qty" in d or "unit" in d:
            changes[oz] = {"kind": "quantity" if "qty" in d else "unit",
                           "qty": d.get("qty"), "unit": d.get("unit")}
    mine = {i.oz for i in carrier.items}
    for i in carrier.items:
        if i.oz not in theirs:
            changes[i.oz] = {"kind": "dropped"}
    bids = sorted((n for n, d in enumerate(docs) if d["step"] == "bid" and d["readable"] and d["priced"]
                   and sum(1 for i in boqs[n].items if i.oz in theirs) > len(theirs) / 2),
                  key=lambda n: _RANK[boqs[n].format])
    bid = {i.oz: i for i in boqs[bids[0]].items} if bids else {}
    num = lambda v: float(v) if v is not None else None  # noqa: E731
    rows, differs = {}, 0
    for i in award.items:
        b = bid.get(i.oz)
        other = b is not None and b.up is not None and i.up is not None and b.up != i.up
        differs += other
        rows[i.oz] = {"qty": str(i.qty) if i.qty is not None else None, "unit": i.unit_raw, "up": num(i.up),
                      "total": num(i.total), "bid_up": num(b.up) if b else None, "differs": other}
    return {"doc": index, "lv": lv["id"], "items": len(award.items),
            "priced": sum(1 for i in award.items if i.up is not None),
            "net": float(sum(i.total for i in award.items if i.total is not None)),
            "changes": changes, "rows": rows,
            "added": [{"oz": i.oz, "path": i.path, "short": i.label, "long": i.long_text} for i in award.items
                      if i.oz not in mine],
            "bid": ({"doc": bids[0], "net": float(sum(i.total for i in boqs[bids[0]].items if i.total is not None)),
                     "differs": differs} if bids else None)}


def _issues(arrived: list[int], docs: list[dict]) -> list[list[int]]:
    """The documents of one LV as the issues they came in. A client does not send the same LV twice in one
    format: a document starts a new issue when the issue so far already holds one of its format (a second
    X83 after an X83). A document of another format joins the issue (the print-out of the X83), and so does
    an excerpt, which is a part and not an issue."""
    issues: list[list[int]] = [[]]
    for n in arrived:
        if docs[n]["role"] != "excerpt" and any(docs[m]["format"] == docs[n]["format"] and docs[m]["role"] != "excerpt"
                                                for m in issues[-1]):
            issues.append([])
        issues[-1].append(n)
    return issues


_FOLLOW = ("bid_prices", "mails", "amendments", "supply_plans", "quotes")  # what is kept per project and file


def follow(project_id: str, earlier: str, now: str) -> int:
    """The work done on the earlier issue of an LV goes on with the new one: bid prices, the messages to
    the client with their answers and what they changed, the inquiries and their quotes are kept by the
    name of the LV's file, so they are moved to the file that carries the LV now. Rows for an item the
    new issue no longer has stay and are shown nowhere. Returns how many rows moved; nothing to do when
    both issues came under one file name or the work has moved already."""
    if earlier == now:
        return 0
    moved = 0
    with db.engine().begin() as conn:
        for name in _FOLLOW:
            table = getattr(db, name)
            moved += conn.execute(update(table).where(table.c.project_id == project_id, table.c.file == earlier)
                                  .values(file=now)).rowcount
    return moved


def view(project: dict, boqs: list[BoQ | None], pages: list[int | None]) -> dict:
    """The tender step of a project. `boqs`: its files parsed, in the project's order, None where a file
    could not be read. `pages`: the page count of each PDF."""
    files = project["files"]
    docs = []
    for n, (f, boq) in enumerate(zip(files, boqs)):
        docs.append({"index": n, "name": f["name"], "format": f["format"], "role": f["role"],
                     "step": intake.step_of(f["role"]), "pages": pages[n], "lv": None, "carrier": False,
                     "items": len(boq.items) if boq else 0, "remarks": len(boq.remarks) if boq else 0,
                     "priced": sum(1 for i in boq.items if i.up is not None) if boq else 0,
                     "readable": boq is not None, "extra_remarks": 0, "compare": None,
                     "issue": None, "current": True})
    mine = [n for n, d in enumerate(docs) if d["step"] == "tender" and d["readable"]]
    # trade LVs of a building repeat parts of each other (F: 01 inside 00): there an LV is a whole file
    groups = intake.same_lv([boqs[n] for n in mine], whole=project["kind"] == "trades")
    lvs = []
    best = lambda ns: sorted(ns, key=lambda n: (docs[n]["role"] == "excerpt", _RANK[boqs[n].format], -len(boqs[n].items)))  # noqa: E731
    for g in sorted(set(groups)):
        arrived = [n for n, grp in zip(mine, groups) if grp == g]  # in the order they came into the project
        issues = _issues(arrived, docs)
        members = best(issues[-1])
        head, rest = members[0], members[1:]
        carrier = boqs[head]
        docs[head]["carrier"] = True
        items = [{"oz": i.oz, "path": i.path, "short": i.short_text, "long": i.long_text,
                  "qty": str(i.qty) if i.qty is not None else None, "unit": i.unit_raw, "kind": i.kind,
                  "sources": [{"doc": head, "page": i.source.page}], "diff": None, "change": None}
                 for i in carrier.items]
        by_oz = {i["oz"]: i for i in items}
        for k, issue in enumerate(issues, 1):
            for n in issue:
                docs[n] |= {"issue": k, "current": k == len(issues)}
        # what this issue changed against the one before it
        removed, before = [], None
        if len(issues) > 1:
            before = best(issues[-2])[0]
            old = boqs[before]
            _, diffs = _compare(carrier, old)  # per item: what the EARLIER issue said
            was = {i.oz: i for i in old.items}
            for item in carrier.items:
                d = diffs.get(item.oz)
                if item.oz not in was:
                    by_oz[item.oz]["change"] = {"kind": "new"}
                elif d and ("qty" in d or "unit" in d):
                    by_oz[item.oz]["change"] = {"kind": "quantity" if "qty" in d else "unit",
                                                "was_qty": str(was[item.oz].qty) if was[item.oz].qty is not None else None,
                                                "was_unit": was[item.oz].unit_raw}
                elif d and "alike" in d:
                    by_oz[item.oz]["change"] = {"kind": "text", "alike": d["alike"], "was": d["only"],
                                                "now": _only_here(item, was[item.oz])}
            now = {i.oz for i in carrier.items}
            removed = [{"oz": i.oz, "path": i.path, "short": i.label, "long": i.long_text,
                        "qty": str(i.qty) if i.qty is not None else None, "unit": i.unit_raw}
                       for i in old.items if i.oz not in now]
        remarks = [{"text": r.text, "doc": head} for r in carrier.remarks]
        known = _norm(" ".join(r.text for r in carrier.remarks))
        for n in rest:
            other = boqs[n]
            counts, diffs = _compare(carrier, other)
            docs[n]["compare"] = counts
            for i in other.items:
                if i.oz in by_oz:
                    by_oz[i.oz]["sources"].append({"doc": n, "page": i.source.page})
            for oz, d in diffs.items():
                if by_oz[oz]["diff"] is None:  # the first document that differs is the one shown
                    by_oz[oz]["diff"] = {"doc": n, **d}
            extra = [text for r in other.remarks for text in _only_in(r.text, known)]
            docs[n]["extra_remarks"] = len(extra)
            remarks += [{"text": text, "doc": n} for text in extra]
            known += _norm(" ".join(extra))
        for n in arrived:
            docs[n]["lv"] = len(lvs)
        no = _LV_NO.match(carrier.file)
        label = lv_name(carrier)
        lvs.append({"id": len(lvs), "no": no.group(1) if no else None,
                    "label": carrier.lv_label or (label.split(" ", 1)[1] if no and " " in label else label),
                    "carrier": head, "documents": members, "items": items, "remarks": remarks,
                    "back": _back(carrier, files[head]["name"]),
                    # every issue with its documents, oldest first; the last one is the tender as it stands
                    "issues": [best(issue) for issue in issues], "before": before, "removed": removed})
    client = next((boqs[n].client for n in mine if boqs[n].client), "")
    awards = [a for a in (_award(n, boqs, docs, lvs) for n, d in enumerate(docs)
                          if d["step"] == "award" and d["readable"]) if a]
    return {"id": project["id"], "awards": awards, "number": project["number"], "name": project["name"], "kind": project["kind"],
            "client": client, "plan": project["plan"], "lvs": lvs, "documents": docs,
            "items": sum(len(lv["items"]) for lv in lvs)}


# ---------------------------------------------------------------- differences as points for the client

def asked(project_id: str) -> set[str]:
    """The text differences the estimator wants to ask the client about, as `document id:item number`."""
    with db.engine().connect() as conn:
        return set(conn.execute(select(db.settings.c.value).where(db.settings.c.key == f"tender_ask:{project_id}")).scalar() or [])


def set_asked(project_id: str, doc_id: int, oz: str, ask: bool) -> set[str]:
    key, entry = f"tender_ask:{project_id}", f"{doc_id}:{oz}"
    with db.engine().begin() as conn:
        kept = set(conn.execute(select(db.settings.c.value).where(db.settings.c.key == key)).scalar() or [])
        kept = kept | {entry} if ask else kept - {entry}
        conn.execute(delete(db.settings).where(db.settings.c.key == key))
        conn.execute(insert(db.settings).values(key=key, value=sorted(kept)))
    return kept


def _figure(value) -> str:
    """A quantity as a German reader writes it: 860 instead of 860.000, 12,5 instead of 12.500."""
    text = format(Decimal(str(value)).normalize(), "f")
    return text.replace(".", ",")


def difference_findings(lv: dict, docs: list[dict], doc_ids: list[int], wanted: set[str]) -> list[Finding]:
    """What the documents of one LV say differently, as findings on its carrier, each with its bidder
    question. Another quantity or unit is a fact about the client's papers and always a finding. Another
    wording may be the client's or our reading of a page, so it is one only where the estimator said so
    (`wanted`, see `asked`)."""
    carrier = docs[lv["carrier"]]
    out = []
    for item in lv["items"]:
        d = item["diff"]
        if not d:
            continue
        other = docs[d["doc"]]
        here, there = f"{carrier['format']} ({carrier['name']})", f"{other['format']} ({other['name']})"
        if "qty" in d or "unit" in d:
            what = "quantity" if "qty" in d else "unit"
            mine = f"{_figure(item['qty'])} {item['unit']}" if item["qty"] is not None else "keine Menge"
            other_qty = d["qty"] if "qty" in d else item["qty"]
            theirs = f"{_figure(other_qty)} {d.get('unit', item['unit'])}" if other_qty is not None else "keine Menge"
            out.append(Finding(
                item_oz=item["oz"], category="error", check_id="D-QTY" if "qty" in d else "D-UNIT",
                title=f"The documents state another {what}", severity="high",
                evidence=f"{carrier['format']}: {mine.replace('keine Menge', 'no quantity')} · "
                         f"{other['format']}: {theirs.replace('keine Menge', 'no quantity')}",
                explanation=f"The {here} states {mine.replace('keine Menge', 'no quantity')} for this item, the {there} "
                            f"states {theirs.replace('keine Menge', 'no quantity')}. "
                            f"The bid is priced on one of them; which one holds is the client's to say.",
                action="ask_client",
                question_de=f"Die {carrier['format']}-Datei nennt für diese Position {mine}, "
                            f"der {other['format']}-Ausdruck dagegen {theirs}. Welche Angabe gilt?"))
        elif f"{doc_ids[lv['carrier']]}:{item['oz']}" in wanted:
            only = [line for line in d.get("only", []) if line]
            quote = f"„{only[0]}“" if only else f"„{item['short']}“"
            out.append(Finding(
                item_oz=item["oz"], category="unclear_scope", check_id="D-TEXT",
                title="The documents word this item differently", severity="warn",
                evidence=(f"only in the {other['format']} file: {quote}" if only
                          else f"{quote}: the text in the {other['format']} file is {round(d['alike'] * 100)} % alike"),
                explanation=f"The text of this item in the {there} is not the text in the {here}. "
                            f"The scope that is priced depends on which wording holds.",
                action="ask_client",
                question_de=f"Der Text dieser Position in der {carrier['format']}-Datei weicht vom "
                            f"{other['format']}-Ausdruck ab"
                            + (f" (nur im {other['format']}-Ausdruck: {quote})" if only else "")
                            + ". Welche Fassung ist maßgebend?"))
    return out
