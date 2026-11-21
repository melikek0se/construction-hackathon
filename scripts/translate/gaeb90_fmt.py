"""GAEB 90: translate the text records, re-wrap, renumber. Numeric records stay byte-identical (except cols 75-80)."""
import re
import textwrap

from boq.parsers.gaeb90 import decode, encoding_of

from common import needs_translation

# record type -> (start col, end col) of the text field, 0-based slice
FIELD = {"25": (2, 72), "26": (5, 72), "T0": (2, 74), "T1": (2, 74), "T9": (2, 74), "12": (2, 72), "20": (2, 72),
         "41": (5, 72), "42": (2, 72)}
WRAPPED = {"25", "26", "T1", "20", "42"}
LIST_START = re.compile(r"^\s*(?:[-–•*·]|\d{1,2}[.)]\s|[a-z][.)]\s)")
ASCII_MAP = {"“": '"', "”": '"', "„": '"', "’": "'", "‘": "'", "–": "-", "—": "-", "…": "...", "‑": "-", " ": " ",
             "≥": ">=", "≤": "<=", "×": "x", "•": "-", "→": "->", "″": '"', "′": "'"}


def codec_of(raw: bytes) -> str:
    return encoding_of(raw)


def _lines(path):
    raw = open(path, "rb").read()
    text = decode(raw)
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(eol)
    assert lines[-1] == "", "file does not end with a line ending"
    return lines[:-1], eol, codec_of(raw)


def _cells(area: str):
    """Split a label area into (start, width, text) cells separated by two or more spaces."""
    out = []
    for m in re.finditer(r"\S+(?: \S+)*", area):
        nxt = re.compile(r"\S").search(area, m.end())
        out.append((m.start(), (nxt.start() if nxt else len(area)) - m.start(), m.group(0)))
    return out


def extract(path):
    lines, _, _ = _lines(path)
    obs = {}  # observed max text width per record type
    for l in lines:
        t = l[:2]
        if t in FIELD:
            a, b = FIELD[t]
            obs[t] = max(obs.get(t, 0), len(l[a:b].rstrip()))
    segs, oz, i = [], "", 0
    while i < len(lines):
        l, t = lines[i], lines[i][:2]
        if t == "21":
            oz = l[2:11]
        elif t in ("11", "31"):
            oz = l[2:11].strip()
        if t == "01":
            name = l[2:42].rstrip()
            if needs_translation(name):
                segs.append({"kind": "fixed", "max": 40, "src": name, "loc": {"line": i, "col": 2, "width": 40},
                             "oz": "", "what": "01 project name"})
        elif t in ("06", "07", "08", "11"):
            start = {"06": 3, "07": 2, "08": 8, "11": 16}[t]
            for c0, w, word in _cells(l[start:74]):
                if needs_translation(word):
                    segs.append({"kind": "fixed", "max": w - 1 if c0 + w < 74 - start else w, "src": word,
                                 "loc": {"line": i, "col": start + c0, "width": w}, "oz": oz, "what": t + " label"})
        elif t == "12":
            a, b = FIELD[t]
            if needs_translation(l[a:b]):
                segs.append({"kind": "fixed", "max": b - a, "src": l[a:b].rstrip(), "loc": {"line": i, "col": a, "width": b - a},
                             "oz": oz, "what": "12 title"})
        elif t in WRAPPED:
            a, b = FIELD[t]
            prefix = l[2:a]
            j = i
            run = []
            while j < len(lines) and lines[j][:2] == t and lines[j][2:a] == prefix and lines[j][a:b].strip():
                run.append(lines[j][a:b].rstrip())
                j += 1
            if run:
                if any(needs_translation(h) for h in run):
                    segs.append({"kind": "text", "src": "\n".join(h.strip() for h in run),
                                 "loc": {"first": i, "last": j - 1, "type": t, "prefix": prefix,
                                         "width": max(obs[t], 40), "a": a},
                                 "oz": oz, "what": {"25": "short text", "26": "long text"}.get(t, t + " text block")})
                i = j
                continue
        i += 1
    return segs


def to_codec(text: str, codec: str) -> str:
    for a, b in ASCII_MAP.items():
        text = text.replace(a, b)
    out = []
    for ch in text:
        try:
            ch.encode(codec)
            out.append(ch)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out)


def rebuild(path, segs, lookup, out):
    lines, eol, codec = _lines(path)
    replace = {}  # first line index -> (last index, new record bodies)
    for seg in segs:
        en = lookup(seg)
        if en is None:
            continue
        loc = seg["loc"]
        if seg["kind"] == "fixed":
            i = loc["line"]
            l = replace.get(i, (i, [lines[i][:74]]))[1][0]
            text = to_codec(en, codec)[:loc["width"]].ljust(loc["width"])
            l = l[:loc["col"]] + text + l[loc["col"] + loc["width"]:]
            replace[i] = (i, [l])
            continue
        body = []
        for text in en.split("\n"):
            wrapped = textwrap.wrap(to_codec(text.strip(), codec), loc["width"], break_long_words=True,
                                    break_on_hyphens=False) or [""]
            for w in wrapped:
                body.append((loc["type"] + loc["prefix"] + w).ljust(74))
        replace[loc["first"]] = (loc["last"], body)
    res, i = [], 0
    while i < len(lines):
        if i in replace:
            last, body = replace[i]
            res.extend(body)
            i = last + 1
        else:
            res.append(lines[i][:74])
            i += 1
    data = "".join(f"{l}{n:06d}{eol}" for n, l in enumerate(res, 1))
    assert all(len(l) == 74 for l in res)
    open(out, "wb").write(data.encode(codec))
