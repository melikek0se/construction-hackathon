"""Dataset translation pipeline. Run from the repo root with `uv run python scripts/translate/pipeline.py CMD`.

  extract [NAME ...]   segments of every dataset file (or those whose name contains NAME) -> segments/<file>.json
  batch [--size N]     untranslated unique segments -> batches/bNNN.json (document order, ~N source characters)
  ingest               read out/*.json, validate, keep the accepted ones in translations.json, report the rest
  rebuild [NAME ...]   write dataset/en/<same path>
  status               coverage per file
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import docx_fmt  # noqa: E402
import gaeb90_fmt  # noqa: E402
import pdf_fmt  # noqa: E402
import xml_fmt  # noqa: E402
from common import DATASET, OUT, WORK, flat, key_of, load_translations, out_path, save_translations, validate  # noqa: E402

FORMATS = {".x83": xml_fmt, ".d83": gaeb90_fmt, ".d84": gaeb90_fmt, ".d86": gaeb90_fmt, ".pdf": pdf_fmt, ".docx": docx_fmt}
PILOT = ["8209.003_Leistungsverzeichnis_leer.X83", "StBALV23040.D86", "LV_02_PVC_Fussbodenbelag.pdf", "LV-Positionen.docx"]
SEG_DIR, BATCH_DIR, OUT_DIR = WORK / "segments", WORK / "batches", WORK / "out"


def files(names):
    all_files = sorted(p for p in DATASET.rglob("*") if p.is_file() and p.suffix.lower() in FORMATS
                       and OUT not in p.parents)
    if names == ["pilot"]:
        names = PILOT
    sel = [p for p in all_files if not names or any(n in p.name for n in names)]
    # pilot files first, so their segments lead the batches
    return sorted(sel, key=lambda p: (p.name not in PILOT, str(p)))


def seg_file(p):
    return SEG_DIR / (p.relative_to(DATASET).as_posix().replace("/", "__") + ".json")


def load_segs(p):
    return json.loads(seg_file(p).read_text())


def cmd_extract(names):
    SEG_DIR.mkdir(parents=True, exist_ok=True)
    for p in files(names):
        segs = FORMATS[p.suffix.lower()].extract(str(p))
        for n, s in enumerate(segs):
            s["id"] = f"{p.name}#{n}"
            s["file"] = p.relative_to(DATASET).as_posix()
            s["key"] = key_of(s)
        seg_file(p).write_text(json.dumps(segs, ensure_ascii=False))
        print(f"{len(segs):6d} segments {sum(len(flat(s['src'])) for s in segs):8d} chars  {p.relative_to(DATASET)}")


def unique_pending(names):
    tr = load_translations()
    seen, out = set(), []
    for p in files(names):
        if not seg_file(p).exists():
            continue
        for s in load_segs(p):
            if s["key"] not in tr and s["key"] not in seen:
                seen.add(s["key"])
                out.append(s)
    return out


def cmd_batch(args):
    size = 40000
    if "--size" in args:
        k = args.index("--size")
        size = int(args[k + 1])
        del args[k:k + 2]
    hints = json.loads((WORK / "failures.json").read_text()) if (WORK / "failures.json").exists() else {}
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # earlier rounds are archived, and numbering continues so that notes/bNNN.json never collide
    done = WORK / "done"
    done.mkdir(exist_ok=True)
    for old in list(BATCH_DIR.glob("*.json")) + list(OUT_DIR.glob("*.json")):
        old.rename(done / f"{old.parent.name}_{old.name}")
    first = 1 + max([int(f.stem[-3:]) for f in list(done.glob("*.json")) + list((WORK / "notes").glob("*.json"))], default=0)
    pending = unique_pending(args)
    batches, cur, n = [], [], 0
    for s in pending:
        item = {"id": s["key"], "src": s["src"]}
        if s["kind"] == "fixed":
            item["max_chars"] = s["max"]
        if s.get("ctx"):
            item["context_only"] = s["ctx"]
        if s["key"] in hints:
            item["previous_attempt_rejected_because"] = hints[s["key"]]
        cost = len(flat(s["src"])) + 40
        if cur and n + cost > size:
            batches.append(cur)
            cur, n = [], 0
        cur.append(item)
        n += cost
    if cur:
        batches.append(cur)
    for k, b in enumerate(batches, first):
        (BATCH_DIR / f"b{k:03d}.json").write_text(json.dumps(b, ensure_ascii=False, indent=1))
    print(f"{len(pending)} unique segments, {sum(len(flat(s['src'])) for s in pending)} chars -> {len(batches)} batches"
          f" (b{first:03d} - b{first + len(batches) - 1:03d})")


def keep_dashes(src, en):
    """An en dash that a translator turned into a spaced hyphen is put back (same count only)."""
    if isinstance(src, list):
        return [keep_dashes(a, b) for a, b in zip(src, en)] if isinstance(en, list) and len(en) == len(src) else en
    if isinstance(en, str) and "–" in src and "–" not in en and en.count(" - ") == src.count("–"):
        return en.replace(" - ", " – ")
    return en


def cmd_ingest(args):
    force = "--force" in args
    tr = load_translations()
    by_key = {}
    for f in SEG_DIR.glob("*.json"):
        for s in json.loads(f.read_text()):
            by_key.setdefault(s["key"], s)
    failures, ok, missing = {}, 0, 0
    for b in sorted(BATCH_DIR.glob("*.json")):
        want = [x["id"] for x in json.loads(b.read_text())]
        o = OUT_DIR / b.name
        if not o.exists():
            print("no output for", b.name)
            missing += len(want)
            continue
        try:
            got = json.loads(o.read_text())
        except json.JSONDecodeError as e:
            print("invalid JSON in", o.name, e)
            missing += len(want)
            continue
        for key in want:
            if key in tr:
                continue
            if key not in got:
                failures[key] = ["missing in output"]
                continue
            got[key] = keep_dashes(by_key[key]["src"], got[key])
            errs = validate(by_key[key], got[key])
            hard = [e for e in errs if e.startswith(("not a", "line count", "longer", "empty line"))]
            if errs and not (force and not hard):
                failures[key] = errs
            else:
                tr[key] = got[key]
                ok += 1
    save_translations(tr)
    (WORK / "failures.json").write_text(json.dumps(failures, ensure_ascii=False, indent=1))
    print(f"accepted {ok}, rejected {len(failures)}, no output for {missing}; translations total {len(tr)}")
    for key, errs in list(failures.items())[:15]:
        print("  ", key, errs, "|", flat(by_key[key]["src"])[:60].replace("\n", " / "))


def cmd_rebuild(names):
    tr = load_translations()
    notes = {}
    for p in files(names):
        segs = load_segs(p)
        out = out_path(p)
        out.parent.mkdir(parents=True, exist_ok=True)
        todo = sum(1 for s in segs if s["key"] not in tr)
        res = FORMATS[p.suffix.lower()].rebuild(str(p), segs, lambda s: tr.get(s["key"]), str(out))
        if res:
            notes[p.relative_to(DATASET).as_posix()] = res
        print(f"{'OK ' if not todo else f'{todo} untranslated'} {out.relative_to(DATASET)}" + (f"  tight boxes: {len(res)}" if res else ""))
    tight = WORK / "pdf_tight.json"
    old = json.loads(tight.read_text()) if tight.exists() else {}
    for p in files(names):
        old.pop(p.relative_to(DATASET).as_posix(), None)
    old.update(notes)
    tight.write_text(json.dumps(old, ensure_ascii=False, indent=1))


def cmd_status(names):
    tr = load_translations()
    for p in files(names):
        if seg_file(p).exists():
            segs = load_segs(p)
            print(f"{sum(s['key'] in tr for s in segs):6d}/{len(segs):6d}  {p.relative_to(DATASET)}")


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    {"extract": cmd_extract, "batch": cmd_batch, "ingest": cmd_ingest, "rebuild": cmd_rebuild, "status": cmd_status}[cmd](args)
