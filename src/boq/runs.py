"""Runs of the pipeline in the background.

A run takes the files of a project through every step of `boq.pipeline`, in a thread of the server, so the
request that started it returns at once and the user goes on working. Each step of each document is one row
of the run's record (queued, running, done with what it found, skipped with the reason, failed with the
error); the record is kept in the database (`db.runs`) and is what the pages show.

What a run works out for later requests is kept with it: the AI findings per document, which the API adds
to the file when it is opened (`llm_findings`).

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

from boq import catalog, db, pipeline
from boq import intake as intake_rules
from boq.model import BoQ, Finding
from boq.parsers import SUPPORTED, parse_file
from boq.project import lv_name

AUTO = True  # start a run when a project is created or gets files (the tests switch this off)
RUNS_AT_ONCE = 2
AGENTIC_AT_ONCE = 3  # documents an agentic step works on at the same time within one run

_pool = ThreadPoolExecutor(max_workers=RUNS_AT_ONCE, thread_name_prefix="run")
_lock = threading.Lock()
_live: dict[str, dict] = {}  # the runs of this process that are queued or running, by id


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


def _row(step_id: str, title: str, kind: str, scope: str, doc: int | None = None, file: str | None = None) -> dict:
    return {"step": step_id, "title": title, "kind": kind, "scope": scope, "doc": doc, "file": file,
            "status": "queued", "detail": "", "counts": None, "ms": None}


def _plan(project: dict) -> list[dict]:
    """One row per step and document, in the order they run. Known before anything is read, so the record
    shows from the start what will be done."""
    rows = []
    docs = [(n, f) for n, f in enumerate(project["files"]) if Path(f["name"]).suffix.lower() in SUPPORTED]
    for n, f in docs:
        rows.append(_row("READ", "Read the file", "deterministic", "document", n, f["name"]))
        rows += [_row(s.id, s.title, s.kind, s.scope, n, f["name"]) for s in pipeline.steps("document", "deterministic")]
    for n, f in docs:
        rows += [_row(s.id, s.title, s.kind, s.scope, n, f["name"]) for s in pipeline.steps("document", "agentic")]
    if project["kind"] == "trades":
        rows += [_row(s.id, s.title, s.kind, s.scope) for s in pipeline.steps("project")]
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


def _do(run: dict, row: dict, job) -> list | None:
    """One row of the record: run `job`, note what came of it. Returns its findings, None if it did not run."""
    with _lock:
        row["status"] = "running"
    _save(run)
    started = time.monotonic()
    try:
        found = job(lambda text: row.__setitem__("detail", text))
        with _lock:
            row.update(status="done", counts=_counts(found))
    except pipeline.Skip as why:
        found = None
        with _lock:
            row.update(status="skipped", detail=str(why))
    except Exception as exc:  # one step failing must not end the run: the others still say something
        found = None
        with _lock:
            row.update(status="failed", detail=f"{type(exc).__name__}: {exc}"[:300])
    with _lock:
        row["ms"] = round((time.monotonic() - started) * 1000)
    _save(run)
    return found


def _work(run: dict) -> None:
    results: dict = {"llm": {}}
    try:
        project = catalog.find(run["project_id"])
        if project is None:
            raise RuntimeError("the project is gone")
        with _lock:
            run.update(status="running", started=_now())
        _save(run)
        rows = run["steps"]
        of = lambda n, kind: [r for r in rows if r["doc"] == n and r["kind"] == kind]  # noqa: E731

        # 1. every document: read it, then the deterministic steps
        boqs: dict[int, BoQ] = {}
        found: dict[int, list[Finding]] = {}
        for n in sorted({r["doc"] for r in rows if r["doc"] is not None}):
            doc = project["files"][n]
            read, *checks = of(n, "deterministic")

            def read_it(tell, doc=doc, n=n):
                boqs[n] = _parse(catalog.file_bytes(doc["id"]), doc["name"])
                tell(f"{len(boqs[n].items)} items")
                return []

            _do(run, read, read_it)
            if n not in boqs:
                with _lock:
                    for r in checks + of(n, "agentic"):
                        r.update(status="skipped", detail="the file could not be read")
                continue
            found[n] = []
            for row, step in zip(checks, pipeline.steps("document", "deterministic")):
                ctx = pipeline.Context(boq=boqs[n])
                found[n] += _do(run, row, lambda tell, step=step, ctx=ctx: step.run(_with(ctx, tell))) or []

        # 2. the agentic steps, on one file per LV where the step says so: the file a project opens with
        order = sorted(boqs)
        if project["kind"] == "trades":
            chosen = {id(b) for b in intake_rules.one_per_lv([boqs[n] for n in order])}
            first = {n for n in order if id(boqs[n]) in chosen}
        else:
            first = set(order[:1])
        jobs = []
        for n in order:
            for row, step in zip(of(n, "agentic"), pipeline.steps("document", "agentic")):
                if step.once_per_lv and n not in first:
                    with _lock:
                        row.update(status="skipped", detail="another file of the same LV is reviewed")
                    continue
                jobs.append((n, row, step))

        def agentic(n: int, row: dict, step: pipeline.Step) -> None:
            ctx = pipeline.Context(boq=boqs[n], findings=list(found[n]))
            got = _do(run, row, lambda tell: step.run(_with(ctx, tell)))
            if got is not None:
                with _lock:
                    kept = results["llm"].setdefault(str(project["files"][n]["id"]), [])
                    kept += [f.model_dump(mode="json") for f in got]
                _save(run, results)  # a file opened while the run goes on already has them

        if jobs:
            with ThreadPoolExecutor(max_workers=AGENTIC_AT_ONCE, thread_name_prefix="run-ai") as workers:
                list(workers.map(lambda job: agentic(*job), jobs))

        # 3. across the LVs
        project_rows = [r for r in rows if r["scope"] == "project"]
        if project_rows:
            lvs: dict[str, BoQ] = {}
            for boq in intake_rules.one_per_lv([boqs[n] for n in order]):
                label = lv_name(boq)
                while label in lvs:
                    label += " (2)"
                lvs[label] = boq
            for row, step in zip(project_rows, pipeline.steps("project")):
                if len(lvs) < 2:
                    with _lock:
                        row.update(status="skipped", detail="the project has one LV")
                    continue
                ctx = pipeline.Context(lvs=lvs)
                _do(run, row, lambda tell, step=step, ctx=ctx: (tell(f"{len(lvs)} LVs compared"), step.run(_with(ctx, tell)))[1])

        with _lock:
            run.update(status="done", finished=_now())
    except Exception as exc:
        with _lock:
            run.update(status="failed", finished=_now(), error=f"{type(exc).__name__}: {exc}"[:300])
    finally:
        try:
            _save(run, results)
        finally:
            with _lock:
                _live.pop(run["id"], None)


def _with(ctx: pipeline.Context, tell) -> pipeline.Context:
    ctx.tell = tell
    return ctx


def start(project_id: str, trigger: str, wait: bool = False) -> dict | None:
    """Start a run on a project; None if there is no such project. `trigger`: why it runs, for the record
    ("project created", "files added", "started by hand"). `wait`: run it here and return when it is done."""
    project = catalog.find(project_id)
    if project is None:
        return None
    run = {"id": uuid.uuid4().hex, "project_id": project_id, "project": project["name"], "trigger": trigger,
           "status": "queued", "created": _now(), "started": None, "finished": None, "error": None,
           "steps": _plan(project)}
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


def _view(run: dict) -> dict:
    """A run as the pages get it: the record, with how far it is."""
    with _lock:
        steps = [dict(r) for r in run["steps"]]
        view = {**run, "steps": steps}
    done = [r for r in steps if r["status"] in ("done", "skipped", "failed")]
    counts = {"high": 0, "warn": 0, "info": 0}
    for r in steps:
        for severity, n in (r["counts"] or {}).items():
            counts[severity] += n
    return {**view, "total": len(steps), "finished_steps": len(done), "counts": counts,
            "active": view["status"] in ("queued", "running")}


def list_runs(project_id: str | None = None, limit: int = 12) -> list[dict]:
    """The latest runs, newest first: of one project, or of all."""
    query = select(db.runs.c.id, db.runs.c.state).order_by(db.runs.c.created.desc()).limit(limit)
    if project_id:
        query = query.where(db.runs.c.project_id == project_id)
    with db.engine().connect() as conn:
        kept = conn.execute(query).all()
    out = []
    for row in kept:
        with _lock:
            live = _live.get(row.id)
        run = live or row.state
        if live is None and run["status"] in ("queued", "running"):
            # written by a server process that is gone (a restart): it will not go on
            run = {**run, "status": "interrupted",
                   "steps": [{**r, "status": "interrupted"} if r["status"] in ("queued", "running") else r
                             for r in run["steps"]]}
        out.append(_view(run))
    return out


def llm_findings(project_id: str, doc_id: int) -> list[Finding] | None:
    """The AI findings of the project's latest run that reviewed this document; None if none did."""
    query = (select(db.runs.c.results).where(db.runs.c.project_id == project_id)
             .order_by(db.runs.c.created.desc()).limit(5))
    with db.engine().connect() as conn:
        for (results,) in conn.execute(query):
            kept = ((results or {}).get("llm") or {}).get(str(doc_id))
            if kept is not None:
                return [Finding.model_validate(f) for f in kept]
    return None
