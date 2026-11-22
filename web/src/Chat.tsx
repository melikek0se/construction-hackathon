// Questions about the project, answered by the server from the project's documents only (boq/chat.py).
// Every answer lists the passages it rests on; a passage opens the item it stands in, in this file or
// in another file of the project. "Not in the documents" is an answer, and one whose passages could not
// be confirmed says so.
import { useEffect, useRef, useState } from "react";
import { askAllProjects, askProject } from "./api";
import { LvText } from "./format";
import type { ChatAnswer, ChatCitation, ChatTurn } from "./types";

const ALL_EXAMPLES = [
  "Which tender is due next?",
  "Which project has the most stops?",
  "Which projects have a priced bid or award, and what is the net total?",
];

const EXAMPLES = [
  "Which work does this LV expect from others (bauseits)?",
  "Is clearing the site paid as an item of its own?",
  "Welche Leistungen sind in die Einheitspreise einzurechnen?",
];

export function Chat({
  analysisId,
  openFile,
  turns,
  onTurns,
  onCite,
  autoFocus,
}: {
  autoFocus?: boolean; // the panel Polier opens puts the cursor in the box
  analysisId: string | null; // null: the conversation about all projects, answered from their overview
  openFile: string; // the conversation outlives the file: "this file" is said about the one open now
  turns: ChatTurn[];
  onTurns: (turns: ChatTurn[]) => void;
  onCite: (c: ChatCitation) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, busy]);

  // `again`: the turn index of an answer to give once more from every document of the project, in place
  // of the one a search-based answer gave; the question is the turn before it.
  async function send(text: string, again?: number) {
    const question = text.trim();
    if (!question || busy) return;
    const before = again === undefined ? turns : turns.slice(0, again - 1);
    const asked: ChatTurn[] = [...before, { role: "user", content: question }];
    onTurns(asked);
    if (again === undefined) setDraft("");
    setBusy(true);
    setError(null);
    try {
      const history = before.map((t) => ({ role: t.role, content: t.content }));
      const answer: ChatAnswer =
        analysisId === null
          ? await askAllProjects(question, history)
          : await askProject(analysisId, question, history, openFile !== "", again === undefined ? "search" : "all");
      onTurns([...asked, { role: "assistant", content: answer.answer, answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onTurns(turns); // nothing is lost: the question goes back into the box, or the earlier answer stays
      if (again === undefined) setDraft(question);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel chat">
      <div className="scroll chat-turns">
        {turns.length === 0 && (
          <div className="chat-empty">
            <strong className="chat-hello">Ask me.</strong>
            <p>
              {analysisId === null
                ? "Ask about all your tenders: stages, dates, files, findings, net totals. The answer comes only from the overview of the projects and names the line it rests on. What stands inside an LV is asked in its project."
                : "Ask about this project. The answer comes only from the project's documents, this LV and the other files, and names the item and passage it rests on. What the documents do not say is not answered."}
            </p>
            {(analysisId === null ? ALL_EXAMPLES : EXAMPLES).map((q) => (
              <button key={q} className="chat-example" onClick={() => void send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, n) => {
          if (t.role !== "user") return null;
          const reply = turns[n + 1]?.role === "assistant" ? turns[n + 1] : null;
          const no = turns.slice(0, n + 1).filter((x) => x.role === "user").length;
          return (
            <article key={n} className="chat-p">
              <div className="chat-hq">
                <span className="chat-num" aria-hidden="true">
                  {String(no).padStart(2, "0")}
                </span>
                <h3 className={t.content.length > 90 ? "long" : undefined}>
                  <small>You asked</small>
                  {t.content}
                </h3>
              </div>
              {reply ? (
                <Answer
                  turn={reply}
                  openFile={openFile}
                  onCite={onCite}
                  onWhole={busy || n + 1 !== turns.length - 1 ? undefined : () => void send(t.content, n + 1)}
                />
              ) : (
                busy &&
                n === turns.length - 1 && (
                  <p className="chat-wait" role="status">
                    Reading<i aria-hidden="true">...</i>
                    <small>{analysisId === null ? "The overview of the projects" : "The project documents"}</small>
                  </p>
                )
              )}
            </article>
          );
        })}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <div className="chat-box">
        <textarea
          value={draft}
          rows={1}
          autoFocus={autoFocus}
          placeholder={analysisId === null ? "Ask about your projects…" : "Ask about the project…"}
          aria-label="Question about the project"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button type="submit" disabled={busy || !draft.trim()} title="Ask (Enter)">
          Ask
        </button>
        </div>
      </form>
    </div>
  );
}

const usd = (v: number) => (v < 0.01 ? "under 0.01 USD" : `${v.toFixed(2)} USD`);

function Answer({
  turn,
  openFile,
  onCite,
  onWhole,
}: {
  turn: ChatTurn;
  openFile: string;
  onCite: (c: ChatCitation) => void;
  onWhole?: () => void; // ask the same question again with every document read; only for the last answer
}) {
  const a = turn.answer;
  return (
    <>
      {a && !a.found && <p className="chat-stamp">{a.scope === "overview" ? "Not in the overview" : "Not in the documents"}</p>}
      {a && a.found && !a.grounded && (
        <p className="chat-flag">
          {a.scope === "overview"
            ? "No line of the overview could be confirmed for this answer. Treat it as unverified."
            : "No passage in the documents could be confirmed for this answer. Treat it as unverified."}
        </p>
      )}
      <p className="chat-text">{turn.content}</p>
      {a && a.citations.length > 0 && (
        <ul className="chat-cites">
          {a.citations.map((c, k) => {
            const here = c.file === openFile;
            if (c.project)
              return (
                <li key={k}>
                  <button className="cite-project" onClick={() => onCite(c)} title={`Open ${c.project_name}`}>
                    <b className="chat-cite-oz" lang="de">
                      {c.project_name}
                    </b>
                    <span className="chat-cite-quote">
                      <LvText text={c.quote} />
                    </span>
                  </button>
                </li>
              );
            return (
            <li key={k}>
              <button onClick={() => onCite({ ...c, here })} title={here ? "Show this item" : `Open ${c.file} at this item`}>
                <b className="chat-cite-oz">{c.oz || "Remarks"}</b>
                <span>
                  <span className="chat-cite-quote" lang="de">
                    <LvText text={`„${c.quote}“`} />
                  </span>
                  <span className="chat-cite-file">{here ? "this file" : c.file}</span>
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {a && (
        <p
          className="chat-read"
          title={
            a.documents.join("\n") +
            (a.usage
              ? `\n\nTokens: ${a.usage.input_tokens + a.usage.cache_write_tokens} read new, ${a.usage.cache_read_tokens} from the cache, ${a.usage.output_tokens} written`
              : "")
          }
        >
          {a.scope === "overview"
            ? `Read the overview of ${a.files} ${a.files === 1 ? "project" : "projects"}`
            : a.scope === "all"
            ? `Read all ${a.files} ${a.files === 1 ? "document" : "documents"} in full`
            : `Read the ${a.passages} passages a search found, from ${a.files} of ${a.documents.length} ${
                a.documents.length === 1 ? "document" : "documents"
              }`}
          {a.cost_usd !== null && ` · ${usd(a.cost_usd)}`}
          {a.dropped > 0 && ` · ${a.dropped} ${a.scope === "overview" ? "line" : "passage"}${a.dropped === 1 ? "" : "s"} left out: not found word for word`}
        </p>
      )}
      {a && a.scope === "search" && onWhole && (
        <button className="chat-whole" onClick={onWhole}>
          Read every document for this question
          {a.whole.first_usd !== null && a.whole.then_usd !== null && (
            <span>
              about {usd(a.whole.first_usd)} now, then {usd(a.whole.then_usd)} a question for an hour
            </span>
          )}
        </button>
      )}
    </>
  );
}

/** A line icon on a 16px grid, drawn in the current colour. */
export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
