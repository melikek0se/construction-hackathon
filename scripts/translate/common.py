"""Shared pieces of the dataset translation pipeline (German dataset -> dataset/en).

A segment is the unit sent to a translator:
  kind "text"  : src is one string (may contain \n for structural line breaks)
  kind "lines" : src is a list of strings; the translation must have the same number of entries
  kind "fixed" : src is one string and the translation may not be longer than `max` characters
"""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "dataset"
OUT = DATASET / "en"
WORK = ROOT / "data" / "processed" / "translation"
TRANSLATIONS = WORK / "translations.json"

# dataset/en is sorted by project (the mapping of src/boq/catalog.py), not by format like dataset/
PROJECT_DIRS = {
    "A": "A_Maschinentechnik-Anlagenbau_8209.003",
    "B": "B_Ringschluss-Brunnenwasser",
    "C": "C_Fernleitung_2024-001",
    "D": "D_Bachdurchlass_152516",
    "E": "E_Tiefbau-und-Verlegung_501-24-01",
    "F": "F_Ausbildungszentrum-und-Buerogebaeude_79-222",
}
# files that are part of a project although the app's catalogue does not list them (not an LV)
EXTRA_FILES = {"05_positionslisten/LV-Positionen.docx": "C"}


def project_of(src) -> str:
    """Project letter of a dataset file."""
    from boq.catalog import DATASET_PROJECTS

    rel = Path(src).relative_to(DATASET).as_posix()
    if rel in EXTRA_FILES:
        return EXTRA_FILES[rel]
    for p in DATASET_PROJECTS:
        if rel in [f for f, _ in p.get("files", [])] or ("folder" in p and rel.startswith(p["folder"] + "/")):
            return p["id"]
    raise KeyError(f"{rel} belongs to no project: add it to boq.catalog or EXTRA_FILES")


def out_path(src) -> Path:
    """Where the English copy of a dataset file lives: dataset/en/<project>/<file name>."""
    return OUT / PROJECT_DIRS[project_of(src)] / Path(src).name


TOKEN = re.compile(r"\[?[A-Z]{2,}_\d+\]?")
UNITS = {
    "m", "lfm", "lfdm", "m2", "m²", "qm", "m3", "m³", "cbm", "st", "stk", "stck", "psch", "pau", "h", "std", "t", "to",
    "kg", "l", "km", "cm", "mm", "d", "wo", "mt", "jr", "stwo", "mwo", "m2wo", "m2d", "md", "kwh", "eur", "euro",
    "cm2", "km2", "mmt", "m2mt", "m3d", "m3mt", "m3wo", "sth", "stmt", "st/m", "st/j", "dn", "pn", "oz", "lv", "ep",
    "gp", "ag", "an", "x", "nn", "kn", "kw", "bar", "mwst", "din", "en", "iso", "vob", "gaeb",
}
GERMAN_WORDS = set(
    "und oder der das für mit nach von bei wird werden ist sind nicht sowie zur zum dem einschl gemäß inkl bzw "
    "einer eines auf aus durch über unter einschließlich jedoch wie vor siehe gem liefern herstellen einbauen".split()
)
WORD = re.compile(r"[A-Za-zÄÖÜäöüß]+")
NORM_RE = re.compile(r"\b(?:DN|PN|DIN|EN|ISO|SN|SDR|PE|OD|da|DA)\s?\d[\d.,/x-]*\d|\b(?:DN|PN|DIN|EN|ISO|SN|SDR)\s?\d")


def flat(src) -> str:
    return "\n".join(src) if isinstance(src, list) else src


def needs_translation(text: str) -> bool:
    """True when there is a word left that is neither an anonymisation token nor a unit / code."""
    rest = TOKEN.sub(" ", text)
    return any(len(w) >= 2 and w.lower() not in UNITS for w in WORD.findall(rest))


def key_of(seg: dict) -> str:
    blob = json.dumps([seg["kind"], seg["src"], seg.get("ctx", ""), seg.get("max", 0)], ensure_ascii=False)
    return "s" + hashlib.sha1(blob.encode()).hexdigest()[:10]


def load_translations() -> dict:
    return json.loads(TRANSLATIONS.read_text()) if TRANSLATIONS.exists() else {}


def save_translations(tr: dict) -> None:
    TRANSLATIONS.write_text(json.dumps(tr, ensure_ascii=False, indent=0, sort_keys=True))


def validate(seg: dict, en, strict_german: bool = True) -> list[str]:
    """Return the list of problems of one translation; empty means accepted."""
    src = seg["src"]
    errs = []
    if seg["kind"] == "lines":
        if not isinstance(en, list) or not all(isinstance(x, str) for x in en):
            return ["not a list of strings"]
        if len(en) != len(src):
            return [f"line count {len(en)} != {len(src)}"]
        for a, b in zip(src, en):
            if a.strip() and not b.strip():
                errs.append("empty line for non-empty source")
                break
    elif not isinstance(en, str):
        return ["not a string"]
    s, e = flat(src), flat(en)
    if seg["kind"] == "fixed" and len(e) > seg["max"]:
        errs.append(f"longer than {seg['max']} characters ({len(e)})")
    ds, de = Counter(re.findall(r"\d+", s)), Counter(re.findall(r"\d+", e))
    if ds != de:
        errs.append(f"digits differ: missing {sorted((ds - de).elements())} extra {sorted((de - ds).elements())}")
    ts, te = Counter(TOKEN.findall(s)), Counter(TOKEN.findall(e))
    if ts != te:
        errs.append(f"tokens differ: missing {sorted((ts - te).elements())} extra {sorted((te - ts).elements())}")
    squeeze = lambda t: re.sub(r"\s+", " ", t)  # a line break inside "DIN EN\n1610" is not a change
    ns, ne = Counter(NORM_RE.findall(squeeze(s))), Counter(NORM_RE.findall(squeeze(e)))
    if ns - ne:
        errs.append(f"DN/PN/DIN/EN strings changed: {sorted((ns - ne).elements())}")
    if strict_german:
        rest = TOKEN.sub(" ", e)
        words = [w.lower() for w in WORD.findall(rest)]
        german = [w for w in words if w in GERMAN_WORDS]
        if german and len(german) >= max(1, len(words) // 12):
            errs.append(f"German words left: {sorted(set(german))[:6]}")
    return errs


def german_residue(en) -> list[str]:
    """Umlauts / ß and German function words left in a translation (for the report, not a hard failure)."""
    rest = TOKEN.sub(" ", flat(en))
    hits = [w for w in WORD.findall(rest) if re.search(r"[ÄÖÜäöüß]", w) or w.lower() in GERMAN_WORDS]
    return hits
