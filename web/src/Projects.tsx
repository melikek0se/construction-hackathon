import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sign } from "./components";
import { DateField, Select } from "./controls";
import { eur } from "./format";
import { FORMAT_LABEL, SEVERITIES, SEVERITY_LABEL, type CatalogProject, type Intake, type IntakeFile, type Plan, type ProjectDoc, type ProjectSummary, type Severity } from "./types";
import "./home.css";

/* The projects page: the running tenders on a schedule (their dates and nothing else), and under it
   every tender on a board by the stage it is in (what is open on it and nothing about dates). */

/* A tender's files belong to one of three steps (the GAEB exchange phases 83, 84, 86). */
const STEPS = ["tender", "bid", "award"] as const;
type Step = (typeof STEPS)[number]; // the same three as `Step` in types.ts
const STEP_LABEL: Record<Step, string> = { tender: "Tender", bid: "Bid", award: "Award" };

function stepOf(role: string): Step {
  if (role === "award") return "award";
  return ["bid", "submitted bid", "offer"].includes(role) ? "bid" : "tender";
}

/* The stages a tender moves through on the contractor's side. The last two follow from the files (a bid or
   an award is there); the first three are the estimator's own and are set on the card. */
const STAGES = ["check", "questions", "pricing", "submitted", "award"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = { check: "Check", questions: "Questions", pricing: "Pricing", submitted: "Submitted", award: "Award" };
const STAGE_EMPTY: Record<Stage, string> = {
  check: "No new tender. Drop its files anywhere on the page.",
  questions: "No tender has questions out.",
  pricing: "Nothing is being priced.",
  submitted: "No bid is with a client.",
  award: "No award yet.",
};

function stageOf(p: CatalogProject): Stage {
  const steps = p.files.map((f) => stepOf(f.role));
  if (steps.includes("award")) return "award";
  if (steps.includes("bid")) return "submitted";
  return p.plan.stage ?? "check";
}

type Change = { [K in keyof Plan]?: Plan[K] | null };

/* ------------------------------------------------------------------ days */

const DAY = 864e5;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
const dm = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
const wd = (d: Date) => `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${dm(d)}`;
const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : n === -1 ? "yesterday" : `${-n} days ago`);

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

/** The next hard date of a running tender: the question deadline or the submission, whichever comes first. */
function nextDate(p: CatalogProject, today: Date): { what: string; day: Date; days: number } | null {
  if (stageOf(p) === "award") return null;
  const dates: [string, Date | null][] =
    stageOf(p) === "submitted"
      ? [["binding period ends", parseDay(p.plan.binding_until)]]
      : [["questions close", parseDay(p.plan.questions_due)], ["submission", parseDay(p.plan.due)]];
  const ahead = dates.flatMap(([what, day]) => (day && daysBetween(today, day) >= 0 ? [{ what, day, days: daysBetween(today, day) }] : []));
  return ahead.sort((a, b) => a.days - b.days)[0] ?? null;
}

/* ------------------------------------------------------------------ shared marks */

const MARK = ["", "info", "warn", "high"];

/** An LV as one strip: a mark for every flagged item, where it stands in the LV. Marks keep a visible
 *  width however long the LV is, so one stop in a thousand items can still be seen. */
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
          <line key={i} className={`fp-${MARK[+m]}`} x1={i + 0.5} x2={i + 0.5} y1={m === "3" ? 0 : m === "2" ? H * 0.14 : H * 0.32} y2={H} vectorEffect="non-scaling-stroke" />
        ),
      )}
    </svg>
  );
}

/** The logo: a hard hat in profile, front peak to the right (the app icon without its tile). */
export function HardHatIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="hardhat-icon" width={(size * 58) / 36} height={size} viewBox="4 12 58 36" aria-hidden>
      <path d="M9 41 C9 25 18.5 14 31.5 14 C44 14 52 23.5 53 38 L53.5 41 Z" fill="currentColor" />
      <path d="M5 40.5 H52 C56.5 40.5 60 41.8 61.5 44 C62.2 45.3 61.4 46.8 59.8 46.8 H7 C5 46.8 4 44.5 5 40.5 Z" fill="currentColor" />
      <path d="M7 40.6 H52 M16 39.5 C16.5 29 21.5 21 29 17.5 M25 39.5 C25.5 30 30 23 37 19" fill="none" stroke="var(--yellow, #ffc400)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** The tower crane of the old logo: mast, jib with its tie, counterweight, hook. */
export function CraneIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="crane-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M7 22V6M4 22h6M2 6h20M7 2v4M7 2l13 4M7 2 3 6M18 6v6" />
        <path d="M2 6h3v3H2z" fill="currentColor" />
        <path d="M16.5 12h3v2.5h-3z" fill="currentColor" />
        <path d="M7 10l3-4" />
      </g>
    </svg>
  );
}

const plateOf = (p: CatalogProject) => (p.source === "demo" ? p.id : (p.name.match(/[A-Za-zÄÖÜ]/)?.[0] ?? "+").toUpperCase());

/* ------------------------------------------------------------------ the opening */

/** The page opens the way a site does: barrier tape across full yellow while the projects are fetched,
 *  then the yellow is cut away on the slant and the tapes are pulled out to their sides.
 *  `phase`: "loading" holds, "opening" plays the cut. */
export function Opening({ phase }: { phase: "loading" | "opening" }) {
  const run = (text: string) => (
    <div className="open-run" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i}>{text}</span>
      ))}
    </div>
  );
  return (
    <div className={`opening is-${phase}`} role="status">
      <span className="visually-hidden">Reading the projects</span>
      <div className="open-sheet" />
      <div className="open-tape a">{run("Polier")}</div>
      <div className="open-tape b">{run("Reading the projects")}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ schedule */

const SPAN = 56; // days on the schedule: two weeks back, six ahead

/** A date of a tender, set in place: it shows a frame only when pointed at or focused. */
function DayField({ label, value, disabled, onSet }: { label: string; value?: string; disabled: boolean; onSet: (v: string | null) => void }) {
  return (
    <label className={`day-field${value ? "" : " unset"}`}>
      <span>{label}</span>
      <DateField label={label} value={value ?? ""} disabled={disabled} onChange={(v) => onSet(v || null)} />
    </label>
  );
}

function Schedule({
  projects,
  busy,
  onOpen,
  onChange,
}: {
  projects: CatalogProject[];
  busy: boolean;
  onOpen: (p: CatalogProject) => void;
  onChange: (p: CatalogProject, change: Change) => void;
}) {
  const today = startOfDay(new Date());
  const start = new Date(today.getTime() - 14 * DAY);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to a Monday
  const pos = (d: Date) => (daysBetween(start, d) / SPAN) * 100;
  const x = (d: Date) => Math.max(0, Math.min(100, pos(d)));
  const running = projects
    .filter((p) => stageOf(p) !== "award")
    .sort((a, b) => (nextDate(a, today)?.days ?? 9999) - (nextDate(b, today)?.days ?? 9999));
  const closed = projects.length - running.length;
  const [open, setOpen] = useState(true); // open on every load; closed only for this visit

  const bar = (kind: string, from: Date, to: Date) =>
    x(to) > x(from) && <i className={`gbar ${kind}`} style={{ left: `${x(from)}%`, width: `${x(to) - x(from)}%` }} />;
  /** Which way each of a row's two labels opens. Two dates less than eight days apart would put their labels
   *  on top of each other: the earlier one then opens to the left of its line, the later one to the right. */
  const sides = (a: Date | null, b: Date | null): ["left" | "right" | undefined, "left" | "right" | undefined] => {
    if (!a || !b || Math.abs(daysBetween(a, b)) >= 8) return [undefined, undefined];
    return a.getTime() <= b.getTime() ? ["left", "right"] : ["right", "left"];
  };
  const mark = (day: Date | null, label: string, flag = false, side?: "left" | "right") => {
    if (!day || pos(day) < 0 || pos(day) > 100) return null;
    const n = daysBetween(today, day);
    const left = side ? side === "left" : pos(day) > 80; // near the right edge a label opens to the left
    return (
      <i className={`gmark${flag ? " flag" : ""}${n >= 0 && n <= 3 ? " soon" : ""}${left ? " left" : ""}`} style={{ left: `${pos(day)}%` }}>
        <span>
          {label}
          <small>
            {wd(day)} · {inDays(n)}
          </small>
        </span>
      </i>
    );
  };
  const off = (day: Date | null, label: string) =>
    day && (pos(day) < 0 || pos(day) > 100) ? (
      <span className={`goff ${pos(day) < 0 ? "before" : "after"}`}>
        {label} {dm(day)}
        {day.getFullYear() !== today.getFullYear() ? day.getFullYear() : ""}
      </span>
    ) : null;

  return (
    <section className={`sched${open ? "" : " closed"}`} aria-label="Schedule of the running tenders">
      <div className="sched-head">
        <h2>
          <button className="sched-toggle" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? "Close the schedule" : "Open the schedule"}>
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            Schedule
          </button>
          <small>{running.length === 0 ? "no running tender" : `${running.length} running tender${running.length > 1 ? "s" : ""}, next date first`}</small>
        </h2>
        <div className="weeks" aria-hidden>
          {Array.from({ length: SPAN / 7 }, (_, w) => {
            const d = new Date(start.getTime() + w * 7 * DAY);
            return (
              <span key={w} style={{ left: `${(w / (SPAN / 7)) * 100}%` }}>
                KW {isoWeek(d)} · {dm(d)}
              </span>
            );
          })}
        </div>
      </div>
      {open && (
      <div className="sched-body">
        {running.map((p) => {
          const stage = stageOf(p);
          const received = parseDay(p.created) ?? today;
          const due = parseDay(p.plan.due), q = parseDay(p.plan.questions_due);
          const sent = parseDay(p.plan.sent), bind = parseDay(p.plan.binding_until);
          const dated = stage === "submitted" ? sent || bind : due || q;
          const [sentSide, bindSide] = sides(sent, bind), [qSide, dueSide] = sides(q, due);
          return (
            <div
              key={p.id}
              className="sched-row"
              tabIndex={0}
              aria-disabled={busy}
              onClick={() => !busy && onOpen(p)}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && !busy && onOpen(p)}
            >
              <div className="sched-left">
                <span className="plate">{plateOf(p)}</span>
                <div>
                  <b lang="de">{p.name}</b>
                  <div className="day-fields">
                    {stage === "submitted" ? (
                      <>
                        <DayField label="Sent" value={p.plan.sent} disabled={busy} onSet={(v) => onChange(p, { sent: v })} />
                        <DayField label="Binding until" value={p.plan.binding_until} disabled={busy} onSet={(v) => onChange(p, { binding_until: v })} />
                      </>
                    ) : (
                      <>
                        <DayField label="Questions until" value={p.plan.questions_due} disabled={busy} onSet={(v) => onChange(p, { questions_due: v })} />
                        <DayField label="Submission" value={p.plan.due} disabled={busy} onSet={(v) => onChange(p, { due: v })} />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="lane">
                {Array.from({ length: SPAN / 7 }, (_, w) => (
                  <i key={w} className="wkend" style={{ left: `${((w * 7 + 5) / SPAN) * 100}%`, width: `${(2 / SPAN) * 100}%` }} />
                ))}
                {!dated && <span className="lane-none">No date yet. A tender's dates stand on its notice, not in the LV: enter them on the left.</span>}
                {stage === "submitted" ? (
                  <>
                    {sent && bar("past", received, sent)}
                    {sent && bind && bar("wait", sent, bind)}
                    {mark(sent, "Bid sent", true, sentSide)}
                    {mark(bind, "Binding until", false, bindSide)}
                    {off(sent, "sent")}
                    {off(bind, "binding until")}
                  </>
                ) : (
                  dated && (
                    <>
                      {bar("past", received, today)}
                      {due && bar("todo", today, due)}
                      {mark(q, "Questions close", false, qSide)}
                      {mark(due, "Submission", true, dueSide)}
                      {off(due, "submission")}
                    </>
                  )
                )}
              </div>
            </div>
          );
        })}
        {running.length === 0 && <p className="sched-empty">Nothing is running. A tender appears here as soon as its files are dropped, and stays until it is awarded.</p>}
        <div className="today-wrap" aria-hidden>
          <i className="today" style={{ left: `${x(today)}%` }}>
            <b>Today</b>
          </i>
        </div>
      </div>
      )}
      {open && closed > 0 && (
        <p className="sched-note">
          {closed} awarded tender{closed > 1 ? "s are" : " is"} not on the schedule.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ board */

/** What is still open on a tender at the stage it is in, from its files and the rule checks. */
function openItems(p: CatalogProject, s: ProjectSummary, stage: Stage): { sign?: Severity; text: ReactNode; quiet?: boolean }[] {
  const read = s.docs.filter((d) => d.counts);
  const counted = p.kind === "trades" ? read : read.slice(0, 1);
  const of = (step: Step) => read.filter((d) => stepOf(d.role) === step);
  const out: { sign?: Severity; text: ReactNode; quiet?: boolean }[] = [];
  const n = (count: number, one: string, many = `${one}s`) => <b>{`${count.toLocaleString("de-DE")} ${count === 1 ? one : many}`}</b>;
  const unread = s.docs.length - read.length;
  if (unread > 0) out.push({ text: <>{n(unread, "file")} could not be read</> });

  if (stage === "award" || stage === "submitted") {
    const [tender] = of("tender"), [later] = of(stage === "award" ? "award" : "bid");
    if (tender && later && tender.items !== later.items)
      out.push({ text: <>The {stage === "award" ? "award" : "bid"} has {n(later.items, "item")}, the tender {tender.items.toLocaleString("de-DE")}</> });
    else out.push({ quiet: true, text: stage === "award" ? "Awarded. Same items as the tender." : "The bid is with the client." });
    return out;
  }
  const questions = counted.reduce((sum, d) => sum + (d.questions ?? 0), 0);
  if (s.counts.high > 0) out.push({ sign: "high", text: <>{n(s.counts.high, "stop")} cannot be priced as written</> });
  if (questions > 0) out.push({ text: <>{n(questions, "item")} with a point to raise with the client</> });
  if (s.counts.warn > 0)
    out.push({
      sign: "warn",
      text: (
        <>
          {n(s.counts.warn, "caution")} push risk onto the bidder
          {p.kind === "trades" && `, in ${counted.filter((d) => d.counts!.warn > 0).length} of ${counted.length} LVs`}
        </>
      ),
    });
  // the same LV read from two formats should give the same findings; say so when it does not
  const twins = of("tender").filter((d) => d.items === counted[0]?.items);
  if (p.kind !== "trades" && twins.some((d) => SEVERITIES.some((sev) => d.counts![sev] !== twins[0].counts![sev])))
    out.push({ text: "The formats of the tender do not give the same findings" });
  if (out.length === 0) out.push({ quiet: true, text: "Nothing open from the rule checks." });
  return out;
}

function Card({
  p,
  s,
  stage,
  busy,
  onOpen,
  onChooseFiles,
  onDropFiles,
  onDelete,
  onSetStep,
  onChange,
}: {
  p: CatalogProject;
  s: ProjectSummary | "failed" | undefined;
  stage: Stage;
  busy: boolean;
  onOpen: (p: CatalogProject, file?: number) => void;
  onChooseFiles: (target: string) => void;
  onDropFiles: (files: FileList, target: string) => void;
  onDelete: (p: CatalogProject) => void;
  onSetStep: (p: CatalogProject, index: number, step: Step) => void;
  onChange: (p: CatalogProject, change: Change) => void;
}) {
  const ready = s !== undefined && s !== "failed";
  // A card whose files are still being read is closed off with tape; the tape is pulled once its numbers
  // are there. A card that arrives with its numbers was never taped and just stands there.
  const taped = useRef(!ready);
  const [doomed, setDoomed] = useState(false); // Delete was clicked once
  const [over, setOver] = useState(false);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  let strip: ReactNode = null;
  if (ready) {
    const read = s.docs.filter((d) => d.counts);
    const shown = p.kind === "trades" ? read : read.slice(0, 1);
    const cuts = shown.slice(0, -1).reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.items], []);
    strip = shown.length > 0 && (
      <div className="card-lv">
        <Fingerprint marks={shown.map((d) => d.marks).join("")} cuts={cuts} />
        <span className="doc-counts">
          {SEVERITIES.map((sev) => (
            <span key={sev} className={s.counts[sev] === 0 ? "zero" : ""}>
              <Sign severity={sev} size={13} />
              {s.counts[sev]}
            </span>
          ))}
          <small>
            {s.items.toLocaleString("de-DE")} items{p.kind === "trades" ? ` in ${s.lvs} LVs` : ""}
          </small>
        </span>
      </div>
    );
  }

  return (
    <article
      className={`card${!ready ? " taped" : taped.current ? " untape" : ""}${over ? " over" : ""}`}
      tabIndex={0}
      aria-disabled={busy}
      onClick={() => !busy && onOpen(p)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && !busy && onOpen(p)}
      // later files of a running tender are dropped onto its card
      onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDropFiles(e.dataTransfer.files, p.id);
      }}
    >
      <header>
        <span className="plate">{plateOf(p)}</span>
        <div className="card-name">
          <b lang="de">{p.name}</b>
          <small>{[p.name.startsWith(p.number) ? "" : p.number, p.trade].filter(Boolean).join(" · ") || (p.kind === "trades" ? `${p.files.length} trade LVs` : "one LV")}</small>
        </div>
      </header>

      {!ready && <p className="card-wait">{s === "failed" ? "The files could not be read." : "Reading the files"}</p>}
      {strip}
      {ready && (
        <ul className="open-list">
          {openItems(p, s, stage).map((o, i) => (
            <li key={i} className={o.quiet ? "quiet" : undefined}>
              {o.sign ? <Sign severity={o.sign} size={14} /> : <i className={o.quiet ? "ok" : "dot"} />}
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
      )}
      {ready && s.net !== null && (
        <p className="card-net">
          <span>{s.net_from === "award" ? "Award" : s.net_from === "offer" ? "Offer" : "Bid"}, net</span>
          <b className="num">{eur(s.net)}</b>
        </p>
      )}

      <details className="card-files" onClick={stop}>
        <summary>
          {p.files.length} file{p.files.length > 1 ? "s" : ""}
          <small>{STEPS.filter((step) => p.files.some((f) => stepOf(f.role) === step)).map((step) => STEP_LABEL[step].toLowerCase()).join(", ")}</small>
        </summary>
        <ul>
          {p.files.map((f, index) => {
            const doc: ProjectDoc | undefined = ready ? s.docs.find((d) => d.index === index) : undefined;
            return (
              <li key={index}>
                <button className="file-open" disabled={busy} title={`Open ${f.name}`} onClick={() => onOpen(p, index)}>
                  <b>{f.format}</b>
                  <span>{doc?.title || f.name}</span>
                </button>
                {/* the step was read from the file (D-028); this is where a wrong one is put right */}
                <Select
                  value={stepOf(f.role)}
                  options={STEPS.map((step) => ({ value: step, label: STEP_LABEL[step] }))}
                  disabled={busy}
                  aria-label={`Step of ${f.name}`}
                  onChange={(step) => onSetStep(p, index, step)}
                />
              </li>
            );
          })}
        </ul>
        <p className="card-actions">
        <button className="btn-ghost small" disabled={busy} title="Add a later version or another LV to this tender" onClick={() => onChooseFiles(p.id)}>
            Add files
          </button>
          {/* two clicks: the first arms the button, the second deletes the project and its files */}
          <button
            className={`btn-ghost small${doomed ? " armed" : ""}`}
            disabled={busy}
            onClick={() => {
              if (doomed) onDelete(p);
              setDoomed(!doomed);
            }}
            onBlur={() => setDoomed(false)}
          >
            {doomed ? "Delete for good?" : "Delete"}
          </button>
        </p>
      </details>

      {(stage === "check" || stage === "questions" || stage === "pricing") && (
        <label className="stage-move" onClick={stop}>
          <span>Stage</span>
          <Select
            value={stage}
            options={(["check", "questions", "pricing"] as const).map((st) => ({ value: st, label: STAGE_LABEL[st] }))}
            disabled={busy}
            aria-label={`Stage of ${p.name}`}
            onChange={(st) => onChange(p, { stage: st })}
          />
        </label>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ new project */

interface Pending {
  files: File[]; // none yet: the dialog is open and waits for files
  info: Intake | null; // null while the server is still reading the files
  target: string | null; // the project the files were dropped on, if any
}

/** Dropped files, read but not yet kept. The server has read which tender they belong to and which step
 *  of it each file is; the dialog shows that with its evidence, so the user checks instead of filling in.
 *  Only what no file carries is asked for: the tender's dates. */
function NewProjectDialog({
  pending,
  projects,
  busy,
  error,
  onFiles,
  onChoose,
  onRemoveFile,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  projects: CatalogProject[];
  busy: boolean;
  error: string | null;
  onFiles: (files: FileList, target: string | null) => void;
  onChoose: (target: string | null) => void;
  onRemoveFile: (file: File) => void;
  onConfirm: (name: string, target: string | null, roles: (string | null)[], dates: { due?: string; questions_due?: string }) => void;
  onCancel: () => void;
}) {
  const { info, files } = pending;
  const dialog = useRef<HTMLDialogElement>(null);
  // What the user typed or chose stays when files are added or taken out and the set is read again.
  const [name, setName] = useState<string | null>(null); // null: as read from the files
  const [target, setTarget] = useState<string | null | undefined>(pending.target ?? undefined); // undefined: as suggested
  const [steps, setSteps] = useState(() => new Map<File, Step>()); // the user's corrections, by file
  const [due, setDue] = useState("");
  const [questionsDue, setQuestionsDue] = useState("");
  const [over, setOver] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  const rows: IntakeFile[] = [...(info?.files ?? [])].sort((a, b) => a.lv - b.lv || a.index - b.index);
  const fileOf = (f: IntakeFile) => files[f.index];
  const stepNow = (f: IntakeFile) => steps.get(fileOf(f)) ?? f.step;
  const nameNow = name ?? info?.name ?? "";
  const targetNow = target === undefined ? (info?.suggested?.id ?? null) : target;
  const present = STEPS.filter((s) => rows.some((f) => stepNow(f) === s));
  const toCheck = rows.filter((f) => !f.certain && !steps.has(fileOf(f))).length;
  const into = projects.find((p) => p.id === targetNow);
  const waiting = files.length === 0;

  function confirm() {
    if (!info) return;
    const roles: (string | null)[] = files.map(() => null);
    for (const f of info.files) if (stepNow(f) !== f.step) roles[f.index] = stepNow(f);
    onConfirm(nameNow.trim(), targetNow, roles, targetNow ? {} : { due: due || undefined, questions_due: questionsDue || undefined });
  }

  return (
    <dialog
      ref={dialog}
      className={`new-project${over ? " over" : ""}`}
      aria-label={into ? `Add files to ${into.name}` : "New project"}
      onCancel={(e) => (e.preventDefault(), !busy && onCancel())}
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()} // a click on the veil
      onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (!busy) onFiles(e.dataTransfer.files, targetNow);
      }}
    >
      <header>
        <b>{into ? "Add files" : "New project"}</b>
        <span>
          {waiting ? (
            into ? `to ${into.name}` : "from the files of a tender"
          ) : info ? (
            <>
              {into ? `to ${into.name}: ` : ""}
              {info.lvs === 1 ? "one LV" : `${info.lvs} LVs`} in {rows.length} file{rows.length > 1 ? "s" : ""} ({present.map((s) => STEP_LABEL[s].toLowerCase()).join(", ")})
              {info.left_out.length > 0 && `, ${info.left_out.length} left out`}
              {toCheck > 0 && <em>{toCheck} step{toCheck > 1 ? "s" : ""} to check</em>}
            </>
          ) : (
            `reading ${files.length} file${files.length > 1 ? "s" : ""}`
          )}
        </span>
        <button className="btn-ghost small" onClick={onCancel} disabled={busy}>
          Close
        </button>
      </header>

      {waiting ? (
        <div className="np-drop">
          <p>
            <b>Drop the files of the tender here.</b>
            The LV as GAEB, PDF or Excel, in every version you have: the app reads which tender it is and which step each file belongs to.
          </p>
          <button className="btn-new" onClick={() => onChoose(targetNow)}>
            Choose files
          </button>
          {error && (
            <strong className="np-error" role="alert">
              {error}
            </strong>
          )}
          <small>GAEB XML (X83, X84, X86) · GAEB 90 (D83, D84, D86) · PDF with a text layer · Excel</small>
        </div>
      ) : (
        <div className="np-body">
          <section>
            <h3>
              The files and the step each belongs to
              <button className="btn-ghost small" disabled={busy} title="Or drop more files onto this window" onClick={() => onChoose(targetNow)}>
                Add more files
              </button>
            </h3>
            <ul className="np-files">
              {!info &&
                files.map((f, i) => (
                  <li key={i} className="reading">
                    <span className="np-name">{f.name}</span>
                    <span className="np-why">being read{files.length > 1 ? " together with the others" : ""}</span>
                  </li>
                ))}
              {rows.map((f, i) => {
                const first = i === 0 || rows[i - 1].lv !== f.lv;
                const corrected = steps.has(fileOf(f)) && steps.get(fileOf(f)) !== f.step;
                return (
                  <li key={f.index} className={first && i > 0 ? "new-lv" : undefined}>
                    {first && info!.lvs > 1 && (
                      <span className="np-lv" lang="de">
                        {f.title}
                      </span>
                    )}
                    <span className="np-name" title={f.name}>
                      {f.name}
                    </span>
                    <span className="np-controls">
                      <span className="np-step" role="group" aria-label={`Step of ${f.name}`}>
                        {STEPS.map((s) => (
                          <button key={s} aria-pressed={stepNow(f) === s} disabled={busy} onClick={() => setSteps((old) => new Map(old).set(fileOf(f), s))}>
                            {STEP_LABEL[s]}
                          </button>
                        ))}
                      </span>
                      <button className="np-remove" disabled={busy} aria-label={`Remove ${f.name}`} title="Take this file out" onClick={() => onRemoveFile(fileOf(f))}>
                        Remove
                      </button>
                    </span>
                    <span className="np-why">
                      {!f.certain && !steps.has(fileOf(f)) && <i>check</i>}
                      {FORMAT_LABEL[f.format]} · {f.items.toLocaleString("de-DE")} items · {corrected ? "step set by you" : f.evidence.join(" · ")}
                    </span>
                  </li>
                );
              })}
              {info?.left_out.map((f, i) => {
                const file = files.find((x) => x.name === f.name);
                return (
                  <li key={`out${i}`} className="left-out">
                    <span className="np-name">{f.name}</span>
                    {file && (
                      <span className="np-controls">
                        <button className="np-remove" disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => onRemoveFile(file)}>
                          Remove
                        </button>
                      </span>
                    )}
                    <span className="np-why">left out: {f.reason}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="np-fields">
            <h3>{targetNow ? "Where the files go" : "The tender"}</h3>
            <label className="wide">
              <span>Goes into</span>
              <Select
                value={targetNow ?? ""}
                options={[{ value: "", label: "A new project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                aria-label="Goes into"
                onChange={(id) => setTarget(id || null)}
                disabled={!info || busy}
              />
              <small>{info?.suggested && targetNow === info.suggested.id ? `suggested: ${info.suggested.reason}` : " "}</small>
            </label>
            {targetNow === null && (
              <>
                <label className="wide">
                  <span>Project name</span>
                  <input value={nameNow} maxLength={80} placeholder={info ? "Name this tender" : ""} onChange={(e) => setName(e.target.value)} disabled={!info || busy} />
                  <small>
                    {info?.source && nameNow === info.name
                      ? `read from ${info.source.file}: ${info.source.where}`
                      : info && !info.name
                        ? "the files do not name their project"
                        : " "}
                  </small>
                </label>
                {info?.client && (
                  <p className="np-fact wide">
                    <span>Client</span>
                    <b lang="de">{info.client}</b>
                    <small>read from the files</small>
                  </p>
                )}
                <label>
                  <span>Submission deadline</span>
                  <DateField label="Submission deadline" value={due} onChange={setDue} disabled={!info || busy} />
                  <small>Not in an LV file. It stands on the tender notice.</small>
                </label>
                <label>
                  <span>Questions until</span>
                  <DateField label="Questions until" value={questionsDue} max={due || undefined} onChange={setQuestionsDue} disabled={!info || busy} />
                  <small>Set by the client. Both can be entered later.</small>
                </label>
              </>
            )}
          </section>
        </div>
      )}

      {!waiting && (
        <footer className={busy ? "busy" : undefined}>
          {error && !busy ? (
            <span className="np-error" role="alert">
              {error}
            </span>
          ) : (
            <span>{busy ? "Keeping the files and checking every item" : "Nothing is kept until you confirm."}</span>
          )}
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Discard
          </button>
          <button className="btn-new" onClick={confirm} disabled={!info || busy}>
            {targetNow ? "Add to project" : "Create project"}
          </button>
        </footer>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ the page */

export function ProjectsPage({
  projects,
  summaries,
  busy,
  pending,
  error,
  onOpen,
  onNew,
  onChooseFiles,
  onDropFiles,
  onRemoveFile,
  onConfirm,
  onCancel,
  onDelete,
  onSetStep,
  onChange,
}: {
  projects: CatalogProject[];
  summaries: Record<string, ProjectSummary | "failed">;
  busy: boolean;
  pending: Pending | null;
  error: string | null; // shown in the dialog while it is open: it covers the notice bar
  onOpen: (project: CatalogProject, file?: number) => void;
  onNew: () => void;
  onChooseFiles: (target: string | null) => void;
  onDropFiles: (files: FileList, target: string | null) => void;
  onRemoveFile: (file: File) => void;
  onConfirm: (name: string, target: string | null, roles: (string | null)[], dates: { due?: string; questions_due?: string }) => void;
  onCancel: () => void;
  onDelete: (project: CatalogProject) => void;
  onSetStep: (project: CatalogProject, index: number, step: Step) => void;
  onChange: (project: CatalogProject, change: Change) => void;
}) {
  return (
    <main className="register">
      {/* the schedule runs the full width of the window, straight under the band */}
      <Schedule projects={projects} busy={busy} onOpen={onOpen} onChange={onChange} />

      <div className="register-body">
      {pending && (
        <NewProjectDialog
          key={pending.target ?? "new"}
          pending={pending}
          projects={projects}
          busy={busy}
          error={error}
          onFiles={onDropFiles}
          onChoose={onChooseFiles}
          onRemoveFile={onRemoveFile}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}

      <section className="board-wrap" aria-label="Tenders by stage">
        <header className="board-head">
          <h1>Projects</h1>
          <div className="register-new">
            <span>Drop the files of a tender anywhere, or</span>
            <button className="btn-new" disabled={busy || pending !== null} onClick={onNew}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
              </svg>
              New project
            </button>
          </div>
        </header>
        <div className="board">
          {STAGES.map((stage) => {
            const here = projects.filter((p) => stageOf(p) === stage);
            return (
              <section key={stage} className="col" aria-label={STAGE_LABEL[stage]}>
                <h3>
                  {STAGE_LABEL[stage]}
                  <small>{here.length || "none"}</small>
                </h3>
                {here.map((p) => (
                  <Card
                    key={p.id}
                    p={p}
                    s={summaries[p.id]}
                    stage={stage}
                    busy={busy}
                    onOpen={onOpen}
                    onChooseFiles={onChooseFiles}
                    onDropFiles={onDropFiles}
                    onDelete={onDelete}
                    onSetStep={onSetStep}
                    onChange={onChange}
                  />
                ))}
                {here.length === 0 && <p className="col-empty">{STAGE_EMPTY[stage]}</p>}
              </section>
            );
          })}
        </div>
      </section>

      <footer className="register-foot">
        {SEVERITIES.map((sev) => (
          <span key={sev}>
            <Sign severity={sev} size={14} />
            <b>{SEVERITY_LABEL[sev]}</b>
            {sev === "high" ? "cannot be priced as written" : sev === "warn" ? "risk pushed onto the bidder" : "wording worth knowing"}
          </span>
        ))}
        <span className="formats">Submitted and Award follow from the files of a tender; the stages before are set on its card.</span>
      </footer>
      </div>
    </main>
  );
}
