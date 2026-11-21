/* Bidder questions by e-mail. The questions that need the client are picked, the German message is written
   by the server and can be changed, and it goes out from the estimator's own mail program (a draft) or, where
   the server has an account, from the app. What was asked is kept; when the client answers, the reply is
   pasted in — or found in the inbox, where the server may look into one — and read against the questions.
   What an answer changes on our side (a finding settled, a quantity corrected, a point to price as a risk)
   is put up under its question for the estimator to accept, change or reject. */
import { useEffect, useMemo, useRef, useState } from "react";
import { checkReplies, composeQuestions, decideAmendment, discardMail, mailQuestions, markMailSent, readReply } from "./api";
import { dayText } from "./controls";
import type { Amendment, BidderQuestion, QuestionMail, QuestionsState } from "./types";

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
  const fromFile = state?.lv.email ?? ""; // the client's address as the LV gives it
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
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null); // what the last look into the inbox found

  const questions = state?.questions ?? [];
  const keys = useMemo(() => {
    const all = questions.map((q) => q.key);
    return picked ? all.filter((k) => picked.has(k)) : questions.filter((q) => q.status === "new").map((q) => q.key);
  }, [questions, picked]);

  useEffect(() => {
    if (file) setTo(stored(TO_KEY)[file] || (fromFile.includes("@") ? fromFile : ""));
  }, [file, fromFile]);

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

  const waiting = state.mails.filter((m) => !m.reply).length;
  function lookForReplies() {
    setChecking(true);
    setChecked(null);
    setError(null);
    checkReplies(analysisId).then(
      (next) => {
        setChecking(false);
        setChecked(next.found === 0 ? "No reply in the inbox yet." : `${next.found} ${next.found === 1 ? "reply" : "replies"} came in and ${next.found === 1 ? "was" : "were"} read.`);
        onState(next);
      },
      (e) => {
        setChecking(false);
        setChecked(e instanceof Error ? e.message : String(e));
      },
    );
  }
  const proposals = (key: string) => state.amendments.filter((a) => a.key === key);
  const open = state.amendments.filter((a) => a.status === "proposed").length;

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
      {(state.inbox || open > 0) && (
        <div className="q-inbox">
          {state.inbox && (
            <>
              <button className="btn" disabled={checking || waiting === 0} onClick={lookForReplies}>
                {checking ? "Looking into the inbox" : "Check the inbox for replies"}
              </button>
              <span className="quiet">
                {checked ?? (waiting === 0 ? "Every message has its reply." : `${waiting} ${waiting === 1 ? "message waits" : "messages wait"} for a reply · inbox of ${state.inbox}`)}
              </span>
            </>
          )}
          {open > 0 && (
            <span className="q-open">
              <b>{open}</b> {open === 1 ? "change" : "changes"} from the answers to decide
            </span>
          )}
        </div>
      )}

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
                  {proposals(q.key).length > 0 && (
                    <ul className="q-amend">
                      {proposals(q.key).map((a) => (
                        <AmendmentRow key={a.id} amendment={a} onChanged={onReload} />
                      ))}
                    </ul>
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
                    {fromFile.includes("@") ? (
                      to === fromFile ? (
                        <small className="quiet">Read from the LV. Check that questions go to this address.</small>
                      ) : (
                        <small className="quiet">
                          The LV names <button type="button" className="text-link" onClick={() => setTo(fromFile)}>{fromFile}</button>.
                        </small>
                      )
                    ) : fromFile ? (
                      <small className="quiet">The LV names an address, but this copy has it blanked out ({fromFile}).</small>
                    ) : null}
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

const AMEND: Record<Amendment["kind"], string> = {
  settle: "Close the finding",
  note: "Note on the item",
  quantity: "New quantity",
  unit: "New unit",
  text: "New wording",
  allowance: "Risk allowance",
};

/** What one answer changes on our side, to accept, change or reject. The value can be changed before it
    is accepted: the note, the new quantity, the percent of an allowance (which the app never proposes). */
function AmendmentRow({ amendment: a, onChanged }: { amendment: Amendment; onChanged: () => void }) {
  const field = a.kind === "allowance" ? "percent" : a.kind === "settle" || a.kind === "note" ? "note" : "to";
  const start = a.value[field] == null ? "" : String(a.value[field]);
  const [text, setText] = useState(start);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(start), [start]);

  const decide = (status: Amendment["status"]) => {
    setBusy(true);
    setError(null);
    decideAmendment(a.id, status, status === "accepted" ? { [field]: text.trim() } : undefined).then(
      () => {
        setBusy(false);
        setEditing(false);
        onChanged();
      },
      (e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  const proposed = a.status === "proposed";
  const input = proposed && (editing || a.kind === "allowance");
  return (
    <li className={`q-amend-row is-${a.status}`}>
      <span className="caption">
        {AMEND[a.kind]}
        {!proposed && <span className={`tag is-${a.status}`}>{a.status === "accepted" ? "Accepted" : "Rejected"}</span>}
      </span>
      {input ? (
        a.kind === "allowance" ? (
          <label className="q-percent">
            <input type="text" inputMode="decimal" value={text} placeholder="0" aria-label="Allowance in percent" onChange={(e) => setText(e.target.value)} />
            <span>% on the price of this item. {a.value.note}</span>
          </label>
        ) : field === "note" ? (
          <textarea rows={2} value={text} aria-label={AMEND[a.kind]} onChange={(e) => setText(e.target.value)} />
        ) : (
          <input type="text" lang="de" value={text} aria-label={AMEND[a.kind]} onChange={(e) => setText(e.target.value)} />
        )
      ) : (
        <p lang={field === "to" ? "de" : undefined}>
          {a.kind === "allowance" ? (a.value.percent != null ? `${a.value.percent} % on the price of this item. ${a.value.note ?? ""}` : a.value.note) : start}
        </p>
      )}
      {error && <p className="q-error" role="alert">{error}</p>}
      <div className="q-actions">
        {proposed ? (
          <>
            <button className="btn" disabled={busy || (input && text.trim() === "")} onClick={() => decide("accepted")}>
              Accept
            </button>
            {a.kind !== "allowance" && !editing && (
              <button className="text-link" disabled={busy} onClick={() => setEditing(true)}>
                Change
              </button>
            )}
            <button className="text-link" disabled={busy} onClick={() => decide("rejected")}>
              Reject
            </button>
          </>
        ) : (
          <button className="text-link" disabled={busy} onClick={() => decide("proposed")}>
            Take back
          </button>
        )}
      </div>
    </li>
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
            <b>{mail.reply_via === "imap" ? "Reply found in the inbox" : "Reply read"} {mail.reply_at ? stamp(mail.reply_at) : ""}</b>: {n("answered")} answered, {n("partly")} in part,{" "}
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
