"""Check one translated batch: uv run python scripts/translate/check_batch.py b007

Reads data/processed/translation/batches/b007.json and .../out/b007.json and prints every segment that is missing
or fails the automatic checks (line count, digits, anonymisation tokens, DN/PN/DIN strings, German left over).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import WORK, flat, validate  # noqa: E402

name = sys.argv[1].replace(".json", "")
batch = json.loads((WORK / "batches" / f"{name}.json").read_text())
try:
    out = json.loads((WORK / "out" / f"{name}.json").read_text())
except Exception as e:  # noqa: BLE001
    sys.exit(f"cannot read out/{name}.json: {e}")
bad = 0
for item in batch:
    seg = {"kind": "lines" if isinstance(item["src"], list) else "fixed" if "max_chars" in item else "text",
           "src": item["src"], "max": item.get("max_chars", 0)}
    if item["id"] not in out:
        errs = ["missing in output"]
    else:
        errs = validate(seg, out[item["id"]])
    if errs:
        bad += 1
        print(item["id"], "|", "; ".join(errs))
        print("    src:", json.dumps(item["src"], ensure_ascii=False)[:300])
        if item["id"] in out:
            print("    en :", json.dumps(out[item["id"]], ensure_ascii=False)[:300])
extra = set(out) - {i["id"] for i in batch}
if extra:
    print("unknown ids in output:", sorted(extra)[:5])
print(f"{len(batch) - bad} of {len(batch)} segments pass")
