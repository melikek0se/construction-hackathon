import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Sign } from "./components";
import { DateField, Select } from "./controls";
import { eur } from "./format";
import { FORMAT_LABEL, SEVERITIES, SEVERITY_LABEL, type CatalogProject, type DateKind, type FoundDate, type Intake, type IntakeFile, type Plan, type ProjectSummary, type Run, type Severity, type TenderDate } from "./types";
import "./home.css";

/* The projects page: the running tenders on a schedule (their dates and nothing else), and under it
   every tender on a board by the stage it is in (what is open on it; its dates only behind a button that
   opens the schedule at them). */

/* A tender's files belong to one of three steps (the GAEB exchange phases 83, 84, 86). */
export const STEPS = ["tender", "bid", "award"] as const;
export type Step = (typeof STEPS)[number]; // the same three as `Step` in types.ts
export const STEP_LABEL: Record<Step, string> = { tender: "Tender", bid: "Bid", award: "Award" };

export function stepOf(role: string): Step {
  if (role === "award") return "award";
  return ["bid", "submitted bid", "offer"].includes(role) ? "bid" : "tender";
}

/* Where a tender stands on the contractor's side (D-042). A column says where it stands, not what is being
   done on it: the bidder questions run beside the checks and the prices, so they are a line on the card
   and no column. A new tender, found by the agent in the mail or dropped by the estimator, is checked the
   moment it arrives (D-065), so the board has one column Tender for both stages "intake" (nobody has taken
   it on yet: its card asks for that decision) and "check" (taken on). Submitted follows from the files (a
   bid is there); Result holds every way a tender ends, not only the award. */
const STAGES = ["intake", "check", "pricing", "submitted", "result"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { intake: "New tender", check: "Tender", pricing: "Pricing", submitted: "Submitted", result: "Result" };
/** The columns of the board: the stages a column holds, in the order their cards stand in it. */
const COLUMNS: { key: string; label: string; stages: Stage[]; empty: string }[] = [
  { key: "tender", label: "Tender", stages: ["intake", "check"], empty: "No tender at work. Drop its files anywhere on the page; what Polier finds in your mail stands here too." },
  { key: "pricing", label: "Pricing", stages: ["pricing"], empty: "Nothing is being priced." },
  { key: "submitted", label: "Submitted", stages: ["submitted"], empty: "No bid is with a client." },
  { key: "result", label: "Result", stages: ["result"], empty: "No tender has ended yet." },
];

export type Outcome = NonNullable<Plan["outcome"]>;
const OUTCOME_LABEL: Record<Outcome, string> = { won: "Won", lost: "Lost", passed: "No bid", cancelled: "Cancelled" };
const OUTCOME_SAYS: Record<Outcome, string> = {
  won: "The contract is ours.",
  lost: "The contract went to another bidder.",
  passed: "No bid was made.",
  cancelled: "The client cancelled the tender.",
};

/** How a tender ended: as said on its card, else won when an award is among its files. */
export function outcomeOf(p: CatalogProject): Outcome | null {
  return p.plan.outcome ?? (p.files.some((f) => stepOf(f.role) === "award") ? "won" : null);
}

export function stageOf(p: CatalogProject): Stage {
  if (outcomeOf(p)) return "result";
  if (p.files.some((f) => stepOf(f.role) === "bid")) return "submitted";
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
function nextDate(p: CatalogProject, plan: Plan, today: Date): { what: string; day: Date; days: number } | null {
  if (stageOf(p) === "result") return null;
  const dates: [string, Date | null][] =
    stageOf(p) === "submitted"
      ? [["binding period ends", parseDay(plan.binding_until)]]
      : [["questions close", parseDay(plan.questions_due)], ["submission", parseDay(plan.due)]];
  const ahead = dates.flatMap(([what, day]) => (day && daysBetween(today, day) >= 0 ? [{ what, day, days: daysBetween(today, day) }] : []));
  return ahead.sort((a, b) => a.days - b.days)[0] ?? null;
}

/* ------------------------------------------------------------------ dates read from the files */

const DATE_LABEL: Record<DateKind, string> = {
  sent_out: "Tender sent",
  questions_due: "Questions until",
  due: "Submission",
  opening: "Bid opening",
  binding_until: "Binding until",
  exec_start: "Work starts",
  exec_end: "Work done by",
};
const DATE_ORDER = Object.keys(DATE_LABEL) as DateKind[];
/* The dates a tender is planned by, in the order it runs. "Tender sent" is a fact about the past and is
   only shown. `hint`: where the day stands when the files do not state it. */
export const PLANNED: { kind: TenderDate; label: string; hint: string }[] = [
  { kind: "questions_due", label: "Questions until", hint: "Set by the client, often in the cover letter." },
  { kind: "due", label: "Submission deadline", hint: "It stands on the tender notice." },
  { kind: "opening", label: "Bid opening", hint: "Usually the moment the deadline ends." },
  { kind: "binding_until", label: "Binding until", hint: "How long the bid holds (Bindefrist)." },
  { kind: "exec_start", label: "Work starts", hint: "In the contract terms or the schedule." },
  { kind: "exec_end", label: "Work done by", hint: "In the contract terms or the schedule." },
];
export const dmy = (iso: string) => iso.split("-").reverse().join(".");

// an approximate date names a month ("Ende Juni 2026"); the day kept for it is not shown
const dayText = (d: FoundDate) => (d.approx ? `${d.date.slice(5, 7)}.${d.date.slice(0, 4)}` : `${d.date.split("-").reverse().join(".")}${d.time ? `, ${d.time}` : ""}`);
/** Where a date was read, with the words it was read from: the evidence behind it. */
export const readFrom = (d: FoundDate) => `${d.sources.map((s) => `${s.file}, ${s.where}`).join("; ")}: "${[d.label, d.text].filter(Boolean).join(" ")}"`;

/** The dates the files give without doubt: one day per kind, not an approximate one (as `plan_of` in dates.py). */
export function planOf(dates: FoundDate[]): Pick<Plan, TenderDate> {
  const one = (kind: DateKind) => {
    const days = [...new Set(dates.filter((d) => d.kind === kind && !d.approx).map((d) => d.date))];
    return days.length === 1 ? days[0] : undefined;
  };
  return {
    due: one("due") ?? one("opening"),
    questions_due: one("questions_due"),
    opening: one("opening"),
    binding_until: one("binding_until"),
    exec_start: one("exec_start"),
    exec_end: one("exec_end"),
  };
}

/** A tender's dates under its row on the schedule: the ones it is planned by and what its files state.
 *  Only the date is written; where it was read is on hover. A day the files state but the project is not
 *  planned by is set quieter. Read only. */
function FoundDates({ dates, plan }: { dates: FoundDate[]; plan: Plan }) {
  // a day of the project that no file states: entered by hand
  const byHand = PLANNED.filter((f) => plan[f.kind] && !dates.some((d) => d.kind === f.kind && d.date === plan[f.kind]));
  if (dates.length === 0 && byHand.length === 0) return <p className="found-none">Its files state no date, and none was entered.</p>;
  const rows = [
    ...dates.map((d) => ({ kind: d.kind as DateKind, day: d.date, found: d as FoundDate | null })),
    ...byHand.map((f) => ({ kind: f.kind as DateKind, day: plan[f.kind]!, found: null })),
  ].sort((a, b) => DATE_ORDER.indexOf(a.kind) - DATE_ORDER.indexOf(b.kind) || a.day.localeCompare(b.day));
  return (
    <dl className="found-dates">
      {rows.map(({ kind, day, found }) => {
        // the files state another day than the one the project is planned by
        const other = found && kind !== "sent_out" && plan[kind] && plan[kind] !== day;
        return (
          <div key={kind + day} className={other ? "other" : undefined} title={found ? `Read from ${readFrom(found)}` : "Entered by hand"}>
            <dt>{DATE_LABEL[kind]}</dt>
            <dd className="num">{found ? dayText(found) : dmy(day)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------------------ shared marks */

const MARK = ["", "info", "warn", "high"];

/** An LV as one strip: a mark for every flagged item, where it stands in the LV. Marks keep a visible
 *  width however long the LV is, so one stop in a thousand items can still be seen. */
export function Fingerprint({ marks, cuts = [] }: { marks: string; cuts?: number[] }) {
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

/* How wide a deadline's plate on the line of all tenders is, in px: the tender's number in it, or a bare square. */
const railWidth = (p: CatalogProject) => (p.number ? Math.min(96, 10 + p.number.length * 6.6) : 14);
/* The name on a card whose plate already says the number: without the number it begins with. */
const nameBeside = (p: CatalogProject) =>
  (p.number && p.name.startsWith(p.number) && p.name.slice(p.number.length).replace(/^[\s\-–:,_]+/, "")) || p.name;

/* ------------------------------------------------------------------ the opening */

/** The page opens the way a site does: barrier tape across full yellow while the projects are fetched,
 *  then the tapes run on through (bottom corner to opposite top corner) and the yellow rolls up like a shutter
 *  until what is left of it is the band. The name stands on the yellow in very large letters behind the
 *  tapes and fades as the shutter starts; the brand then comes into the band from the left (`.entering`).
 *  `phase`: "loading" holds, "opening" plays the roll-up. */
export function Opening({ phase }: { phase: "loading" | "opening" }) {
  const run = (text: string) => (
    <div className="open-run" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i}>{text}</span>
      ))}
    </div>
  );
  // the band's own height, so that the shutter stops exactly on it
  const [bandH, setBandH] = useState<number | null>(null);
  useLayoutEffect(() => setBandH(document.querySelector<HTMLElement>(".band")?.offsetHeight ?? null), []);
  // the large name is shown only in its own typeface: in the fallback it is wider than the screen
  const [lettered, setLettered] = useState(false);
  useEffect(() => {
    const done = () => setLettered(true);
    void document.fonts.load('700 1em "Barlow Condensed"').then(done, done);
  }, []);
  return (
    <div className={`opening is-${phase}`} role="status" style={bandH ? ({ "--band-h": `${bandH}px` } as CSSProperties) : undefined}>
      <span className="visually-hidden">Reading the projects</span>
      <div className="open-sheet">
        <div className={`open-word${lettered ? "" : " is-waiting"}`} aria-hidden>
          Polier
        </div>
        <div className="open-edge foot" />
      </div>
      <div className="open-edge head" />
      <div className="open-tape a">{run("Reading the projects")}</div>
      <div className="open-tape b">{run("Reading the projects")}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ schedule */

/* The schedule's axis has two scales, because a tender runs over weeks and the work over months: eight weeks
   drawn by the day, a marked break, then thirteen months drawn by the month. The week before today is on it;
   the arrows move it by four weeks. */
const NEAR = 56; // days drawn day by day
const FAR = 396; // the days after them, drawn by the month
const NEAR_END = 66; // % of the lane where the days end
const FAR_START = 70; // % of the lane where the months begin; the break lies between the two
const STEP = 28; // days the arrows move the schedule by

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const homeStart = () => monday(addDays(new Date(), -7));
const dmY = (d: Date) => `${dm(d)}${d.getFullYear()}`; // `dm` ends with the dot

/** Where a day stands on the axis, in % of the lane; below 0 and above 100 it is off it. */
function axisPos(start: Date, d: Date): number {
  const n = daysBetween(start, d);
  return n < NEAR ? (n / NEAR) * NEAR_END : FAR_START + ((n - NEAR) / FAR) * (100 - FAR_START);
}

/** The lines across the schedule: a Monday per week on the days, the first of each month after the break
 *  (named every third month, so the names have room). */
function ticks(start: Date): { day: Date; label: string; sub?: string; strong?: boolean }[] {
  const out: { day: Date; label: string; sub?: string; strong?: boolean }[] = [];
  for (let w = 0; w < NEAR / 7; w++) {
    const d = addDays(start, w * 7);
    out.push({ day: d, label: `KW ${isoWeek(d)}`, sub: dm(d) });
  }
  const end = addDays(start, NEAR);
  let named = false;
  for (let d = new Date(end.getFullYear(), end.getMonth() + 1, 1); daysBetween(end, d) < FAR; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const show = d.getMonth() % 3 === 0 && axisPos(start, d) < 93;
    const month = d.toLocaleDateString("en-GB", { month: "short" });
    out.push({ day: d, label: show ? (named && d.getMonth() !== 0 ? month : `${month} ${d.getFullYear()}`) : "", strong: d.getMonth() === 0 });
    named ||= show;
  }
  return out;
}

/** The dates a tender is planned by: what was set on the project, else what its files state without doubt. */
export function datesOf(p: CatalogProject, s: ProjectSummary | "failed" | undefined): Plan {
  const read = s && s !== "failed" ? planOf(s.dates ?? []) : {};
  const out: Plan = { ...p.plan };
  for (const [k, v] of Object.entries(read) as [TenderDate, string | undefined][]) if (v && !out[k]) out[k] = v;
  return out;
}

/** The days a tender's row shows: question deadline and submission while it runs, sent and binding period after. */
function laneDays(p: CatalogProject, plan: Plan): Date[] {
  const keys: (keyof Plan)[] = stageOf(p) === "intake" || stageOf(p) === "check" || stageOf(p) === "pricing" ? ["questions_due", "due"] : ["sent", "binding_until", "due"];
  const days = keys.map((k) => parseDay(plan[k] as string | undefined)).filter((d): d is Date => d !== null);
  if (days.length) return days;
  return (["opening", "exec_start", "exec_end"] as const).map((k) => parseDay(plan[k])).filter((d): d is Date => d !== null);
}

/** The years on the axis: the one it begins in, and each one that begins on it. */
function years(start: Date): { year: number; at: number }[] {
  const out = [{ year: start.getFullYear(), at: 0 }];
  for (let y = start.getFullYear() + 1; ; y++) {
    const at = axisPos(start, new Date(y, 0, 1));
    if (at > 96) break;
    if (at - out[out.length - 1].at < 5) out.pop(); // the old year has only days left: no room for its label
    out.push({ year: y, at });
  }
  return out;
}

const PLAN_DAYS = ["questions_due", "due", "opening", "sent", "binding_until", "exec_start", "exec_end"] as const;

/** Where the schedule opens: at this week while a running tender has a date on the axis then; else at the
 *  dates of the tender nearest to today, so it never opens empty while there are dates to show. */
function openingStart(projects: CatalogProject[], summaries: Record<string, ProjectSummary | "failed">): Date {
  const home = homeStart(), today = startOfDay(new Date());
  const sets = projects
    .filter((p) => stageOf(p) !== "result")
    .map((p) => {
      const plan = datesOf(p, summaries[p.id]);
      return PLAN_DAYS.map((k) => parseDay(plan[k])).filter((d): d is Date => d !== null);
    })
    .filter((days) => days.length > 0);
  const onAxis = (d: Date) => axisPos(home, d) >= 0 && axisPos(home, d) <= 100;
  if (sets.length === 0 || sets.some((days) => days.some(onAxis))) return home;
  const away = (days: Date[]) => Math.min(...days.map((d) => Math.abs(daysBetween(today, d))));
  const nearest = sets.sort((a, b) => away(a) - away(b))[0];
  return monday(addDays(new Date(Math.min(...nearest.map((d) => d.getTime()))), -7));
}

/** Which project's dates the schedule shows, asked for from its card; `n` counts the asks, so the same card
 *  asked twice goes there again after the user moved away. */
export type Focus = { id: string; n: number } | null;

function Schedule({
  projects,
  summaries,
  busy,
  focus,
  hover,
  onFocus,
  onOpen,
  onEnter,
  onLeave,
}: {
  projects: CatalogProject[];
  summaries: Record<string, ProjectSummary | "failed">;
  busy: boolean;
  focus: Focus;
  hover: string | null; // the card pointed at: its lane is shown while it is
  onEnter: () => void;
  onLeave: () => void;
  onFocus: (id: string | null) => void;
  onOpen: (p: CatalogProject) => void;
}) {
  const today = startOfDay(new Date());
  const [start, setStart] = useState(() => openingStart(projects, summaries));
  // once the user has moved the schedule, it stays where they put it
  const moved = useRef(false);
  const move = (to: Date) => ((moved.current = true), setStart(to));
  // dates read from the files arrive after the first drawing: until the user moves it, the schedule follows them
  useEffect(() => {
    if (moved.current) return;
    const to = openingStart(projects, summaries);
    setStart((was) => (was.getTime() === to.getTime() ? was : to));
  }, [projects, summaries]);
  const lines = ticks(start);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pos = (d: Date) => axisPos(start, d);
  const x = (d: Date) => Math.max(0, Math.min(100, pos(d)));
  const seen = (d: Date) => pos(d) >= 0 && pos(d) <= 100;
  const planned = new Map(projects.map((p) => [p.id, datesOf(p, summaries[p.id])]));
  // a tender that has ended is shown only while its dates were asked for
  const running = projects
    .filter((p) => stageOf(p) !== "result" || p.id === focus?.id)
    .sort((a, b) => (nextDate(a, planned.get(a.id)!, today)?.days ?? 9999) - (nextDate(b, planned.get(b.id)!, today)?.days ?? 9999));
  /* The schedule is one lane docked under the band: the line of all tenders, or the lane of the one
     tender whose card is pointed at or whose dates are held open. */
  const one = projects.find((p) => p.id === (focus?.id ?? hover));

  /** Moves the schedule so a day stands a week in from its left edge, where days are drawn one by one. */
  const goTo = (day: Date) => move(monday(addDays(day, -7)));
  /** Moves the schedule to a tender's dates: a little before the first of them. */
  const goToProject = (p: CatalogProject) => {
    const days = laneDays(p, planned.get(p.id)!);
    if (days.length) goTo(new Date(Math.min(...days.map((d) => d.getTime()))));
  };

  // the dates of a project were asked for from its card: go there and bring its row into view
  useEffect(() => {
    if (!focus) return;
    const p = projects.find((q) => q.id === focus.id);
    if (!p) return;
    goToProject(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const bar = (kind: string, from: Date, to: Date) =>
    x(to) > x(from) && <i className={`gbar ${kind}${pos(to) > 100 ? " cut" : ""}`} style={{ left: `${x(from)}%`, width: `${x(to) - x(from)}%` }} />;
  /* What a date is, is told by its mark (legend under the rows), so its label is one line: the day. */
  type Kind = "q" | "due" | "open" | "sent" | "bind" | "w0" | "w1";
  type Mark = { kind: Kind; day: Date; label: string };
  /** The lines, the past and the break of the axis: the ground of every lane. */
  const ground = (
    <>
      {seen(today) && <i className="past" style={{ width: `${x(today)}%` }} />}
      {lines.map((t) => (
        <i key={t.day.getTime()} className={`gline${t.strong ? " strong" : ""}`} style={{ left: `${pos(t.day)}%` }} />
      ))}
      <i className="axis-break" style={{ left: `${NEAR_END}%`, width: `${FAR_START - NEAR_END}%` }} />
    </>
  );
  /** The dates off the axis: at each edge a pointer to the nearest one, that moves the schedule there. */
  const offs = (list: Mark[]) => {
    const before = list.filter((m) => pos(m.day) < 0).sort((a, b) => b.day.getTime() - a.day.getTime());
    const after = list.filter((m) => pos(m.day) > 100).sort((a, b) => a.day.getTime() - b.day.getTime());
    const one = (m: Mark | undefined, side: "before" | "after", more: number) =>
      m && (
        <button key={side} className={`goff ${side}`} title={`Go to ${dmY(m.day)}`} onClick={(e) => (e.stopPropagation(), goTo(m.day))}>
          {side === "before" && "← "}
          {m.label.toLowerCase()} {dm(m.day)}
          {m.day.getFullYear() !== today.getFullYear() ? m.day.getFullYear() : ""}
          {more > 0 && ` +${more}`}
          {side === "after" && " →"}
        </button>
      );
    return [one(before[0], "before", before.length - 1), one(after[0], "after", after.length - 1)];
  };

  /* The line of all tenders: every question deadline and submission as the tender's plate (days that fall
     together stand on top of each other), and after the break the work of each as a thin bar, so sites that
     would run at the same time show. */
  const railTiers: number[] = [];
  const rail = running
    .flatMap((p) => {
      const plan = planned.get(p.id)!;
      return ([["q", parseDay(plan.questions_due)], ["due", parseDay(plan.due)]] as const).flatMap(([kind, day]) =>
        day && seen(day) ? [{ p, kind, day, at: pos(day), days: daysBetween(today, day) }] : [],
      );
    })
    .sort((a, b) => a.at - b.at || (a.kind === "due" ? -1 : 1))
    .map((m) => {
      // a plate is as wide as its number: it takes the first tier whose last plate has ended (the lane
      // taken for 900px wide, which errs on the side of one tier more)
      const end = m.at + (railWidth(m.p) + 6) / 9;
      let tier = railTiers.findIndex((last) => m.at >= last);
      if (tier < 0) tier = railTiers.push(end) - 1;
      else railTiers[tier] = end;
      return { ...m, tier };
    });
  const sameDay = new Map<number, typeof rail>();
  for (const m of rail) if (m.kind === "due" && m.days >= 0) sameDay.set(m.day.getTime(), [...(sameDay.get(m.day.getTime()) ?? []), m]);
  const works = running.flatMap((p) => {
    const from = parseDay(planned.get(p.id)!.exec_start), to = parseDay(planned.get(p.id)!.exec_end);
    return from && to && x(to) > x(from) ? [{ p, from, to }] : [];
  });
  const atHome = start.getTime() === homeStart().getTime();
  /* The lane of a card pointed at lies over the line of all tenders, which stays in the page unseen: the dock
     is exactly as high as before, so the board does not move. Dates held open take the room they need. */
  const single = !!one && !focus;
  const railHeight = Math.max(68, 12 + Math.max(1, railTiers.length) * 22, 14 + works.length * 8);

  return (
    <section id="schedule" className={`sched dock${single ? " single" : ""}`} aria-label="Schedule of the running tenders" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="sched-head">
        <div className="sched-title">
          <div className="sched-nav" role="group" aria-label="Move the schedule">
            <button className="btn-ghost small" aria-label="4 weeks back" title="4 weeks back" onClick={() => move(addDays(start, -STEP))}>
              ←
            </button>
            <button className="btn-ghost small" disabled={atHome} onClick={() => move(homeStart())} title="Back to this week">
              Today
            </button>
            <button className="btn-ghost small" aria-label="4 weeks ahead" title="4 weeks ahead" onClick={() => move(addDays(start, STEP))}>
              →
            </button>
            <span className="sched-scale" title="The scale changes at the hatched strip: eight weeks by the day to its left, thirteen months by the month to its right">
              8 weeks <i aria-hidden /> 13 months
            </span>
          </div>
        </div>
        <div className="weeks" aria-hidden>
          {years(start).map((y) => (
            <b key={y.year} className="axis-year num" style={{ left: `${y.at}%` }}>
              {y.year}
            </b>
          ))}
          {lines.map((t) => (
            <span key={t.day.getTime()} className={t.strong ? "strong" : undefined} style={{ left: `${pos(t.day)}%` }}>
              {t.label}
              {t.sub && <small>{t.sub}</small>}
            </span>
          ))}
          <i className="axis-break" style={{ left: `${NEAR_END}%`, width: `${FAR_START - NEAR_END}%` }} />
          {seen(today) && (
            <b className="today-tag" style={{ left: `${x(today)}%` }}>
              Today · {wd(today)}
            </b>
          )}
        </div>
      </div>
      {/* the height of the line of all tenders: the lane of a card pointed at keeps that room (empty) under it, so the board does not move */}
      <div className="sched-body" style={running.length > 0 ? ({ "--rail-h": `${railHeight}px` } as CSSProperties) : undefined}>
        {(!one || single) && running.length > 0 && (
          <div className="sched-rail">
            <div className="rail-label">All tenders</div>
            <div className="rail-lane" style={{ height: railHeight }}>
              {ground}
              {works.map(({ p, from, to }, i) => (
                <i key={p.id} className="rail-work" style={{ left: `${x(from)}%`, width: `${x(to) - x(from)}%`, top: 7 + i * 8 }} title={`${p.name}: work ${dmY(from)} – ${dmY(to)}`} />
              ))}
              {rail.map((m) => (
                <i
                  key={m.p.id + m.kind}
                  className={`rail-plate${m.p.number ? "" : " bare"}${m.kind === "q" ? " q" : ""}${m.days < 0 ? " gone" : ""}`}
                  style={{ left: `${m.at}%`, top: 6 + m.tier * 22 }}
                  title={`${m.p.name}: ${m.kind === "q" ? "questions close" : "submission"} ${wd(m.day)}`}
                >
                  {m.p.number}
                </i>
              ))}
              {[...sameDay.values()]
                .filter((l) => l.length > 1)
                .map((l) => (
                  <span key={l[0].day.getTime()} className="rail-clash" style={{ left: `calc(${l[0].at}% + ${Math.round(Math.max(...l.map((m) => railWidth(m.p)))) + 6}px)` }}>
                    {l.length} submissions {wd(l[0].day)}
                  </span>
                ))}
            </div>
          </div>
        )}
        {(one ? [one] : []).map((p) => {
          const stage = stageOf(p);
          const plan = planned.get(p.id)!;
          const s = summaries[p.id];
          const shown = focus?.id === p.id;
          const received = parseDay(p.created) ?? today;
          const due = parseDay(plan.due), q = parseDay(plan.questions_due), opening = parseDay(plan.opening);
          const sent = parseDay(plan.sent), bind = parseDay(plan.binding_until);
          const workFrom = parseDay(plan.exec_start), workTo = parseDay(plan.exec_end);
          const late = stage === "submitted" || stage === "result";
          const next = nextDate(p, plan, today);
          const days = laneDays(p, plan);
          // every date the tender has, in the order it runs; the opening only where it is not the deadline's day
          const all: Mark[] = [
            q && { kind: "q", day: q, label: "Questions close" },
            due && { kind: "due", day: due, label: "Submission" },
            opening && (!due || daysBetween(due, opening) !== 0) && { kind: "open", day: opening, label: "Bid opening" },
            sent && { kind: "sent", day: sent, label: "Bid sent" },
            bind && { kind: "bind", day: bind, label: "Binding until" },
            workFrom && { kind: "w0", day: workFrom, label: "Work starts" },
            workTo && { kind: "w1", day: workTo, label: "Work done by" },
          ].filter((m): m is Mark => !!m);
          /* A date on the lane. Labels do not meet: the question deadline, the opening and the end of the
             binding period are written above the bar, submission and the work below it. */
          const mark = (m: Mark) => {
            const at = pos(m.day);
            if (at < 0 || at > 100) return null;
            const n = daysBetween(today, m.day);
            let text = "", below = false, flip = at > 90;
            if (m.kind === "q" || m.kind === "open") text = wd(m.day);
            else if (m.kind === "due") (text = late && sent ? "" : wd(m.day)), (below = true);
            else if (m.kind === "sent") (text = `sent ${dm(m.day)}`), (below = true), (flip = true);
            // right after the break the label opens to the right, or the break would cover it
            else if (m.kind === "bind") (text = dm(m.day)), (flip = !(at > FAR_START && at < FAR_START + 8));
            else if (m.kind === "w0") {
              if (workTo && pos(workTo) > 100) return null; // the pointer at the edge says it
              (text = `Work ${dm(m.day)}${workTo ? ` – ${dmY(workTo)}` : ""}`), (below = true), (flip = at > 78);
            } else {
              if (!workFrom || pos(workFrom) >= 0) return null; // written at the start of the bar
              (text = `Work until ${dmY(m.day)}`), (below = true), (flip = true);
            }
            const isNext = next?.day.getTime() === m.day.getTime() && (m.kind === "q" || m.kind === "due" || m.kind === "bind");
            return (
              <i
                key={m.kind}
                className={`gmark ${m.kind}${isNext ? " next" : ""}${n >= 0 && n <= 3 ? " soon" : ""}${n < 0 ? " gone" : ""}${flip ? " flip" : ""}`}
                style={{ left: `${at}%` }}
                title={`${m.label}: ${wd(m.day)}${m.day.getFullYear()}, ${inDays(n)}`}
              >
                {text && <span className={below ? "below" : "above"}>{text}</span>}
              </i>
            );
          };
          const waitFrom = sent ?? due;
          return (
            <div
              key={p.id}
              ref={(el) => void (el ? rowRefs.current.set(p.id, el) : rowRefs.current.delete(p.id))}
              className={`sched-row${shown ? " shown" : ""}`}
              tabIndex={0}
              aria-disabled={busy}
              onClick={() => !busy && onOpen(p)}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && !busy && onOpen(p)}
            >
              <div className="sched-left">
                <div>
                  <b lang="de" title={p.name}>
                    {p.number && <span className="plate no" title={`Tender number ${p.number}`}>{p.number}</span>}
                    {nameBeside(p)}
                  </b>
                  <small className="sched-next">{STAGE_LABEL[stage]}</small>
                </div>
                {/* the days left to the next hard date: the first thing read on a row */}
                <span className={`sched-count${next ? (next.days <= 3 ? " soon" : "") : " none"}`} title={next ? `${next.what[0].toUpperCase()}${next.what.slice(1)} ${wd(next.day)}, ${inDays(next.days)}` : undefined}>
                  <b className="num">{next ? next.days : "–"}</b>
                  <span>
                    {next ? (next.days === 1 ? "day to" : "days to") : stage === "result" ? "tender" : "no date"}
                    <em>{next ? next.what.split(" ")[0] : stage === "result" ? OUTCOME_LABEL[outcomeOf(p) ?? "won"].toLowerCase() : days.length ? "ahead" : "in its files"}</em>
                  </span>
                </span>
                <button
                  className="sched-go"
                  aria-expanded={shown}
                  aria-label={`Dates of ${p.name}`}
                  title={shown ? "Hide its dates" : "Go to its dates and list them with where they were read"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (shown) return onFocus(null);
                    onFocus(p.id);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              <div className="lane">
                {ground}
                {all.length === 0 && (
                  <span className="lane-none" style={{ left: `calc(${seen(today) ? x(today) : 0}% + 14px)` }}>
                    Its files state no date.
                  </span>
                )}
                {/* a thin grey line is time gone (until today, or until the bid went out), the ink bar what is
                    left until submission, the dashed line waiting for the client through the binding period,
                    the yellow bar the work itself */}
                {all.length > 0 && bar("gone", received, late && sent ? sent : today)}
                {!late && due && bar("left", today, due)}
                {waitFrom && bind && bar("wait", waitFrom, bind)}
                {workFrom && workTo && bar("work", workFrom, workTo)}
                {all.map(mark)}
                {offs(all)}
              </div>
              {shown && (
                <div className="sched-detail" onClick={(e) => e.stopPropagation()}>
                  {s && s !== "failed" ? <FoundDates dates={s.dates ?? []} plan={p.plan} /> : <p className="found-none">{s === "failed" ? "Its files could not be read." : "Reading its files"}</p>}
                </div>
              )}
            </div>
          );
        })}
        {(!one || single) && running.length === 0 && <p className="sched-empty">Nothing is running. A tender appears here as soon as its files are dropped, and stays until it is awarded.</p>}
        {seen(today) && (
          <div className="today-wrap" aria-hidden>
            <i className="today" style={{ left: `${x(today)}%` }} />
          </div>
        )}
      </div>
      {focus && one && (
        <p className="sched-legend" aria-hidden>
          <span><i className="lg left" />time left until submission</span>
          <span><i className="lg gone" />time gone</span>
          <span><i className="lg q" />questions close</span>
          <span><i className="lg due" />submission</span>
          <span><i className="lg sent" />bid sent</span>
          <span><i className="lg bind" />binding period</span>
          <span><i className="lg work" />work</span>
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

  if (stage === "result" || stage === "submitted") {
    const award = stage === "result" && of("award").length > 0;
    const [tender] = of("tender"), [later] = of(award ? "award" : "bid");
    if (stage === "result") out.push({ quiet: true, text: OUTCOME_SAYS[outcomeOf(p) ?? "won"] });
    if (tender && later && tender.items !== later.items)
      out.push({ text: <>The {award ? "award" : "bid"} has {n(later.items, "item")}, the tender {tender.items.toLocaleString("de-DE")}</> });
    return out;
  }
  // the same LV read from two formats should give the same findings; say so when it does not
  const twins = of("tender").filter((d) => d.items === counted[0]?.items);
  if (p.kind !== "trades" && twins.some((d) => SEVERITIES.some((sev) => d.counts![sev] !== twins[0].counts![sev])))
    out.push({ text: "The formats of the tender do not give the same findings" });
  return out;
}

/** Whose move it is on a tender, in one line: Polier is working on it, it waits for the estimator, or it
 *  waits for the client. Null where the pipeline's own line says all there is (checked, nothing open). */
function nowOf(
  p: CatalogProject,
  s: ProjectSummary | "failed" | undefined,
  run: Run | undefined,
  stage: Stage,
): { who: "polier" | "you" | "client" | "supplier" | "end"; label: string; text: string; n?: number } | null {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (stage === "result") {
    const o = outcomeOf(p) ?? "won";
    return { who: "end", label: OUTCOME_LABEL[o], text: "" };
  }
  if (run?.active) {
    const on = run.stages.find((x) => x.status === "running");
    return { who: "polier", label: "Polier", text: on ? `${on.title} · ${on.line || "running"}` : "waiting for a free worker" };
  }
  const plan = datesOf(p, s);
  if (stage === "intake") {
    const due = parseDay(plan.due);
    const days = due ? daysBetween(new Date(), due) : null;
    const read = days === null ? "No submission date in the files" : days < 0 ? `Submission was ${inDays(days)}: too late` : `Submission ${inDays(days)}${days <= 7 ? ": tight" : ""}`;
    return { who: "you", label: "You", text: read }; // the two buttons under it say what there is to decide
  }
  if (stage === "submitted") {
    const until = parseDay(plan.binding_until);
    return { who: "client", label: "Client", text: until ? `Bid binding until ${dm(until)}` : "The bid is with the client" };
  }
  if (run && (run.status === "failed" || run.status === "interrupted" || run.status === "cancelled"))
    return { who: "you", label: "You", text: run.status === "cancelled" ? "The checks were stopped: run them again" : "A check did not finish: see the pipeline" };
  const q = run?.questions;
  // price inquiries to suppliers and subcontractors (D-044): drafts are the estimator's move, sent ones the supplier's
  const inq = run?.inquiries;
  const inquiries = (n: number) => `${n} price ${n === 1 ? "inquiry" : "inquiries"}`;
  // what waits for the estimator, in one line: questions and inquiries to send, answers to decide on
  const decide = run?.decisions?.proposed ?? 0;
  // [how many, what]: the foot shows the figure on a plate and the words beside it
  const mine: [number, string][] = [];
  if (q && q.to_send > 0) mine.push([q.to_send, `question${q.to_send === 1 ? "" : "s"} to send`]);
  if (decide > 0) mine.push([decide, `answer${decide === 1 ? "" : "s"} of the client to decide`]);
  if (inq && inq.to_send > 0) mine.push([inq.to_send, `price inquir${inq.to_send === 1 ? "y" : "ies"} to send`]);
  // one move is said in full; several are counted, the card's list names them
  if (mine.length === 1) return { who: "you", label: "You", n: mine[0][0], text: mine[0][1] };
  if (mine.length > 1) return { who: "you", label: "You", n: mine.length, text: "things wait for you" };
  if (q && q.out > 0) {
    const until = parseDay(plan.questions_due);
    return { who: "client", label: "Client", text: `${count(q.out, "question")} out, no answer yet${until ? ` · until ${dm(until)}` : ""}` };
  }
  if (inq && inq.out > 0) return { who: "supplier", label: "Supplier", text: `${inquiries(inq.out)} out, ${inq.answered} answered` };
  return null;
}

function Card({
  p,
  s,
  run,
  stage,
  busy,
  pinned,
  covered,
  onOpen,
  onDropFiles,
  onChange,
  onDates,
  onPoint,
}: {
  p: CatalogProject;
  s: ProjectSummary | "failed" | undefined;
  run: Run | undefined; // the project's latest pipeline run: where it stands
  stage: Stage;
  busy: boolean;
  pinned: boolean; // its dates are held open on the schedule
  covered: boolean; // the opening is still across the page
  onOpen: (p: CatalogProject, file?: number) => void;
  onDropFiles: (files: FileList, target: string) => void;
  onChange: (p: CatalogProject, change: Change) => void;
  onDates: (p: CatalogProject) => void;
  onPoint: (id: string | null) => void; // the card is pointed at: the schedule shows its lane
}) {
  const ready = s !== undefined && s !== "failed";
  // A card whose files are still being read is closed off with tape; the tape is pulled once its numbers
  // are there. A card that arrives with its numbers was never taped and just stands there; so does one
  // whose numbers came while the opening still covered the page: nobody saw its tape.
  const taped = useRef(false);
  if (!ready && !covered) taped.current = true;
  const [over, setOver] = useState(false);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  /* Top right: the days left to the next hard date, the first figure read on a card. It names that date;
     the submission is written out only where the count is to something else. */
  const today = startOfDay(new Date());
  const plan = datesOf(p, s);
  const next = nextDate(p, plan, today);
  const due = parseDay(plan.due);
  const also = stage !== "submitted" && stage !== "result" && next && due && due.getTime() !== next.day.getTime() && daysBetween(today, due) >= 0 ? due : null;
  const alsoDue = also && (
    <span className="kc-date" title="Submission">
      <i className="lg due" />
      Submission {wd(also)}
    </span>
  );

  // a summary made before D-065 may say "not checked": no strip, no counts, only how much there is
  const unchecked = ready && s.checked === false;
  let strip: ReactNode = null;
  if (ready && !unchecked) {
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
          {alsoDue}
        </span>
      </div>
    );
  }
  const size = ready
    ? `${s.items.toLocaleString("de-DE")} items${p.kind === "trades" ? ` in ${s.lvs} LVs` : ""}${unchecked ? ", not checked yet" : ""}`
    : p.kind === "trades" ? `${p.files.length} trade LVs` : "";

  /* The middle of the card is what its stage asks: where an intake tender was found; on a tender being
     checked or priced what changed since the last check and how its bidder questions stand; on a bid the
     net and when the work would run. */
  const open = ready ? openItems(p, s, stage) : [];
  const found = p.plan.found;
  const working = stage === "check" || stage === "pricing";
  const since = working && run?.since && run.since.new + run.since.gone > 0 ? run.since : null;
  const q = working && run?.questions && run.questions.total > 0 ? run.questions : null;
  const inq = working && run?.inquiries && run.inquiries.packages > 0 ? run.inquiries : null;
  // the client's answers: changes still to decide, and what the accepted ones did
  const dec = working && run?.decisions ? run.decisions : null;
  // the bid: unit prices entered, against the items of the LV (several trade LVs: over all of them)
  const bidOf = working && ready && run?.bid ? run.bid : null;
  const priced = bidOf ? Math.min(p.kind === "trades" ? bidOf.priced_all : bidOf.priced, ready ? s.items : 0) : 0;
  const workFrom = parseDay(plan.exec_start), workTo = parseDay(plan.exec_end);
  const net = ready && s.net !== null;
  const block: ReactNode[] = [];
  if (stage === "intake" && found)
    block.push(
      <p key="found" className="card-found" title={found.subject}>
        <span className="kc-label">
          Found in your {found.via ?? "mail"}
          {found.received && parseDay(found.received) ? ` · ${dm(parseDay(found.received)!)}` : ""}
        </span>
        {found.subject && <span lang="de">„{found.subject}“</span>}
        {found.client || found.sender}
      </p>,
    );
  // what the mail asks, and how the job fits what the firm's own people do: Polier's read, with its reason
  if (stage === "intake" && found?.summary)
    block.push(
      <p key="read" className={`card-read is-${found.fit ?? "partly"}`}>
        <b>{found.fit === "yes" ? "Fits your work" : found.fit === "no" ? "Not your trade" : "Fits in part"}</b>
        {found.why || found.summary}
      </p>,
    );
  /* What is open on the tender, as one list. The mark of a row says whose it is: a yellow square is the
     estimator's, an open square waits for somebody else, a tick is done, a grey dot is only to know. */
  type Row = { state: "mine" | "wait" | "done" | "info"; n?: number | string; text: ReactNode; rest?: string; bar?: number; sign?: Severity };
  const rows: Row[] = [];
  const and = (parts: (string | false | 0)[]) => parts.filter(Boolean).join(" · ");
  if (since) rows.push({ state: "info", n: `+${since.new}`, text: `new finding${since.new === 1 ? "" : "s"} since the last check`, rest: since.gone ? `${since.gone} gone` : "" });
  if (q)
    rows.push(
      q.to_send > 0
        ? { state: "mine", n: q.to_send, text: `question${q.to_send === 1 ? "" : "s"} to send`, rest: and([q.out > 0 && `${q.out} with the client`, q.answered > 0 && `${q.answered} answered`]) }
        : q.out > 0
          ? { state: "wait", n: q.out, text: `question${q.out === 1 ? "" : "s"} with the client`, rest: q.answered > 0 ? `${q.answered} answered` : "" }
          : { state: "done", n: q.answered || q.total, text: q.answered ? "questions answered" : "questions closed" },
    );
  if (dec && dec.proposed + dec.accepted > 0) {
    const did = and([dec.quantities > 0 && `${dec.quantities} quantit${dec.quantities === 1 ? "y" : "ies"} corrected`, dec.allowances > 0 && `${dec.allowances} allowance${dec.allowances === 1 ? "" : "s"}`]);
    rows.push(
      dec.proposed > 0
        ? { state: "mine", n: dec.proposed, text: `answer${dec.proposed === 1 ? "" : "s"} of the client to decide`, rest: did }
        : { state: "done", n: dec.accepted, text: `change${dec.accepted === 1 ? "" : "s"} taken over from the answers`, rest: did },
    );
  }
  if (inq) {
    const packages = `${inq.packages} package${inq.packages === 1 ? "" : "s"}`;
    const held = inq.held > 0 && `${inq.held} item${inq.held === 1 ? " waits" : "s wait"} for the client`;
    rows.push(
      inq.to_send > 0
        ? { state: "mine", n: inq.to_send, text: `price inquir${inq.to_send === 1 ? "y" : "ies"} to send`, rest: and([inq.out > 0 && `${inq.out} out`, inq.answered > 0 && `${inq.answered} answered`, held]) }
        : inq.out > 0
          ? { state: "wait", n: inq.out, text: `inquir${inq.out === 1 ? "y" : "ies"} with suppliers`, rest: and([inq.answered > 0 && `${inq.answered} answered`, held]) }
          : { state: "done", n: inq.answered, text: `quote${inq.answered === 1 ? "" : "s"} in`, rest: and([packages, held]) },
    );
  }
  if (bidOf && ready && s.items > 0)
    rows.push({
      state: priced >= s.items ? "done" : "info",
      n: `${priced.toLocaleString("de-DE")}/${s.items.toLocaleString("de-DE")}`,
      text: "items priced",
      rest: bidOf.from_suggestions > 0 ? `${bidOf.from_suggestions} taken from past bids` : "",
      bar: priced / s.items,
    });
  for (const o of open) rows.push({ state: o.quiet ? "done" : "info", text: o.text, sign: o.sign });
  if (rows.length > 0)
    block.push(
      <ul key="rows" className="kc-list">
        {rows.map((r, i) => (
          <li key={i} className={`is-${r.state}`}>
            {r.sign ? <Sign severity={r.sign} size={13} /> : <i />}
            <span>
              {r.n !== undefined && <b className="num">{r.n}</b>} {r.text}
              {r.bar !== undefined && (
                <i className="kc-bar">
                  <i style={{ width: `${r.bar * 100}%` }} />
                </i>
              )}
            </span>
            {r.rest && <small>{r.rest}</small>}
          </li>
        ))}
      </ul>,
    );
  if (net)
    block.push(
      <p key="net" className="card-net">
        <span>{s.net_from === "award" ? "Award" : s.net_from === "offer" ? "Offer" : "Bid"}, net</span>
        <b className="num">{eur(s.net!)}</b>
      </p>,
    );
  if ((stage === "submitted" || stage === "result") && workFrom && workTo)
    block.push(
      <p key="work" className="kc-quiet">
        Work {dm(workFrom)} – {dmY(workTo)}
      </p>,
    );

  /* The foot of the card says whose move it is, and is the one filled surface on it: yellow when it is
     the estimator's. The stage (or how a bid ended) is changed from the same band. */
  const now = nowOf(p, s, run, stage);
  const move =
    stage === "check" || stage === "pricing" ? (
      <Select
        className="kc-sel"
        value={stage as string}
        options={[...(["check", "pricing"] as const).map((st) => ({ value: st as string, label: STAGE_LABEL[st] })), { value: "passed", label: "No bid" }]}
        disabled={busy}
        aria-label={`Stage of ${p.name}`}
        onChange={(st) => onChange(p, st === "passed" ? { outcome: "passed" } : { stage: st as "check" | "pricing" })}
      />
    ) : stage === "submitted" || (stage === "result" && p.plan.outcome) ? (
      // a bid that is out ends one way or another; an award among the files says "won" by itself
      <Select
        className="kc-sel"
        value={p.plan.outcome ?? "open"}
        options={[
          { value: "open", label: stage === "submitted" ? "Open" : "Open again" },
          ...(Object.keys(OUTCOME_LABEL) as Outcome[])
            .filter((o) => o === p.plan.outcome || (stage === "submitted" ? o !== "passed" : true))
            .map((o) => ({ value: o as string, label: OUTCOME_LABEL[o] })),
        ]}
        disabled={busy}
        aria-label={`Result of ${p.name}`}
        onChange={(o) => onChange(p, { outcome: o === "open" ? null : (o as Outcome) })}
      />
    ) : null;
  const who = stage === "intake" ? "decide" : (now?.who ?? "none");
  // the checks are running: the foot shows the six stations and the one they are at
  const stations = run?.active ? run.stages : null;
  const at = stations ? Math.max(0, stations.findIndex((x) => x.status === "running")) : 0;
  // a run that ends while the card is on the page: what it left comes in once (the foot wipes in)
  const wasActive = useRef(!!run?.active);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const was = wasActive.current;
    wasActive.current = !!run?.active;
    if (!was || run?.active) return;
    setEnded(true);
    const t = window.setTimeout(() => setEnded(false), 1400);
    return () => window.clearTimeout(t);
  }, [run?.active]);
  return (
    <article
      className={`card kc is-${stage}${!ready ? " taped" : taped.current ? " untape" : ""}${over ? " over" : ""}${pinned ? " pinned" : ""}${stage === "result" && outcomeOf(p) !== "won" ? " stood-back" : ""}${who === "you" ? " mine" : ""}${ended ? " just-done" : ""}`}
      tabIndex={0}
      aria-disabled={busy}
      onClick={() => !busy && onOpen(p)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && !busy && onOpen(p)}
      onMouseEnter={() => onPoint(p.id)}
      onMouseLeave={() => onPoint(null)}
      onFocus={() => onPoint(p.id)}
      onBlur={() => onPoint(null)}
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
        <div className="card-name">
          {/* the tender's own number, as its files state it; a tender without one carries no plate */}
          {p.number && <span className="plate no" title={`Tender number ${p.number}`}>{p.number}</span>}
          <b lang="de" title={p.name}>{nameBeside(p)}</b>
          <small>{[p.trade, size].filter(Boolean).join(" · ")}</small>
        </div>
        {/* the dates live on the schedule above the board; this holds this tender's open there */}
        <button
          className={`kc-days${next ? (next.days <= 3 ? " soon" : "") : " none"}`}
          disabled={busy}
          aria-pressed={pinned}
          aria-label={`Dates of ${p.name}`}
          title={`${next ? `${next.what[0].toUpperCase()}${next.what.slice(1)} ${wd(next.day)}. ` : ""}${pinned ? "Let go of its dates" : "Hold its dates open on the schedule, with where they were read"}`}
          onClick={(e) => (e.stopPropagation(), onDates(p))}
        >
          {next ? (
            <>
              <b className="num">{next.days}</b>
              <span>
                {next.days === 1 ? "day" : "days"} to
                <br />
                {next.what.split(" ")[0]}
              </span>
            </>
          ) : (
            <span>Dates</span>
          )}
        </button>
      </header>

      {!ready && <p className="card-wait">{s === "failed" ? "The files could not be read." : "Reading the files"}</p>}
      {strip}
      {!strip && alsoDue && <div className="card-lv">{alsoDue}</div>}
      {block.length > 0 && <div className="kc-block">{block}</div>}

      {stations ? (
        <footer className="kc-now is-run">
          <span className="run-seg-row" aria-hidden>
            {stations.map((x) => (
              <i key={x.id} className={`is-${x.status}`} />
            ))}
          </span>
          <p>
            <b>
              {at + 1}/{stations.length} {stations[at]?.title ?? "Waiting for a free worker"}
            </b>
            <span>{stations[at]?.line}</span>
          </p>
        </footer>
      ) : (
        <footer className={`kc-now is-${who}`}>
          {stage === "intake" ? (
            <span className="kc-decide" onClick={stop}>
              <button className="btn-new" disabled={busy} title="It goes on to the questions and the prices" onClick={() => onChange(p, { stage: "check" })}>
                Take it on
              </button>
              <button className="btn-ghost" disabled={busy} title="No bid: it goes to Result as passed" onClick={() => onChange(p, { outcome: "passed" })}>
                Pass
              </button>
            </span>
          ) : (
            <>
              {/* the estimator's move: how many on an ink plate, what beside it */}
              {now?.who === "you" ? <em className="num">{now.n ?? "!"}</em> : now && <b>{now.label}</b>}
              <span>{now ? now.text : !ready ? "" : run ? "Nothing open" : "Not checked yet"}</span>
              {move && (
                <span className="kc-move" onClick={stop}>
                  {move}
                </span>
              )}
            </>
          )}
        </footer>
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
 *  The tender's dates are filled in where a file states them (also a cover letter that is no LV). */
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
  onConfirm: (name: string, target: string | null, roles: (string | null)[], dates: Partial<Record<TenderDate, string>>) => void;
  onCancel: () => void;
}) {
  const { info, files } = pending;
  const dialog = useRef<HTMLDialogElement>(null);
  // What the user typed or chose stays when files are added or taken out and the set is read again.
  const [name, setName] = useState<string | null>(null); // null: as read from the files
  const [target, setTarget] = useState<string | null | undefined>(pending.target ?? undefined); // undefined: as suggested
  const [steps, setSteps] = useState(() => new Map<File, Step>()); // the user's corrections, by file
  const [days, setDays] = useState<Partial<Record<TenderDate, string>>>({}); // the dates the user set; the others are as read from the files
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
  // what the user set, else what the project already has, else what the files state
  const dayNow = (kind: TenderDate) => days[kind] ?? into?.plan[kind] ?? info?.plan[kind] ?? "";
  /** What stands under a date field: where the day in it was read, as long as it is still that day; a day
   *  the files state but that was not filled in (approximate, or two different days); else where to look. */
  const under = (kind: TenderDate, hint: string): { text: string; de?: boolean } => {
    const stated = info?.dates.filter((f) => f.kind === kind || (kind === "due" && f.kind === "opening")) ?? [];
    const here = dayNow(kind) && stated.find((f) => f.date === dayNow(kind) && !f.approx);
    if (here) return { text: `read from ${readFrom(here)}`, de: true };
    const own = stated.filter((f) => f.kind === kind);
    const added = own.filter((f) => !f.approx && f.date !== dayNow(kind));
    if (into && dayNow(kind) && added.length > 0)
      return { text: `The added files say ${added.map(dayText).join(" and ")}: ${readFrom(added[0])}`, de: true };
    if (own.length > 0 && !info?.plan[kind])
      return { text: `The files say ${own.map((f) => (f.approx ? "end of " : "") + dayText(f)).join(" and ")}${own.some((f) => f.approx) ? ", no exact day" : ""}: ${readFrom(own[0])}`, de: true };
    return { text: info ? `Not stated in these files. ${hint}` : " " };
  };
  const issued = info?.dates.find((f) => f.kind === "sent_out");

  function confirm() {
    if (!info) return;
    const roles: (string | null)[] = files.map(() => null);
    for (const f of info.files) if (stepNow(f) !== f.step) roles[f.index] = stepNow(f);
    onConfirm(nameNow.trim(), targetNow, roles, Object.fromEntries(PLANNED.map((f) => [f.kind, dayNow(f.kind)])));
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
              </>
            )}
            {/* the dates are asked for also when files are added: a later file can state a new deadline */}
            {(
              <>
                {issued && (
                  <p className="np-fact wide" title={`Read from ${readFrom(issued)}`}>
                    <span>Tender sent</span>
                    <b>{dayText(issued)}</b>
                    <small lang="de">
                      read from {issued.sources[0].file}, {issued.sources[0].where}
                    </small>
                  </p>
                )}
                {/* every date a tender is planned by: filled in from the files once they are read, and the
                    user's to change; a day the user set stays when files are added */}
                {PLANNED.map(({ kind, label, hint }) => {
                  const note = under(kind, hint);
                  return (
                    <label key={kind} className={dayNow(kind) && note.de ? "np-read" : undefined}>
                      <span>{label}</span>
                      <DateField
                        label={label}
                        value={dayNow(kind)}
                        max={kind === "questions_due" ? dayNow("due") || undefined : undefined}
                        onChange={(v) => setDays({ ...days, [kind]: v })}
                        disabled={!info || busy}
                      />
                      <small lang={note.de ? "de" : undefined} title={note.text}>
                        {note.text}
                      </small>
                    </label>
                  );
                })}
              </>
            )}
          </section>
        </div>
      )}

      {!waiting && (
        <footer className={busy || !info ? "busy" : undefined}>
          {error && !busy ? (
            <span className="np-error" role="alert">
              {error}
            </span>
          ) : (
            <span>{busy ? "Keeping the files; the checks then run in the background" : !info ? `Reading ${files.length === 1 ? "the file" : `${files.length} files`}` : "Nothing is kept until you confirm."}</span>
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
  runs,
  busy,
  covered,
  pending,
  error,
  onOpen,
  onChooseFiles,
  onDropFiles,
  onRemoveFile,
  onConfirm,
  onCancel,
  onChange,
  onNew,
  mail,
}: {
  projects: CatalogProject[];
  summaries: Record<string, ProjectSummary | "failed">;
  runs: Run[]; // the pipeline runs: a card whose project is being checked says so
  busy: boolean;
  covered: boolean; // the opening is still across the page: what loads behind it shows no tape of its own
  pending: Pending | null;
  error: string | null; // shown in the dialog while it is open: it covers the notice bar
  onOpen: (project: CatalogProject, file?: number) => void;
  onChooseFiles: (target: string | null) => void;
  onDropFiles: (files: FileList, target: string | null) => void;
  onRemoveFile: (file: File) => void;
  onConfirm: (name: string, target: string | null, roles: (string | null)[], dates: Partial<Record<TenderDate, string>>) => void;
  onCancel: () => void;
  onChange: (project: CatalogProject, change: Change) => void;
  onNew: (() => void) | null; // null: not now (something is loading, or the dialog is open)
  mail: { busy: boolean; onCheck: () => void; title: string } | null; // a mailbox is watched: look into it now
}) {
  const [focus, setFocus] = useState<Focus>(null);
  /* The card pointed at. Leaving a card lets go of it a moment later, so the pointer can cross to the
     schedule, where the lane then stays for as long as the pointer is on it. */
  const [hover, setHover] = useState<string | null>(null);
  const letGo = useRef(0);
  const point = (id: string | null) => {
    window.clearTimeout(letGo.current);
    if (id) setHover(id);
    else letGo.current = window.setTimeout(() => setHover(null), 300);
  };
  useEffect(() => () => window.clearTimeout(letGo.current), []);
  return (
    <main className="register">
      {/* the schedule: one lane docked under the band, the full width of the window; it stays while the board scrolls */}
      {projects.length > 0 && (
        <Schedule
          projects={projects}
          summaries={summaries}
          busy={busy}
          focus={focus}
          hover={hover}
          onFocus={(id) => setFocus(id ? { id, n: (focus?.n ?? 0) + 1 } : null)}
          onOpen={onOpen}
          onEnter={() => window.clearTimeout(letGo.current)}
          onLeave={() => point(null)}
        />
      )}

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
          {/* a new project, top right of the board */}
          <div className="register-new">
            {mail && (
              <button className="btn plain" disabled={mail.busy} onClick={mail.onCheck} title={mail.title}>
                {mail.busy ? "Reading mail…" : "Check mail"}
              </button>
            )}
            <div className="register-drop">
              <button className="btn" disabled={onNew === null} onClick={() => onNew?.()}>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
                </svg>
                New project
              </button>
            </div>
          </div>
        </header>
        <div className="board">
          {COLUMNS.map((col) => {
            // a tender still to be taken on stands above the ones at work: it asks for a decision
            const here = col.stages.flatMap((stage) => projects.filter((p) => stageOf(p) === stage));
            return (
              <section key={col.key} className="col" aria-label={col.label}>
                <h3>
                  {col.label}
                  <small>{here.length || "none"}</small>
                </h3>
                {here.map((p) => (
                  <Card
                    key={p.id}
                    p={p}
                    s={summaries[p.id]}
                    run={runs.find((r) => r.project_id === p.id)}
                    stage={stageOf(p)}
                    busy={busy}
                    onOpen={onOpen}
                    onDropFiles={onDropFiles}
                    onChange={onChange}
                    pinned={focus?.id === p.id}
                    covered={covered}
                    onDates={(p) => setFocus(focus?.id === p.id ? null : { id: p.id, n: (focus?.n ?? 0) + 1 })}
                    onPoint={point}
                  />
                ))}
                {here.length === 0 && <p className="col-empty">{col.empty}</p>}
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
      </footer>
      </div>
    </main>
  );
}
