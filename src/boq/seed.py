"""Put the demo projects (the six of the challenge dataset) and earlier LLM answers into the database.

    uv run boq-seed            # into whatever DATABASE_URL points to (SQLite data/boq.db when unset)

Safe to run again: projects already there and cached answers already there are left alone. Only ever run on
purpose: a new database starts empty, and the server never seeds by itself.
"""
import json
import os
from pathlib import Path

from boq import catalog, db
from boq.checks import llm
from boq.env import load_env


def seed(dataset: Path) -> tuple[list[str], int]:
    """Demo projects added, and LLM answers copied from data/cache/llm/ (if that folder is there)."""
    added = catalog.seed_demo(dataset)
    copied = 0
    for path in sorted(llm.LEGACY_CACHE_DIR.glob("*.json")):
        if llm.cache_get(path.stem) is None:
            llm.cache_put(path.stem, json.loads(path.read_text(encoding="utf-8")))
            copied += 1
    return added, copied


def main() -> None:
    load_env()
    dataset = Path(os.environ.get("BOQ_DATASET_DIR", db.ROOT / "dataset"))
    print(f"Database: {db.url().split('@')[-1]}")  # never print the password of a Postgres URL
    added, copied = seed(dataset)
    print(f"Demo projects added: {', '.join(added) or 'none (all there already)'}")
    print(f"Cached LLM answers copied: {copied}")


if __name__ == "__main__":
    main()
