"""Runs of the pipeline in the background.

A run takes the files of a project through every step of `boq.pipeline`, in a thread of the server, so the
request that started it returns at once and the user goes on working. Each step of each document is one row
of the run's record (queued, running, done with what it found, skipped with the reason, failed with the
error, waiting for the person, held behind that); the record is kept in the database (`db.runs`) and is
what the pages show.

A run is worked through row by row and can be taken up again where it stands: rows that are done are left
alone. That is how it goes on after the person has dealt with the bidder questions (`nudge`, `go_on`), how
a failed step is tried again (`retry`) and how a run cut off by a restart is finished (`resume_interrupted`).

What a run works out for later requests is kept with it per document: the AI findings and what a later
version changed against the tender (`findings_for`, put onto the file when it is opened), and the facts the
steps state (dates, questions, prices).

The runs live in this process: with several server processes a run would be seen as "interrupted" by the
others. One worker, as for the AI review's progress.
"""
import copy
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import insert, select, update

from boq import amendments, bid, catalog, db, events, pipeline, spend, supply
from boq import intake as intake_rules
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file
from boq.project import lv_name

AUTO = True  # start a run when a project is created or gets files (the tests switch this off)
RUNS_AT_ONCE = 2
AGENTIC_AT_ONCE = 3  # documents an agentic step works on at the same time within one run

PENDING = ("queued", "held", "waiting", "interrupted", "running")  # rows a run still has to work through

_pool = ThreadPoolExecutor(max_workers=RUNS_AT_ONCE, thread_name_prefix="run")
_lock = threading.Lock()
_live: dict[str, dict] = {}  # the runs of this process that are queued or running, by id


class _Cancelled(Exception):
    pass


def _now() -> str:
    return db.now().isoformat()


def _parse(data: bytes, name: str) -> BoQ:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{Path(name).suffix.lower()}"
        path.write_bytes(data)
        boq = parse_file(str(path))
    boq.file = name
    if boq.name == path.stem:  # as boq.api does: the uploaded name, so the AI review's cache is hit
        boq.name = Path(name).stem
    if not boq.items:
        raise ValueError("no LV items found")
    return boq


def _row(step_id: str, title: str, kind: str, scope: str, stage: str, doc: int | None = None,
         file: dict | None = None, report: bool = False) -> dict:
    return {"step": step_id, "title": title, "kind": kind, "scope": scope, "stage": stage, "report": report,
            "doc": doc, "doc_id": file["id"] if file else None, "file": file["name"] if file else None,
            "status": "queued", "detail": "", "counts": None, "ms": None, "usd": None,
            # another file of an LV that is counted already (its print-out, its bid): what the rules find in
            # it is the same finding again, so the stations and the run do not add it up
            "twin": False}


def _plan(project: dict) -> list[dict]:
    """One row per step and document, station by station, in the order they run. Known before anything is
    read, so the record shows from the start what will be done."""
    rows = []
    docs = [(n, f) for n, f in enumerate(project["files"]) if Path(f["name"]).suffix.lower() in SUPPORTED]
    of = lambda n, f, steps: [_row(s.id, s.title, s.kind, s.scope, s.stage, n, f, s.report) for s in steps]  # noqa: E731
    for n, f in docs:
        rows.append(_row("READ", "Read the file", "deterministic", "document", "read", n, f, True))
        rows += of(n, f, pipeline.steps("document", stages=("read", "rules")))
    for n, f in docs:
        rows += of(n, f, pipeline.steps("document", stages=("ai",)))
    if len(docs) > 1:
        for n, f in docs:
            rows += of(n, f, pipeline.steps("versions"))
    if project["kind"] == "trades":
        rows += [_row(s.id, s.title, s.kind, s.scope, s.stage, report=s.report) for s in pipeline.steps("project")]
    for n, f in docs:
        rows += of(n, f, pipeline.steps("document", stages=("questions", "prices")))
    return rows


def _save(run: dict, results: dict | None = None) -> None:
    with _lock:  # a copy: other threads of the run go on writing into it
        values = {"status": run["status"], "state": copy.deepcopy(run)}
        if results is not None:
            values["results"] = copy.deepcopy(results)
    with db.engine().begin() as conn:
        conn.execute(update(db.runs).where(db.runs.c.id == run["id"]).values(**values))


def _counts(findings: list) -> dict:
    counts = {"high": 0, "warn": 0, "info": 0}
    for f in findings:
        counts[f["severity"] if isinstance(f, dict) else f.severity] += 1
    return counts


def _usd(usage: dict) -> float | None:
    """What an agentic step cost (estimate at list prices, boq.spend); 0 when every answer came from the cache."""
    cost = spend.usd(usage.get("model"), usage)
    return None if cost is None else round(cost, 3) if usage.get("api_requests") else 0.0


def _do(run: dict, row: dict, job) -> list | None:
    """One row of the record: run `job`, note what came of it. Returns its findings, None if it did not run
    (skipped, failed, or waiting for the person)."""
    if run.get("cancel"):
        raise _Cancelled
    with _lock:
        row.update(status="running", detail="")
    _save(run)
    started = time.monotonic()
    try:
        # what Claude is asked inside the step is noted in the audit under this project, file and run
        with spend.scope(project_id=run["project_id"], run_id=run["id"], file=row["file"]):
            found = job(row)
        with _lock:
            row.update(status="done", counts=_counts(found))
    except pipeline.Skip as why:
        found = None
        with _lock:
            row.update(status="skipped", detail=str(why))
    except pipeline.Wait as what:
        found = None
        with _lock:
            row.update(status="waiting", detail=str(what))
    except Exception as exc:  # one step failing must not end the run: the others still say something
        found = None
        with _lock:
            row.update(status="failed", detail=f"{type(exc).__name__}: {exc}"[:300])
    with _lock:
        row["ms"] = round((time.monotonic() - started) * 1000)
    _save(run)
    return found


def _work(run: dict, results: dict | None = None) -> None:
    """Work through the rows of a run that are not done yet."""
    results = results if results is not None else {}
    for key in ("llm", "extra", "facts", "keys"):
        results.setdefault(key, {})
    project = None
    try:
        project = catalog.find(run["project_id"])
        if project is None:
            raise RuntimeError("the project is gone")
        with _lock:
            run.update(status="running", started=run.get("started") or _now(), finished=None, error=None)
        _save(run)
        rows = run["steps"]
        files = {f["id"]: f for f in project["files"]}
        docs = [n for n in sorted({r["doc"] for r in rows if r["doc"] is not None})
                if next(r for r in rows if r["doc"] == n)["doc_id"] in files]
        doc_id = {n: next(r for r in rows if r["doc"] == n)["doc_id"] for n in docs}
        mine = lambda n, stages: [r for r in rows if r["doc"] == n and r["scope"] != "project" and r["stage"] in stages]  # noqa: E731
        step_of = {s.id: s for s in pipeline.STEPS}
        data: dict[int, bytes] = {}
        boqs: dict[int, BoQ] = {}
        found: dict[int, list[Finding]] = {}  # per document: what the rules found

        def context(n: int, row: dict, **more) -> pipeline.Context:
            def keep(key: str, value) -> None:
                with _lock:
                    results["facts"].setdefault(str(doc_id[n]), {})[key] = value
                    if key == "questions":  # how the questions of this LV stand: the pages say whose move it is
                        row["tally"] = value

            def spent(usage: dict) -> None:
                with _lock:
                    row["usd"] = _usd(usage)

            return pipeline.Context(boq=boqs[n], data=data[n], project=project, keep=keep, spent=spent,
                                    tell=lambda text: row.__setitem__("detail", text), **more)

        def give_up(n: int, why: str, stages: tuple[str, ...]) -> None:
            with _lock:
                for r in mine(n, stages):
                    if r["status"] in PENDING:
                        r.update(status="skipped", detail=why)

        # 1. read: every document, then the dates it states; 2. rules
        later = ("ai", "compare", "questions", "prices")
        for n in docs:
            read, *checks = mine(n, ("read", "rules"))
            data[n] = catalog.file_bytes(doc_id[n])

            def read_it(row, n=n):
                boqs[n] = _parse(data[n], files[doc_id[n]]["name"])
                sections = len({i.path[0] for i in boqs[n].items if i.path})
                priced = sum(i.total is not None for i in boqs[n].items)
                row["detail"] = (f"{len(boqs[n].items)} items" + (f" in {sections} sections" if sections > 1 else "")
                                 + (f", {priced} with a price" if priced else ""))
                return []

            if read["status"] in PENDING:
                _do(run, read, read_it)
            else:
                try:
                    boqs[n] = _parse(data[n], files[doc_id[n]]["name"])
                except Exception:
                    pass
            if n not in boqs:
                give_up(n, "the file could not be read", ("read", "rules", *later))
                continue
            found[n] = []
            for row in checks:
                step = step_of[row["step"]]
                if row["status"] in PENDING:
                    got = _do(run, row, lambda row, step=step, n=n: step.run(context(n, row)))
                elif row["status"] == "done" and row["stage"] == "rules":  # taken up again: the rules cost nothing
                    got = step.run(pipeline.Context(boq=boqs[n]))
                else:
                    got = None
                if row["stage"] == "rules":
                    found[n] += got or []
        order = [n for n in docs if n in boqs]

        # which file stands for its LV (the agentic steps, the questions and the prices run on that one),
        # and which tender a later version is compared with
        groups = dict(zip(order, intake_rules.same_lv([boqs[n] for n in order])))
        rank = {"tender": 0, "bid": 1, "award": 2}
        stage_of = {n: rank[intake_rules.step_of(files[doc_id[n]]["role"])] for n in order}
        if project["kind"] == "trades":
            chosen = {id(b) for b in intake_rules.one_per_lv([boqs[n] for n in order])}
            first = {n for n in order if id(boqs[n]) in chosen}
        else:
            first = set(order[:1])
        base: dict[int, int] = {}  # per LV group: its tender, a GAEB file before a print-out
        for n in order:
            g = groups[n]
            if g not in base or (stage_of[n], boqs[n].format == "pdf") < (stage_of[base[g]], boqs[base[g]].format == "pdf"):
                base[g] = n

        with _lock:
            for r in rows:
                r["twin"] = r["doc"] is not None and r["doc"] in order and r["doc"] not in first and r["stage"] == "rules"

        def skip_others(n: int, stages: tuple[str, ...]) -> list[dict]:
            """The rows of these stations a document still has to do; a step that runs once per LV is
            skipped on the other files of the LV."""
            todo = []
            for row in mine(n, stages):
                if row["status"] not in PENDING:
                    continue
                if step_of[row["step"]].once_per_lv and n not in first:
                    with _lock:
                        row.update(status="skipped", detail="done on another file of the same LV")
                    continue
                todo.append(row)
            return todo

        # 3. ai: one document after the other within a file, several files at once
        def read_by_ai(n: int) -> None:
            key = str(doc_id[n])
            ai = [Finding.model_validate(f) for f in results["llm"].get(key, [])]
            for row in skip_others(n, ("ai",)):
                ctx = context(n, row, findings=found[n] + ai, ai=ai)
                got = _do(run, row, lambda row, ctx=ctx: step_of[row["step"]].run(ctx))
                if got is not None:
                    ai += [f for f in got if f not in ai]
                    with _lock:
                        results["llm"][key] = [f.model_dump(mode="json") for f in ai]
                    _save(run, results)  # a file opened while the run goes on already has them

        with ThreadPoolExecutor(max_workers=AGENTIC_AT_ONCE, thread_name_prefix="run-ai") as workers:
            list(workers.map(read_by_ai, order))
        if run.get("cancel"):
            raise _Cancelled

        # 4. compare: a later version against its tender, then the LVs of a building against each other
        for n in order:
            for row in mine(n, ("compare",)):
                if row["status"] not in PENDING:
                    continue
                b = base[groups[n]]
                later_version = stage_of[n] > stage_of[b] or (stage_of[n] == stage_of[b] and boqs[n].format == boqs[b].format)
                if n == b or not later_version:
                    with _lock:
                        row.update(status="skipped", detail="this is the tender itself" if n == b else
                                   f"the same step as {boqs[b].file}: a print-out, not a later version")
                    continue
                ctx = context(n, row, base=boqs[b])
                got = _do(run, row, lambda row, ctx=ctx: step_of[row["step"]].run(ctx))
                if got is not None:
                    with _lock:
                        results["extra"][str(doc_id[n])] = [f.model_dump(mode="json") for f in got]
        project_rows = [r for r in rows if r["scope"] == "project" and r["status"] in PENDING]
        if project_rows:
            lvs: dict[str, BoQ] = {}
            for boq in intake_rules.one_per_lv([boqs[n] for n in order]):
                label = lv_name(boq)
                while label in lvs:
                    label += " (2)"
                lvs[label] = boq
            for row in project_rows:
                if len(lvs) < 2:
                    with _lock:
                        row.update(status="skipped", detail="the project has one LV")
                    continue

                def across(row, row_step=step_of[row["step"]]):
                    row["detail"] = f"{len(lvs)} LVs compared"
                    return row_step.run(pipeline.Context(lvs=lvs, project=project))

                _do(run, row, across)

        # 5. questions, a thread that stays open until the client has answered (or the person closes it);
        # 6. prices, worked out beside it: a question can be asked until shortly before the bid, so nothing
        # waits for the answers (D-042)
        waived = set(run.get("waived") or [])
        for n in order:
            key = str(doc_id[n])
            everything = (found[n] + [Finding.model_validate(f) for f in results["llm"].get(key, [])]
                          + [Finding.model_validate(f) for f in results["extra"].get(key, [])])
            with _lock:
                results["keys"][key] = sorted({f"{f.check_id}|{f.item_oz}|{f.evidence}" for f in everything})
            for row in skip_others(n, ("questions", "prices")):
                ctx = context(n, row, findings=everything, waived=doc_id[n] in waived)
                _do(run, row, lambda row, ctx=ctx: step_of[row["step"]].run(ctx))

        waiting = any(r["status"] == "waiting" for r in rows)
        with _lock:
            run.update(status="waiting" if waiting else "done", finished=_now())
        if not run.get("told"):  # said once per run, not again each time a waiting run is taken up
            run["told"] = True
            found = {"high": 0, "warn": 0, "info": 0}
            for r in rows:
                if not r["report"] and not r.get("twin"):
                    for severity, n in (r["counts"] or {}).items():
                        found[severity] += n
            said = [r["detail"] for r in rows if r["step"] in ("Q-DRAFT", "P-INQUIRIES") and r["status"] == "done" and r["detail"]]
            events.record(project["id"], "run", f"The checks ran on {len(order)} file{'' if len(order) == 1 else 's'}: "
                          f"{found['high']} stop{'' if found['high'] == 1 else 's'}, {found['warn']} caution{'' if found['warn'] == 1 else 's'}, "
                          f"{found['info']} note{'' if found['info'] == 1 else 's'}." + "".join(f" {d[0].upper()}{d[1:]}." for d in said),
                          "you" if waiting else "")
        # The run does not move the tender along the board: price suggestions being ready is not the
        # estimator pricing. The card stays in Check until the estimator moves it (D-044).
    except _Cancelled:
        with _lock:
            for r in run["steps"]:
                if r["status"] in PENDING:
                    r.update(status="cancelled", detail="")
            run.update(status="cancelled", finished=_now())
            run.pop("cancel", None)
    except Exception as exc:
        with _lock:
            run.update(status="failed", finished=_now(), error=f"{type(exc).__name__}: {exc}"[:300])
    finally:
        try:
            if project is not None:
                run["since"] = _since(run, results)
                catalog.keep_summary(run["project_id"], None)  # the cards count what this run found
            _save(run, results)
        finally:
            with _lock:
                _live.pop(run["id"], None)


def _since(run: dict, results: dict) -> dict | None:
    """What this run found that the run before it on the project did not, and what is gone."""
    query = (select(db.runs.c.results).where(db.runs.c.project_id == run["project_id"], db.runs.c.id != run["id"],
                                             db.runs.c.created < db.now()).order_by(db.runs.c.created.desc()).limit(6))
    with db.engine().connect() as conn:
        earlier = [r for (r,) in conn.execute(query) if (r or {}).get("keys")]
    if not earlier:
        return None
    new = gone = 0
    for doc, keys in results.get("keys", {}).items():
        before = next((r["keys"][doc] for r in earlier if doc in r["keys"]), None)
        if before is not None:
            new += len(set(keys) - set(before))
            gone += len(set(before) - set(keys))
    return {"new": new, "gone": gone}


# ---------------------------------------------------------------- starting, and taking a run up again

def start(project_id: str, trigger: str, wait: bool = False) -> dict | None:
    """Start a run on a project; None if there is no such project. `trigger`: why it runs, for the record
    ("project created", "files added", "started by hand"). `wait`: run it here and return when it is done."""
    project = catalog.find(project_id)
    if project is None:
        return None
    run = {"id": uuid.uuid4().hex, "project_id": project_id, "project": project["name"], "trigger": trigger,
           "status": "queued", "created": _now(), "started": None, "finished": None, "error": None,
           "since": None, "waived": [], "steps": _plan(project)}
    with db.engine().begin() as conn:
        conn.execute(insert(db.runs).values(id=run["id"], project_id=project_id, created=db.now(),
                                            status="queued", state=run))
    with _lock:
        _live[run["id"]] = run
    if wait:
        _work(run)
    else:
        _pool.submit(_work, run)
    return _view(run)


def autostart(project_id: str, trigger: str) -> None:
    if AUTO:
        start(project_id, trigger)


def _kept(run_id: str) -> tuple[dict, dict] | None:
    with db.engine().connect() as conn:
        row = conn.execute(select(db.runs.c.state, db.runs.c.results).where(db.runs.c.id == run_id)).first()
    return None if row is None else (row.state, row.results or {})


def _take_up(run_id: str, change, wait: bool = False) -> dict | None:
    """Work on through a run that has stopped (waiting, failed steps, interrupted). `change(run)` says what
    is different this time. None: no such run; a run that is going is returned as it is."""
    with _lock:
        live = _live.get(run_id)
    if live is not None:
        return _view(live)
    kept = _kept(run_id)
    if kept is None:
        return None
    run, results = kept
    run.pop("cancel", None)
    change(run)
    if not any(r["status"] in PENDING for r in run["steps"]):
        return _view(run)
    for r in run["steps"]:
        if r["status"] in ("running", "interrupted"):
            r.update(status="queued", detail="")
    run["status"] = "queued"
    with _lock:
        _live[run_id] = run
    _save(run)
    if wait:
        _work(run, results)
    else:
        _pool.submit(_work, run, results)
    return _view(run)


def go_on(run_id: str, wait: bool = False) -> dict | None:
    """The person closes the questions without waiting for the client: what is open stays unanswered and
    is priced as a risk; the run has nothing left to wait for."""
    def waive(run: dict) -> None:
        run["waived"] = sorted({r["doc_id"] for r in run["steps"] if r["status"] == "waiting"} | set(run.get("waived") or []))

    return _take_up(run_id, waive, wait)


def retry(run_id: str, wait: bool = False) -> dict | None:
    """Try the failed steps of a run again, and what was skipped or cancelled behind them."""
    def again(run: dict) -> None:
        for r in run["steps"]:
            if r["status"] in ("failed", "cancelled") or (r["status"] == "skipped" and r["detail"] == "the file could not be read"):
                r.update(status="queued", detail="", counts=None)

    return _take_up(run_id, again, wait)


def cancel(run_id: str) -> bool:
    """Stop a run after the step it is on. False if it is not going."""
    with _lock:
        live = _live.get(run_id)
        if live is not None:
            live["cancel"] = True
    return live is not None


def nudge(project_id: str | None, wait: bool = False) -> None:
    """Something happened to the bidder questions of a project (a message written, sent, answered): the
    run that waits for them looks again, and is done if nothing is open any more."""
    if not project_id:
        return
    query = (select(db.runs.c.id, db.runs.c.status).where(db.runs.c.project_id == project_id)
             .order_by(db.runs.c.created.desc()).limit(1))
    with db.engine().connect() as conn:
        latest = conn.execute(query).first()
    if latest is not None and latest.status == "waiting":
        _take_up(latest.id, lambda run: None, wait)


def resume_interrupted() -> int:
    """After a restart: the runs that were going when the server stopped are worked on from where they
    stood. Returns how many."""
    query = select(db.runs.c.id).where(db.runs.c.status.in_(("queued", "running")))
    with db.engine().connect() as conn:
        ids = [row.id for row in conn.execute(query)]
    with _lock:
        ids = [i for i in ids if i not in _live]
    for run_id in ids:
        _take_up(run_id, lambda run: None)
    return len(ids)


# ---------------------------------------------------------------- what the pages get

def _stages(steps: list[dict]) -> list[dict]:
    """The six stations of a run: how far each is, what it found, and one line on it."""
    out = []
    for stage, title in pipeline.STAGES:
        rows = [r for r in steps if r["stage"] == stage]
        status = {r["status"] for r in rows}
        counts = {"high": 0, "warn": 0, "info": 0}
        for r in rows:
            if not r["report"] and not r.get("twin"):
                for severity, n in (r["counts"] or {}).items():
                    counts[severity] += n
        state = ("none" if not rows else "running" if "running" in status else "waiting" if "waiting" in status
                 else "failed" if "failed" in status and not status & set(PENDING)
                 else "queued" if status & {"queued", "held", "interrupted"}
                 else "cancelled" if "cancelled" in status else "skipped" if status == {"skipped"} else "done")
        said = [r for r in rows if r["report"] and r["status"] in ("done", "waiting") and r["detail"]]
        on = next((r for r in rows if r["status"] == "running"), None) or next(
            (r for r in rows if r["status"] in ("waiting", "failed")), None)
        files = {r["doc"] for r in rows if r["doc"] is not None and r["status"] == "done"}
        line = (on["detail"] or on["title"]) if on else ""
        held_up = [r for r in rows if r["status"] == "waiting"]
        if len(held_up) > 1 and on is held_up[0]:
            line = f"open on {len(held_up)} LVs"
        if not on and said:
            line = said[0]["detail"] if stage == "read" else said[-1]["detail"]
            if len({r["doc"] for r in said}) > 1:
                line = f"{len(files)} files" if stage == "read" else f"{len({r['doc'] for r in said})} LVs: {line}"
        out.append({"id": stage, "title": title, "status": state, "counts": counts, "line": line,
                    "done": sum(r["status"] in ("done", "skipped", "failed", "cancelled") for r in rows),
                    "total": len(rows), "checks": sum(not r["report"] for r in rows)})
    return out


def _view(run: dict) -> dict:
    """A run as the pages get it: the record, with how far it is."""
    with _lock:
        steps = [dict(r) for r in run["steps"]]
        view = {k: v for k, v in run.items() if k != "cancel"} | {"steps": steps}
        view["stopping"] = bool(run.get("cancel"))  # asked to stop: it does after the step it is on
    done = [r for r in steps if r["status"] in ("done", "skipped", "failed", "cancelled")]
    counts = {"high": 0, "warn": 0, "info": 0}
    for r in steps:
        if not r.get("report") and not r.get("twin"):
            for severity, n in (r["counts"] or {}).items():
                counts[severity] += n
    spent = [r["usd"] for r in steps if r.get("usd") is not None]
    held_up = [r for r in steps if r["status"] == "waiting"]
    waiting = {"detail": f"open on {len(held_up)} LVs"} if len(held_up) > 1 else held_up[0] if held_up else None
    tallies = {r["doc"]: r["tally"] for r in steps if r.get("tally")}  # per LV, as its last step left it
    questions = {k: sum(t[k] for t in tallies.values()) for k in ("total", "to_send", "out", "answered")} if tallies else None
    if questions and not held_up:  # nothing waits any more: closed by the person, the deadline or the bid
        questions |= {"to_send": 0, "out": 0}
    return {**view, "total": len(steps), "finished_steps": len(done), "counts": counts, "questions": questions,
            "inquiries": supply.tally(view["project_id"]),
            # what else is the estimator's on this project: answers to decide on, and how far the bid is
            "decisions": amendments.tally(view["project_id"]), "bid": bid.tally(view["project_id"]),
            "stages": _stages(steps), "usd": round(sum(spent), 3) if spent else None,
            "waiting_for": waiting["detail"] if waiting else None,
            "active": view["status"] in ("queued", "running")}


def _seen(run_id: str, state: dict) -> dict:
    with _lock:
        live = _live.get(run_id)
    run = live or state
    run.setdefault("since", None)
    for r in run["steps"]:  # records written before the stations
        r.setdefault("stage", "ai" if r["kind"] == "agentic" else "compare" if r["scope"] == "project"
                     else "read" if r["step"] == "READ" else "rules")
        r.setdefault("report", r["step"] == "READ")
        r.setdefault("usd", None)
        r.setdefault("doc_id", None)
    if live is None and run["status"] in ("queued", "running"):
        # written by a server process that is gone (a restart) and not taken up again
        run = {**run, "status": "interrupted",
               "steps": [{**r, "status": "interrupted"} if r["status"] in ("queued", "running") else r
                         for r in run["steps"]]}
    return _view(run)


def list_runs(project_id: str | None = None, limit: int = 12) -> list[dict]:
    """The latest runs, newest first: of one project, or of all."""
    query = select(db.runs.c.id, db.runs.c.state).order_by(db.runs.c.created.desc()).limit(limit)
    if project_id:
        query = query.where(db.runs.c.project_id == project_id)
    with db.engine().connect() as conn:
        kept = conn.execute(query).all()
    return [_seen(row.id, row.state) for row in kept]


def latest() -> list[dict]:
    """The latest run of every project that has one, newest first: where each project stands."""
    newest = (select(db.runs.c.project_id, db.runs.c.id, db.runs.c.state).order_by(db.runs.c.created.desc()).limit(400))
    with db.engine().connect() as conn:
        kept = conn.execute(newest).all()
    seen: dict[str, dict] = {}
    for row in kept:
        if row.project_id not in seen:
            seen[row.project_id] = _seen(row.id, row.state)
    return list(seen.values())


def find(run_id: str) -> dict | None:
    kept = _kept(run_id)
    return None if kept is None else _seen(run_id, kept[0])


def _results(project_id: str, doc_id: int, part: str):
    query = (select(db.runs.c.results).where(db.runs.c.project_id == project_id)
             .order_by(db.runs.c.created.desc()).limit(5))
    with db.engine().connect() as conn:
        for (results,) in conn.execute(query):
            kept = ((results or {}).get(part) or {}).get(str(doc_id))
            if kept is not None:
                return kept
    return None


def llm_findings(project_id: str, doc_id: int) -> list[Finding] | None:
    """The AI findings of the project's latest run that reviewed this document; None if none did."""
    kept = _results(project_id, doc_id, "llm")
    return None if kept is None else [Finding.model_validate(f) for f in kept]


def version_findings(project_id: str, doc_id: int) -> list[Finding]:
    """What the latest run found this document to change against the tender it follows."""
    return [Finding.model_validate(f) for f in _results(project_id, doc_id, "extra") or []]


def facts(project_id: str, doc_id: int) -> dict:
    """What the steps of the latest run stated about this document: dates, questions, prices, second look."""
    return _results(project_id, doc_id, "facts") or {}
