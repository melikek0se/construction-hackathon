"""Shared test setup."""
import pytest

from boq import api, catalog


@pytest.fixture(autouse=True)
def projects_in_tmp(tmp_path, monkeypatch):
    """Tests that create a project must not leave it on the real projects page (data/projects/)."""
    monkeypatch.setattr(catalog, "STORE", tmp_path / "projects")
    monkeypatch.setattr(api, "PAGES", tmp_path / "pages")  # pages drawn for LVs without a PDF
