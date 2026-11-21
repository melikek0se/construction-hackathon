"""GAEB XML: translate text nodes on the raw string, every other byte stays as it is."""
import re
from html import unescape

from common import needs_translation

PIECE = re.compile(r"<!--.*?-->|<\?.*?\?>|<[^>]+>|[^<]+", re.S)
INLINE = {"span", "p", "b", "i", "u", "div", "br", "strong", "em", "sub", "sup"}
LABELS = {"LblBoQ", "LblBoQBkdn", "LblTime", "CurLbl", "PerfLbl", "LblUPComp1", "LblUPComp2", "LblUPComp3",
          "LblUPComp4", "LblUPComp5", "LblUPComp6"}
MAX_LINES = 40


def _local(tag: str) -> str:
    return re.match(r"</?\s*([^\s/>]+)", tag).group(1).split(":")[-1]


def extract(path):
    s = open(path, "rb").read().decode("utf-8")
    segs, cur, cur_container = [], None, None
    stack = []  # (local name, index)
    oz_parts, short = [], ""
    breaks = 0

    def close():
        nonlocal cur
        if cur and any(needs_translation(t) for t in cur["src"]):
            segs.append(cur)
        cur = None

    for n, m in enumerate(PIECE.finditer(s)):
        piece = m.group(0)
        if piece.startswith("<"):
            if piece.startswith(("<!--", "<?")):
                continue
            name = _local(piece)
            if piece.startswith("</"):
                while stack and stack.pop()[0] != name:
                    pass
                if name not in INLINE:
                    close()
            elif piece.endswith("/>"):
                if name == "p":
                    close()
                elif name == "br":
                    breaks += 1
                    if breaks >= 2:
                        close()
            else:
                stack.append((name, n))
                if name not in INLINE:
                    close()
                rno = re.search(r'RNoPart="([^"]*)"', piece)
                if name in ("BoQCtgy", "Item"):
                    depth = sum(1 for x, _ in stack if x in ("BoQCtgy", "Item"))
                    oz_parts[depth - 1:] = [rno.group(1) if rno else "?"]
            continue
        if not piece.strip() or not stack:
            continue
        parent = stack[-1][0]
        if parent in LABELS:
            core = piece.strip()
            if needs_translation(unescape(core)):
                lead = len(piece) - len(piece.lstrip())
                segs.append({"kind": "text", "src": unescape(core), "loc": {"nodes": [[m.start() + lead, m.start() + lead + len(core)]]},
                             "oz": "", "what": parent})
            continue
        if parent not in INLINE:
            continue
        container = next((i for x, i in reversed(stack) if x not in INLINE), None)
        cname = next((x for x, i in reversed(stack) if x not in INLINE), "")
        if cur is None or container != cur_container or len(cur["src"]) >= MAX_LINES:
            close()
            cur = {"kind": "lines", "src": [], "loc": {"nodes": []}, "oz": ".".join(oz_parts), "what": cname}
            cur_container = container
        breaks = 0
        core = piece.strip()
        lead = len(piece) - len(piece.lstrip())
        cur["src"].append(unescape(core))
        cur["loc"]["nodes"].append([m.start() + lead, m.start() + lead + len(core)])
    close()
    return segs


def _esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rebuild(path, segs, lookup, out):
    s = open(path, "rb").read().decode("utf-8")
    repl = []
    for seg in segs:
        en = lookup(seg)
        if en is None:
            continue
        lines = en if seg["kind"] == "lines" else [en]
        for (a, b), text, src in zip(seg["loc"]["nodes"], lines, seg["src"] if seg["kind"] == "lines" else [seg["src"]]):
            if needs_translation(src) or text.strip() != src.strip():
                repl.append((a, b, _esc(text.strip())))
    for a, b, text in sorted(repl, reverse=True):
        s = s[:a] + text + s[b:]
    open(out, "wb").write(s.encode("utf-8"))
