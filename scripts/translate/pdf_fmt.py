"""PDF: group the text layer into paragraphs, redact the German, write the English into the same place.

The anonymiser replaced whole lines by an overlay in another font, so PyMuPDF's own blocks are useless here:
a paragraph is rebuilt from positioned line fragments (same left edge, same size, consecutive line pitch).
"""
import html
import re

import fitz

from common import TOKEN, needs_translation

OVERLAY_FONTS = ("LiberationSans", "Helvetica")
LIST_START = re.compile(r"^\s*(?:[-–•*·]|\d{1,2}[.)]\s|[a-z][.)]\s)")


FLAGS = fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP


def _spans(page):
    out, seen, boxes = [], set(), []
    for b in page.get_text("rawdict", flags=FLAGS)["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            dx, dy = l["dir"]
            horizontal = abs(dy) < 0.01 and dx > 0.99
            for s in l["spans"]:
                chars = [c for c in s["chars"] if c["c"].strip()]
                text = "".join(c["c"] for c in s["chars"]).strip()
                if not chars or s["size"] < 3:  # hidden footnote anchors of the form generator
                    continue
                # bbox of the visible characters only (leading / trailing spaces are part of the span)
                x0, x1 = min(c["bbox"][0] for c in chars), max(c["bbox"][2] for c in chars)
                y0, y1 = s["bbox"][1], s["bbox"][3]
                key = (text, round(x0), round(y0))
                if key in seen:
                    continue
                seen.add(key)
                boxes.append(fitz.Rect(s["bbox"]))
                out.append({"text": text, "bbox": [x0, y0, x1, y1], "size": s["size"],
                            "bold": bool(s["flags"] & 16) or "bold" in s["font"].lower(),
                            "overlay": s["font"].startswith(OVERLAY_FONTS), "color": s["color"],
                            "mono": "courier" in s["font"].lower(), "base": s["origin"][1], "ok": horizontal})
    # "rawdict" silently drops some lines that "words" still has (seen with an italic font whose glyph boxes
    # have no height: ten lines of contract forms). They are added from the words, one span per printed line.
    lines = {}
    for x0, y0, x1, y1, word, bno, lno, _ in page.get_text("words", flags=FLAGS):
        centre = fitz.Point((x0 + x1) / 2, (y0 + y1) / 2)
        if not any(r.contains(centre) for r in boxes):
            lines.setdefault((bno, lno), []).append((x0, y0, x1, y1, word))
    for words in lines.values():
        x0, y0 = min(w[0] for w in words), min(w[1] for w in words)
        x1, y1 = max(w[2] for w in words), max(w[3] for w in words)
        out.append({"text": " ".join(w[4] for w in words), "bbox": [x0, y0, x1, y1], "size": y1 - y0, "bold": False,
                    "overlay": False, "color": 0x231F20, "mono": False, "base": y1 - 0.12 * (y1 - y0), "ok": True})
    return out


def _fragments(spans):
    """Spans on one baseline that follow each other closely form one fragment (a line within one column)."""
    spans = sorted((s for s in spans if s["ok"]), key=lambda s: (round(s["base"]), s["bbox"][0]))
    frags = []
    for s in spans:
        f = frags[-1] if frags else None
        if f and abs(f["base"] - s["base"]) < 2 and -2 < s["bbox"][0] - f["bbox"][2] < max(4.5, 0.62 * s["size"]):
            gap = s["bbox"][0] - f["bbox"][2]
            f["text"] += (" " if gap > 0.15 * s["size"] else "") + s["text"]
            f["bbox"][2] = max(f["bbox"][2], s["bbox"][2])
            f["bbox"][1] = min(f["bbox"][1], s["bbox"][1])
            f["bbox"][3] = max(f["bbox"][3], s["bbox"][3])
            f["spans"].append(s["bbox"] + [s["base"]])
            f["overlay"] = f["overlay"] and s["overlay"]
            f["bold"] = f["bold"] and s["bold"]
        else:
            frags.append({"text": s["text"], "bbox": list(s["bbox"]), "size": s["size"], "bold": s["bold"],
                          "overlay": s["overlay"], "color": s["color"], "base": s["base"], "spans": [s["bbox"] + [s["base"]]],
                          "mono": s["mono"]})
    return frags


def _paragraphs(frags):
    frags = sorted(frags, key=lambda f: (round(f["bbox"][0] / 3), f["base"]))
    paras = []
    # a line with another fragment to its left on the same baseline is a row of its own (bullet, label: value)
    led = {id(f) for f in frags for g in frags
           if g is not f and abs(g["base"] - f["base"]) < 2 and g["bbox"][2] <= f["bbox"][0] + 1}
    # ... and a line that has a short neighbour close to its right (label: value on one line) stands alone too,
    # so that its box ends before the value
    leads = {id(g) for f in frags for g in frags
             if g is not f and abs(g["base"] - f["base"]) < 2 and 0 <= f["bbox"][0] - g["bbox"][2] < 60}
    for f in frags:
        p = paras[-1] if paras else None
        last = p["frags"][-1] if p else None
        if (last and id(f) not in led and id(f) not in leads and id(last) not in leads and abs(last["bbox"][0] - f["bbox"][0]) <= 3 and abs(last["size"] - f["size"]) < 0.7
                and 0 < f["base"] - last["base"] <= 1.45 * f["size"]
                and (last["bold"] == f["bold"] or last["overlay"] or f["overlay"])):
            p["frags"].append(f)
        else:
            paras.append({"frags": [f]})
    return paras


def _text(para):
    """One line per printed line; the translator decides which breaks are structural."""
    return "\n".join(f["text"] for f in para["frags"])


def extract(path):
    doc = fitz.open(path)
    segs = []
    for pno, page in enumerate(doc):
        if page.rotation:
            page.remove_rotation()
        frags = _fragments(_spans(page))
        paras = _paragraphs(frags)
        boxes = [f["bbox"] for f in frags]
        right_margin = max((b[2] for b in boxes), default=page.rect.width - 30)
        page_segs = []
        for p in paras:
            fr = p["frags"]
            x0 = min(f["bbox"][0] for f in fr)
            y0 = min(f["bbox"][1] for f in fr)
            y1 = max(f["bbox"][3] for f in fr)
            own = max(f["bbox"][2] for f in fr)
            mine = {id(f) for f in fr}
            # right limit: the nearest other fragment to the right on the same lines, else the page's text margin
            limit = right_margin
            for f in frags:
                b = f["bbox"]
                if id(f) not in mine and b[0] >= own - 1 and b[1] < y1 - 2 and b[3] > y0 + 2:
                    limit = min(limit, b[0] - 4)
            limit = max(limit, own)
            # bottom limit: free space down to the next fragment below
            bottom = page.rect.height - 20
            for f in frags:
                b = f["bbox"]
                if id(f) not in mine and b[1] >= y1 - 2 and b[0] < limit and b[2] > x0:
                    bottom = min(bottom, b[1] - 1)
            bottom = max(bottom, y1)
            text = _text(p)
            if not needs_translation(text):
                continue
            real = [f for f in fr if not f["overlay"]] or fr
            steps = sorted(b["base"] - a["base"] for a, b in zip(fr, fr[1:]))
            pitch = steps[len(steps) // 2] if steps else 0
            page_segs.append({"kind": "text", "src": text, "oz": "", "what": "paragraph",
                              "loc": {"page": pno, "rect": [x0, y0, limit, y1], "bottom": min(bottom, y1 + 60),
                                      "own": own, "size": round(real[0]["size"], 1),
                                      "bold": sum(f["bold"] for f in real) * 2 > len(real),
                                      "color": real[0]["color"], "lines": len(fr), "mono": real[0]["mono"],
                                      "pitch": round(pitch, 2),
                                      "spans": [s for f in fr for s in f["spans"]]}})
        page_segs.sort(key=lambda s: (round(s["loc"]["rect"][1] / 4), s["loc"]["rect"][0]))
        segs.extend(page_segs)
    # a paragraph that starts in lower case or ends without punctuation is cut by a page break or by an
    # anonymised line: give the translator the neighbouring text of the same column
    def same_col(a, b):
        return abs(a["loc"]["rect"][0] - b["loc"]["rect"][0]) <= 3 and abs(a["loc"]["size"] - b["loc"]["size"]) < 0.7

    for k, s in enumerate(segs):
        t = TOKEN.sub("X", s["src"]).strip()
        ctx = {}
        if t[0].islower():
            prev = next((p for p in reversed(segs[max(0, k - 40):k]) if same_col(p, s)), None)
            if prev:
                ctx["before"] = prev["src"][-160:]
        if len(t) > 25 and t[-1] not in ".:;!?)'\"" and s["loc"]["lines"] > 1:
            nxt = next((p for p in segs[k + 1:k + 40] if same_col(p, s)), None)
            if nxt and TOKEN.sub("X", nxt["src"]).strip()[0].islower():
                ctx["after"] = nxt["src"][:160]
        if ctx:
            s["ctx"] = ctx
    return segs


def _html(text, size, bold, color, mono=False, pitch=0):
    body = html.escape(text).replace("\n", "<br>")
    weight = "font-weight:bold;" if bold else ""
    family = "monospace" if mono else "sans-serif"
    lh = min(1.6, max(1.0, pitch / size)) if pitch else 1.12
    return (f'<div style="font-family:{family};font-size:{size}pt;line-height:{lh:.3f};margin:0;padding:0;'
            f'color:#{color:06x};{weight}">{body}</div>')


def rebuild(path, segs, lookup, out, report=None):
    doc = fitz.open(path)
    by_page = {}
    for s in segs:
        en = lookup(s)
        if en is not None and " ".join(en.split()) != " ".join(s["src"].split()):
            by_page.setdefault(s["loc"]["page"], []).append((s, en))
    tight = []
    for pno, items in sorted(by_page.items()):
        page = doc[pno]
        if page.rotation:
            page.remove_rotation()
        def band(box):
            x0, y0, x1, y1 = box[:4]
            h = y1 - y0
            return fitz.Rect(x0 + 0.3, y0 + 0.35 * h, x1 - 0.3, y1 - 0.4 * h)

        def baseline(box):
            # glyphs of some fonts have boxes without height that sit on the baseline: a strip there catches them
            x0, y0, x1, y1 = box[:4]
            base = box[4] if len(box) > 4 else y1 - 0.2 * (y1 - y0)
            return fitz.Rect(x0 + 0.3, base - 0.25, x1 - 0.3, base + 0.25)

        rects = [f(box) for s, _ in items for box in s["loc"]["spans"] for f in (band, baseline)]
        mine = {tuple(round(v, 1) for v in box[:4]) for s, _ in items for box in s["loc"]["spans"]}
        # text that is not translated but lies under a redaction (a filled-in value on a blank, an anonymised
        # line printed over other text) is removed completely and written back unchanged
        others = [sp for sp in _spans(page) if tuple(round(v, 1) for v in sp["bbox"]) not in mine]
        restore, grew = [], True
        while grew:
            grew = False
            for sp in list(others):
                if any(fitz.Rect(sp["bbox"]).intersects(r) for r in rects):
                    others.remove(sp)
                    restore.append(sp)
                    rects.append(band(sp["bbox"]))
                    rects.append(baseline(sp["bbox"] + [sp["base"]]))
                    grew = True
        for r in rects:
            page.add_redact_annot(r, fill=False, cross_out=False)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE)
        for sp in restore:
            x0, y0, x1, y1 = sp["bbox"]
            pad = 0.12 * sp["size"]
            page.insert_htmlbox(fitz.Rect(x0, y0 - pad, x1 + 40, y1 + pad),
                                _html(sp["text"], round(sp["size"], 1), sp["bold"], sp["color"], sp["mono"]), scale_low=0)
        for s, en in items:
            loc = s["loc"]
            x0, y0, x1, y1 = loc["rect"]
            pad = 0.12 * loc["size"]
            rect = fitz.Rect(x0, y0 - pad, max(x1, x0 + 20), y1 + pad)
            # insert_htmlbox cuts a word that is wider than the box without saying so ("Location:" in the box
            # of "Ort:"), so the size is reduced first until the longest word fits
            font = "cour" if loc.get("mono") else "hebo" if loc["bold"] else "helv"
            widest = max((fitz.get_text_length(w, fontname=font, fontsize=loc["size"]) for w in en.split()), default=0)
            size = loc["size"]
            if widest > rect.width - 1.5:
                size = round(loc["size"] * (rect.width - 1.5) / widest, 2)
            markup = _html(en, size, loc["bold"], loc["color"], loc.get("mono", False), loc.get("pitch", 0))
            spare, scale = page.insert_htmlbox(rect, markup, scale_low=0.72)
            if spare < 0:  # does not fit at 72 %: use the free space below, then shrink without limit
                rect.y1 = max(rect.y1, loc["bottom"])
                spare, scale = page.insert_htmlbox(rect, markup, scale_low=0)
            scale *= size / loc["size"]
            if scale < 0.72 or spare < 0:
                tight.append({"page": pno + 1, "scale": round(scale, 2), "text": en[:70]})
    doc.subset_fonts()
    doc.save(out, garbage=4, deflate=True)
    return tight
