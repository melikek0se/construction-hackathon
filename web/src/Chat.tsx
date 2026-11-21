// Questions about the project, answered by the server from the project's documents only (boq/chat.py).
// Every answer lists the passages it rests on; a passage opens the item it stands in, in this file or
// in another file of the project. "Not in the documents" is an answer, and one whose passages could not
// be confirmed says so.
import { useEffect, useRef, useState } from "react";
import { askProject } from "./api";
import { LvText } from "./format";
import type { ChatAnswer, ChatCitation, ChatTurn } from "./types";

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
}: {
  analysisId: string;
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

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const asked: ChatTurn[] = [...turns, { role: "user", content: question }];
    onTurns(asked);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const answer: ChatAnswer = await askProject(
        analysisId,
        question,
        turns.map((t) => ({ role: t.role, content: t.content })),
      );
      onTurns([...asked, { role: "assistant", content: answer.answer, answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onTurns(turns); // the question goes back into the box, nothing is lost
      setDraft(question);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel chat">
      <div className="scroll chat-turns">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>
              Ask about this project. The answer comes only from the project's documents, this LV and the other files,
              and names the item and passage it rests on. What the documents do not say is not answered.
            </p>
            {EXAMPLES.map((q) => (
              <button key={q} className="chat-example" onClick={() => void send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, n) =>
          t.role === "user" ? (
            <p key={n} className="chat-q">
              {t.content}
            </p>
          ) : (
            <Answer key={n} turn={t} openFile={openFile} onCite={onCite} />
          ),
        )}
        {busy && <p className="chat-wait">Reading the project documents…</p>}
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
        <textarea
          value={draft}
          rows={2}
          placeholder="Ask about the project…"
          aria-label="Question about the project"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

function Answer({ turn, openFile, onCite }: { turn: ChatTurn; openFile: string; onCite: (c: ChatCitation) => void }) {
  const a = turn.answer;
  return (
    <div className="chat-a">
      {a && !a.found && <p className="chat-flag">Not in the project documents</p>}
      {a && a.found && !a.grounded && (
        <p className="chat-flag warn">
          No passage in the documents could be confirmed for this answer. Treat it as unverified.
        </p>
      )}
      <p className="chat-text">{turn.content}</p>
      {a && a.citations.length > 0 && (
        <ul className="chat-cites">
          {a.citations.map((c, k) => {
            const here = c.file === openFile;
            return (
            <li key={k}>
              <button onClick={() => onCite({ ...c, here })} title={here ? "Show this item" : `Open ${c.file} at this item`}>
                <span className="chat-cite-head">
                  <b>{c.oz || "Remarks"}</b>
                  <span>{here ? "this file" : c.file}</span>
                </span>
                <span className="chat-cite-quote" lang="de">
                  <LvText text={`„${c.quote}“`} />
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {a && (
        <p className="chat-read" title={a.documents.join("\n")}>
          Read {a.documents.length} {a.documents.length === 1 ? "document" : "documents"}
          {a.dropped > 0 && ` · ${a.dropped} passage${a.dropped === 1 ? "" : "s"} left out: not found word for word`}
        </p>
      )}
    </div>
  );
}
