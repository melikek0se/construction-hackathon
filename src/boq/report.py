"""Risk report and bidder questions (Bieterfragen) from the findings of an LV.

The report is for the estimator and is in English with German quotes; the bidder questions go to the
client and are in German. Nothing here is estimated: every number is a count or a sum of values that are
in the file, and the report says so where money is not known.
"""
import datetime
import html
import re
from collections import Counter
from decimal import Decimal

from boq.model import BoQ, Finding, Item

# Risk points, used only to rank sections and items against each other.
POINTS = {"high": 5, "warn": 2, "info": 1}
SEVERITY_LABEL = {"high": "Stop", "warn": "Caution", "info": "Note"}
ACTION_LABEL = {
    "ask_client": "Ask the client (bidder question)",
    "add_surcharge": "Price in a risk surcharge",
    "get_quote": "Get a supplier quote",
    "note_for_claims": "Note for later claims",
    "fix_typo": "Correct before submitting",
}
KIND_LABEL = {"lump_sum": "Lump-sum items", "contingency": "Contingency items (Bedarfspositionen)",
              "alternative": "Alternative items (Wahlpositionen)", "hourly": "Hourly-rate items",
              "surcharge": "Surcharge items (Zulagen)"}

# How a finding can turn into a change order under VOB/B §2 (docs/03-domain-primer.md).
MECHANISMS = {
    "abs6": ("§2 Abs. 6", "Additional work", "Work that is needed but not in the contract is paid on top, "
             "if it is announced before execution."),
    "abs5": ("§2 Abs. 5", "Changed work", "If the client has to decide or change what is built, the price "
             "is adjusted."),
    "abs3": ("§2 Abs. 3", "Quantity deviation", "If the executed quantity deviates by more than 10 %, the "
             "unit price is renegotiated."),
    "abs7": ("§2 Abs. 7", "Lump-sum risk", "A lump sum stays fixed when quantities change, so open scope "
             "behind it is the bidder's risk, not a claim."),
}


def mechanism(f: Finding) -> str | None:
    """Key into MECHANISMS, or None when the finding is a plain error or a priced risk."""
    if f.check_id == "R-LUMP-SUM-SCOPE":
        return "abs7"
    if f.check_id == "L-MISSING-ITEM" or (f.check_id.startswith("C-") and f.category == "change_order"):
        return "abs6"
    if f.category == "quantity":
        return "abs3"
    if f.category == "unclear_scope" or f.check_id in ("R-DIM-MISMATCH", "L-CONTRADICTION", "R-REF-BROKEN"):
        return "abs5"
    return None


def _section_of(item: Item) -> tuple[str, str]:
    return item.oz.split(".")[0], (item.path[0] if item.path else "")


def _money(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _quotes(evidence: str) -> str:
    """The quoted LV passages of an evidence string, without the English words rule checks put around them."""
    return " / ".join(f"„{q.strip()}“" for q in re.findall(r"„([^“]{3,})“", evidence))


def _questions(findings: list[Finding], by_oz: dict[str, Item]) -> list[dict]:
    """One bidder question per finding that needs the client, in LV order, without repeats."""
    order = {oz: n for n, oz in enumerate(by_oz)}
    asked, out = set(), []
    for f in sorted((f for f in findings if f.action == "ask_client"),
                    key=lambda f: order.get(f.item_oz or "", len(order))):
        item = by_oz.get(f.item_oz or "")
        text = f.question_de or "Die Leistungsbeschreibung ist an dieser Stelle nicht eindeutig. Wir bitten um Klarstellung."
        key = (f.item_oz, text)
        if key in asked:
            continue
        asked.add(key)
        out.append({
            "no": len(out) + 1, "item_oz": f.item_oz, "related_oz": f.related_oz,
            "item_label": item.label if item else "", "page": item.source.page if item else None,
            "question": text, "evidence": _quotes(f.evidence), "severity": f.severity, "origin": f.origin,
        })
    return out


def build_report(boq: BoQ, findings: list[Finding]) -> dict:
    by_oz: dict[str, Item] = {}
    for item in boq.items:
        by_oz.setdefault(item.oz, item)
    priced = [i for i in boq.items if i.total is not None]
    net = sum((i.total for i in priced), Decimal(0)) if priced else None

    per_item: dict[str, list[Finding]] = {}
    for f in findings:
        if f.item_oz in by_oz:
            per_item.setdefault(f.item_oz, []).append(f)

    sections: dict[str, dict] = {}
    for item in boq.items:
        key, title = _section_of(item)
        s = sections.setdefault(key, {"key": key, "title": title, "items": 0, "items_with_findings": 0,
                                      "high": 0, "warn": 0, "info": 0, "points": 0, "value": Decimal(0),
                                      "value_at_items_with_findings": Decimal(0)})
        s["items"] += 1
        s["value"] += item.total or 0
        own = per_item.get(item.oz, [])
        if own:
            s["items_with_findings"] += 1
            s["value_at_items_with_findings"] += item.total or 0
        for f in own:
            s[f.severity] += 1
            s["points"] += POINTS[f.severity]
    section_rows = []
    for s in sections.values():
        s["value"] = _money(s["value"]) if priced else None
        s["value_at_items_with_findings"] = _money(s["value_at_items_with_findings"]) if priced else None
        section_rows.append(s)

    top_items = sorted(
        ({"item_oz": oz, "label": by_oz[oz].label, "points": sum(POINTS[f.severity] for f in fs),
          "findings": len(fs), "worst": min(fs, key=lambda f: "high warn info".split().index(f.severity)).severity,
          "total": _money(by_oz[oz].total), "headline": fs[0].title or fs[0].check_id}
         for oz, fs in per_item.items()),
        key=lambda r: (-r["points"], -(r["total"] or 0)))[:15]

    kinds = Counter(i.kind for i in boq.items if i.kind != "normal")
    kind_rows = [{"kind": k, "label": KIND_LABEL[k], "items": n,
                  "value": _money(sum((i.total or 0 for i in boq.items if i.kind == k), Decimal(0))) if priced else None}
                 for k, n in kinds.most_common()]

    change_orders = []
    for key, (clause, name, rule) in MECHANISMS.items():
        own = [f for f in findings if mechanism(f) == key]
        if own:
            change_orders.append({"clause": clause, "name": name, "rule": rule, "count": len(own),
                                  "findings": [{"item_oz": f.item_oz, "title": f.title or f.check_id,
                                                "severity": f.severity} for f in own]})

    order = {oz: n for n, oz in enumerate(by_oz)}
    listed = sorted(findings, key=lambda f: (order.get(f.item_oz or "", len(order)), "high warn info".split().index(f.severity)))
    return {
        "lv": {"name": boq.name or boq.file, "file": boq.file, "format": boq.format, "phase": boq.phase,
               "items": len(boq.items), "net_total": _money(net)},
        "generated": datetime.date.today().isoformat(),
        "checks": {"rule": sum(f.origin == "rule" for f in findings), "llm": sum(f.origin == "llm" for f in findings)},
        "counts": {s: sum(f.severity == s for f in findings) for s in POINTS},
        "items_with_findings": len(per_item),
        "actions": [{"action": a, "label": ACTION_LABEL[a], "count": n}
                    for a, n in Counter(f.action for f in findings).most_common()],
        "sections": section_rows,
        "top_items": top_items,
        "position_types": kind_rows,
        "change_orders": change_orders,
        "questions": _questions(findings, by_oz),
        "findings": [{**f.model_dump(mode="json"), "item_label": by_oz[f.item_oz].label if f.item_oz in by_oz else "",
                      "section": _section_of(by_oz[f.item_oz])[0] if f.item_oz in by_oz else "",
                      "mechanism": MECHANISMS[m][0] if (m := mechanism(f)) else None} for f in listed],
    }


def render_questions(report: dict) -> str:
    """The bidder questions as plain German text, ready for an e-mail or the tender platform."""
    lv = report["lv"]
    lines = [f"Bieterfragen zum Leistungsverzeichnis „{lv['name']}“", f"Datei: {lv['file']}", ""]
    if not report["questions"]:
        lines.append("Keine Bieterfragen.")
    for q in report["questions"]:
        where = f"Position {q['item_oz']}" + (f" (Seite {q['page']})" if q["page"] else "")
        lines += [f"Frage {q['no']} – {where}: {q['item_label']}", q["question"]]
        lines += [f"Bezug im LV: {q['evidence']}", ""] if q["evidence"] else [""]
    return "\n".join(lines).rstrip() + "\n"


def _eur(value: float | None) -> str:
    if value is None:
        return "–"
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " EUR"


_CSS = """
:root{--yellow:#ffc400;--ink:#121413;--ink2:#3b403a;--red:#c4161c;--blue:#0a5aa8;--plate:#fcfcf9;--ground:#ecece6;--rule:#cdd0c7}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:500 15px/1.5 Barlow,system-ui,sans-serif}
.page{max-width:210mm;margin:0 auto;background:var(--plate);padding:0 14mm 16mm}
header{background:var(--yellow);margin:0 -14mm;padding:10mm 14mm 6mm;border-bottom:6px solid var(--ink)}
h1,h2,h3,th,.num,.sign{font-family:"Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.02em}
h1{font-size:40px;line-height:1;margin:0 0 6px;font-weight:700}
header p{margin:0;color:#3a2c00}
h2{font-size:26px;margin:28px 0 8px;font-weight:700;border-bottom:3px solid var(--ink);padding-bottom:4px}
h3{font-size:19px;margin:16px 0 4px;font-weight:700}
p{margin:6px 0}
.lede{font-size:17px;max-width:70ch}
.note{color:var(--ink2);max-width:75ch}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}
th{background:var(--ink);color:#fff;text-align:left;padding:5px 8px;font-size:15px;font-weight:600}
td{padding:5px 8px;border-bottom:1px solid var(--rule);vertical-align:top}
td.r,th.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.num{font-weight:700;font-size:17px;white-space:nowrap;font-variant-numeric:tabular-nums}
.sign{display:inline-block;min-width:62px;text-align:center;padding:0 7px;border-radius:3px;font-weight:700;font-size:14px}
.sign.high{background:var(--red);color:#fff}.sign.warn{background:var(--yellow)}.sign.info{background:var(--blue);color:#fff}
.finding{border:2px solid var(--ink);border-radius:6px;margin:10px 0;break-inside:avoid}
.finding>div{padding:8px 12px}
.finding .head{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid var(--rule)}
.finding .head b{flex:1}
blockquote{margin:6px 0;padding:6px 10px;background:var(--ground);font-size:14px}
.tag{border:1px solid var(--ink);border-radius:3px;padding:0 6px;font-size:12px;white-space:nowrap}
.q{margin:12px 0;break-inside:avoid}
.q .text{font-size:16px}
.print{position:fixed;top:12px;right:12px;font:600 16px "Barlow Condensed","Arial Narrow",sans-serif;background:var(--ink);color:#fff;border:0;border-radius:4px;padding:8px 16px;cursor:pointer}
@media print{body{background:#fff}.page{max-width:none;padding:0 0 0}header{margin:0;padding:6mm 0 4mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .print{display:none}th,.sign,blockquote{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:14mm}}
"""


def render_html(report: dict) -> str:
    """The risk report as one self-contained page; print it from the browser to get a PDF."""
    e = html.escape
    lv, counts = report["lv"], report["counts"]
    priced = lv["net_total"] is not None
    total = sum(counts.values())
    phase = {"83": "Tender", "84": "Bid", "86": "Award"}.get(lv["phase"], "LV")

    def sign(sev):
        return f'<span class="sign {sev}">{SEVERITY_LABEL[sev]}</span>'

    out = [f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Risk report – {e(lv["name"])}</title>'
           f'<style>{_CSS}</style></head><body><button class="print" onclick="print()">Print or save as PDF</button>'
           f'<div class="page"><header><h1>Risk report</h1><p><b lang="de">{e(lv["name"])}</b></p>'
           f'<p>{e(lv["file"])}, {phase.lower()} with {lv["items"]} items, '
           f'{_eur(lv["net_total"]) + " net" if priced else "no prices in this file"}. '
           f'Generated {report["generated"]}.</p></header>']

    out.append(f'<h2>Summary</h2><p class="lede">{total} findings on {report["items_with_findings"]} of {lv["items"]} '
               f'items: {counts["high"]} Stop, {counts["warn"]} Caution, {counts["info"]} Note. '
               f'{len(report["questions"])} of them become bidder questions to the client.</p>')
    out.append(f'<p class="note">{report["checks"]["rule"]} findings come from deterministic rule checks'
               + (f', {report["checks"]["llm"]} from the AI review; each AI finding quotes the LV verbatim and '
                  f'should be read by the estimator before it is acted on.' if report["checks"]["llm"]
                  else '. The AI review has not been run for this report.')
               + (' ' if priced else ' The file has no prices, so no finding carries a money amount.') + '</p>')
    if report["actions"]:
        out.append('<table><tr><th>What to do</th><th class="r">Findings</th></tr>'
                   + "".join(f'<tr><td>{e(a["label"])}</td><td class="r">{a["count"]}</td></tr>' for a in report["actions"])
                   + '</table>')

    out.append('<h2>Where the risk sits</h2><p class="note">One row per section of the LV. Risk points rank the '
               'sections against each other: 5 per Stop, 2 per Caution, 1 per Note.</p><table><tr><th>Section</th>'
               '<th class="r">Items</th><th class="r">With findings</th><th class="r">Stop</th><th class="r">Caution</th>'
               '<th class="r">Note</th><th class="r">Points</th>'
               + ('<th class="r">Value of items with findings</th>' if priced else '') + '</tr>')
    for s in sorted(report["sections"], key=lambda s: -s["points"]):
        out.append(f'<tr><td><span class="num">{e(s["key"])}</span> <span lang="de">{e(s["title"])}</span></td>'
                   f'<td class="r">{s["items"]}</td><td class="r">{s["items_with_findings"]}</td><td class="r">{s["high"]}</td>'
                   f'<td class="r">{s["warn"]}</td><td class="r">{s["info"]}</td><td class="r"><b>{s["points"]}</b></td>'
                   + (f'<td class="r">{_eur(s["value_at_items_with_findings"])} of {_eur(s["value"])}</td>' if priced else '')
                   + '</tr>')
    out.append('</table>')

    if report["top_items"]:
        out.append('<h3>Items with the most risk points</h3><table><tr><th>Item</th><th>First finding</th>'
                   '<th class="r">Findings</th><th class="r">Points</th>' + ('<th class="r">Item total</th>' if priced else '') + '</tr>')
        for r in report["top_items"]:
            out.append(f'<tr><td><span class="num">{e(r["item_oz"])}</span> <span lang="de">{e(r["label"][:70])}</span></td>'
                       f'<td>{sign(r["worst"])} {e(r["headline"])}</td><td class="r">{r["findings"]}</td>'
                       f'<td class="r"><b>{r["points"]}</b></td>' + (f'<td class="r">{_eur(r["total"])}</td>' if priced else '') + '</tr>')
        out.append('</table>')

    if report["position_types"]:
        out.append('<h3>Item types that carry risk by themselves</h3><table><tr><th>Type</th><th class="r">Items</th>'
                   + ('<th class="r">Value</th>' if priced else '') + '</tr>'
                   + "".join(f'<tr><td>{e(k["label"])}</td><td class="r">{k["items"]}</td>'
                             + (f'<td class="r">{_eur(k["value"])}</td>' if priced else '') + '</tr>'
                             for k in report["position_types"]) + '</table>')

    out.append('<h2>Change-order potential</h2>')
    if not report["change_orders"]:
        out.append('<p>No finding points to a change-order mechanism.</p>')
    for c in report["change_orders"]:
        out.append(f'<h3>VOB/B {e(c["clause"])}: {e(c["name"])} ({c["count"]})</h3><p class="note">{e(c["rule"])}</p><table>'
                   + "".join(f'<tr><td style="width:90px">{sign(f["severity"])}</td><td style="width:90px"><span class="num">'
                             f'{e(f["item_oz"] or "LV")}</span></td><td>{e(f["title"])}</td></tr>' for f in c["findings"])
                   + '</table>')

    out.append(f'<h2>Bidder questions ({len(report["questions"])})</h2>')
    if report["questions"]:
        out.append('<p class="note">In German, as they go to the client. Read each one against the quoted passage before sending.</p>')
    else:
        out.append('<p>No finding needs a question to the client.</p>')
    for q in report["questions"]:
        where = f'Position {e(q["item_oz"] or "")}' + (f', Seite {q["page"]}' if q["page"] else '')
        out.append(f'<div class="q" lang="de"><b>Frage {q["no"]} – {where}: {e(q["item_label"][:90])}</b>'
                   + ('  <span class="tag">AI</span>' if q["origin"] == "llm" else '')
                   + f'<p class="text">{e(q["question"])}</p>'
                   + (f'<blockquote>Bezug im LV: {e(q["evidence"])}</blockquote>' if q["evidence"] else '') + '</div>')

    out.append(f'<h2>All findings ({total})</h2>')
    section = None
    titles = {s["key"]: s["title"] for s in report["sections"]}
    for f in report["findings"]:
        if f["section"] != section:
            section = f["section"]
            out.append(f'<h3><span class="num">{e(section)}</span> <span lang="de">{e(titles.get(section, ""))}</span></h3>')
        out.append(f'<div class="finding"><div class="head">{sign(f["severity"])}<span class="num">{e(f["item_oz"] or "LV")}</span>'
                   f'<b>{e(f["title"] or f["check_id"])}</b>'
                   + (f'<span class="tag">VOB/B {e(f["mechanism"])}</span>' if f["mechanism"] else '')
                   + ('<span class="tag">AI</span>' if f["origin"] == "llm" else '')
                   + f'</div><div><span lang="de">{e(f["item_label"][:120])}</span><blockquote lang="de">{e(f["evidence"])}</blockquote>'
                   f'<p>{e(f["explanation"])}</p><p><b>{e(ACTION_LABEL[f["action"]])}</b>'
                   + (f', {_eur(float(f["money_at_stake"]))} at stake' if f["money_at_stake"] else '')
                   + (f'. Related items: {e(", ".join(f["related_oz"][:12]))}' if f["related_oz"] else '') + '</p></div></div>')
    out.append('</div></body></html>')
    return "".join(out)
