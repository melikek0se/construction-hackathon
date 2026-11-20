"""File format dispatch."""
import os

from boq.model import BoQ
from boq.parsers.gaeb90 import parse_gaeb90
from boq.parsers.gaeb_xml import parse_gaeb_xml


def parse_file(path: str) -> BoQ:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".x83", ".x84", ".x86"):
        return parse_gaeb_xml(path)
    if ext in (".d83", ".d84", ".d86"):
        return parse_gaeb90(path)
    raise ValueError(f"Unsupported file type: {ext} (GAEB XML and GAEB 90 only so far)")
