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

export function LoadingTapes({ what }: { what: string }) {
  return (
    <div className="tapes" role="status" aria-live="polite">
      <span className="visually-hidden">Reading {what}</span>
      <Tape side="left" text="Reading the files" />
      <Tape side="right" text={what} />
    </div>
  );
}
