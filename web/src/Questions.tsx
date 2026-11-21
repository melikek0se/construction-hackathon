/* Bidder questions by e-mail. The questions that need the client are picked, the German message is written
   by the server and can be changed, and it goes out from the estimator's own mail program (a draft) or, where
   the server has an account, from the app. What was asked is kept; when the client answers, the reply is
   pasted in and read against the questions. */
import { useEffect, useMemo, useRef, useState } from "react";
import { composeQuestions, discardMail, mailQuestions, markMailSent, readReply } from "./api";
import { dayText } from "./controls";
import type { BidderQuestion, QuestionMail, QuestionsState } from "./types";

const SENDER_KEY = "lvcheck.mail.sender"; // the signature under the message (name, company), kept in this browser
const TO_KEY = "lvcheck.mail.to"; // the client's address per LV file

const STATUS: Record<BidderQuestion["status"], string> = {
  new: "Not asked",
  drafted: "Draft",
  sent: "Sent",
  partly: "Partly answered",
  answered: "Answered",
};

const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
};

function daysLeft(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const n = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : n === -1 ? "yesterday" : `${-n} days ago`;
}

const stored = (key: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
};

export function QuestionsView({
  analysisId,
  state,
  onState,
  onReload,
  onItem,
}: {
  analysisId: string;
  state: QuestionsState | null;
  onState: (s: QuestionsState) => void;
  onReload: () => void;
  onItem: (oz: string) => void;
}) {
  const file = state?.lv.file ?? "";
  // Picked for the next message: at first every question that is in no message yet.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [to, setTo] = useState("");
  const [sender, setSender] = useState(() => localStorage.getItem(SENDER_KEY) ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false); // the text was changed by hand: it is no longer rewritten
  const [busy, setBusy] = useState<"draft" | "file" | "smtp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const questions = state?.questions ?? [];
  const keys = useMemo(() => {
    const all = questions.map((q) => q.key);
    return picked ? all.filter((k) => picked.has(k)) : questions.filter((q) => q.status === "new").map((q) => q.key);
  }, [questions, picked]);

  useEffect(() => {
    if (file) setTo(stored(TO_KEY)[file] ?? "");
  }, [file]);

  // The message follows the picked questions and the signature until it is changed by hand.
  const asked = useRef(0);
  useEffect(() => {
    if (edited || keys.length === 0) {
      if (keys.length === 0 && !edited) setBody("");
      return;
    }
    const mine = ++asked.current;
    const timer = window.setTimeout(() => {
      composeQuestions(analysisId, keys, sender).then(
        (m) => {
          if (mine !== asked.current) return;
          setSubject(m.subject);
          setBody(m.body);
        },
        (e) => mine === asked.current && setError(e instanceof Error ? e.message : String(e)),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [analysisId, keys, sender, edited]);

  if (!state) return <div className="questions"><p className="quiet">Reading the bidder questions…</p></div>;

  const count = (s: BidderQuestion["status"][]) => questions.filter((q) => s.includes(q.status)).length;
  const toggle = (key: string) => {
    const next = new Set(keys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  // "draft": a link into the mail program; "file": the same message as an .eml file, for a message too long
  // for a link (Outlook on Windows cuts those); "smtp": the app sends it. The first two are kept as drafts.
  async function send(via: "draft" | "file" | "smtp") {
    setBusy(via);
    setError(null);
    try {
      const address = to.trim();
      const next = await mailQuestions(analysisId, { keys, to: address, subject, body, via: via === "smtp" ? "smtp" : "draft" });
      localStorage.setItem(SENDER_KEY, sender);
      localStorage.setItem(TO_KEY, JSON.stringify({ ...stored(TO_KEY), [file]: address }));
      onState(next);
      setPicked(null);
      setEdited(false);
      if (via === "draft") {
        // The user's own mail program, with the message filled in; the app cannot see what happens there.
        // In a new tab: where the browser hands mailto: to a web mail page (Gmail, Yandex), that page would
        // otherwise replace this one. A mail program on the computer takes the link and no tab stays open.
        const link = document.createElement("a");
        link.href = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        link.target = "_blank";
        link.rel = "noopener";
        link.click();
      }
      if (via === "file") {
        const link = document.createElement("a");
        link.href = `/api/mails/${next.mails[next.mails.length - 1].id}/message.eml`;
        link.download = ""; // the server names the file: subject and day
        link.click();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const ready = keys.length > 0 && /^\S+@\S+$/.test(to.trim()) && subject.trim() !== "" && body.trim() !== "";

  return (
    <div className="questions">
      <div className="q-head">
        <p>
          <b>{questions.length}</b> bidder {questions.length === 1 ? "question" : "questions"}
          {questions.length > 0 && (
            <>
              {" "}
              · {count(["new"])} not asked · {count(["drafted", "sent"])} waiting · {count(["partly", "answered"])} answered
            </>
          )}
        </p>
        {state.questions_due && (
          <p className={`q-due${daysLeft(state.questions_due).includes("ago") || daysLeft(state.questions_due) === "yesterday" ? " past" : ""}`}>
            Questions until <b>{dayText(state.questions_due)}</b> ({daysLeft(state.questions_due)})
          </p>
        )}
        <a className="text-link" href={`/api/analyses/${analysisId}/bieterfragen.txt`} download>
          Download as text
        </a>
      </div>

      {questions.length === 0 ? (
        <p className="quiet q-none">
          No finding of this LV needs the client so far. The rule checks raise few questions; the AI review (in the
          findings pane) writes one for every unclear description, contradiction or missing item it finds.
        </p>
      ) : (
        <div className="q-cols">
          <ol className="q-list">
            {questions.map((q) => (
              <li key={q.key} className={`q-row is-${q.status}`}>
                <input
                  type="checkbox"
                  aria-label={`Ask question ${q.no}`}
                  checked={keys.includes(q.key)}
                  onChange={() => toggle(q.key)}
                />
                <div>
                  <div className="q-where">
                    {q.item_oz ? (
                      <button className="oz-link" onClick={() => onItem(q.item_oz!)}>
                        {q.item_oz}
                      </button>
                    ) : (
                      <span className="oz-link">LV</span>
                    )}
                    <span lang="de">{q.item_label}</span>
                    <span className={`tag q-status is-${q.status}`}>
                      {STATUS[q.status]}
                      {q.sent_at && q.status === "sent" ? ` ${stamp(q.sent_at).slice(0, 10)}` : ""}
                    </span>
                  </div>
                  <p className="q-text" lang="de">
                    {q.question}
                  </p>
                  {q.evidence && (
                    <p className="q-quote" lang="de">
                      {q.evidence}
                    </p>
                  )}
                  {q.answer && (
                    <div className="q-answer">
                      <span className="caption">{q.status === "partly" ? "The client answers in part" : "The client answers"}</span>
                      <p className="q-quote" lang="de">
                        „{q.answer.quote}“
                      </p>
                      {q.answer.meaning && <p>{q.answer.meaning}</p>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="q-side">
            <section className="q-compose">
              <h2 className="caption">
                Message to the client{keys.length > 0 && ` · ${keys.length} ${keys.length === 1 ? "question" : "questions"}`}
              </h2>
              {keys.length === 0 ? (
                <p className="quiet">Tick the questions to ask. Every question is already in a message.</p>
              ) : (
                <>
                  <label>
                    <span>To</span>
                    <input type="email" value={to} placeholder="vergabestelle@…" onChange={(e) => setTo(e.target.value)} />
                  </label>
                  <label>
                    <span>Subject</span>
                    <input type="text" lang="de" value={subject} onChange={(e) => { setSubject(e.target.value); setEdited(true); }} />
                  </label>
                  <label>
                    <span>Signature</span>
                    <textarea
                      rows={2}
                      value={sender}
                      placeholder={"Name\nCompany"}
                      disabled={edited}
                      onChange={(e) => setSender(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      Text
                      {edited && (
                        <button className="text-link" onClick={() => setEdited(false)}>
                          Write it again from the questions
                        </button>
                      )}
                    </span>
                    <textarea
                      className="q-body"
                      lang="de"
                      rows={14}
                      value={body}
                      onChange={(e) => { setBody(e.target.value); setEdited(true); }}
                    />
                  </label>
                  {error && <p className="q-error" role="alert">{error}</p>}
                  <div className="q-actions">
                    <button className="btn" disabled={!ready || busy !== null} onClick={() => void send("draft")}>
                      {busy === "draft" ? "Opening" : "Open in mail program"}
                    </button>
                    <button className="btn q-file" disabled={!ready || busy !== null} onClick={() => void send("file")}>
                      {busy === "file" ? "Writing the file" : "Download for Outlook (.eml)"}
                    </button>
                    {state.account && (
                      <button className="btn q-send" disabled={!ready || busy !== null} onClick={() => void send("smtp")}>
                        {busy === "smtp" ? "Sending" : `Send from ${state.account}`}
                      </button>
                    )}
                    <button
                      className="text-link"
                      disabled={!body}
                      onClick={() => {
                        void navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1600);
                        });
                      }}
                    >
                      {copied ? "Copied" : "Copy the text"}
                    </button>
                  </div>
                  {!state.account && (
                    <p className="q-note">
                      The message opens in your mail program and is sent by you, from your own address. A long
                      message can be cut on the way into the mail program: the .eml file has no such limit. Either way
                      it is kept here as a draft until you mark it as sent.
                    </p>
                  )}
                </>
              )}
            </section>

            {[...state.mails].reverse().map((m) => (
              <MailCard key={m.id} mail={m} onChanged={onReload} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One message: who it went to and when, and the place for the client's reply. */
function MailCard({ mail, onChanged }: { mail: QuestionMail; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const act = (what: string, run: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    run().then(
      () => {
        setBusy(null);
        onChanged();
      },
      (e) => {
        setBusy(null);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };

  const answers = Object.values(mail.answers ?? {});
  const n = (s: string) => answers.filter((a) => a.status === s).length;
  return (
    <section className={`q-mail${mail.sent_at ? "" : " is-draft"}`}>
      <header>
        <h2 className="caption">
          {mail.sent_at ? "Sent" : "Draft"} · {mail.items.length} {mail.items.length === 1 ? "question" : "questions"}
        </h2>
        <span className="num">{stamp(mail.sent_at ?? mail.created)}</span>
      </header>
      <p className="q-to">
        to <b>{mail.to}</b>
        {mail.via === "smtp" ? " · sent by the app" : mail.sent_at ? " · sent from your mail program" : " · opened in your mail program"}
      </p>
      <details>
        <summary>{mail.subject}</summary>
        <pre lang="de">{mail.body}</pre>
      </details>

      {!mail.sent_at && (
        <div className="q-actions">
          <button className="btn" disabled={busy !== null} onClick={() => act("sent", () => markMailSent(mail.id, true))}>
            Mark as sent
          </button>
          <a className="text-link" href={`/api/mails/${mail.id}/message.eml`} download>
            Download .eml
          </a>
          <button className="text-link" disabled={busy !== null} onClick={() => act("discard", () => discardMail(mail.id))}>
            Discard the draft
          </button>
        </div>
      )}

      {mail.reply ? (
        <div className="q-reply">
          <p>
            <b>Reply read {mail.reply_at ? stamp(mail.reply_at) : ""}</b>: {n("answered")} answered, {n("partly")} in part,{" "}
            {n("not_answered")} still open.
            {note && ` ${note}`}
          </p>
          <details>
            <summary>The reply as it came</summary>
            <pre>{mail.reply}</pre>
          </details>
        </div>
      ) : (
        <div className="q-reply">
          <label>
            <span>The client's reply</span>
            <textarea
              rows={4}
              value={reply}
              placeholder="Paste the text of the reply e-mail here"
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <div className="q-actions">
            <button
              className="btn"
              disabled={busy !== null || reply.trim().length < 10}
              onClick={() =>
                act("reply", async () => {
                  const read = await readReply(mail.id, reply);
                  setNote(read.dropped ? `${read.dropped} passage${read.dropped === 1 ? " was" : "s were"} not found in the reply and left out.` : null);
                })
              }
            >
              {busy === "reply" ? "Reading the reply" : "Read the reply"}
            </button>
            <span className="q-note">Each answer is matched to its question and shown with the passage of the reply.</span>
          </div>
        </div>
      )}
      {error && <p className="q-error" role="alert">{error}</p>}
    </section>
  );
}
