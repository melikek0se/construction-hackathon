import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { reviewProgress } from "./api";
import { Sign } from "./components";
import { LvText } from "./format";
import { Fingerprint } from "./Projects";
import { SEVERITIES, type ReviewProgress, type Severity } from "./types";

/* Loading, the way a site says "not yet": two barrier tapes are pulled across the screen, one from each
   side, with what is being read running along them. They block the page until the work is done. */

function Tape({ text, side }: { text: string; side: "left" | "right" }) {
  // the text repeated often enough to fill any screen twice over, so the run never shows a gap
  const run = Array.from({ length: 12 }, (_, i) => <span key={i}>{text}</span>);
  return (
    <div className={`tape from-${side}`}>
      <div className="tape-run" aria-hidden>
        {run}
        {run}
      </div>
    </div>
  );
}

/** `doing` is the work ("Reading the files", "AI review"), `what` the thing it is done to. */
export function LoadingTapes({ doing = "Reading the files", what }: { doing?: string; what: string }) {
  return (
    <div className="tapes" role="status" aria-live="polite">
      <span className="visually-hidden">
        {doing}: {what}
      </span>
      <Tape side="left" text={doing} />
      <Tape side="right" text={what} />
    </div>
  );
}

/** What the sheet says while a page is opened: what is being opened and, where the projects page has read
    it already, the LV as a strip with its counts. Nothing on it is guessed: no numbers, no strip. */
export interface GateInfo {
  caption: string; // "Opening the LV"
  title: string; // the project or LV, in its own words
  sub?: string; // file, format, step
  marks?: string; // one digit per item in LV order (ProjectDoc.marks)
  counts?: Record<Severity, number>;
  items?: number;
}

/** The way from one page to another: the band is the shutter (as in the opening, where the yellow rolls
    up until what is left of it is the band). It is let down from under the band, its hazard stripe along
    the foot, the page changes behind it, and it rolls up into the band again. `dir` "in" (into an LV or a
    project) says what is being opened, "out" (back) is bare and quicker. `held`: it was down already. */
export function Gate({ dir, phase, info, held }: { dir: "in" | "out"; phase: "closing" | "opening"; info: GateInfo | null; held: boolean }) {
  const doing = info?.caption.replace(/^Opening/, "Reading") ?? "";
  // the band's own height: the shutter hangs from its lower stripe and its foot is drawn like it
  const [bandH, setBandH] = useState<number | null>(null);
  useLayoutEffect(() => setBandH(document.querySelector<HTMLElement>(".band")?.offsetHeight ?? null), []);
  return (
    <div
      className={`gate dir-${dir} is-${phase}${held ? " is-held" : ""}`}
      role="status"
      aria-live="polite"
      style={bandH ? ({ "--band-h": `${bandH}px` } as CSSProperties) : undefined}
    >
      <div className="gate-sheet">
        <div className="gate-foot" />
        {info && (
          <>
            <div className="gate-sign" key={info.title}>
              <span className="gate-caption">{info.caption}</span>
              <strong className="gate-title" lang="de">
                <LvText text={info.title} />
              </strong>
              {info.sub && (
                <span className="gate-sub" lang="de">
                  <LvText text={info.sub} />
                </span>
              )}
              {info.marks && (
                <div className="gate-strip">
                  <Fingerprint marks={info.marks} />
                </div>
              )}
              {info.counts && (
                <p className="gate-counts">
                  {SEVERITIES.map((sev) => (
                    <span key={sev} className={info.counts![sev] === 0 ? "zero" : undefined}>
                      <Sign severity={sev} size={18} />
                      <b className="num">{info.counts![sev]}</b>
                    </span>
                  ))}
                  {info.items !== undefined && <small>in {info.items.toLocaleString("de-DE")} items, as last read</small>}
                </p>
              )}
            </div>
            <Tape side="right" text={doing} />
          </>
        )}
      </div>
    </div>
  );
}

// The six kinds of finding the AI review looks for, in the words of the findings list. Every request
// looks for all of them in the section it reads, so they are shown together, each with its count so far.
const LOOKING_FOR: [string, string][] = [
  ["unclear_scope", "Unclear descriptions"],
  ["contradiction", "Contradictions"],
  ["missing_item", "Missing items"],
  ["typo", "Typos that change the price"],
  ["risk_shift", "Risk shifted to the bidder"],
  ["quantity", "Quantities that do not fit"],
];

/** The tapes of the AI review, with a board under them that says what is being done right now: the
    section being read, how many are read, and what was found so far. Asked from the server while it runs. */
export function ReviewTapes({ id, what }: { id: string; what: string }) {
  const [state, setState] = useState<ReviewProgress | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () =>
      reviewProgress(id).then(
        (s) => live && s.running && setState(s),
        () => undefined, // the review itself reports a failure; the board just keeps its last state
      );
    void ask();
    const timer = window.setInterval(ask, 700);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [id]);

  const total = state?.total ?? 0;
  const read = state?.read ?? 0;
  const reading = state?.reading ?? [];
  const found = state?.found;
  return (
    <div className="tapes has-board" role="status" aria-live="polite">
      <span className="visually-hidden">AI review in progress: {what}</span>
      <Tape side="left" text="AI review in progress" />
      <Tape side="right" text={what} />
      <div className="review-board">
        <div className="review-head">
          <strong>{total ? (read < total ? "Reading the LV section by section" : "Putting the findings together") : "Starting the review"}</strong>
          {total > 0 && (
            <span className="num">
              {read} of {total} sections read
            </span>
          )}
        </div>
        <div className="review-meter" aria-hidden>
          <i style={{ width: total ? `${(100 * read) / total}%` : 0 }} />
        </div>
        <p className="review-now">
          {reading.length > 0 ? (
            <>
              <span>Now reading</span> {reading[0]}
              {reading.length > 1 && ` and ${reading.length - 1} more`}
            </>
          ) : (
            "\u00a0"
          )}
        </p>
        <ul className="review-checks">
          {LOOKING_FOR.map(([check, label]) => (
            <li key={check} className={found?.[check] ? "has" : undefined}>
              <span>{label}</span>
              <b className="num">{found && read > 0 ? found[check] ?? 0 : "·"}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
