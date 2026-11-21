"""Score the intake (boq.intake) against the hand mapping of the dataset in boq.catalog.

For every dataset project: is each file put into the right step of the tender (tender, bid, award), with
the right qualifier (package, excerpt, as submitted), and do the files give the project's number and name?

    uv run python scripts/eval_intake.py [-v]
"""
import sys
from pathlib import Path

from boq.catalog import DATASET_PROJECTS
from boq.intake import classify, identity, same_lv, step_of
from boq.parsers import parse_file

DATASET = Path(__file__).resolve().parents[1] / "dataset"


def main(verbose: bool) -> int:
    files = steps = roles = uncertain = 0
    numbers = named = 0
    for p in DATASET_PROJECTS:
        if "folder" in p:
            paths = [(q, "tender") for q in sorted((DATASET / p["folder"]).glob("LV_*"))]
        else:
            paths = [(DATASET / rel, role) for rel, role in p["files"]]
        boqs = [parse_file(str(q)) for q, _ in paths]
        found = identity(boqs)
        numbers += found["number"] == p["number"]
        named += p["name"].replace("–", "-").casefold() in found["name"].casefold()
        print(f"{p['id']}  number {found['number'] or '-':10} (hand: {p['number'] or '-':10})  "
              f"name {found['name']!r}  (hand: {p['name']!r})  LVs {len(set(same_lv(boqs)))}")
        for boq, (_, want) in zip(boqs, paths):
            got = classify(boq, boqs)
            want = "bid" if want == "offer" else want  # "offer" is the hand mapping's word for a contractor's bid
            files += 1
            steps += got["step"] == step_of(want)
            roles += got["role"] == want
            uncertain += not got["certain"]
            if verbose or got["step"] != step_of(want):
                mark = "ok " if got["role"] == want else "~  " if got["step"] == step_of(want) else "BAD"
                print(f"   {mark} {boq.file[:44]:44} {got['role']:15} (hand: {want:15}) "
                      f"{'' if got['certain'] else 'inferred · '}{' · '.join(got['evidence'])}")
    n = len(DATASET_PROJECTS)
    print(f"\nstep {steps}/{files}   role with qualifier {roles}/{files}   marked inferred {uncertain}"
          f"   project number {numbers}/{n}   project name {named}/{n}")
    return 0 if steps == files else 1


if __name__ == "__main__":
    sys.exit(main("-v" in sys.argv))
