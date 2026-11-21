import { useEffect, useRef, useState } from "react";
import { Sign } from "./components";
import { SEVERITIES, SEVERITY_LABEL, type Run, type RunStep, type Severity } from "./types";
import "./runs.css";

/* The pipeline runs (src/boq/runs.py): what is being checked in the background, step by step.
   - RunsSwitch: the button in the band, on the projects page (all runs) and on a project (its runs).
     While a run is going it counts the steps done.
   - RunsDialog: the record. A run, its documents, and under each document every step of the pipeline
     (src/boq/pipeline.py) with what it found. The same sign on two posts as the other dialogs. */

const KIND = { deterministic: "Rule", agentic: "AI" } as const;

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function took(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

const STATUS: Record<Run["status"], string> = {
  queued: "Waiting",
  running: "Running",
  done: "Done",
  failed: "Failed",
  interrupted: "Interrupted",
};

function Counts({ counts }: { counts: Record<Severity, number> }) {
  const any = SEVERITIES.some((s) => counts[s] > 0);
  if (!any) return <span className="run-none">nothing found</span>;
  return (
    <span className="run-counts">
      {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} title={SEVERITY_LABEL[s]}>
          <Sign severity={s} size={13} />
          {counts[s]}
        </span>
      ))}
    </span>
  );
}

/** The step a run is on right now, in words. */
function nowDoing(run: Run): string {
  const on = run.steps.filter((s) => s.status === "running");
  if (on.length === 0) return run.status === "queued" ? "waiting for a free worker" : "";
  const first = on[0];
  const where = first.file ? ` · ${first.file}` : "";
  return `${first.title}${where}${on.length > 1 ? ` and ${on.length - 1} more` : ""}`;
}

export function RunsSwitch({ runs, onOpen }: { runs: Run[]; onOpen: () => void }) {
  const active = runs.filter((r) => r.active);
  const done = active.reduce((n, r) => n + r.finished_steps, 0);
  const total = active.reduce((n, r) => n + r.total, 0);
  return (
    <button
      className={`btn plain runs-switch${active.length > 0 ? " going" : ""}`}
      onClick={onOpen}
      title={active.length > 0 ? `${nowDoing(active[0])}` : "The checks run on the files, step by step"}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d="M1 2.5h4M1 7h4M1 11.5h4M8 2.5h5M8 7h5M8 11.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      </svg>
      {active.length > 0 ? (
        <>
          Checking
          <b className="num">
            {done}/{total}
          </b>
        </>
      ) : (
        "Pipeline"
      )}
    </button>
  );
}

function StepRow({ row }: { row: RunStep }) {
  return (
    <li className={`run-step is-${row.status}`}>
      <i className="run-mark" aria-label={row.status} />
      <span className={`run-kind ${row.kind}`}>{row.step === "READ" ? "File" : KIND[row.kind]}</span>
      <span className="run-title">
        {row.title}
        <code>{row.step}</code>
      </span>
      <span className="run-result">
        {row.status === "done" && row.step !== "READ" && row.counts && <Counts counts={row.counts} />}
        {row.detail && (row.status !== "done" || row.step === "READ" || row.kind === "agentic") && (
          <span className="run-detail">{row.detail}</span>
        )}
        {row.status === "queued" && <span className="run-detail">waiting</span>}
        {row.status === "interrupted" && <span className="run-detail">the server was restarted</span>}
      </span>
      <span className="run-ms num">{took(row.ms)}</span>
    </li>
  );
}

function Group({ name, rows, open }: { name: string; rows: RunStep[]; open: boolean }) {
  const counts = { high: 0, warn: 0, info: 0 };
  for (const r of rows) for (const s of SEVERITIES) counts[s] += r.counts?.[s] ?? 0;
  const done = rows.filter((r) => r.status === "done" || r.status === "skipped" || r.status === "failed").length;
  const going = rows.some((r) => r.status === "running");
  const failed = rows.filter((r) => r.status === "failed").length;
  const ai = rows.filter((r) => r.kind === "agentic" && r.status === "done").length;
  return (
    <details className={`run-group${going ? " going" : ""}`} open={open || undefined}>
      <summary>
        <b lang="de">{name}</b>
        <span className="run-progress num">
          {done}/{rows.length}
        </span>
        {failed > 0 && <span className="run-flag">{failed} failed</span>}
        {ai > 0 && <span className="run-kind agentic">AI</span>}
        {done > 0 && <Counts counts={counts} />}
      </summary>
      <ul>
        {rows.map((r, i) => (
          <StepRow key={i} row={r} />
        ))}
      </ul>
    </details>
  );
}

function RunCard({ run, open, showProject }: { run: Run; open: boolean; showProject: boolean }) {
  const groups: { name: string; rows: RunStep[] }[] = [];
  for (const row of run.steps) {
    const name = row.scope === "project" ? "Between the LVs" : (row.file ?? "");
    // the rows of one document are not all next to each other: its AI step runs after every file was read
    const group = groups.find((g) => g.rows[0].scope === row.scope && g.rows[0].doc === row.doc);
    if (group) group.rows.push(row);
    else groups.push({ name, rows: [row] });
  }
  const few = groups.length <= 3;
  const share = run.total > 0 ? run.finished_steps / run.total : 0;
  return (
    <details className={`run is-${run.status}`} open={open || undefined}>
      <summary>
        <span className="run-head">
          <b lang="de">{showProject ? run.project : run.trigger}</b>
          <small>
            {showProject ? `${run.trigger} · ` : ""}
            {ago(run.created)}
          </small>
        </span>
        <span className={`run-status is-${run.status}`}>{STATUS[run.status]}</span>
        <span className="run-progress num">
          {run.finished_steps}/{run.total} steps
        </span>
        <Counts counts={run.counts} />
        <span className="run-bar" aria-hidden>
          <i style={{ clipPath: `inset(0 ${(1 - share) * 100}% 0 0)` }} />
        </span>
        {run.active && <span className="run-now">{nowDoing(run)}</span>}
        {run.error && <span className="run-now err">{run.error}</span>}
      </summary>
      {groups.map((g, i) => (
        <Group
          key={i}
          name={g.name}
          rows={g.rows}
          open={few || g.rows.some((r) => r.status === "running" || r.status === "failed")}
        />
      ))}
    </details>
  );
}

export function RunsDialog({
  runs,
  project,
  starting,
  onStart,
  onClose,
}: {
  runs: Run[]; // of the project, or of all
  project: { id: string; name: string } | null; // null: the runs of all projects
  starting: boolean;
  onStart: (() => void) | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  // re-render once in a while so "2 min ago" moves on while the dialog stays open
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const active = runs.filter((r) => r.active);
  const first = active[0] ?? runs[0];
  return (
    <dialog
      ref={dialog}
      className="new-project settings runs"
      aria-label={project ? `Pipeline runs of ${project.name}` : "Pipeline runs"}
      onCancel={(e) => (e.preventDefault(), onClose())}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header>
        <b>Pipeline</b>
        <span lang="de">{project ? project.name : "all projects"}</span>
        <button className="btn-ghost small" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="runs-body">
        {runs.length === 0 && (
          <p className="runs-empty">
            <b>No run yet.</b>
            A run starts by itself when a project is created or gets files: every file is read, every rule is run on
            it, Claude reviews one file per LV, and the LVs of a building are compared with each other.
            {project ? " Start one for this project below." : ""}
          </p>
        )}
        {runs.map((r) => (
          <RunCard key={r.id} run={r} open={r === first} showProject={!project} />
        ))}
      </div>
      <footer className={active.length > 0 ? "busy" : undefined}>
        <span>
          {active.length > 0
            ? `${active.length === 1 ? "One run is" : `${active.length} runs are`} going in the background. You can close this and go on working.`
            : "Runs go in the background. Their AI findings are on the LV when you open it."}
        </span>
        {onStart && (
          <button className="btn-new" onClick={onStart} disabled={starting || active.length > 0}>
            Run again
          </button>
        )}
      </footer>
    </dialog>
  );
}
