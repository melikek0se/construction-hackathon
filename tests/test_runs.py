"""The pipeline runs in the background: the record of a run, and what it leaves for the file when opened."""
import dataclasses
from pathlib import Path

from fastapi.testclient import TestClient

from boq import catalog, pipeline, runs
from boq.api import app
from boq.model import Finding

DATASET = Path(__file__).parent.parent / "dataset"
client = TestClient(app)


def _stub_review(monkeypatch, run):
    """The agentic step without Claude."""
    monkeypatch.setattr(pipeline, "STEPS", [dataclasses.replace(s, run=run) if s.kind == "agentic" else s
                                            for s in pipeline.STEPS])


def _tender():
    """One LV as X83 and D83, both the tender (project A without its award: with a bid or an award in the
    project the questions are over and the run does not wait)."""
    files = [("files", (p.name, p.read_bytes())) for p in sorted(DATASET.rglob("8209.003_Leistungsverzeichnis_leer.*"))
             if p.suffix.lower() in (".x83", ".d83") and "en" not in p.parts]
    assert len(files) == 2
    files.sort(key=lambda f: f[1][0].lower().endswith(".d83"))
    return client.post("/api/projects", files=files, data={"name": "Tender only"}).json()["id"]


def _taken_on() -> str:
    """The same tender, taken on by the estimator: its run goes all the way to the questions and the prices."""
    pid = _tender()
    catalog.set_plan(pid, {"stage": "check"})
    return pid


def test_a_tender_in_the_intake_is_checked_and_the_questions_and_prices_wait_until_it_is_taken_on(monkeypatch):
    pid = _tender()
    _stub_review(monkeypatch, lambda ctx: [])
    arrived = runs.start(pid, "tender arrived", wait=True)
    by = lambda run, stage: {r["status"] for r in run["steps"] if r["stage"] == stage}  # noqa: E731
    assert "done" in by(arrived, "rules") and "done" in by(arrived, "ai")  # every check ran
    assert by(arrived, "questions") <= {"held", "skipped"} and by(arrived, "prices") <= {"held", "skipped"}
    assert arrived["status"] == "done"  # nothing waits for the estimator but the decision itself

    monkeypatch.setattr(runs, "AUTO", True)
    catalog.set_plan(pid, {"stage": "check"})
    runs.taken_on(pid, wait=True)
    done = runs.find(arrived["id"])  # the same run went on; no second one was started
    assert len(runs.list_runs(pid)) == 1 and "held" not in {r["status"] for r in done["steps"]}
    assert next(r for r in done["steps"] if r["step"] == "Q-GATE" and r["doc"] == 0)["status"] == "waiting"
    assert next(r for r in done["steps"] if r["step"] == "P-PRICES" and r["doc"] == 0)["status"] == "done"


def test_every_step_is_declared_once_and_listed():
    ids = [s["id"] for s in client.get("/api/pipeline").json()]
    assert len(ids) == len(set(ids)) and "R-ARITHMETIC" in ids and "L-REVIEW" in ids and "P-INTERFACES" in ids
    stages = [s["stage"] for s in client.get("/api/pipeline").json()]
    assert list(dict.fromkeys(stages)) == [s for s, _ in pipeline.STAGES]  # the steps stand in station order


def test_a_run_records_every_step_and_its_ai_findings_open_with_the_file(monkeypatch):
    pid = _taken_on()
    def review(ctx):
        ctx.tell("1 of 1 sections read")
        item = ctx.boq.items[0]
        return [Finding(item_oz=item.oz, category="unclear_scope", check_id="L-UNCLEAR-SCOPE", severity="high",
                        origin="llm", title="stub", evidence="„x“", explanation="y", action="ask_client")]

    _stub_review(monkeypatch, review)
    # one LV as X83 and D83. Its findings raise questions: they stay open, the prices are worked out beside them.
    assert runs.start(pid, "test", wait=True)["status"] == "waiting"
    done = client.get("/api/runs", params={"project": pid}).json()[0]
    assert done["status"] == "waiting" and not done["active"] and done["waiting_for"].endswith("to send")
    assert done["questions"]["to_send"] == done["questions"]["total"] > 0 and done["questions"]["out"] == 0
    assert [s["id"] for s in done["stages"]] == [s for s, _ in pipeline.STAGES]
    # compare: no later version, but the LV came in two documents, and those are held against each other
    assert [s["status"] for s in done["stages"]] == ["done", "done", "done", "done", "waiting", "done"]
    held = next(r for r in done["steps"] if r["step"] == "V-DIFF" and r["doc"] == 1)
    assert held["status"] == "done" and held["detail"].startswith("held against the other document") and not any(held["counts"].values())
    by_doc = {}
    for row in done["steps"]:
        by_doc.setdefault(row["doc"], []).append(row)
    assert [r["step"] for r in by_doc[0]][0] == "READ" and "159 items" in by_doc[0][0]["detail"]
    assert {r["status"] for r in by_doc[0] if r["stage"] in ("read", "rules", "ai")} == {"done"}
    # the second file is the same LV: the agentic step is not paid for twice, and the record says so
    skipped = [r for r in by_doc[1] if r["status"] == "skipped"]
    assert "L-REVIEW" in [r["step"] for r in skipped] and "same LV" in skipped[0]["detail"]
    assert not any(r["scope"] == "project" for r in done["steps"])  # one LV: nothing to compare
    dim = next(r for r in by_doc[0] if r["step"] == "R-DIM-MISMATCH")
    assert dim["counts"]["high"] >= 2  # 5.1.4 and 5.1.46

    opened = client.get(f"/api/catalog/{pid}/files/0").json()
    assert opened["reviewed"] and any(f["check_id"] == "L-UNCLEAR-SCOPE" for f in opened["findings"])
    other = client.get(f"/api/catalog/{pid}/files/1").json()
    assert not other["reviewed"] and not any(f["origin"] == "llm" for f in other["findings"])


def test_a_step_that_cannot_run_is_skipped_with_its_reason_and_a_failing_one_does_not_end_the_run(monkeypatch):
    pid = _taken_on()
    def no_key(ctx):
        raise pipeline.Skip("No working Claude API credentials.")

    _stub_review(monkeypatch, no_key)
    runs.start(pid, "test", wait=True)
    done = runs.list_runs(pid)[0]
    review = next(r for r in done["steps"] if r["step"] == "L-REVIEW" and r["doc"] == 0)
    assert done["status"] == "waiting" and review["status"] == "skipped" and "credentials" in review["detail"]
    assert not client.get(f"/api/catalog/{pid}/files/0").json()["reviewed"]

    def broken(ctx):
        raise RuntimeError("boom")

    _stub_review(monkeypatch, broken)
    runs.start(pid, "test", wait=True)
    done = runs.list_runs(pid)[0]
    review = next(r for r in done["steps"] if r["step"] == "L-REVIEW" and r["doc"] == 0)
    assert done["status"] == "waiting" and review["status"] == "failed" and "boom" in review["detail"]


def test_a_building_is_compared_across_its_lvs_and_a_new_project_starts_a_run_when_taken_on(monkeypatch):
    _stub_review(monkeypatch, lambda ctx: [])
    started = []
    monkeypatch.setattr(runs, "AUTO", True)
    monkeypatch.setattr(runs, "start", lambda project_id, trigger, wait=False: started.append((project_id, trigger)))
    folder = DATASET / "03_pdf_hochbau_projekt"
    files = [("files", (p.name, p.read_bytes())) for p in (folder / "LV_18_Estrich.pdf", folder / "LV_07_Teppichboden.pdf")]
    created = client.post("/api/projects", files=files, data={"name": "Two trades"}).json()
    assert started == [(created["id"], "tender arrived")]  # a new project stands in the intake and is checked at once (D-065)
    assert client.get(f"/api/catalog/{created['id']}/summary").json()["checked"] is True
    assert client.patch(f"/api/catalog/{created['id']}", json={"stage": "check"}).json()["plan"]["stage"] == "check"
    # taken on: no run is kept here (`start` is a stand-in), so the tender gets one
    assert started == [(created["id"], "tender arrived"), (created["id"], "taken on")]
    monkeypatch.undo()
    monkeypatch.setattr(runs, "AUTO", False)
    _stub_review(monkeypatch, lambda ctx: [])

    runs.start(created["id"], "test", wait=True)
    done = runs.list_runs(created["id"])[0]
    across = [r for r in done["steps"] if r["scope"] == "project"]
    assert [r["step"] for r in across] == ["P-INTERFACES"] and across[0]["status"] == "done"
    assert sum(r["step"] == "L-REVIEW" and r["status"] == "done" for r in done["steps"]) == 2
    assert client.post("/api/catalog/Z/runs").status_code == 404


def test_the_prices_do_not_wait_for_the_questions_and_the_person_can_close_them(monkeypatch):
    pid = _taken_on()
    _stub_review(monkeypatch, lambda ctx: [])
    waiting = runs.start(pid, "test", wait=True)
    gate = next(r for r in waiting["steps"] if r["step"] == "Q-GATE" and r["doc"] == 0)
    prices = next(r for r in waiting["steps"] if r["step"] == "P-PRICES" and r["doc"] == 0)
    assert gate["status"] == "waiting" and prices["status"] == "done"
    assert catalog.find(pid)["plan"]["stage"] == "check"  # the run does not move the tender: the estimator does

    rules_before = [r["ms"] for r in waiting["steps"] if r["stage"] == "rules"]
    runs.go_on(waiting["id"], wait=True)  # the person closes the questions without the answers
    done = runs.find(waiting["id"])
    gate = next(r for r in done["steps"] if r["step"] == "Q-GATE" and r["doc"] == 0)
    prices = next(r for r in done["steps"] if r["step"] == "P-PRICES" and r["doc"] == 0)
    assert done["status"] == "done" and "closed without" in gate["detail"] and prices["status"] == "done"
    assert done["questions"]["to_send"] == 0 and done["questions"]["total"] > 0
    assert "unit price" in prices["detail"] or "carries its prices" in prices["detail"]
    assert [r["ms"] for r in done["steps"] if r["stage"] == "rules"] == rules_before  # nothing was run twice
    assert client.post("/api/runs/nope/go-on").status_code == 404


def test_a_later_version_is_compared_with_its_tender(monkeypatch):
    _stub_review(monkeypatch, lambda ctx: [])
    tender = next(DATASET.rglob("*NUMMER_001*_leer.X83"))
    award = next(DATASET.rglob("StBALV23040.D86"))
    files = [("files", (p.name, p.read_bytes())) for p in (tender, award)]
    created = client.post("/api/projects", files=files, data={"name": "Tender and award"}).json()
    assert created["kind"] == "versions"
    done = runs.start(created["id"], "test", wait=True)
    diff = [r for r in done["steps"] if r["step"] == "V-DIFF"]
    assert [r["status"] for r in diff] == ["skipped", "done"] and diff[1]["detail"].startswith("against ")
    assert "tender itself" in diff[0]["detail"]


def test_the_waiting_run_goes_on_by_itself_once_the_client_has_answered(monkeypatch):
    pid = _taken_on()
    from boq import mail
    from boq.report import build_report

    _stub_review(monkeypatch, lambda ctx: [])
    waiting = runs.start(pid, "test", wait=True)
    assert waiting["status"] == "waiting"
    opened = client.get(f"/api/catalog/{pid}/files/0").json()
    asked = client.get(f"/api/analyses/{opened['id']}/questions").json()["questions"]
    items = [{"no": q["no"], "key": q["key"], "item_oz": q["item_oz"], "question": q["question"], "evidence": q["evidence"]}
             for q in asked]
    mail_id = mail.keep(mail.BIDDER_QUESTIONS, pid, opened["boq"]["file"], "client@example.org", "Bieterfragen", "…",
                        "draft", items, sent=True)["id"]
    runs.nudge(pid, wait=True)  # sent, not answered: the run still waits, and says so
    still = runs.find(waiting["id"])
    assert still["status"] == "waiting" and "no answer yet" in still["waiting_for"]

    mail.keep_reply(mail_id, "Antwort", {q["key"]: {"status": "answered", "quote": "x", "meaning": "y"} for q in asked})
    runs.nudge(pid, wait=True)
    done = runs.find(waiting["id"])
    gate = next(r for r in done["steps"] if r["step"] == "Q-GATE" and r["doc"] == 0)
    assert done["status"] == "done" and "answered by the client" in gate["detail"]
    assert next(r for r in done["steps"] if r["step"] == "P-PRICES" and r["doc"] == 0)["status"] == "done"


def test_a_run_is_stopped_after_the_step_it_is_on_and_can_be_taken_up_again(monkeypatch):
    pid = _taken_on()
    stop = {"on": True}

    def review(ctx):
        if stop["on"]:  # the person presses Stop while the AI reads
            live = next(iter(runs._live.values()))
            assert runs.cancel(live["id"]) and runs.find(live["id"])["stopping"]
        return []

    _stub_review(monkeypatch, review)
    stopped = runs.start(pid, "test", wait=True)
    after = [r["status"] for r in stopped["steps"] if r["stage"] in ("questions", "prices") and r["doc"] == 0]
    assert stopped["status"] == "cancelled" and set(after) == {"cancelled"} and not stopped["stopping"]
    assert not runs.cancel(stopped["id"])  # it is not going any more

    stop["on"] = False
    runs.retry(stopped["id"], wait=True)
    again = runs.find(stopped["id"])
    assert again["status"] == "waiting" and not any(r["status"] == "cancelled" for r in again["steps"])


def test_a_tender_found_in_the_mail_stands_in_the_intake_until_it_is_taken_on_and_a_bid_can_be_lost(monkeypatch):
    _stub_review(monkeypatch, lambda ctx: [])
    monkeypatch.setattr(runs, "AUTO", True)
    started = []
    monkeypatch.setattr(runs, "start", lambda pid, trigger, wait=False: started.append((pid, trigger)))
    path = DATASET / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
    made = client.post("/api/projects", files=[("files", (path.name, path.read_bytes()))],
                       data={"found": '{"via": "mail", "sender": "vergabe@example.org", "subject": "Ausschreibung"}'})
    pid = made.json()["id"]
    try:
        plan = catalog.find(pid)["plan"]
        assert plan["stage"] == "intake" and plan["found"]["sender"] == "vergabe@example.org"
        assert started == [(pid, "tender arrived")]  # checked as it arrives, before anybody decides on it
        read = client.get(f"/api/catalog/{pid}/summary").json()  # the rules' findings stand on an intake tender too
        assert read["checked"] and read["items"] == 50 and any(read["counts"].values())
        more = DATASET / "04_pdf_tiefbau_sonstige" / "LV-Ausdruck-[PROJEKT_004].pdf"
        client.post("/api/projects", files=[("files", (more.name, more.read_bytes()))], data={"project": pid})
        assert len(catalog.find(pid)["files"]) == 2 and started[-1] == (pid, "files added")  # more files: checked again
        assert client.patch(f"/api/catalog/{pid}", json={"stage": "check"}).json()["plan"]["stage"] == "check"
        assert started[-1] == (pid, "taken on")
        assert client.get(f"/api/catalog/{pid}/summary").json()["checked"]
        assert client.patch(f"/api/catalog/{pid}", json={"outcome": "lost"}).json()["plan"]["outcome"] == "lost"
        assert "outcome" not in client.patch(f"/api/catalog/{pid}", json={"outcome": ""}).json()["plan"]
        assert client.patch(f"/api/catalog/{pid}", json={"outcome": "nope"}).status_code == 422
        assert client.patch(f"/api/catalog/{pid}", json={"stage": "questions"}).status_code == 422
    finally:
        catalog.remove_project(pid)
