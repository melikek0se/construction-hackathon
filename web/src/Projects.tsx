import { useEffect, useState } from "react";
import { Sign } from "./components";
import { eur } from "./format";
import { FORMAT_LABEL, SEVERITIES, SEVERITY_LABEL, type CatalogProject, type Intake, type IntakeFile, type ProjectDoc, type ProjectSummary, type Severity } from "./types";

/* The projects page: a dense register of every project the app knows. */

/* A tender moves through steps, and each step leaves documents: the tender itself (GAEB phase 83, its
   print-out, the tender package), our bid (84, the submitted bid, an offer), the award (86). */
const STEPS = ["tender", "bid", "award"] as const;
type Step = (typeof STEPS)[number]; // the same three as `Step` in types.ts
const STEP_LABEL: Record<Step, string> = { tender: "Tender", bid: "Bid", award: "Award" };

function stepOf(role: string): Step {
  if (role === "award") return "award";
  return ["bid", "submitted bid", "offer"].includes(role) ? "bid" : "tender";
}

/** What sets a file apart from the others of its step, beyond its format. */
function qualifier(role: string): string {
  return { "tender package": "package", excerpt: "excerpt", "submitted bid": "as submitted" }[role] ?? "";
}

const MARK = ["", "info", "warn", "high"];

/** A project's LV as one strip: a mark for every flagged item, where it stands in the LV. Marks keep a
 *  visible width however long the LV is, so one stop in a thousand items can still be seen. */
function Fingerprint({ marks, cuts = [] }: { marks: string; cuts?: number[] }) {
  const n = Math.max(1, marks.length);
  const H = 22;
  return (
    <svg className="fingerprint" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${n} items in LV order, flagged items marked`}>
      <rect className="fp-base" x="0" y={H * 0.5} width={n} height={H * 0.5} />
      {cuts.map((x) => (
        <line key={`c${x}`} className="fp-cut" x1={x} x2={x} y1={H * 0.5} y2={H} vectorEffect="non-scaling-stroke" />
      ))}
      {[...marks].map((m, i) =>
        m === "0" ? null : (
          <line
            key={i}
            className={`fp-${MARK[+m]}`}
            x1={i + 0.5}
            x2={i + 0.5}
            y1={m === "3" ? 0 : m === "2" ? H * 0.14 : H * 0.32}
            y2={H}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  );
}

/** One step of a tender (tender, bid, award): the same line for every project.
 *
 *  A step holds files. Files of the same format are one choice: for a single LV that is one file (GAEB XML,
 *  GAEB 90, PDF: the same LV three ways), for a building it is all its trade LVs together. The chosen
 *  format's items are drawn as one strip, LV after LV, with its findings counted. */
function StepLine({
  step,
  docs,
  onOpenFile,
  onOpenProject,
  onSetStep,
}: {
  step: Step;
  docs: ProjectDoc[];
  onOpenFile?: (index: number) => void;
  onOpenProject?: () => void;
  onSetStep?: (index: number, step: Step) => void; // the selected file belongs to another step
}) {
  const [picked, setPicked] = useState(0);
  if (docs.length === 0) {
    return (
      <span className="step-line none">
        <span className="step-name">{STEP_LABEL[step]}</span>
        <span className="step-none">no file</span>
      </span>
    );
  }
  const groups: { label: string; note: string; docs: ProjectDoc[] }[] = [];
  for (const d of docs) {
    const note = qualifier(d.role);
    const group = groups.find((g) => g.label === d.format && g.note === note);
    if (group) group.docs.push(d);
    else groups.push({ label: d.format, note, docs: [d] });
  }
  const group = groups[Math.min(picked, groups.length - 1)];
  const read = group.docs.filter((d) => d.counts);
  const count = (sev: Severity) => read.reduce((n, d) => n + d.counts![sev], 0);
  const items = read.reduce((n, d) => n + d.items, 0);
  const cuts = read.slice(0, -1).reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.items], []);
  const several = group.docs.length > 1;
  // where the findings of a multi-LV step come from: the LVs that carry a stop or a caution
  const sources = several ? read.filter((d) => d.counts!.high + d.counts!.warn > 0) : [];
  // the same LV read from two formats should give the same findings; say so when it does not
  const single = groups.filter((g) => g.docs.length === 1 && g.docs[0].counts && g.docs[0].items === items).map((g) => g.docs[0]);
  const disagree = !several && single.some((d) => SEVERITIES.some((s) => d.counts![s] !== single[0].counts![s]));
  const open = several ? onOpenProject : onOpenFile && (() => onOpenFile(group.docs[0].index));

  return (
    <span className="step-line">
      <span className="step-name">{STEP_LABEL[step]}</span>
      <span className="step-files" role="group" aria-label={`${STEP_LABEL[step]} files`}>
        {groups.map((g, n) => (
          <button
            key={g.label + g.note}
            className="file-chip"
            aria-pressed={g === group}
            title={g.docs.length === 1 ? g.docs[0].name : `${g.docs.length} files`}
            onClick={(e) => (e.stopPropagation(), setPicked(n))}
          >
            {g.label}
            {g.note && <small>{g.note}</small>}
            {g.docs.length > 1 && <small>{g.docs.length} LVs</small>}
          </button>
        ))}
        {onSetStep && !several && (
          /* the step was read from the file (D-028); this is where a wrong one is put right */
          <select
            className="move-step"
            value=""
            aria-label={`Move ${group.docs[0].name} to another step`}
            title={`${group.docs[0].name} is filed under ${STEP_LABEL[step]}. Move it if that is wrong.`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => e.target.value && onSetStep(group.docs[0].index, e.target.value as Step)}
          >
            <option value="">Move to…</option>
            {STEPS.filter((other) => other !== step).map((other) => (
              <option key={other} value={other}>
                {STEP_LABEL[other]}
              </option>
            ))}
          </select>
        )}
      </span>
      {read.length > 0 ? (
        <>
          <button
            className="step-strip"
            title={several ? "Open the project" : `Open ${group.docs[0].name}`}
            disabled={!open}
            onClick={(e) => (e.stopPropagation(), open?.())}
          >
            <Fingerprint marks={read.map((d) => d.marks).join("")} cuts={cuts} />
          </button>
          <span className="doc-counts">
            {SEVERITIES.map((sev) => (
              <span key={sev} className={count(sev) === 0 ? "zero" : ""}>
                <Sign severity={sev} size={13} />
                {count(sev)}
              </span>
            ))}
          </span>
          <span className="doc-items">{items.toLocaleString("de-DE")}</span>
          {disagree && <span className="step-note">The formats of this step do not give the same findings. Select each to compare.</span>}
          {several && (
            <span className="step-sources">
              {sources.length === 0 ? (
                `No stop and no caution in any of the ${read.length} LVs.`
              ) : (
                <>
                  Stops and cautions come from {sources.length} of {read.length} LVs:
                  {sources.slice(0, 4).map((d) => (
                    <button
                      key={d.index}
                      className="source-lv"
                      title={`Open ${d.name}`}
                      disabled={!onOpenFile}
                      onClick={(e) => (e.stopPropagation(), onOpenFile?.(d.index))}
                    >
                      <span lang="de">{d.title || d.name}</span>
                      {(["high", "warn"] as const).map(
                        (sev) =>
                          d.counts![sev] > 0 && (
                            <b key={sev}>
                              <Sign severity={sev} size={12} />
                              {d.counts![sev]}
                            </b>
                          ),
                      )}
                    </button>
                  ))}
                  {sources.length > 4 && <span>and {sources.length - 4} more</span>}
                </>
              )}
            </span>
          )}
        </>
      ) : (
        <span className="doc-error">could not be read</span>
      )}
    </span>
  );
}

/** The tower crane of the logo: mast, jib with its tie, counterweight, hook. */
export function CraneIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="crane-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M7 22V6M4 22h6M2 6h20M7 2v4M7 2l13 4M7 2 3 6M18 6v6" />
        <path d="M2 6h3v3H2z" fill="currentColor" />
        <path d="M16.5 12h3v2.5h-3z" fill="currentColor" />
        <path d="M7 10l3-4M7 14l-0 0M7 18l0 0" />
      </g>
    </svg>
  );
}

interface Pending {
  files: File[];
  info: Intake | null; // null while the server is still reading the files
  target: string | null; // the project the files were dropped on, if any
}

/** Dropped files, read but not yet kept. The server has read which tender they belong to and which step
 *  of it each file is; the panel shows that with its evidence, so the user checks instead of filling in.
 *  Only what was inferred asks for a look, and every step can be corrected with one click. */
function IntakePanel({
  pending,
  projects,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  projects: CatalogProject[];
  busy: boolean;
  onConfirm: (name: string, target: string | null, roles: (string | null)[]) => void;
  onCancel: () => void;
}) {
  const { info, files } = pending;
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string | null>(pending.target);
  const [steps, setSteps] = useState<Record<number, Step>>({}); // the user's corrections, by file index
  useEffect(() => {
    setName(info?.name ?? "");
    if (info?.suggested && pending.target === null) setTarget(info.suggested.id);
  }, [info, pending.target]);

  const rows: IntakeFile[] = [...(info?.files ?? [])].sort((a, b) => a.lv - b.lv || a.index - b.index);
  const stepNow = (f: IntakeFile) => steps[f.index] ?? f.step;
  const present = STEPS.filter((s) => rows.some((f) => stepNow(f) === s));
  const toCheck = rows.filter((f) => !f.certain && steps[f.index] === undefined).length;
  const into = projects.find((p) => p.id === target);

  function confirm() {
    if (!info) return;
    const roles: (string | null)[] = files.map(() => null);
    for (const f of info.files) if (stepNow(f) !== f.step) roles[f.index] = stepNow(f);
    onConfirm(name.trim(), target, roles);
  }

  return (
    <section className="intake" aria-label="Files waiting to be kept">
      <header>
        <b>Intake</b>
        {info ? (
          <span>
            {into ? `Adds to ${into.name}: ` : "New tender: "}
            {info.lvs === 1 ? "one LV" : `${info.lvs} LVs`} in {rows.length} file{rows.length > 1 ? "s" : ""} (
            {present.map((s) => STEP_LABEL[s].toLowerCase()).join(", ")})
            {info.left_out.length > 0 && `, ${info.left_out.length} left out`}
            {toCheck > 0 && (
              <em>
                {toCheck} step{toCheck > 1 ? "s" : ""} to check
              </em>
            )}
          </span>
        ) : (
          <span>
            Reading {files.length} file{files.length > 1 ? "s" : ""}
          </span>
        )}
      </header>
      <ul className="intake-files">
        {!info &&
          files.map((f, i) => (
            <li key={i} className="reading">
              <span />
              <span className="intake-name">{f.name}</span>
              <span className="intake-why">being read</span>
            </li>
          ))}
        {rows.map((f, i) => {
          const first = i === 0 || rows[i - 1].lv !== f.lv;
          const corrected = steps[f.index] !== undefined && steps[f.index] !== f.step;
          return (
            <li key={f.index} className={first && i > 0 ? "new-lv" : undefined}>
              <span className="intake-lv" lang="de" title={f.title}>
                {first ? f.title : ""}
              </span>
              <span className="intake-name" title={f.name}>
                {f.name}
                <small>
                  {FORMAT_LABEL[f.format]} · {f.items.toLocaleString("de-DE")} items
                  {qualifier(f.role) && !corrected && ` · ${qualifier(f.role)}`}
                </small>
              </span>
              <span className="intake-step" role="group" aria-label={`Step of ${f.name}`}>
                {STEPS.map((s) => (
                  <button
                    key={s}
                    aria-pressed={stepNow(f) === s}
                    disabled={busy}
                    onClick={() => setSteps((old) => ({ ...old, [f.index]: s }))}
                  >
                    {STEP_LABEL[s]}
                  </button>
                ))}
              </span>
              <span className="intake-why">
                {corrected ? (
                  "set by you"
                ) : (
                  <>
                    {!f.certain && steps[f.index] === undefined && <i>check</i>}
                    {f.evidence.join(" · ")}
                  </>
                )}
              </span>
            </li>
          );
        })}
        {info?.left_out.map((f, i) => (
          <li key={`out${i}`} className="left-out">
            <span />
            <span className="intake-name">{f.name}</span>
            <span className="intake-why">left out: {f.reason}</span>
          </li>
        ))}
      </ul>
      <footer>
        <label>
          <span>Goes into</span>
          <select value={target ?? ""} onChange={(e) => setTarget(e.target.value || null)} disabled={!info || busy}>
            <option value="">A new project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <small>{info?.suggested && target === info.suggested.id ? `suggested: ${info.suggested.reason}` : " "}</small>
        </label>
        {target === null && (
          <label className="grow">
            <span>Project name</span>
            <input
              value={name}
              maxLength={80}
              placeholder={info ? "Name this tender" : ""}
              onChange={(e) => setName(e.target.value)}
              disabled={!info || busy}
            />
            <small>
              {info?.source && name === info.name
                ? `read from ${info.source.file}: ${info.source.where}`
                : info && !info.name
                  ? "the files do not name their project"
                  : " "}
            </small>
          </label>
        )}
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Discard
        </button>
        <button className="btn-new" onClick={confirm} disabled={!info || busy}>
          {target ? "Add to project" : "Create project"}
        </button>
      </footer>
    </section>
  );
}

export function ProjectsPage({
  projects,
  summaries,
  busy,
  pending,
  onOpen,
  onChooseFiles,
  onDropFiles,
  onConfirm,
  onCancel,
  onDelete,
  onSetStep,
}: {
  projects: CatalogProject[];
  summaries: Record<string, ProjectSummary | "failed">;
  busy: boolean;
  pending: Pending | null;
  onOpen: (project: CatalogProject, file?: number) => void;
  onChooseFiles: (target: string | null) => void;
  onDropFiles: (files: FileList, target: string | null) => void;
  onConfirm: (name: string, target: string | null, roles: (string | null)[]) => void;
  onCancel: () => void;
  onDelete: (project: CatalogProject) => void;
  onSetStep: (project: CatalogProject, index: number, step: Step) => void;
}) {
  const [doomed, setDoomed] = useState<string | null>(null); // the project whose Delete was clicked once
  const [over, setOver] = useState<string | null>(null); // the project row files are being dragged onto
  const known = projects.flatMap((p) => {
    const s = summaries[p.id];
    return s && s !== "failed" ? [s] : [];
  });
  const total = (pick: (s: ProjectSummary) => number) => known.reduce((n, s) => n + pick(s), 0);

  return (
    <main className="register">
      <header className="register-head">
        <div>
          <h1>Projects</h1>
          <p>
            {projects.length} projects
            {known.length > 0 && (
              <>
                {" · "}
                {total((s) => s.items).toLocaleString("de-DE")} items · {total((s) => s.counts.high)} stops ·{" "}
                {total((s) => s.counts.warn)} cautions · {total((s) => s.counts.info)} notes
                {known.length < projects.length && " so far"}
              </>
            )}
          </p>
        </div>
        <div className="register-new">
          <span>Drop the files of a tender anywhere, or</span>
          <button className="btn-new" disabled={busy || pending !== null} onClick={() => onChooseFiles(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
            </svg>
            New project
          </button>
        </div>
      </header>

      {pending && (
        <IntakePanel
          key={pending.files.map((f) => f.name).join("|")}
          pending={pending}
          projects={projects}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}

      <div className="register-table" role="table" aria-label="Projects">
        <div className="register-cols" role="row">
          <span role="columnheader">No.</span>
          <span role="columnheader">Project</span>
          <span role="columnheader" className="step-cols">
            <span>Step</span>
            <span>Files</span>
            <span>Items of the selected file</span>
            <span>Findings</span>
            <span className="r">Items</span>
          </span>
          <span role="columnheader" className="r">
            Net total
          </span>
        </div>
        {projects.map((p) => {
          const s = summaries[p.id];
          const ready = s !== undefined && s !== "failed";
          return (
            <div
              key={p.id}
              role="row"
              tabIndex={0}
              aria-disabled={busy}
              className={`register-row${over === p.id ? " over" : ""}`}
              onClick={() => !busy && onOpen(p)}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && !busy && onOpen(p)}
              // later files of a running tender are dropped onto its row
              onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setOver(p.id))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(null);
                onDropFiles(e.dataTransfer.files, p.id);
              }}
            >
              <span role="cell" className="reg-id">
                {p.source === "upload" ? "+" : p.id}
              </span>
              <span role="cell" className="reg-name">
                <b lang="de">{p.name}</b>
                <small>
                  {[p.name.startsWith(p.number) ? "" : p.number, p.trade].filter(Boolean).join(" · ") ||
                    (p.created
                      ? `Created ${new Date(p.created).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
                      : "")}
                </small>
                {ready && (
                  <span className="reg-total">
                    {SEVERITIES.map((sev) => (
                      <span key={sev} className={s.counts[sev] === 0 ? "zero" : ""}>
                        <Sign severity={sev} size={14} />
                        <b>{s.counts[sev]}</b>
                      </span>
                    ))}
                    <span>
                      {s.items.toLocaleString("de-DE")} items
                      {p.kind === "trades" ? ` in ${s.lvs} LVs` : ""}
                    </span>
                  </span>
                )}
                <span className="reg-actions">
                  <button
                    className="btn-ghost add-files"
                    disabled={busy}
                    title="Add a later version or another LV to this project"
                    onClick={(e) => (e.stopPropagation(), onChooseFiles(p.id))}
                  >
                    Add files
                  </button>
                  {/* two clicks: the first arms the button, the second deletes the project and its files */}
                  <button
                    className={`btn-ghost add-files${doomed === p.id ? " armed" : ""}`}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (doomed === p.id) onDelete(p);
                      setDoomed(doomed === p.id ? null : p.id);
                    }}
                    onBlur={() => setDoomed((d) => (d === p.id ? null : d))}
                  >
                    {doomed === p.id ? "Delete for good?" : "Delete"}
                  </button>
                </span>
              </span>
              {ready ? (
                <>
                  <span role="cell" className="reg-docs">
                    {/* the same three lines for every project, whatever it holds */}
                    {STEPS.map((step) => (
                      <StepLine
                        key={step}
                        step={step}
                        docs={s.docs.filter((d) => stepOf(d.role) === step)}
                        onOpenFile={busy ? undefined : (index) => onOpen(p, index)}
                        onOpenProject={busy ? undefined : () => onOpen(p)}
                        onSetStep={busy ? undefined : (index, to) => onSetStep(p, index, to)}
                      />
                    ))}
                  </span>
                  <span role="cell" className="r num reg-net">
                    {s.net !== null ? (
                      <>
                        {eur(s.net)}
                        <small>{s.net_from}</small>
                      </>
                    ) : (
                      <small>no prices</small>
                    )}
                  </span>
                </>
              ) : (
                <span role="cell" className="reg-wait">
                  {s === "failed" ? "Could not be read" : "Reading the files"}
                </span>
              )}
            </div>
          );
        })}
        {projects.length === 0 && <p className="register-empty">No project yet. Drop the LVs of a building here to make the first one.</p>}
      </div>

      <footer className="register-foot">
        {SEVERITIES.map((sev) => (
          <span key={sev}>
            <Sign severity={sev} size={14} />
            <b>{SEVERITY_LABEL[sev]}</b>
            {sev === "high" ? "cannot be priced as written" : sev === "warn" ? "risk pushed onto the bidder" : "wording worth knowing"}
          </span>
        ))}
        <span className="formats">GAEB XML · GAEB 90 · Excel · PDF with a text layer</span>
      </footer>
    </main>
  );
}
