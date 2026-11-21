"""Unit normalisation. The dataset spells the same unit many ways (docs/02-dataset.md)."""
import re

_ALIASES = {
    "m": "m", "lfm": "m", "lfdm": "m",
    "m2": "m2", "m²": "m2", "qm": "m2",
    "m3": "m3", "m³": "m3", "cbm": "m3",
    "st": "St", "stk": "St", "stck": "St", "stück": "St",
    "psch": "psch", "pau": "psch", "pausch": "psch", "pauschal": "psch", "pschl": "psch",
    "h": "h", "std": "h", "stunde": "h", "stunden": "h", "stde": "h",
    "t": "t", "to": "t",
    "kg": "kg", "l": "l", "km": "km", "cm": "cm", "mm": "mm",
    "d": "d", "tag": "d", "tage": "d", "wo": "Wo", "woche": "Wo", "wochen": "Wo",
    "mt": "Mt", "mon": "Mt", "monat": "Mt", "monate": "Mt", "jahr": "Jahr", "jahre": "Jahr", "jr": "Jahr",
    # time-based rental units: per piece / metre / m2 and week or day
    "stwo": "StWo", "mwo": "mWo", "m2wo": "m2Wo", "m2d": "m2d", "md": "md",
    "kwh": "kWh", "%": "%", "satz": "Satz", "set": "Satz", "paar": "Paar",
}

LUMP_SUM = "psch"
HOURLY = "h"


def normalise_unit(raw: str) -> str:
    """Return the canonical unit, or "" when the spelling is not known."""
    key = re.sub(r"[\s.]", "", raw or "").lower()
    return _ALIASES.get(key, "")
