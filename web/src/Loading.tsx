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
