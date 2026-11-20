"""File format dispatch."""
import os

from boq.model import BoQ
from boq.parsers.gaeb90 import parse_gaeb90
from boq.parsers.gaeb_xml import parse_gaeb_xml

GAEB_XML = {".x83", ".x84", ".x86"}
GAEB_90 = {".d83", ".d84", ".d86"}
SUPPORTED = GAEB_XML | GAEB_90 | {".pdf"}


def parse_file(path: str) -> BoQ:
    ext = os.path.splitext(path)[1].lower()
    if ext in GAEB_XML:
        return parse_gaeb_xml(path)
    if ext in GAEB_90:
        return parse_gaeb90(path)
    if ext == ".pdf":
        from boq.parsers.pdf import parse_pdf  # PyMuPDF is only needed for PDFs
        return parse_pdf(path)
    raise ValueError(f"Unsupported file type: {ext} (GAEB XML, GAEB 90 and PDF)")
