// What Polier says by itself: a call over the site radio, at its left, when something happened that the estimator
// did not ask for at that moment (a tender came in the mail, a supplier answered, the client sent the LV
// again). The words are the server's record of what Polier did (boq.events), asked for every few seconds;
// only what happens while the page is open is said. One bubble at a time, the oldest first.
import { useEffect, useRef, useState } from "react";
import "./says.css";

export interface Said {
  id: number;
  kind: string; // tender, quote, answer, asks, decline, run; "note": said by the page itself
  text: string;
  project_id: string | null;
  project: string; // its name, "" where the thing belongs to no project
}

const STAYS_MS = 14_000;
const EVERY_MS = 6_000;

/** What Polier calls out, and whether it is a contract won. */
function shout(s: Said): [string, boolean] {
  if (s.kind === "tender") {
    if (s.text.startsWith("A tender was found")) return ["New tender!", false];
    if (s.text.startsWith("A new issue")) return ["The LV changed!", false];
    if (s.text.startsWith("The award")) return ["You won it!", true];
    if (s.text.startsWith("The bid")) return ["Bid on file.", false];
    return ["More on a tender!", false];
  }
  if (s.kind === "note") return [s.text.startsWith("Nothing new") ? "All quiet." : "I looked.", false];
  return [{ quote: "Prices are in!", answer: "The client answered!", asks: "They ask back.", decline: "They declined.", run: "Checked." }[s.kind] ?? "Polier here.", false];
}

/** The record's sentence as Polier says it over the radio: in the first person, without the reason it
 *  filed a thing where it did (that stays in the record of what Polier did). */
function spoken(s: Said): string {
  return s.text
    .replace(/^A tender was found in the mail: /, "Look what I found in your mail: ")
    .replace(/ \(same project (number [^)]*|name)\)/, "")
    .replace(/^A new issue of the LV came \(([^)]*)\): /, "The client sent the LV again and I read it for you ($1): ")
    .replace("Your questions, inquiries and prices went over to it.", "Your questions, inquiries and prices came along.")
    .replace(/^The award came in the mail from /, "The award is in, from ")
    .replace(/^The bid as it went out came in the mail from [^:]*: /, "I put the bid as it went out next to its tender: ")
    .replace(/^A new document of the tender came in the mail from /, "More came for this tender, from ");
}

const react = (how: "hop" | "excited") => window.dispatchEvent(new CustomEvent("polier", { detail: how }));

/** A contract won: square confetti out of Polier's corner. Squares only, as everything here. */
function confetti() {
  for (let i = 0; i < 34; i++) {
    const bit = document.createElement("i");
    bit.className = "says-bit";
    const angle = Math.PI * (0.55 + Math.random() * 0.75);
    const far = 140 + Math.random() * 300;
    bit.style.cssText = `--s:${6 + Math.round(Math.random() * 8)}px;--c:${["#ffc400", "#121413", "#fff"][i % 3]};--x:${Math.round(Math.cos(angle) * far)}px;--y:${Math.round(-Math.sin(angle) * far + 120)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--t:${900 + Math.round(Math.random() * 700)}ms;animation-delay:${Math.round(Math.random() * 160)}ms`;
    document.body.append(bit);
    window.setTimeout(() => bit.remove(), 2000);
  }
}

/** What Polier did since the page opened, newest last; `onNews` is told when something came (the board
 *  then reads its projects again). */
export function useSaid(onNews: (kinds: string[]) => void): [Said[], (s: Said) => void, (id: number) => void] {
  const [said, setSaid] = useState<Said[]>([]);
  const last = useRef<number | null>(null);
  const news = useRef(onNews);
  news.current = onNews;
  useEffect(() => {
    let stop = false;
    const ask = async () => {
      try {
        // the first answer only says where the record stands: what happened before is not news
        const got: Said[] = await (await fetch(`/api/events?limit=${last.current === null ? 1 : 20}&after=${last.current ?? 0}`)).json();
        if (stop || !Array.isArray(got)) return;
        const first = last.current === null;
        if (got.length > 0) last.current = Math.max(last.current ?? 0, ...got.map((e) => e.id));
        else if (first) last.current = 0;
        if (first || got.length === 0) return;
        const fresh = [...got].reverse();
        setSaid((was) => [...was, ...fresh.filter((e) => !was.some((w) => w.id === e.id))]);
        news.current(fresh.map((e) => e.kind));
      } catch {
        // the server not answering is said elsewhere
      }
    };
    void ask();
    const t = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);
  return [said, (s) => setSaid((was) => [...was, s]), (id) => setSaid((was) => was.filter((s) => s.id !== id))];
}

/** The site radio: Polier calls it in. An ink plate at the left of the hard hat, the call sign with its
 *  signal bars, what it calls out in the display face, then the sentence letter by letter. The mascot hops
 *  when it speaks (and cheers, with confetti, for a contract won). */
export function Says({ said, hidden, onGone, onOpen }: { said: Said[]; hidden: boolean; onGone: (id: number) => void; onOpen: (projectId: string) => void }) {
  const now = said[0];
  const line = now ? spoken(now) : "";
  const [typed, setTyped] = useState(0);
  const [held, setHeld] = useState(false);
  const waiting = said.length;
  // the line comes letter by letter; the mascot moves as it starts
  useEffect(() => {
    if (!now || hidden) return;
    const won = shout(now)[1];
    react(won ? "excited" : "hop");
    const burst = won ? window.setTimeout(confetti, 260) : 0;
    setTyped(0);
    const t = window.setInterval(() => setTyped((n) => (n >= line.length ? (window.clearInterval(t), n) : n + 2)), 22);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(burst);
    };
  }, [now?.id, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  // more came while it speaks: it hops again
  useEffect(() => {
    if (waiting > 1 && !hidden) react("hop");
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  // a call goes by itself after a while, unless the pointer rests on it
  useEffect(() => {
    if (!now || held || hidden) return;
    const t = window.setTimeout(() => onGone(now.id), STAYS_MS);
    return () => window.clearTimeout(t);
  }, [now?.id, held, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!now || hidden) return null;
  const opens = now.project_id !== null && now.project_id !== "";
  const done = typed >= line.length;
  return (
    <aside key={now.id} className={`says${done ? " done" : ""}`} role="status" aria-live="polite" aria-label={`${shout(now)[0]} ${line}`} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <div className="says-top">
        <span className="says-bars" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="says-call">Polier calling</span>
        {said.length > 1 && <span className="says-more">{said.length - 1} more</span>}
        <button className="says-x" aria-label="Dismiss" onClick={() => onGone(now.id)}>
          <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" /></svg>
        </button>
      </div>
      <h3>{shout(now)[0]}</h3>
      <p aria-hidden="true">
        {line.slice(0, typed)}
        {!done && <i className="says-caret" />}
      </p>
      {opens && (
        <button className="says-open" tabIndex={done ? 0 : -1} onClick={() => (onOpen(now.project_id!), onGone(now.id))}>
          Open <span lang="de">{now.project || "the project"}</span>
        </button>
      )}
      <i key={held ? "held" : "runs"} className="says-timer" />
    </aside>
  );
}
