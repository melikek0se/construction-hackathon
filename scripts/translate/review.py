"""Independent review of every translation: German next to English, read by a reviewer who did not translate it.

  uv run python scripts/translate/review.py make [--size N]   -> review/rNNN.json (pairs in document order)
  uv run python scripts/translate/review.py check rNNN        -> validates review_out/rNNN.json
  uv run python scripts/translate/review.py apply             -> applies the accepted corrections to translations.json

A reviewer writes review_out/rNNN.json: a list of {"id", "problem", "fixed_en"} for real defects only
(see REVIEWER_BRIEF.md). `fixed_en` has the same shape as the translation and must pass the automatic checks.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import WORK, flat, load_translations, save_translations, validate  # noqa: E402
from pipeline import files, keep_dashes, load_segs  # noqa: E402

REVIEW, REVIEW_OUT = WORK / "review", WORK / "review_out"


def all_segs():
    seen, out = set(), []
    for p in files([]):
        for s in load_segs(p):
            if s["key"] not in seen:
                seen.add(s["key"])
                out.append(s)
    return out


def cmd_make(args):
    size = int(args[args.index("--size") + 1]) if "--size" in args else 45000
    tr = load_translations()
    audit = json.loads((WORK / "audit.json").read_text()) if (WORK / "audit.json").exists() else {}
    flags = {o["key"]: o["why"] for o in audit.get("_segment_outliers", [])}
    REVIEW.mkdir(exist_ok=True)
    REVIEW_OUT.mkdir(exist_ok=True)
    batches, cur, n = [], [], 0
    for s in all_segs():
        en = tr.get(s["key"])
        if en is None or "".join(flat(en).split()) == "".join(flat(s["src"]).split()):
            continue
        item = {"id": s["key"], "de": s["src"], "en": en}
        if s["kind"] == "fixed":
            item["max_chars"] = s["max"]
        if s.get("ctx"):
            item["context_only"] = s["ctx"]
        if s["key"] in flags:
            item["automatic_check_noticed"] = flags[s["key"]]
        cost = len(flat(s["src"])) + 30
        if cur and n + cost > size:
            batches.append(cur)
            cur, n = [], 0
        cur.append(item)
        n += cost
    if cur:
        batches.append(cur)
    for k, b in enumerate(batches, 1):
        (REVIEW / f"r{k:03d}.json").write_text(json.dumps(b, ensure_ascii=False, indent=1))
    print(f"{sum(len(b) for b in batches)} pairs -> {len(batches)} review batches")


def _load(name):
    batch = {x["id"]: x for x in json.loads((REVIEW / f"{name}.json").read_text())}
    out = json.loads((REVIEW_OUT / f"{name}.json").read_text())
    return batch, out


def _check(batch, out):
    """Return (accepted corrections, rejected with reasons)."""
    good, bad = [], []
    if not isinstance(out, list):
        return [], [("-", "output is not a list")]
    for c in out:
        if not isinstance(c, dict) or c.get("id") not in batch:
            bad.append((str(c)[:40], "unknown id"))
            continue
        x = batch[c["id"]]
        if "fixed_en" not in c or not c.get("problem"):
            bad.append((c["id"], "needs problem and fixed_en"))
            continue
        seg = {"kind": "lines" if isinstance(x["de"], list) else "fixed" if "max_chars" in x else "text",
               "src": x["de"], "max": x.get("max_chars", 0)}
        fixed = keep_dashes(x["de"], c["fixed_en"])
        errs = validate(seg, fixed)
        hard = [e for e in errs if not e.startswith("German words")]
        # a correction may not make things worse than the translation it replaces
        before = [e for e in validate(seg, x["en"]) if not e.startswith("German words")]
        if hard and len(hard) >= len(before) and hard != before:
            bad.append((c["id"], "; ".join(hard)))
        elif hard and not before:
            bad.append((c["id"], "; ".join(hard)))
        elif fixed == x["en"]:
            bad.append((c["id"], "fixed_en is identical to the existing English"))
        else:
            good.append({"id": c["id"], "problem": c["problem"], "old": x["en"], "new": fixed})
    return good, bad


def cmd_check(args):
    name = args[0].replace(".json", "")
    try:
        batch, out = _load(name)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"cannot read review_out/{name}.json: {e}")
    good, bad = _check(batch, out)
    for i, why in bad:
        print("REJECTED", i, "|", why)
    print(f"{len(batch)} pairs reviewed, {len(good)} corrections accepted, {len(bad)} rejected")


def cmd_apply(args):
    tr = load_translations()
    log, missing = [], []
    for f in sorted(REVIEW.glob("r*.json")):
        name = f.stem
        if not (REVIEW_OUT / f"{name}.json").exists():
            missing.append(name)
            continue
        batch, out = _load(name)
        good, bad = _check(batch, out)
        for g in good:
            if tr.get(g["id"]) == g["old"]:
                tr[g["id"]] = g["new"]
                log.append({"batch": name, **g})
        for i, why in bad:
            print(name, "rejected", i, why[:120])
    save_translations(tr)
    (WORK / "review_applied.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print(f"{len(log)} corrections applied; batches without output: {missing or 'none'}")


if __name__ == "__main__":
    {"make": cmd_make, "check": cmd_check, "apply": cmd_apply}[sys.argv[1]](sys.argv[2:])
