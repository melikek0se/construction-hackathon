import { useEffect, useState } from "react";
import { reviewProgress } from "./api";
import type { ReviewProgress } from "./types";

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
