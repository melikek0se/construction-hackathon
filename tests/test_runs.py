"""The pipeline runs in the background: the record of a run, and what it leaves for the file when opened."""
import dataclasses
from pathlib import Path

from fastapi.testclient import TestClient

from boq import pipeline, runs
from boq.api import app
from boq.model import Finding

DATASET = Path(__file__).parent.parent / "dataset"
client = TestClient(app)


def _stub_review(monkeypatch, run):
    """The agentic step without Claude."""
    monkeypatch.setattr(pipeline, "STEPS", [dataclasses.replace(s, run=run) if s.kind == "agentic" else s
                                            for s in pipeline.STEPS])


def test_every_step_is_declared_once_and_listed():
    ids = [s["id"] for s in client.get("/api/pipeline").json()]
    assert len(ids) == len(set(ids)) and "R-ARITHMETIC" in ids and "L-REVIEW" in ids and "P-INTERFACES" in ids


def test_a_run_records_every_step_and_its_ai_findings_open_with_the_file(monkeypatch):
    def review(ctx):
        ctx.tell("1 of 1 sections read")
        item = ctx.boq.items[0]
        return [Finding(item_oz=item.oz, category="unclear_scope", check_id="L-UNCLEAR-SCOPE", severity="high",
                        origin="llm", title="stub", evidence="„x“", explanation="y", action="ask_client")]

    _stub_review(monkeypatch, review)
    assert runs.start("A", "test", wait=True)["status"] == "done"  # demo project A: one LV as X83 and D83
    done = client.get("/api/runs", params={"project": "A"}).json()[0]
    assert done["status"] == "done" and not done["active"] and done["finished_steps"] == done["total"]
    by_doc = {}
    for row in done["steps"]:
        by_doc.setdefault(row["doc"], []).append(row)
    assert [r["step"] for r in by_doc[0]][0] == "READ" and by_doc[0][0]["detail"].endswith("items")
    assert {r["status"] for r in by_doc[0]} == {"done"}
    # the second file is the same LV: the agentic step is not paid for twice, and the record says so
    skipped = [r for r in by_doc[1] if r["status"] == "skipped"]
    assert [r["step"] for r in skipped] == ["L-REVIEW"] and "same LV" in skipped[0]["detail"]
    assert not any(r["scope"] == "project" for r in done["steps"])  # one LV: nothing to compare
    dim = next(r for r in by_doc[0] if r["step"] == "R-DIM-MISMATCH")
    assert dim["counts"]["high"] >= 2  # 5.1.4 and 5.1.46

    opened = client.get("/api/catalog/A/files/0").json()
    assert opened["reviewed"] and any(f["check_id"] == "L-UNCLEAR-SCOPE" for f in opened["findings"])
    other = client.get("/api/catalog/A/files/1").json()
    assert not other["reviewed"] and not any(f["origin"] == "llm" for f in other["findings"])


def test_a_step_that_cannot_run_is_skipped_with_its_reason_and_a_failing_one_does_not_end_the_run(monkeypatch):
    def no_key(ctx):
        raise pipeline.Skip("No working Claude API credentials.")

    _stub_review(monkeypatch, no_key)
    runs.start("A", "test", wait=True)
    done = runs.list_runs("A")[0]
    review = next(r for r in done["steps"] if r["step"] == "L-REVIEW" and r["doc"] == 0)
    assert done["status"] == "done" and review["status"] == "skipped" and "credentials" in review["detail"]
    assert not client.get("/api/catalog/A/files/0").json()["reviewed"]

    def broken(ctx):
        raise RuntimeError("boom")

    _stub_review(monkeypatch, broken)
    runs.start("A", "test", wait=True)
    done = runs.list_runs("A")[0]
    review = next(r for r in done["steps"] if r["step"] == "L-REVIEW" and r["doc"] == 0)
    assert done["status"] == "done" and review["status"] == "failed" and "boom" in review["detail"]


def test_a_building_is_compared_across_its_lvs_and_a_new_project_starts_a_run(monkeypatch):
    _stub_review(monkeypatch, lambda ctx: [])
    started = []
    monkeypatch.setattr(runs, "AUTO", True)
    monkeypatch.setattr(runs, "start", lambda project_id, trigger, wait=False: started.append((project_id, trigger)))
    folder = DATASET / "03_pdf_hochbau_projekt"
    files = [("files", (p.name, p.read_bytes())) for p in (folder / "LV_18_Estrich.pdf", folder / "LV_07_Teppichboden.pdf")]
    created = client.post("/api/projects", files=files, data={"name": "Two trades"}).json()
    assert started == [(created["id"], "project created")]
    monkeypatch.undo()
    monkeypatch.setattr(runs, "AUTO", False)
    _stub_review(monkeypatch, lambda ctx: [])

    runs.start(created["id"], "test", wait=True)
    done = runs.list_runs(created["id"])[0]
    across = [r for r in done["steps"] if r["scope"] == "project"]
    assert [r["step"] for r in across] == ["P-INTERFACES"] and across[0]["status"] == "done"
    assert sum(r["step"] == "L-REVIEW" and r["status"] == "done" for r in done["steps"]) == 2
    assert client.post("/api/catalog/Z/runs").status_code == 404
