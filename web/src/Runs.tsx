import { useEffect, useRef, useState, type ReactNode } from "react";
import { chooseModel, getModels, getSpend, listProjectRuns } from "./api";
import { Select } from "./controls";
import { Sign } from "./components";
import { SEVERITIES, SEVERITY_LABEL, type ModelChoice, type Run, type RunStage, type RunStep, type Severity, type Spend, type StageId } from "./types";
import "./runs.css";

/* The pipeline (src/boq/pipeline.py) and its runs (src/boq/runs.py): what is done with a project's files,
   station by station, and where the run waits for the person.
   - PipelineStrip: the six stations under the band of a project or an LV. A station opens to its steps;
     the one the run waits at holds what the person has to do.
   - RunSegs: the same six stations as marks on a project's card.
   - RunsSwitch: the slab in the band of the projects page. While a run is going it counts the steps done.
   - PipelinePage: the page of the pipeline (/pipeline): every project against the six stations, the runs
     of the one picked with every step, what Polier did and what Claude cost beside them. */

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

export function RunsSwitch({ runs, onOpen, still = false }: { runs: Run[]; onOpen: () => void; still?: boolean }) {
  const active = runs.filter((r) => r.active);
  const done = active.reduce((n, r) => n + r.finished_steps, 0);
  const total = active.reduce((n, r) => n + r.total, 0);
  const last = runs.reduce<string | null>((t, r) => (r.finished && (!t || r.finished > t) ? r.finished : t), null);
  const inner = (
    <>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <path d="M2 11h18" stroke="currentColor" strokeWidth="2" />
        <path d="M1 8h4v6H1zM9 8h4v6H9zM17 8h4v6h-4z" fill="currentColor" />
      </svg>
      <b>{still ? (active.length > 0 ? "Running" : "Idle") : "Engine room"}</b>
      <small>
        {active.length > 0 ? (
          <>
            Checking <em className="num">{done}/{total}</em> · {active[0].project}
            {active.length > 1 ? ` +${active.length - 1}` : ""}
          </>
        ) : last ? (
          `Six stations · last run ${ago(last)}`
        ) : (
          "Six stations, from file to price"
        )}
      </small>
    </>
  );
  // on the pipeline page itself it only says what runs: a slab that is not a button
  if (still)
    return (
      <div className={`band-slab is-still runs-switch${active.length > 0 ? " going" : ""}`} role="status">
        {inner}
      </div>
    );
  return (
    <button
      className={`band-slab runs-switch${active.length > 0 ? " going" : ""}`}
      onClick={onOpen}
      title={active.length > 0 ? `${nowDoing(active[0])}` : "The checks run on the files, step by step"}
    >
      {inner}
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

/** Which Claude model does which work (src/boq/engines.py): one line per task, the model chosen in a
 *  select. A choice is kept at once and holds from the next request on. */
function Models() {
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getModels().then((c) => live && setChoice(c), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!choice) return null;
  const options = choice.models.map((m) => ({ value: m.id, label: m.name }));
  const levels = choice.efforts.map((e) => ({ value: e, label: e }));
  const changed = choice.tasks.filter((t) => t.model !== t.default || t.effort !== t.default_effort).length;
  function pick(task: string, what: "models" | "efforts", value: string) {
    setBusy(task);
    setError(null);
    chooseModel(task, what, value)
      .then(setChoice, (e: unknown) => setError(e instanceof Error ? e.message : "The choice was not kept."))
      .finally(() => setBusy(null));
  }
  return (
    <>
      <header className="pipe-page-head">
        <h2>Models</h2>
        <p>
          Which Claude model does which work, and how much it thinks about it (effort: more is slower and costs more
          tokens). A choice holds from the next request on.
          {changed > 0 && ` ${changed} of ${choice.tasks.length} differ from the default.`}
        </p>
      </header>
      {error && <p className="models-error" role="alert">{error}</p>}
      <table className="spend-table models">
        <thead>
          <tr>
            <th>Work</th>
            <th>Model</th>
            <th>Effort</th>
            <th className="r">USD per 1M tokens in / out</th>
          </tr>
        </thead>
        <tbody>
          {choice.tasks.map((t) => {
            const m = choice.models.find((x) => x.id === t.model);
            return (
              <tr key={t.key} className={t.model !== t.default || t.effort !== t.default_effort ? "is-changed" : undefined}>
                <th>
                  {t.name}
                  <small>
                    {t.what}
                    {t.note ? ` ${t.note}` : ""}
                  </small>
                </th>
                <td>
                  <Select value={t.model} options={options} disabled={busy !== null} aria-label={`Model for ${t.name}`} onChange={(id) => pick(t.key, "models", id)} />
                  {m && <small>{m.note}</small>}
                </td>
                <td>
                  <Select value={t.effort} options={levels} disabled={busy !== null} aria-label={`Effort for ${t.name}`} onChange={(e) => pick(t.key, "efforts", e)} />
                  {t.effort !== t.default_effort && <small>default: {t.default_effort}</small>}
                </td>
                <td className="r num">{m?.input != null && m.output != null ? `${m.input.toFixed(2)} / ${m.output.toFixed(2)}` : "no list price"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

/** The audit of what Claude was asked and what it cost (src/boq/spend.py): one line, opening to the sums
 *  per purpose and the latest requests. `at` changes when there may be something new to read. */
function SpendAudit({ projectId, at, open = false }: { projectId: string | null; at: string; open?: boolean }) {
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
    <details className="spend" open={open || undefined}>
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
      {spend.outside && spend.outside.requests > 0 && (
        <p className="spend-note spend-outside">
          Not tied to any project: <span className="num">${spend.outside.usd.toFixed(2)}</span> in {spend.outside.requests}{" "}
          request{spend.outside.requests === 1 ? "" : "s"} ({spend.outside.purposes.slice(0, 3).join(", ")}
          {spend.outside.purposes.length > 3 ? ", …" : ""}).
        </p>
      )}
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
function RunsTable({
  projects,
  runs,
  onOpen,
  selected = null,
}: {
  projects: { id: string; name: string }[];
  runs: Run[];
  onOpen: (id: string) => void;
  selected?: string | null;
}) {
  const titles = runs[0]?.stages.map((s) => s.title) ?? ["Read", "Rules", "AI review", "Compare", "Questions", "Prices"];
  const ids: StageId[] = runs[0]?.stages.map((s) => s.id) ?? ["read", "rules", "ai", "compare", "questions", "prices"];
  return (
    <table className="runs-table">
      <thead>
        <tr>
          <th>Project</th>
          {titles.map((title, n) => (
            <th key={title} title={ABOUT[ids[n]]}>
              <span className="num">{n + 1}</span> {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const run = runs.find((r) => r.project_id === p.id);
          return (
            <tr
              key={p.id}
              className={selected === p.id ? "is-open" : undefined}
              aria-current={selected === p.id || undefined}
              onClick={() => onOpen(p.id)}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
            >
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

/* ------------------------------------------------------------------ what Polier did */

interface Happening {
  id: number;
  at: string;
  project_id: string | null;
  project: string;
  kind: string; // tender, answer, quote, asks, decline, released, run
  text: string;
  move: "you" | "client" | "supplier" | "";
}

const MOVE = { you: "Your move", client: "With the client", supplier: "With the supplier", "": "" } as const;

/** What Polier did on its own, newest first (src/boq/events.py): mail read, quotes compared, checks run.
 *  The record to read after being away; a line that leaves the next move with the estimator says so. */
function Happened({ projectId, at, few = 6 }: { projectId: string | null; at: string; few?: number }) {
  const [list, setList] = useState<Happening[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const load = () =>
      fetch(`/api/events${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setList, () => setList([]));
    void load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [projectId, at]);
  if (!list || list.length === 0) return null;
  const shown = all ? list : list.slice(0, few);
  return (
    <section className="happened" aria-label="What Polier did">
      <h3>What Polier did</h3>
      <ol>
        {shown.map((e) => (
          <li key={e.id} className={e.move === "you" ? "is-yours" : undefined}>
            <time dateTime={e.at} title={new Date(e.at).toLocaleString("de-DE")}>
              {ago(e.at)}
            </time>
            <span>
              {!projectId && e.project && <b lang="de">{e.project}</b>} {e.text}
            </span>
            {e.move && <em>{MOVE[e.move]}</em>}
          </li>
        ))}
      </ol>
      {list.length > few && (
        <button className="text-link" onClick={() => setAll(!all)}>
          {all ? "Show the newest only" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

/** The pipeline as a page (/pipeline[/:project]): every project against the six stations at the top; the
 *  runs of the project picked under it, the latest open with every step; beside them what Polier did and what
 *  Claude cost, both open. Nothing here is behind a dialog. */
export function PipelinePage({
  runs,
  projects,
  project,
  onPick,
  onOpenProject,
  starting,
  onStart,
}: {
  runs: Run[]; // the latest run of every project
  projects: { id: string; name: string }[];
  project: string | null; // the one whose runs are open
  onPick: (id: string | null) => void;
  onOpenProject: (id: string) => void;
  starting: boolean;
  onStart: (id: string) => void;
}) {
  // re-render once in a while so "2 min ago" moves on
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const latest = project ? runs.find((r) => r.project_id === project) : undefined;
  const picked = projects.find((p) => p.id === project) ?? null;
  // the picked project's runs, newest first: read again whenever its latest run moves on
  const [history, setHistory] = useState<Run[] | null>(null);
  useEffect(() => {
    if (!project) return setHistory(null);
    let live = true;
    void listProjectRuns(project).then((h) => live && setHistory(h), () => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [project, latest?.id, latest?.status, latest?.finished_steps]);
  const active = runs.filter((r) => r.active);
  const at = runs.map((r) => `${r.id}${r.status}${r.finished_steps}`).join();
  const mine = history ?? [];
  // a project picked in the table: its runs are scrolled into sight under it
  const runsAt = useRef<HTMLElement>(null);
  useEffect(() => {
    if (project) runsAt.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [project]);
  return (
    <main className="pipe-page">
      <div className="pipe-page-main">
        <section className="pipe-page-block" aria-label="Every project against the six stations">
          <header className="pipe-page-head">
            <h1>All projects</h1>
            <p>
              {active.length > 0
                ? `${active.length === 1 ? "One run is" : `${active.length} runs are`} going: ${nowDoing(active[0])}.`
                : "Nothing is running. A run starts by itself when a project is created or gets files."}{" "}
              One row per project, one column per station; a row opens its runs below.
            </p>
          </header>
          <RunsTable projects={projects} runs={runs} selected={project} onOpen={(id) => onPick(id === project ? null : id)} />
          <dl className="pipe-page-about">
            {(Object.keys(ABOUT) as StageId[]).map((id, n) => (
              <div key={id}>
                <dt>
                  <span className="num">{n + 1}</span> {runs[0]?.stages[n]?.title ?? id}
                </dt>
                <dd>{ABOUT[id]}</dd>
              </div>
            ))}
          </dl>
        </section>

        {picked && (
          <section className="pipe-page-block" aria-label={`Runs of ${picked.name}`} ref={runsAt}>
            <header className="pipe-page-head">
              <h2 lang="de">{picked.name}</h2>
              <p>{history === null ? "Reading its runs…" : mine.length === 0 ? "No run yet." : `${mine.length} run${mine.length === 1 ? "" : "s"}, the newest first.`}</p>
              <div className="pipe-page-acts">
                <button className="btn-ghost" onClick={() => onOpenProject(picked.id)}>
                  Open the project
                </button>
                <button className="btn-new" onClick={() => onStart(picked.id)} disabled={starting || !!latest?.active}>
                  {latest?.active ? "Running" : "Run again"}
                </button>
                <button className="btn-ghost" onClick={() => onPick(null)} aria-label="Close the runs of this project">
                  Close
                </button>
              </div>
            </header>
            {mine.map((r, i) => (
              <RunCard key={r.id} run={r} open={i === 0} showProject={false} />
            ))}
          </section>
        )}

        <section className="pipe-page-block" aria-label="Which model does which work">
          <Models />
        </section>

        <section className="pipe-page-block" aria-label="What Claude cost">
          <SpendAudit projectId={project} at={at} open />
        </section>
      </div>

      <aside className="pipe-page-side">
        <Happened projectId={project} at={at} few={40} />
      </aside>
    </main>
  );
}
