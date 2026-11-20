"""Companion-item rules: work that normally comes with other work.

Each rule says: if an item matching `trigger` exists, an item matching `companion` must exist too.
Patterns run against the item label (short text) and are case-insensitive. Add rules here; the
engine is in companions.py. Sources: LV-Positionen.docx (work packages of project C), DIN 4124,
DVGW W 400-2 / W 291, VOB/C DIN 18299 section 4.2, and the item patterns of projects B, D, E.

Keep rules narrow. A rule that fires on a sound LV costs more trust than a missing rule.
"""
import re
from dataclasses import dataclass

from boq.model import Item


@dataclass(frozen=True)
class CompanionRule:
    id: str
    name: str  # what is missing, used in the finding text
    trigger: str
    companion: str
    why: str
    exclude: str = ""  # trigger items matching this are ignored
    same_size: bool = False  # companion must carry the same DN / da as the trigger
    compare_qty: bool = False  # with same_size: summed quantities must agree
    min_depth_m: float | None = None  # trigger only if the label states a depth above this
    severity: str = "warn"
    source: str = ""

    def triggers(self, item: Item) -> bool:
        label = item.label
        if not re.search(self.trigger, label, re.I):
            return False
        if self.exclude and re.search(self.exclude, label, re.I):
            return False
        if self.min_depth_m is not None:
            depth = max_depth_m(label)
            return depth is not None and depth > self.min_depth_m
        return True


def max_depth_m(label: str) -> float | None:
    """Largest stated depth in metres: "T bis 3m", "T 1,25-1,75m", "Tiefe bis 2 m", "bis 2m"."""
    depths = []
    for m in re.finditer(r"(?:\bT|Tiefe)\s*(?:bis\s*)?(?:\d+(?:,\d+)?\s*-\s*)?(\d+(?:,\d+)?)\s*m\b", label):
        depths.append(float(m.group(1).replace(",", ".")))
    for m in re.finditer(r"aushub\w*,?\s*bis\s*(\d+(?:,\d+)?)\s*m\b", label, re.I):
        depths.append(float(m.group(1).replace(",", ".")))
    return max(depths) if depths else None


_INSTALL = r"verleg|einbau|versetz|montier|einzieh|einzug|herstell"
_PIPE = r"rohr|leitung|kabel"

RULES = [
    CompanionRule(
        id="C-SUPPLY-INSTALL",
        name="laying / installation item for the supplied pipe or cable",
        trigger=rf"({_PIPE}).*\bliefern\b|\bliefern\b.*({_PIPE})",
        exclude=rf"{_INSTALL}|markier|dokumentation",
        companion=rf"({_PIPE}).*({_INSTALL})|({_INSTALL}).*({_PIPE})|\bDN\s*\d+\s*verlegen",
        same_size=True,
        compare_qty=True,
        severity="high",
        why="Material is supplied by one item but no item pays for laying it. Either the laying is "
            "missing from the LV (change order under VOB/B §2 Abs. 6) or it is expected inside "
            "another unit price.",
        source="LV-Positionen.docx: 'DN 250 liefern' is always paired with 'DN 250 verlegen'",
    ),
    CompanionRule(
        id="C-PRESSURE-TEST",
        name="pressure test (Druckprüfung)",
        trigger=r"\bdruckrohr|druckleitung|muffendruckrohr",
        exclude=r"spülen|druckprüf|markier|zulage",
        companion=r"druckprüf|dichtheitsprüf|druckprobe",
        why="A pressure pipeline is not accepted without a pressure test (DVGW W 400-2). Without an "
            "item the test, the water and the blind flanges are unpaid.",
        source="LV-Positionen.docx: 'Druckprüfung [m]' in every pipe work package",
    ),
    CompanionRule(
        id="C-DISINFECTION",
        name="flushing and disinfection of the drinking-water pipe",
        trigger=r"(druckrohr|rohr|leitung).*\b(TW|trinkwasser)\b|trinkwasser(leitung|ltg|rohr)",
        exclude=r"spülen|desinf|druckprüf|markier|zulage|garnitur",
        companion=r"desinf|\bspülen\b|rohrspülung",
        why="Drinking-water pipes must be flushed and disinfected before commissioning (DVGW W 291), "
            "including sampling and lab tests. Without an item this is unpaid work.",
    ),
    CompanionRule(
        id="C-TRENCH-BACKFILL",
        name="backfilling and compaction of the trench",
        trigger=r"graben\w*aushub|boden\s+graben|aushub.*graben",
        exclude=r"zulage|verfüll|wieder\s*ein|einbauen",
        companion=r"verfüll|wieder\s*einbau|\bboden\b.*einbauen.*verdicht",
        why="Trench excavation without a backfilling item: backfill material, placing and compaction "
            "testing are not paid anywhere.",
    ),
    CompanionRule(
        id="C-TRENCH-SHORING",
        name="trench shoring (Verbau) or sloped excavation",
        trigger=r"graben",
        exclude=r"zulage|verbau|geböscht",
        companion=r"verbau|geböscht|abböschen",
        min_depth_m=1.25,
        why="Trenches deeper than 1.25 m must be shored or sloped (DIN 4124). Shoring is a special "
            "service under VOB/C DIN 18300; with no item it is either unpaid or a change order.",
    ),
    CompanionRule(
        id="C-PIPE-BEDDING",
        name="pipe bedding (Rohrbettung / Einbettung)",
        trigger=r"(druckrohr|rohre?\b.*(verlegen|graben)|DN\s*\d+\s*verlegen)",
        exclude=r"zulage|markier|spülen|druckprüf|schneiden|bettung",
        companion=r"bettung|rohrauflager|leitungszone|sandbett",
        why="Buried pipes need a bedding and embedment layer. Without an item the sand or gravel and "
            "its placing fall into the pipe-laying price.",
        source="LV-Positionen.docx: 'Sandbettung und Umhüllung [m³]' next to the duct laying items",
    ),
    CompanionRule(
        id="C-SURFACE-RESTORE",
        name="restoration of the asphalt surface",
        trigger=r"(asphalt|bitumin\w*|straßendecke|straßenaufbruch).*(schneiden|aufbruch|aufbrechen|abbrechen|fräsen)"
                r"|asphaltaufbruch|straßenaufbruch",
        companion=r"asphalt(trag|deck|binder|beton)|\bTS\s+asphalt|\bAC\s*\d+|asphaltschicht.*herstellen|tragschicht.*asphalt",
        exclude=r"asphalt(trag|deck|binder)schicht\s.*(herstellen|einbauen)",
        why="The road surface is cut and broken out but no item restores it. Restoration is either "
            "done by others (clarify the interface) or is a change order.",
        source="LV-Positionen.docx work package 'Asphalt': cut, break out, base course, surface course",
    ),
    CompanionRule(
        id="C-TOPSOIL",
        name="re-spreading of topsoil (Oberboden auftragen)",
        trigger=r"oberboden\w*\s.*(abtragen|abtrag)|oberbodenabtrag",
        exclude=r"auftrag|andecken|zulage",
        companion=r"oberboden.*(auftragen|auftrag|andecken)|mutterboden.*(auftragen|andecken)",
        why="Topsoil is stripped and stored but no item spreads it again; the surface would be left "
            "unrestored.",
    ),
    CompanionRule(
        id="C-SITE-CLEARANCE",
        name="site clearance (Baustelle räumen)",
        trigger=r"baustelle\w*\s*(einrichten|herstellen)|baustelleneinrichtung(\s+herstellen)?\s*$",
        exclude=r"räum|vorhalten",
        companion=r"baustelle\w*.*räum|räumen der baustelle",
        why="Site set-up is paid but clearance is not. Clearance then has to be priced into the "
            "set-up item, which shifts cash flow and is easy to forget.",
        source="LV-Positionen.docx: 1.1.10 Baustelleneinrichtung / 1.1.30 Baustelle räumen",
    ),
    CompanionRule(
        id="C-SHAFT-COVER",
        name="shaft cover (Schachtabdeckung)",
        trigger=r"^\s*(\w+schacht|schachtbauwerk)\b",
        exclude=r"abdeckung|rückbau|abbruch|hydrant|schachtung|suchschacht|zulage",
        companion=r"schachtabdeckung|abdeckung",
        why="A shaft is built but no cover is listed. Covers are priced separately by load class "
            "(B 125 / D 400) and are a frequent omission.",
        source="LV-Positionen.docx: 'Kabelschacht liefern und einbauen' + 'Schachtabdeckung'",
    ),
]
