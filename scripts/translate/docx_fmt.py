"""DOCX: translate per <w:p>; the text goes into the first <w:t>, the others are emptied. Other zip entries are copied."""
import re
import zipfile
from html import unescape

from common import needs_translation

PARA = re.compile(r"<w:p[ >].*?</w:p>", re.S)
WT = re.compile(r"(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)")
PARTS = re.compile(r"word/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$")


def extract(path):
    segs = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if not PARTS.match(info.filename):
                continue
            xml = z.read(info).decode("utf-8")
            for n, m in enumerate(PARA.finditer(xml)):
                text = unescape("".join(t.group(2) for t in WT.finditer(m.group(0))))
                if needs_translation(text):
                    segs.append({"kind": "text", "src": text.strip(), "loc": {"part": info.filename, "para": n},
                                 "oz": "", "what": "paragraph"})
    return segs


def _esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rebuild(path, segs, lookup, out):
    todo = {(s["loc"]["part"], s["loc"]["para"]): lookup(s) for s in segs}
    with zipfile.ZipFile(path) as z, zipfile.ZipFile(out, "w") as zo:
        for info in z.infolist():
            data = z.read(info)
            if PARTS.match(info.filename):
                xml = data.decode("utf-8")
                count = -1

                def para(m):
                    nonlocal count
                    count += 1
                    en = todo.get((info.filename, count))
                    if en is None:
                        return m.group(0)
                    first = True

                    def wt(t):
                        nonlocal first
                        if first:
                            first = False
                            open_tag = t.group(1) if "xml:space" in t.group(1) else t.group(1)[:-1] + ' xml:space="preserve">'
                            return open_tag + _esc(en) + t.group(3)
                        return t.group(1) + t.group(3)
                    return WT.sub(wt, m.group(0))
                data = PARA.sub(para, xml).encode("utf-8")
            zo.writestr(info, data, compress_type=info.compress_type)
