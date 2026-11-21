import { useEffect, useRef, useState, type ReactNode } from "react";
import { getSpend } from "./api";
import { Sign } from "./components";
import { SEVERITIES, SEVERITY_LABEL, type Run, type RunStage, type RunStep, type Severity, type Spend, type StageId } from "./types";
import "./runs.css";

/* The pipeline (src/boq/pipeline.py) and its runs (src/boq/runs.py): what is done with a project's files,
   station by station, and where the run waits for the person.
   - PipelineStrip: the six stations under the band of a project or an LV. A station opens to its steps;
     the one the run waits at holds what the person has to do.
   - RunSegs: the same six stations as marks on a project's card.
   - RunsSwitch: the button in the band of the projects page. While a run is going it counts the steps done.
   - RunsDialog: on the projects page every project against the six stations; on a project the record of
     its runs, each with its documents and every step. The same sign on two posts as the other dialogs. */

const KIND = { deterministic: "Rule", agentic: "AI", human: "You" } as const;

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
  waiting: "Questions open",
  done: "Done",
  failed: "Failed",
  interrupted: "Interrupted",
  cancelled: "Stopped",
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
        {row.status === "done" && !row.report && row.counts && <Counts counts={row.counts} />}
        {row.detail && (row.status !== "done" || row.report || row.kind === "agentic") && (
          <span className="run-detail">{row.detail}</span>
        )}
        {row.status === "queued" && <span className="run-detail">waiting</span>}
        {row.status === "interrupted" && <span className="run-detail">the server was restarted</span>}
        {row.status === "cancelled" && <span className="run-detail">stopped</span>}
      </span>
      <span className="run-ms num">
        {row.usd ? `$${row.usd.toFixed(2)} · ` : ""}
        {took(row.ms)}
      </span>
    </li>
  );
}

function Group({ name, rows, open }: { name: string; rows: RunStep[]; open: boolean }) {
  const counts = { high: 0, warn: 0, info: 0 };
  for (const r of rows) if (!r.report) for (const s of SEVERITIES) counts[s] += r.counts?.[s] ?? 0;
  const done = rows.filter((r) => r.status === "done" || r.status === "skipped" || r.status === "failed" || r.status === "cancelled").length;
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
        {run.status === "waiting" && <span className="run-now">Questions open: {run.waiting_for}</span>}
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

/* ------------------------------------------------------------------ the six stations */

const ABOUT: Record<StageId, string> = {
  read: "Every file is read and the tender's dates are taken from it.",
  rules: "Rules without a model: totals, quantities, units, wording, missing items, the structure of the LV.",
  ai: "Claude reads the LV section by section, then looks at the findings a second time and takes out what is said twice.",
  compare: "A later version against its tender; the LVs of a building against each other.",
  questions: "What only the client can settle is drafted as bidder questions. You send them, the client's answers are read back in; the station stays open until then. The prices do not wait for it.",
  prices: "Beside the questions: unit prices from past bids with their source, and the items that have no reliable price.",
};

function any(counts: Record<Severity, number>): boolean {
  return SEVERITIES.some((s) => counts[s] > 0);
}

/** What a station says in a few words: on the strip, on a card, in the table. */
function stageSays(s: RunStage): { text: string; counts: boolean } {
  switch (s.status) {
    case "none":
      return { text: s.id === "compare" ? "one file: nothing to compare" : "not part of this run", counts: false };
    case "queued":
      return { text: "waiting", counts: false };
    case "running":
      return { text: s.line || "running", counts: false };
    case "waiting":
      return { text: s.line, counts: false };
    case "failed":
      return { text: "failed", counts: false };
    case "cancelled":
      return { text: "stopped", counts: false };
    case "skipped":
      return { text: s.id === "compare" ? "nothing to compare" : "not needed", counts: false };
    default:
      if (s.checks > 0 && any(s.counts)) return { text: "", counts: true };
      return { text: s.line || (s.checks > 0 ? "nothing found" : "done"), counts: false };
  }
}

/** The six stations as marks, with one line under them: on a project's card. */
export function RunSegs({ run, line: said }: { run: Run; line?: ReactNode }) {
  const on = run.stages.find((s) => s.status === "running") ?? run.stages.find((s) => s.status === "waiting");
  // the card says whose move it is (Polier, you, the client); without that, what the run itself has to say
  const line =
    said ??
    (run.status === "waiting"
      ? `Questions: ${run.waiting_for}`
      : run.active
        ? on
          ? `${on.title} · ${on.line || "running"}`
          : "Waiting for a free worker"
        : run.status === "done"
          ? `Checked ${ago(run.finished ?? run.created)}${run.since && run.since.new + run.since.gone > 0 ? ` · ${run.since.new} new, ${run.since.gone} gone` : ""}`
          : `${STATUS[run.status]} ${ago(run.finished ?? run.created)}`);
  return (
    <div className={`run-segs is-${run.status}`} title="The pipeline on this project: read, rules, AI review, compare, questions, prices (the prices do not wait for the questions)">
      <span className="run-seg-row" aria-hidden>
        {run.stages.map((s) => (
          <i key={s.id} className={`is-${s.status}`} />
        ))}
      </span>
      <span className="run-seg-line">{line}</span>
    </div>
  );
}

/** The steps of one station, as they stand: what found something, what failed, what waits; the checks that
 *  found nothing as one line. */
function StageSteps({ rows, onFind }: { rows: RunStep[]; onFind: ((check: string) => void) | null }) {
  const [all, setAll] = useState(false);
  const quiet = (r: RunStep) => r.status === "done" && !r.report && !(r.counts && any(r.counts));
  const clean = rows.filter(quiet);
  const shown = all || clean.length <= 2 ? rows : rows.filter((r) => !quiet(r));
  return (
    <ul className="stage-steps">
      {shown.map((r, i) => {
        const hit = onFind && r.status === "done" && !r.report && r.counts && any(r.counts);
        return (
          <li key={i} className={`run-step is-${r.status}`}>
            <i className="run-mark" aria-label={r.status} />
            <span className={`run-kind ${r.kind}`}>{r.step === "READ" ? "File" : KIND[r.kind]}</span>
            <span className="run-title">
              {hit ? (
                <button className="stage-find" onClick={() => onFind(r.step)} title="Show these findings in the list">
                  {r.title}
                </button>
              ) : (
                r.title
              )}
            </span>
            <span className="run-result">
              {r.status === "done" && !r.report && r.counts && <Counts counts={r.counts} />}
              {r.detail && (r.status !== "done" || r.report || r.kind === "agentic") && <span className="run-detail">{r.detail}</span>}
              {r.status === "queued" && <span className="run-detail">waiting</span>}
            </span>
            <span className="run-ms num">
              {r.usd ? `$${r.usd.toFixed(2)} · ` : ""}
              {took(r.ms)}
            </span>
          </li>
        );
      })}
      {!all && clean.length > 2 && (
        <li className="run-step is-done stage-clean">
          <i className="run-mark" />
          <span className="run-kind deterministic">Rule</span>
          <span className="run-title">
            <button className="stage-find" onClick={() => setAll(true)}>
              {clean.length} more checks
            </button>
          </span>
          <span className="run-result">
            <span className="run-none">nothing found</span>
          </span>
          <span className="run-ms num">{took(clean.reduce((n, r) => n + (r.ms ?? 0), 0))}</span>
        </li>
      )}
    </ul>
  );
}

export function PipelineStrip({
  run,
  file,
  starting,
  onStart,
  onChange,
  onQuestions,
  onFind,
  onRecord,
}: {
  run: Run | undefined; // the project's latest run
  file: number | null; // the file on the page, if one is: its steps are the ones shown
  starting: boolean;
  onStart: () => void;
  onChange: (what: "go-on" | "retry" | "cancel") => void;
  onQuestions: (() => void) | null; // opens the bidder questions of the LV on the page
  onFind: ((check: string) => void) | null; // shows the findings of one step in the list
  onRecord: () => void;
}) {
  const [open, setOpen] = useState<StageId | null>(null);
  // "18 min ago" moves on while the page stays open
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  if (!run) {
    return (
      <section className="pipe none" aria-label="Pipeline">
        <p className="pipe-none">
          <b>Pipeline</b> No run on this project yet: read, rules, AI review, compare, questions, prices.
        </p>
        <button className="btn plain" onClick={onStart} disabled={starting}>
          Run
        </button>
      </section>
    );
  }
  const stage = run.stages.find((s) => s.id === open);
  // the steps of the open station: of the file on the page where it has any, else of the files that are counted
  let rows = run.steps.filter((r) => r.stage === open && !(r.status === "skipped" && r.detail.startsWith("done on another file")));
  if (rows.some((r) => r.doc === file)) rows = rows.filter((r) => r.doc === file || r.doc === null || r.stage === "compare");
  else if (rows.some((r) => !r.twin)) rows = rows.filter((r) => !r.twin);
  const files = [...new Set(rows.map((r) => r.file ?? "Between the LVs"))];
  const failed = run.steps.some((r) => r.status === "failed") || run.status === "cancelled" || run.status === "interrupted" || run.status === "failed";
  return (
    <section className={`pipe is-${run.status}`} aria-label="Pipeline">
      <ol className="pipe-rail">
        {run.stages.map((s, n) => {
          const says = stageSays(s);
          return (
            <li key={s.id} className={`is-${s.status}${open === s.id ? " open" : ""}`}>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} title={ABOUT[s.id]}>
                <b>
                  <span className="num">{n + 1}</span>
                  {s.status === "waiting" ? (run.questions?.to_send ? "Your move" : "With the client") : s.title}
                </b>
                <span className="pipe-says">{says.counts ? <Counts counts={s.counts} /> : s.status === "waiting" ? `Questions: ${says.text}` : says.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="pipe-meta">
        <span title={`${run.trigger} · ${new Date(run.created).toLocaleString("de-DE")}`}>
          {run.active ? `${run.finished_steps}/${run.total} steps` : `${STATUS[run.status]} · ${ago(run.finished ?? run.created)}`}
          {run.since && run.since.new + run.since.gone > 0 && (
            <b title="Against the run before this one">
              {run.since.new} new, {run.since.gone} gone
            </b>
          )}
          {run.usd !== null && run.usd > 0 && <span className="num">${run.usd.toFixed(2)}</span>}
        </span>
        {run.active ? (
          <button
            className="btn-ghost small"
            onClick={() => onChange("cancel")}
            disabled={run.stopping}
            title="The run stops after the step it is on; an AI step can take a minute"
          >
            {run.stopping ? "Stopping after this step" : "Stop"}
          </button>
        ) : (
          <>
            {failed && (
              <button className="btn-ghost small" onClick={() => onChange("retry")}>
                Try again
              </button>
            )}
            <button className="btn-ghost small" onClick={onStart} disabled={starting}>
              Run again
            </button>
          </>
        )}
        <button className="btn-ghost small" onClick={onRecord}>
          Record
        </button>
      </div>
      {stage && (
        <div className={`pipe-panel is-${stage.status}`}>
          <p className="pipe-about">
            <b>{stage.title}</b>
            {ABOUT[stage.id]}
          </p>
          {stage.status === "waiting" && (
            <div className="pipe-move">
              <p>
                <b>{run.waiting_for}.</b> {run.questions?.to_send ? "It is your move: the questions have to go out." : "It is the client's move."} The
                prices are worked out beside this. Close the questions if you will not wait for the answers; what stays open is then priced
                as a risk.
              </p>
              {onQuestions && (
                <button className="btn-new" onClick={onQuestions}>
                  Write the e-mail
                </button>
              )}
              <button className="btn-ghost small" onClick={() => onChange("go-on")}>
                Close the questions
              </button>
            </div>
          )}
          {files.map((name) => (
            <div key={name} className="pipe-file">
              {files.length > 1 && <h4 lang="de">{name}</h4>}
              <StageSteps rows={rows.filter((r) => (r.file ?? "Between the LVs") === name)} onFind={onFind} />
            </div>
          ))}
          {rows.length === 0 && <p className="pipe-empty">{stage.status === "none" ? "This run has no step at this station." : "Nothing to do here on this project."}</p>}
        </div>
      )}
    </section>
  );
}

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

/** The audit of what Claude was asked and what it cost (src/boq/spend.py): one line, opening to the sums
 *  per purpose and the latest requests. `at` changes when there may be something new to read. */
function SpendAudit({ projectId, at }: { projectId: string | null; at: string }) {
  const [spend, setSpend] = useState<Spend | null>(null);
  useEffect(() => {
    let live = true;
    void getSpend(projectId ?? undefined).then((s) => live && setSpend(s), () => undefined);
    return () => {
      live = false;
    };
  }, [projectId, at]);
  if (!spend) return null;
  const none = spend.requests + spend.cached === 0;
  return (
    <details className="spend">
      <summary>
        <b>Claude</b>
        {none ? (
          <span>No request yet{projectId ? " on this project" : ""}.</span>
        ) : (
          <>
            <span className="num spend-sum">${spend.usd.toFixed(2)}</span>
            <span>
              {spend.requests} request{spend.requests === 1 ? "" : "s"}
              {spend.cached > 0 && `, ${spend.cached} more answered from the cache at no cost`}
            </span>
            {spend.keys.length > 0 && <span className="spend-key">key …{spend.keys.join(", …")}</span>}
          </>
        )}
      </summary>
      {!none && (
        <div className="spend-body">
          <p className="spend-note">
            An estimate at list prices from the token counts the API returned, not the invoice.
            {spend.unpriced > 0 &&
              ` ${spend.unpriced} request${spend.unpriced === 1 ? " was" : "s were"} answered by a model without a list price here: counted in tokens only.`}
          </p>
          <table className="spend-table">
            <thead>
              <tr>
                <th>For</th>
                <th className="r">Requests</th>
                <th className="r">From cache</th>
                <th className="r">Tokens in</th>
                <th className="r">Tokens out</th>
                <th className="r">USD</th>
              </tr>
            </thead>
            <tbody>
              {spend.by_purpose.map((p) => (
                <tr key={p.purpose}>
                  <th>{p.purpose}</th>
                  <td className="r num">{p.requests}</td>
                  <td className="r num">{p.cached}</td>
                  <td
                    className="r num"
                    title={`${p.input_tokens} new, ${p.cache_write_tokens} written to Claude's cache, ${p.cache_read_tokens} read from it`}
                  >
                    {tokens(p.input_tokens + p.cache_write_tokens + p.cache_read_tokens)}
                  </td>
                  <td className="r num">{tokens(p.output_tokens)}</td>
                  <td className="r num">${p.usd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="spend-table calls">
            <thead>
              <tr>
                <th>When</th>
                <th>For</th>
                <th>File</th>
                <th>Model</th>
                <th className="r">In</th>
                <th className="r">Out</th>
                <th className="r">Time</th>
                <th className="r">USD</th>
              </tr>
            </thead>
            <tbody>
              {spend.calls.slice(0, 60).map((c) => (
                <tr key={c.id} className={c.cached ? "cached" : undefined}>
                  <td className="num">
                    {new Date(c.created).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>{c.purpose}</td>
                  <td lang="de">{c.file ?? ""}</td>
                  <td>{c.cached ? "from cache" : c.model}</td>
                  <td className="r num">{c.cached ? "" : tokens(c.input_tokens + c.cache_write_tokens + c.cache_read_tokens)}</td>
                  <td className="r num">{c.cached ? "" : tokens(c.output_tokens)}</td>
                  <td className="r num">{took(c.ms)}</td>
                  <td className="r num">{c.usd === null ? "no price" : `$${c.usd.toFixed(c.usd > 0 && c.usd < 0.01 ? 4 : 2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {spend.calls.length > 60 && <p className="spend-note">The latest 60 of {spend.requests + spend.cached} are shown.</p>}
        </div>
      )}
    </details>
  );
}

/** Every project against the six stations: where each stands, and which waits for the person. */
function RunsTable({ projects, runs, onOpen }: { projects: { id: string; name: string }[]; runs: Run[]; onOpen: (id: string) => void }) {
  const titles = runs[0]?.stages.map((s) => s.title) ?? ["Read", "Rules", "AI review", "Compare", "Questions", "Prices"];
  return (
    <table className="runs-table">
      <thead>
        <tr>
          <th>Project</th>
          {titles.map((title, n) => (
            <th key={title}>
              <span className="num">{n + 1}</span> {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const run = runs.find((r) => r.project_id === p.id);
          return (
            <tr key={p.id} onClick={() => onOpen(p.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}>
              <th lang="de">
                {p.name}
                {run && <small>{run.active ? "running" : `${STATUS[run.status]} · ${ago(run.finished ?? run.created)}`}</small>}
              </th>
              {run ? (
                run.stages.map((s) => {
                  const says = stageSays(s);
                  return (
                    <td key={s.id} className={`is-${s.status}`} title={s.line}>
                      {says.counts ? <Counts counts={s.counts} /> : s.status === "waiting" ? <b>{run.questions?.to_send ? "your move" : "with the client"}: {says.text}</b> : says.text}
                    </td>
                  );
                })
              ) : (
                <td colSpan={titles.length} className="is-none">
                  no run yet
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RunsDialog({
  runs,
  project,
  projects,
  onOpenProject,
  starting,
  onStart,
  onClose,
}: {
  runs: Run[]; // of the project, newest first; or the latest run of every project
  project: { id: string; name: string } | null; // null: all projects
  projects?: { id: string; name: string }[]; // all projects: the rows of the table
  onOpenProject?: (id: string) => void;
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
        <SpendAudit projectId={project?.id ?? null} at={runs.map((r) => `${r.id}${r.status}${r.finished_steps}`).join()} />
        {project && runs.length === 0 && (
          <p className="runs-empty">
            <b>No run yet.</b>
            A run starts by itself when a project is created or gets files: every file is read, every rule is run on
            it, Claude reviews one file per LV, versions and LVs are compared, the bidder questions are drafted and
            the prices are worked out beside them.
            {project ? " Start one for this project below." : ""}
          </p>
        )}
        {project ? (
          runs.map((r) => <RunCard key={r.id} run={r} open={r === first} showProject={false} />)
        ) : (
          <RunsTable projects={projects ?? []} runs={runs} onOpen={(id) => (onClose(), onOpenProject?.(id))} />
        )}
      </div>
      <footer className={active.length > 0 ? "busy" : undefined}>
        <span>
          {active.length > 0
            ? `${active.length === 1 ? "One run is" : `${active.length} runs are`} going in the background. You can close this and go on working.`
            : project
              ? "Runs go in the background. What they find is on the LV when you open it."
              : "One row per project, one column per station. A click opens the project."}
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
