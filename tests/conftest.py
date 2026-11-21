"""Shared test setup."""
import shutil
from pathlib import Path

import pytest

from boq import api, catalog, db, runs

DATASET = Path(__file__).parent.parent / "dataset"


@pytest.fixture(scope="session")
def seeded_db(tmp_path_factory) -> Path:
    """A SQLite database holding the six demo projects, built once per test run."""
    path = tmp_path_factory.mktemp("db") / "seeded.db"
    db.use(f"sqlite:///{path}")
    catalog.seed_demo(DATASET)
    db.use("sqlite://")  # release the file before it is copied
    return path


@pytest.fixture(autouse=True)
def database(seeded_db, tmp_path, monkeypatch):
    """Every test works on its own copy, so tests never touch the real database (data/boq.db) and a project
    created in one test does not show up in another. Pages drawn for the PDF view go to a temporary folder."""
    monkeypatch.setattr(api, "PAGES", tmp_path / "pages")
    monkeypatch.setattr(runs, "AUTO", False)  # no background run (and no Claude API call) for a test's project
    copy = tmp_path / "boq.db"
    shutil.copy(seeded_db, copy)
    db.use(f"sqlite:///{copy}")
    yield
