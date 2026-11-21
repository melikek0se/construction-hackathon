"""GAEB DA XML (.X83 / .X84 / .X86), versions 3.1 and 3.2.

Elements are matched by local name because the two versions use different namespaces.
"""
import os
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

from boq.model import BoQ, Item, Remark, SourceRef
from boq.parsers.common import classify, find_refs, norm_oz, tidy
from boq.units import normalise_unit

_BLOCK = {"p", "br", "li", "tr", "div"}


def _local(el) -> str:
    return el.tag.rsplit("}", 1)[-1]


def _child(el, name):
    return next((c for c in el if _local(c) == name), None)


def _children(el, name):
    return [c for c in el if _local(c) == name]


def _text(el) -> str:
    """Plain text of an HTML-like GAEB text element, with newlines at block boundaries."""
    if el is None:
        return ""
    out = []

    def walk(e):
        if e.text:
            out.append(e.text)
        for c in e:
            walk(c)
            if _local(c) in _BLOCK:
                out.append("\n")
            if c.tail:
                out.append(c.tail)

    walk(el)
    return tidy("".join(out))


def _decimal(el) -> Decimal | None:
    if el is None or not (el.text or "").strip():
        return None
    try:
        return Decimal(el.text.strip().replace(",", "."))
    except InvalidOperation:
        return None


def _description(item) -> tuple[str, str]:
    """(short, long) text of an item, including its sub-descriptions."""
    short, long_parts = "", []
    for desc in [d for d in item.iter() if _local(d) == "Description"]:
        complete = _child(desc, "CompleteText")
        if complete is None:
            continue
        outline = _text(_child(complete, "OutlineText")).replace("\n", " ")
        if not short:
            short = outline
        long_parts.append(_text(_child(complete, "DetailTxt")))
    return short, "\n".join(p for p in long_parts if p)


def _walk(body, oz_parts, path, boq: BoQ):
    for el in body:
        name = _local(el)
        if name == "BoQCtgy":
            label = _text(_child(el, "LblTx")).split("\n", 1)[0]
            inner = _child(el, "BoQBody")
            if inner is not None:
                _walk(inner, oz_parts + [el.get("RNoPart", "")], path + [label], boq)
        elif name == "Itemlist":
            for it in el:
                if _local(it) == "Item":
                    boq.items.append(_item(it, oz_parts, path, boq.file))
                elif _local(it) in ("Remark", "PerfDescr"):
                    _remark(it, path, boq)
        elif name in ("Remark", "PerfDescr"):
            _remark(el, path, boq)


def _remark(el, path, boq: BoQ):
    text = _text(el)
    if text:
        boq.remarks.append(Remark(path=path, text=text))


def _item(el, oz_parts, path, file) -> Item:
    short, long = _description(el)
    unit_raw = (getattr(_child(el, "QU"), "text", "") or "").strip()
    item = Item(
        oz=norm_oz(oz_parts + [el.get("RNoPart", ""), el.get("RNoIndex", "")]),
        path=path,
        short_text=short,
        long_text=long,
        qty=_decimal(_child(el, "Qty")),
        unit_raw=unit_raw,
        unit=normalise_unit(unit_raw),
        up=_decimal(_child(el, "UP")),
        total=_decimal(_child(el, "IT")),
        source=SourceRef(file=file, xml_id=el.get("ID")),
    )
    item.refs = find_refs(item.text)
    provis = (getattr(_child(el, "Provis"), "text", "") or "").strip()
    item.kind = classify(
        item,
        alternative=_child(el, "ALNGroupNo") is not None,
        contingency=bool(provis),
        lump_sum=(getattr(_child(el, "LumpSumItem"), "text", "") or "").strip() == "Yes",
    )
    return item


def _child_text(el, name: str) -> str:
    return next(((c.text or "").strip() for c in el if _local(c) == name), "")


def parse_gaeb_xml(path: str) -> BoQ:
    root = ET.parse(path).getroot()
    boq = BoQ(file=os.path.basename(path), format="gaeb_xml")
    for el in root.iter():
        name = _local(el)
        if name == "DP" and not boq.phase:
            boq.phase = (el.text or "").strip()
        elif name == "LblBoQ" and not boq.name:
            boq.name = (el.text or "").strip()
        elif name == "PrjInfo":
            boq.project_no, boq.project = _child_text(el, "NamePrj"), _child_text(el, "LblPrj")
        elif name == "OWN" and not boq.client:
            boq.client = next((_child_text(a, "Name1") for a in el if _local(a) == "Address"), "")
        elif name == "AddText":
            _remark(el, [], boq)
    for el in root.iter():
        if _local(el) == "BoQ":
            body = _child(el, "BoQBody")
            if body is not None:
                _walk(body, [], [], boq)
    _link_repeats(root, boq)
    return boq


def _link_repeats(root, boq: BoQ):
    """A repeat description (<RefDescr>Rep</RefDescr>) names its reference item by ID (<RefRNo IDRef="I54"/>)
    and carries only the difference as text; GAEB 90 prints "Wie Position …" there instead. Record the
    reference item's OZ in `refs`, as the text references are."""
    by_id = {i.source.xml_id: i for i in boq.items if i.source.xml_id}
    for el in root.iter():
        if _local(el) != "Item" or el.get("ID") not in by_id:
            continue
        item = by_id[el.get("ID")]
        for ref in el.iter():
            linked = by_id.get(ref.get("IDRef", "")) if _local(ref) == "RefRNo" else None
            target = linked.oz if linked else None
            if target and target != item.oz and target not in item.refs:
                item.refs.append(target)
