/* Bidder questions by e-mail. In the Questions step the tender stands as in the Tender step (D-069): under
   every finding the client has to settle is its question, to tick for the next message and to reword. The
   ticked questions are one German message, written by the server; it is read, changed and sent beside the
   items it asks about, where the map was (D-070), from a button at the top right of the page — from the app's own account where it has one, else from the
   estimator's mail program (a draft). What was asked is kept; when the client answers, the reply is pasted
   in — or found in the inbox, where the server may look into one — and read against the questions.
   What an answer changes on our side (a finding settled, a quantity corrected, a point to price as a risk)
   is put up under its question for the estimator to accept, change or reject. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AskLayer } from "./TenderDoc";
import { composeQuestions, decideAmendment, discardMail, mailQuestions, markMailSent, readReply } from "./api";
import { dayText } from "./controls";
import type { Amendment, BidderQuestion, Finding, QuestionMail, QuestionsState } from "./types";

const SENDER_KEY = "lvcheck.mail.sender"; // the signature under the message (name, company), kept in this browser
const TO_KEY = "lvcheck.mail.to"; // the client's address per LV file
const DRAFT_KEY = "lvcheck.questions.draft"; // per LV file: the questions ticked for the next message, and reworded

/** What the estimator has prepared for the next message: the questions ticked, and the ones reworded. */
interface Draft {
  picked: string[];
  texts: Record<string, string>;
}
const EMPTY: Draft = { picked: [], texts: {} };

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

function stored<T = string>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

/** What the layout of the tender page gets: the questions on the document, and the button that opens the message. */
export type QuestionsLayer = AskLayer & { count: number; toDecide: number }; // ticked for the next message; changes from the answers to decide

export function QuestionsView({
  analysisId,
  state,
  onState,
  onReload,
  onItem,
  layout,
  composing = false,
  onCompose,
}: {
  analysisId: string;
  state: QuestionsState | null;
  onState: (s: QuestionsState) => void;
  onReload: () => void;
  onItem: (oz: string) => void;
  layout?: (layer: QuestionsLayer) => ReactNode; // drawn on the tender's document instead of as a view of its own
  composing?: boolean; // the message is being written: it stands where the map was (the page says so, D-071)
  onCompose?: () => void; // asks the page to let the message be written
}) {
  const file = state?.lv.file ?? "";
  const fromFile = state?.lv.email ?? ""; // the client's address as the LV gives it
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const open = composing;
  const [to, setTo] = useState("");
  const [sender, setSender] = useState(() => localStorage.getItem(SENDER_KEY) ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false); // the text was changed by hand: it is no longer rewritten
  const [busy, setBusy] = useState<"draft" | "file" | "smtp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ways, setWays] = useState(false); // the other ways to send stand open under the letter

  const questions = state?.questions ?? [];
  // What is ticked and reworded is kept in this browser per LV file: it outlives a change of step.
  useEffect(() => {
    if (!file) return;
    const kept = stored<Draft>(DRAFT_KEY)[file];
    setDraft(kept && Array.isArray(kept.picked) ? { picked: kept.picked, texts: kept.texts ?? {} } : EMPTY);
    setTo(stored(TO_KEY)[file] || (fromFile.includes("@") ? fromFile : ""));
  }, [file, fromFile]);
  const change = (next: Draft) => {
    setDraft(next);
    setEdited(false); // the message follows the questions again
    if (file) localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...stored<Draft>(DRAFT_KEY), [file]: next }));
  };
  // The questions of the next message, in LV order, and the wording of those that were reworded.
  const keys = useMemo(() => questions.filter((q) => draft.picked.includes(q.key)).map((q) => q.key), [questions, draft.picked]);
  const texts = useMemo(
    () => Object.fromEntries(keys.filter((k) => draft.texts[k]?.trim()).map((k) => [k, draft.texts[k]])),
    [keys, draft.texts],
  );

  // The message follows the ticked questions and the signature until it is changed by hand. It is written
  // while it is looked at: in the dialog, or on the view of its own.
  const live = open || !layout;
  const asked = useRef(0);
  useEffect(() => {
    if (!live) return;
    if (edited || keys.length === 0) {
      if (keys.length === 0 && !edited) setBody("");
      return;
    }
    const mine = ++asked.current;
    const timer = window.setTimeout(() => {
      composeQuestions(analysisId, keys, sender, texts).then(
        (m) => {
          if (mine !== asked.current) return;
          setSubject(m.subject);
          setBody(m.body);
        },
        (e) => mine === asked.current && setError(e instanceof Error ? e.message : String(e)),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [analysisId, keys, texts, sender, edited, live]);

  // the items a question is about: what stands on the page while the message is written
  const asks = useMemo(() => {
    const ozs = new Set(questions.map((q) => q.item_oz));
    return (oz: string) => ozs.has(oz);
  }, [questions]);
  if (!state) {
    return layout ? layout({ card: () => null, mark: () => null, count: 0, toDecide: 0 }) : <div className="questions"><p className="quiet">Reading the bidder questions…</p></div>;
  }

  const count = (s: BidderQuestion["status"][]) => questions.filter((q) => s.includes(q.status)).length;
  const toggle = (key: string) => change({ ...draft, picked: draft.picked.includes(key) ? draft.picked.filter((k) => k !== key) : [...draft.picked, key] });
  const reword = (key: string, text: string | null) => {
    const { [key]: _, ...rest } = draft.texts;
    change({ ...draft, texts: text === null ? rest : { ...rest, [key]: text } });
  };

  // "draft": a link into the mail program; "file": the same message as an .eml file, for a message too long
  // for a link (Outlook on Windows cuts those); "smtp": the app sends it. The first two are kept as drafts.
  async function send(via: "draft" | "file" | "smtp") {
    setBusy(via);
    setError(null);
    try {
      const address = to.trim();
      const next = await mailQuestions(analysisId, { keys, texts, to: address, subject, body, via: via === "smtp" ? "smtp" : "draft" });
      localStorage.setItem(SENDER_KEY, sender);
      localStorage.setItem(TO_KEY, JSON.stringify({ ...stored(TO_KEY), [file]: address }));
      onState(next);
      // what went into the message is no longer prepared: the question reads as it was asked from now on
      change({ picked: [], texts: Object.fromEntries(Object.entries(draft.texts).filter(([k]) => !keys.includes(k))) });
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

  const waiting = state.mails.filter((m) => m.sent_at && !m.reply).length; // a message not sent waits for no reply
  const proposals = (key: string) => state.amendments.filter((a) => a.key === key);
  // A question is closed once what its answer changes on our side has been decided, one way or the other.
  const closed = (key: string) => proposals(key).length > 0 && proposals(key).every((a) => a.status !== "proposed");
  const toDecide = state.amendments.filter((a) => a.status === "proposed").length;
  const fresh = questions.filter((q) => q.status === "new");

  const ready = keys.length > 0 && /^\S+@\S+$/.test(to.trim()) && subject.trim() !== "" && body.trim() !== "";

  const headEl = (
      <div className="q-head">
        <p>
          <b>{questions.length}</b> bidder {questions.length === 1 ? "question" : "questions"}
          {questions.length > 0 && (
            <>
              {" "}
              · {count(["new"])} not asked{count(["drafted"]) > 0 ? ` · ${count(["drafted"])} in a message not sent yet` : ""} · {count(["sent"])} waiting · {count(["partly", "answered"])} answered
            </>
          )}
        </p>
        {!layout && state.questions_due && (
          <p className={`q-due${daysLeft(state.questions_due).includes("ago") || daysLeft(state.questions_due) === "yesterday" ? " past" : ""}`}>
            Questions until <b>{dayText(state.questions_due)}</b> ({daysLeft(state.questions_due)})
          </p>
        )}
        <a className="text-link" href={`/api/analyses/${analysisId}/bieterfragen.txt`} download>
          Download as text
        </a>
      </div>
  );
  const inboxEl = (
    <>
      {(state.inbox || toDecide > 0) && (
        <div className="q-inbox">
          {state.inbox && (
            <>
              <span className="quiet">
                {(state.mails.length === 0 ? "No message has gone out yet." : waiting === 0 ? (state.mails.some((m) => !m.sent_at && !m.reply) ? "No message has gone out yet: one is not sent." : "Every message has its reply.") : `${waiting} ${waiting === 1 ? "message waits" : "messages wait"} for a reply · inbox of ${state.inbox}`)}
              </span>
            </>
          )}
          {toDecide > 0 && (
            <span className="q-open">
              <b>{toDecide}</b> {toDecide === 1 ? "change" : "changes"} from the answers to decide
            </span>
          )}
        </div>
      )}
    </>
  );
  const noneEl = (
        <p className="quiet q-none">
          No finding of this LV needs the client so far. The rule checks raise few questions; the AI review (in the
          findings pane) writes one for every unclear description, contradiction or missing item it finds.
        </p>
  );
  /** One question: whether it goes into the next message, how it stands, the client's answer and what it changes. */
  const row = (q: BidderQuestion) => (
    <>
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
                    {closed(q.key) && <span className="tag q-closed">Closed</span>}
                    <span className={`tag q-status is-${q.status}`}>
                      {STATUS[q.status]}
                      {q.sent_at && q.status === "sent" ? ` ${stamp(q.sent_at).slice(0, 10)}` : ""}
                    </span>
                  </div>
                  <p className="q-text" lang="de">
                    {draft.texts[q.key]?.trim() || q.question}
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
                  {proposals(q.key).length > 0 && <Decision amendments={proposals(q.key)} onChanged={onReload} />}
                </div>
    </>
  );
  const composeEl = (
            <section className="q-compose">
              <h2 className="caption">
                Message to the client{keys.length > 0 && ` · ${keys.length} ${keys.length === 1 ? "question" : "questions"}`}
              </h2>
              {keys.length === 0 ? (
                <>
                  <p className="quiet">
                    {fresh.length === 0
                      ? "Every question is already in a message. Tick one on its card to ask it again."
                      : "No question is ticked. Tick the ones to ask on their cards at the right; each one ticked is added to this message."}
                  </p>
                  {fresh.length > 0 && (
                    <div className="q-actions">
                      <button className="btn" onClick={() => change({ ...draft, picked: fresh.map((q) => q.key) })}>
                        Take all {fresh.length} not asked
                      </button>
                    </div>
                  )}
                </>
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
                    {/* where the app has an account, it sends: the other ways stay beside it, quieter */}
                    {state.account && (
                      <button className="btn q-send" disabled={!ready || busy !== null} onClick={() => void send("smtp")}>
                        {busy === "smtp" ? "Sending" : `Send from ${state.account}`}
                      </button>
                    )}
                    <button className={state.account ? "text-link" : "btn"} disabled={!ready || busy !== null} onClick={() => void send("draft")}>
                      {busy === "draft" ? "Opening" : "Open in mail program"}
                    </button>
                    <button className={state.account ? "text-link" : "btn q-file"} disabled={!ready || busy !== null} onClick={() => void send("file")}>
                      {busy === "file" ? "Writing the file" : "Download for Outlook (.eml)"}
                    </button>
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
                      it is kept below, not sent, with its text until you mark it as sent; you can take it back and write it again.
                    </p>
                  )}
                </>
              )}
            </section>
  );
  // A message that was opened in the mail program and not sent is taken back as it was written: its
  // questions are ticked again in their wording, and address, subject and text stand in the fields.
  const takeBack = (m: QuestionMail) => {
    const reworded = m.items.filter((i) => questions.find((q) => q.key === i.key)?.question !== i.question).map((i) => [i.key, i.question]);
    change({ picked: [...new Set([...draft.picked, ...m.items.map((i) => i.key)])], texts: { ...draft.texts, ...Object.fromEntries(reworded) } });
    setTo(m.to);
    setSubject(m.subject);
    setBody(m.body);
    setEdited(true); // the text is the one that was written, not one composed afresh
  };
  // The message as a letter (the panel on the tender's document): who it goes to and its subject as the
  // letter's head, the German text on the sheet, the signature under it, and under the sheet how it is sent.
  const takeAll = () => change({ ...draft, picked: [...new Set([...draft.picked, ...fresh.map((q) => q.key)])] });
  const main = state.account ? "smtp" : "draft"; // the one way the yellow button takes
  const copyText = () => {
    void navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  const letterEl =
    keys.length === 0 ? (
      <div className="qc-paper">
        <div className="qc-none">
          {fresh.length > 0 ? (
            <>
              <h3>{fresh.length} {fresh.length === 1 ? "question waits" : "questions wait"} to be asked</h3>
              <p className="quiet">Tick them on their findings and the letter writes itself here, in German, in the order of the LV.</p>
              <button className="qc-btn yel" onClick={takeAll}>{fresh.length === 1 ? "Take it into a message" : `Take all ${fresh.length} into a message`}</button>
            </>
          ) : questions.length === 0 ? (
            <>
              <h3>Nothing to ask</h3>
              <p className="quiet">No finding of this LV needs the client so far. The AI review writes a question for every unclear description, contradiction or missing item it finds.</p>
            </>
          ) : (
            <>
              <h3>Nothing to send</h3>
              <p className="quiet">Every question is with the client. To ask one again, tick “Ask again” on its finding.</p>
            </>
          )}
        </div>
      </div>
    ) : (
      <div className="qc-paper">
        <div className="qc-head">
          <label>
            <span>To</span>
            <input type="email" value={to} placeholder="vergabestelle@…" onChange={(e) => setTo(e.target.value)} />
            {fromFile.includes("@") && to === fromFile && <small className="side">read from the LV</small>}
          </label>
          {fromFile.includes("@") && to !== fromFile ? (
            <p className="qc-hint">The LV names <button type="button" className="text-link" onClick={() => setTo(fromFile)}>{fromFile}</button>.</p>
          ) : fromFile && !fromFile.includes("@") ? (
            <p className="qc-hint">The LV names an address, but this copy has it blanked out ({fromFile}).</p>
          ) : null}
          <label>
            <span>Subject</span>
            <input type="text" lang="de" value={subject} onChange={(e) => { setSubject(e.target.value); setEdited(true); }} />
          </label>
        </div>
        <textarea className="qc-text" lang="de" aria-label="The text of the message" rows={16} value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} />
        <div className="qc-sign">
          {edited ? (
            <p className="quiet">You changed the text: it is yours now and no longer follows the questions.</p>
          ) : (
            <label>
              <span>Signature</span>
              <textarea rows={2} value={sender} placeholder={"Name\nCompany"} onChange={(e) => setSender(e.target.value)} />
            </label>
          )}
          {edited && <button className="text-link" onClick={() => setEdited(false)}>Write it again from the questions</button>}
        </div>
        {error && <p className="q-error" role="alert">{error}</p>}
        <div className="qc-foot">
          <p>
            <b>{keys.length} {keys.length === 1 ? "question" : "questions"}</b>
            <span>{state.account ? `from ${state.account}` : "sent by you, from your own address"}</span>
          </p>
          <button className="qc-btn line" aria-expanded={ways} onClick={() => setWays(!ways)}>Other ways</button>
          <button className="qc-btn yel" disabled={!ready || busy !== null} onClick={() => void send(main)}>
            <OutIcon />
            {state.account ? (busy === "smtp" ? "Sending" : "Send") : busy === "draft" ? "Opening" : "Open in mail program"}
          </button>
        </div>
        {ways && (
          <div className="qc-ways">
            {state.account && (
              <button className="text-link" disabled={!ready || busy !== null} onClick={() => void send("draft")}>
                {busy === "draft" ? "Opening" : "Open in mail program"}
              </button>
            )}
            <button className="text-link" disabled={!ready || busy !== null} onClick={() => void send("file")}>
              {busy === "file" ? "Writing the file" : "Download for Outlook (.eml)"}
            </button>
            <button className="text-link" disabled={!body} onClick={copyText}>{copied ? "Copied" : "Copy the text"}</button>
            <p>
              A message opened in your mail program or downloaded is sent by you; a long one can be cut on the way into
              the mail program, the .eml file has no such limit. It is kept below as not sent until you mark it as sent.
            </p>
          </div>
        )}
      </div>
    );
  const mailsEl = [...state.mails].reverse().map((m) => <MailCard key={m.id} mail={m} onChanged={onReload} onBack={takeBack} />);
  const unsent = state.mails.filter((m) => !m.sent_at && !m.reply).length;

  // On the tender's document (D-069): the tender as it stands; under a finding its question, on the map the
  // mark of the question, at the top right the button to the message.
  if (layout) {
    const byFinding = new Map<string, BidderQuestion>();
    for (const q of questions) for (const f of q.findings) byFinding.set(f, q);
    const of = (oz: string) => questions.filter((q) => q.item_oz === oz);
    return (
      <>
        {layout({
          card: (f: Finding) => {
            const q = byFinding.get(`${f.check_id}|${f.item_oz}|${f.evidence}`);
            return q ? (
              <AskCard key={q.key} q={q} picked={keys.includes(q.key)} text={draft.texts[q.key] ?? null} closed={closed(q.key)}
                onToggle={() => toggle(q.key)} onText={(text) => reword(q.key, text)} onMessage={open || !onCompose ? null : onCompose}>
                {proposals(q.key).length > 0 && <Decision amendments={proposals(q.key)} onChanged={onReload} />}
              </AskCard>
            ) : null;
          },
          mark: (oz: string) => {
            const qs = of(oz);
            if (!qs.length) return null;
            // the round beside the item's mark (D-077): to ask, ticked, in a message not sent, with the client, answered
            const fresh = qs.filter((q) => q.status === "new");
            if (fresh.length) return { cls: `td-q is-new${fresh.some((q) => keys.includes(q.key)) ? " on" : ""}`, text: "?" };
            if (qs.some((q) => q.status === "sent")) return { cls: "td-q is-out", text: "→" };
            if (qs.some((q) => q.status === "drafted")) return { cls: "td-q is-draft", text: "→" };
            return { cls: "td-q is-done", text: "✓" };
          },
          count: keys.length,
          toDecide,
          keep: (f: Finding) => byFinding.has(`${f.check_id}|${f.item_oz}|${f.evidence}`),
          only: open ? asks : null,
          panel: open
            ? () => (
                <div className="questions td-qpanel td-sheet">
                  {/* the message is a sheet like the document beside it: an ink head with how many questions
                      it holds, its fields on white, what went out under a section head */}
                  <header className="td-phead">
                    <span className="tn-ix">{keys.length}</span>
                    <div>
                      <b>Message to the client</b>
                      <small>{keys.length} of {fresh.length + keys.filter((k) => !fresh.some((q) => q.key === k)).length} questions in the message</small>
                    </div>
                    <span className="td-files">
                      {keys.length < fresh.length && <button className="tn-tag" onClick={() => change({ ...draft, picked: [...new Set([...draft.picked, ...fresh.map((q) => q.key)])] })}>Take all</button>}
                      {keys.length > 0 && <button className="tn-tag" onClick={() => change({ ...draft, picked: [] })}>Take all out</button>}
                    </span>
                  </header>
                  <div className="qc-desk">{letterEl}</div>
                  <h3 className="td-sech">
                    <i>{state.mails.length}</i>Correspondence
                    {(unsent > 0 || toDecide > 0) && (
                      <span className="qc-right">
                        {unsent > 0 && <><b>{unsent}</b> not sent yet</>}
                        {unsent > 0 && toDecide > 0 && " · "}
                        {toDecide > 0 && <><b>{toDecide}</b> to decide</>}
                      </span>
                    )}
                  </h3>
                  <Correspondence state={state} notAsked={fresh.length} onItem={onItem} onChanged={onReload} onBack={takeBack} />
                  <div className="td-pbody">{headEl}</div>
                </div>
              )
            : null,
        })}
      </>
    );
  }

  return (
    <div className="questions">
      {headEl}
      {inboxEl}
      {questions.length === 0 ? (
        noneEl
      ) : (
        <div className="q-cols">
          <ol className="q-list">
            {questions.map((q) => (
              <li key={q.key} className={`q-row is-${q.status}${closed(q.key) ? " is-closed" : ""}`}>
                {row(q)}
              </li>
            ))}
          </ol>
          <div className="q-side">
            {composeEl}
            {mailsEl}
          </div>
        </div>
      )}
    </div>
  );
}

/** The question of a finding, under the finding's card. Not asked yet: a tick for the next message and the
    German wording to change. Asked: how it stands, the client's answer, what it changes (`children`), and a
    tick to ask it again. The wording is the card's own while it is typed and is handed on when left. */
function AskCard({ q, picked, text, closed, onToggle, onText, onMessage, children }: { q: BidderQuestion; picked: boolean; text: string | null; closed: boolean; onToggle: () => void; onText: (text: string | null) => void; onMessage: (() => void) | null; children?: ReactNode }) {
  const [typed, setTyped] = useState(text ?? q.question);
  useEffect(() => setTyped(text ?? q.question), [text, q.question]);
  const reworded = text !== null && text.trim() !== "" && text.trim() !== q.question.trim();
  const open = q.status === "new" || picked; // to be worded: not asked yet, or ticked to be asked again
  return (
    <div className={`questions td-ask is-${q.status}${picked ? " on" : ""}${closed ? " is-closed" : ""}`}>
      <div className="td-askrow">
        <label>
          <input type="checkbox" checked={picked} onChange={onToggle} />
          <b>{q.status === "new" ? "Ask the client" : "Ask again"}</b>
        </label>
        {picked ? (
          onMessage ? <button className="text-link" onClick={onMessage}>in the next message</button> : <span className="tag q-status is-drafted">In the message</span>
        ) : (
          <span className={`tag q-status is-${q.status}`}>
            {closed ? "Closed" : STATUS[q.status]}
            {q.sent_at && q.status === "sent" ? ` ${stamp(q.sent_at).slice(0, 10)}` : ""}
          </span>
        )}
      </div>
      {open ? (
        <>
          <textarea lang="de" aria-label="The question as it is asked" rows={Math.min(9, Math.max(3, Math.ceil(typed.length / 40)))} value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={() => typed !== (text ?? q.question) && onText(typed.trim() && typed.trim() !== q.question.trim() ? typed : null)} />
          {reworded && <button className="text-link" onClick={() => onText(null)}>Back to the drafted wording</button>}
        </>
      ) : (
        <p className="q-text" lang="de">{q.question}</p>
      )}
      {q.answer && (
        <div className="q-answer">
          <span className="caption">{q.status === "partly" ? "The client answers in part" : "The client answers"}</span>
          <p className="q-quote" lang="de">„{q.answer.quote}“</p>
          {q.answer.meaning && <p>{q.answer.meaning}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

const CHANGE: Record<string, string> = { quantity: "New quantity", unit: "New unit", text: "New wording" };

/** What one answer changes on our side, as one decision: the note (what the answer settles), a value the
    client changed (quantity, unit, wording), and for a point the answer leaves open a risk allowance in
    percent — optional, an empty field means none; the app proposes no figure. Accept takes all of it as
    it stands in the fields, Reject none of it. Behind it are several amendments (boq/amendments.py). */
function Decision({ amendments, onChanged }: { amendments: Amendment[]; onChanged: () => void }) {
  const note = amendments.find((a) => a.kind === "settle" || a.kind === "note");
  const change = amendments.find((a) => a.kind in CHANGE);
  const allowance = amendments.find((a) => a.kind === "allowance");
  const open = amendments.some((a) => a.status === "proposed");
  const [noteText, setNoteText] = useState(note?.value.note ?? "");
  const [changeText, setChangeText] = useState(change?.value.to ?? "");
  const [percent, setPercent] = useState(allowance?.value.percent != null ? String(allowance.value.percent) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (steps: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    steps().then(
      () => {
        setBusy(false);
        onChanged();
      },
      (e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
        onChanged(); // what was decided before the refusal shows as decided
      },
    );
  };
  const accept = () =>
    run(async () => {
      // the figure first: it is the one that can be refused, and then nothing else has been decided
      if (allowance) {
        if (percent.trim()) await decideAmendment(allowance.id, "accepted", { percent: percent.trim() as unknown as number });
        else await decideAmendment(allowance.id, "rejected");
      }
      if (change) await decideAmendment(change.id, "accepted", { to: changeText.trim() });
      if (note) await decideAmendment(note.id, noteText.trim() ? "accepted" : "rejected", noteText.trim() ? { note: noteText.trim() } : undefined);
    });
  const all = (status: Amendment["status"]) =>
    run(async () => {
      for (const a of amendments) await decideAmendment(a.id, status);
    });

  const settled = note?.kind === "settle";
  const accepted = amendments.filter((a) => a.status === "accepted");
  const title = settled ? "The answer settles this" : note ? "The answer settles part of this" : "The answer leaves this open";
  if (!open) {
    const keptAllowance = accepted.find((a) => a.kind === "allowance");
    const keptChange = accepted.find((a) => a.kind in CHANGE);
    const keptNote = accepted.find((a) => a.kind === "settle" || a.kind === "note");
    return (
      <div className={`q-decision is-decided${accepted.length === 0 ? " is-rejected" : ""}`}>
        <span className="caption">
          {accepted.length === 0 ? "Rejected: nothing changes on our side" : settled && keptNote ? "Closed: the finding is settled" : "Closed"}
        </span>
        {keptNote && <p>{keptNote.value.note}</p>}
        {keptChange && (
          <p>
            {CHANGE[keptChange.kind]}: <b lang="de">{keptChange.value.to}</b>
          </p>
        )}
        {keptAllowance && (
          <p>
            Priced with a risk allowance of <b>{keptAllowance.value.percent} %</b> on this item.
          </p>
        )}
        {allowance && !keptAllowance && accepted.length > 0 && <p className="quiet">No risk allowance.</p>}
        {error && <p className="q-error" role="alert">{error}</p>}
        <div className="q-actions">
          <button className="text-link" disabled={busy} onClick={() => all("proposed")}>
            Take back
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="q-decision">
      <span className="caption">{title}</span>
      {note && (
        <label>
          <span>{settled ? "Note, and the finding is closed" : "Note on the item"}</span>
          <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        </label>
      )}
      {change && (
        <label>
          <span>{CHANGE[change.kind]}, as the client states it</span>
          <input type="text" lang="de" value={changeText} onChange={(e) => setChangeText(e.target.value)} />
        </label>
      )}
      {allowance && (
        <label className="q-percent">
          <span>Risk allowance for what stays open</span>
          <span>
            <input type="text" inputMode="decimal" value={percent} placeholder="none" onChange={(e) => setPercent(e.target.value)} />
            % on the price of this item. Leave it empty for none.
          </span>
        </label>
      )}
      {error && <p className="q-error" role="alert">{error}</p>}
      <div className="q-actions">
        <button className="btn" disabled={busy || (change !== undefined && changeText.trim() === "")} onClick={accept}>
          Accept
        </button>
        <button className="text-link" disabled={busy} onClick={() => all("rejected")}>
          Reject
        </button>
      </div>
    </div>
  );
}

/** One message: who it went to and when, and the place for the client's reply. A message handed to the
 *  estimator's mail program is not sent until they say so (the app cannot see what happened there): until
 *  then its text stands open, it can be opened in the mail program again, or taken back and written again. */
function MailCard({ mail, onChanged, onBack }: { mail: QuestionMail; onChanged: () => void; onBack?: (mail: QuestionMail) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false); // asked once, waiting for the second click

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
          {mail.sent_at ? "Sent" : "Not sent yet"} · {mail.items.length} {mail.items.length === 1 ? "question" : "questions"}
        </h2>
        <span className="num">{stamp(mail.sent_at ?? mail.created)}</span>
      </header>
      <p className="q-to">
        to <b>{mail.to}</b>
        {mail.via === "smtp" ? " · sent by the app" : mail.sent_at ? " · sent from your mail program" : " · opened in your mail program. Nothing counts as sent until you say so."}
      </p>
      <details open={!mail.sent_at && !mail.reply}>
        <summary>{mail.subject}</summary>
        <pre lang="de">{mail.body}</pre>
      </details>

      {!mail.sent_at && (
        <div className="q-actions">
          <button className="btn" disabled={busy !== null} onClick={() => act("sent", () => markMailSent(mail.id, true))}>
            Mark as sent
          </button>
          <a className="text-link" target="_blank" rel="noopener" href={`mailto:${encodeURIComponent(mail.to)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}>
            Open in mail program again
          </a>
          <a className="text-link" href={`/api/mails/${mail.id}/message.eml`} download>
            Download .eml
          </a>
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
      ) : !mail.sent_at ? null : (
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
      {/* Off the list. A draft goes at once; a message that was sent or answered asks a second time, since
          its reply and what was decided from it go with it. */}
      <div className="q-actions q-remove">
        {!removing ? (
          <button
            className="text-link"
            disabled={busy !== null}
            onClick={() => (mail.sent_at || mail.reply ? setRemoving(true) : act("discard", async () => (await discardMail(mail.id), onBack?.(mail))))}
          >
            {mail.sent_at || mail.reply ? "Delete this message" : onBack ? "Take it back and write it again" : "Discard the draft"}
          </button>
        ) : (
          <>
            <span>
              {mail.reply ? "The reply and what was decided from it go too. " : ""}
              {mail.sent_at ? "The message itself stays with the recipient." : ""}
            </span>
            <button className="btn" disabled={busy !== null} onClick={() => act("discard", () => discardMail(mail.id))}>
              Delete
            </button>
            <button className="text-link" disabled={busy !== null} onClick={() => setRemoving(false)}>
              Keep it
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export const OutIcon = () => (
  <svg className="qc-ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 11 11 3M5 3h6v6" /></svg>
);
export const InIcon = () => (
  <svg className="qc-ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M11 3 3 11M9 11H3V5" /></svg>
);
export const ClockIcon = () => (
  <svg className="qc-ic" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" /><path d="M7 4v3l2.5 1.5" /></svg>
);

export const clock = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** How long ago, in the two largest units that matter: "12 min", "2 h 31 min", "3 days". */
export function since(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  const days = Math.floor(min / (24 * 60));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** What went out and what came back, on one line of time, the newest on top (the panel on the tender's
 *  document). The line ends at the last day for bidder questions. A message that waits has the place for
 *  its reply standing over it; a reply is read question by question: the passage, what it means, and
 *  whether what it changes on our side is decided. */
function Correspondence({ state, notAsked, onItem, onChanged, onBack }: { state: QuestionsState; notAsked: number; onItem: (oz: string) => void; onChanged: () => void; onBack: (mail: QuestionMail) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({}); // per message: what was left out when its reply was read
  // The server looks into the inbox by itself; while a message waits there, the panel reads the state
  // again every 20 s, so that a reply stands on the line when it has been read, without a reload.
  const waiting = state.inbox !== null && state.mails.some((m) => m.sent_at && !m.reply);
  const again = useRef(onChanged);
  again.current = onChanged;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => again.current(), 20_000);
    return () => window.clearInterval(t);
  }, [waiting]);
  // every message is on the line where it went out (or was written), its reply where it came in
  const events = state.mails
    .flatMap((m) => [
      { at: m.sent_at ?? m.created, mail: m, reply: false },
      ...(m.reply ? [{ at: m.reply_at ?? m.sent_at ?? m.created, mail: m, reply: true }] : []),
    ])
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || Number(b.reply) - Number(a.reply));
  const today = dayKey(new Date().toISOString());
  const due = state.questions_due;
  const late = due !== null && due < today;
  let day = "";
  return (
    <div className="qc-line">
      {due && (
        <div className={`qc-ev future${late ? " late" : ""}`}>
          <div className="at num">
            <b>{due.slice(8, 10)}.{due.slice(5, 7)}.</b>
            <small>{dayText(due).slice(0, 3)}</small>
          </div>
          <i className="node" />
          <div className="what">
            <h4>Last day for bidder questions</h4>
            <p className="sub">
              {daysLeft(due)} · {notAsked > 0 ? `${notAsked} ${notAsked === 1 ? "question" : "questions"} not asked yet` : "nothing left to ask"}
            </p>
          </div>
        </div>
      )}
      {events.length === 0 && (
        <div className="qc-ev slot">
          <div className="at" />
          <i className="node" />
          <div className="what"><h4>Nothing has gone out yet</h4><p>A message that goes out stands here, and the client's reply over it.</p></div>
        </div>
      )}
      {events.map((e) => {
        const head = dayKey(e.at) !== day ? ((day = dayKey(e.at)), <p key={`d${day}`} className="qc-day">{day === today ? "Today, " : ""}{dayText(day)}</p>) : null;
        return [
          head,
          e.reply ? (
            <ReplyEvent key={`r${e.mail.id}`} mail={e.mail} state={state} note={notes[e.mail.id] ?? null} onItem={onItem} />
          ) : (
            <OutEvent key={e.mail.id} mail={e.mail} inbox={state.inbox} onItem={onItem} onChanged={onChanged} onBack={onBack} onNote={(note) => setNotes((n) => ({ ...n, [e.mail.id]: note }))} />
          ),
        ];
      })}
    </div>
  );
}

/** A reply on the line: every answer with its question's item, the passage of the reply and what it means. */
function ReplyEvent({ mail, state, note, onItem }: { mail: QuestionMail; state: QuestionsState; note: string | null; onItem: (oz: string) => void }) {
  const answers = mail.answers ?? {};
  const n = (s: string) => Object.values(answers).filter((a) => a.status === s).length;
  const open = mail.items.filter((i) => !answers[i.key] || answers[i.key].status === "not_answered");
  const label = (key: string) => state.questions.find((q) => q.key === key)?.item_label ?? "";
  const counts = [n("answered") && `${n("answered")} answered`, n("partly") && `${n("partly")} in part`, open.length && `${open.length} still open`].filter(Boolean).join(", ");
  return (
    <div className="qc-ev in">
      <div className="at num"><b>{clock(mail.reply_at ?? mail.created)}</b></div>
      <i className="node"><InIcon /></i>
      <div className="what">
        <h4><span className="qc-st read">Reply</span>{counts || "nothing answered"}</h4>
        <p className="sub">{state.lv.client ? `from ${state.lv.client}` : `from ${mail.to}`} · {mail.reply_via === "imap" ? "found in the inbox" : "pasted in"}{note ? ` · ${note}` : ""}</p>
        {mail.items.map((i) => {
          const a = answers[i.key];
          if (!a || a.status === "not_answered") return null;
          const mine = state.amendments.filter((x) => x.key === i.key && x.mail_id === mail.id);
          const waits = mine.some((x) => x.status === "proposed");
          const kept = mine.filter((x) => x.status === "accepted").length;
          return (
            <div key={i.key} className="qc-pair">
              <header>
                {i.item_oz ? <button className="qc-oz" onClick={() => onItem(i.item_oz!)}>{i.item_oz}</button> : <span className="qc-oz">LV</span>}
                <span lang="de">{label(i.key)}</span>
                <span className={`qc-st ${a.status === "partly" ? "part" : "read"}`}>{a.status === "partly" ? "In part" : "Answered"}</span>
              </header>
              <div>
                <p className="q-quote" lang="de">„{a.quote}“</p>
                {a.meaning && <p className="means">{a.meaning}</p>}
                {waits ? (
                  <p className="do">
                    <span className="qc-st decide">To decide</span>
                    {i.item_oz ? <button className="text-link" onClick={() => onItem(i.item_oz!)}>What it changes on the item</button> : <span>what it changes, under its finding</span>}
                  </p>
                ) : mine.length > 0 ? (
                  <p className="do quiet">{kept > 0 ? "Closed: taken over on the item." : "Closed: nothing changes on our side."}</p>
                ) : null}
              </div>
            </div>
          );
        })}
        {open.length > 0 && (
          <p className="qc-ozs">
            <span className="quiet">Still open:</span>
            {open.map((i) => (i.item_oz ? <button key={i.key} className="qc-oz" onClick={() => onItem(i.item_oz!)}>{i.item_oz}</button> : <span key={i.key} className="qc-oz">LV</span>))}
          </p>
        )}
        <details className="qc-fold">
          <summary><i className="chev" />The reply as it came</summary>
          <pre>{mail.reply}</pre>
        </details>
      </div>
    </div>
  );
}

/** A message on the line. Sent and without a reply: the place for the reply stands over it (the inbox is
 *  watched where the app may look into one; a reply can always be pasted in). Not sent: its text stands
 *  open with what can be done with it (the app cannot see what happened in the mail program). */
function OutEvent({ mail, inbox, onItem, onChanged, onBack, onNote }: { mail: QuestionMail; inbox: string | null; onItem: (oz: string) => void; onChanged: () => void; onBack: (mail: QuestionMail) => void; onNote: (note: string) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false); // asked once, waiting for the second click
  const act = (what: string, run: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    run().then(
      () => (setBusy(null), onChanged()),
      (e) => (setBusy(null), setError(e instanceof Error ? e.message : String(e))),
    );
  };
  const n = mail.items.length;
  const questions = `${n} ${n === 1 ? "question" : "questions"}`;
  const ozs = (
    <p className="qc-ozs">
      {mail.items.map((i) => (i.item_oz ? <button key={i.key} className="qc-oz" onClick={() => onItem(i.item_oz!)}>{i.item_oz}</button> : <span key={i.key} className="qc-oz">LV</span>))}
    </p>
  );
  const paste = (
    <div className="qc-paste">
      <textarea rows={4} value={reply} aria-label="The client's reply" placeholder="Paste the text of the reply e-mail here" onChange={(e) => setReply(e.target.value)} />
      <div className="q-actions">
        <button
          className="qc-btn ink"
          disabled={busy !== null || reply.trim().length < 10}
          onClick={() =>
            act("reply", async () => {
              const read = await readReply(mail.id, reply);
              if (read.dropped) onNote(`${read.dropped} passage${read.dropped === 1 ? " was" : "s were"} not found in the reply and left out`);
            })
          }
        >
          {busy === "reply" ? "Reading the reply" : "Read the reply"}
        </button>
        <span className="q-note">Each answer is matched to its question.</span>
      </div>
    </div>
  );
  if (!mail.sent_at) {
    return (
      <div className="qc-ev draft">
        <div className="at num"><b>{clock(mail.created)}</b></div>
        <i className="node" />
        <div className="what">
          <h4><span className="qc-st draft">Not sent yet</span>{questions}</h4>
          <p className="sub">to {mail.to} · opened in your mail program</p>
          {ozs}
          <pre className="qc-msg" lang="de">{mail.body}</pre>
          {error && <p className="q-error" role="alert">{error}</p>}
          <div className="q-actions">
            <button className="qc-btn yel" disabled={busy !== null} onClick={() => act("sent", () => markMailSent(mail.id, true))}>Mark as sent</button>
            <a className="text-link" target="_blank" rel="noopener" href={`mailto:${encodeURIComponent(mail.to)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}>Open in mail program again</a>
            <a className="text-link" href={`/api/mails/${mail.id}/message.eml`} download>Download .eml</a>
          </div>
          <div className="q-actions qc-end">
            <span className="q-note">Nothing counts as sent until you say so.</span>
            <button className="text-link quiet" disabled={busy !== null} onClick={() => act("discard", async () => (await discardMail(mail.id), onBack(mail)))}>Take it back and write it again</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      {!mail.reply && (
        <div className="qc-ev slot">
          <div className="at num"><small>{since(mail.sent_at)}</small></div>
          <i className="node" />
          <div className="what">
            <h4><ClockIcon />No reply yet to the {questions} below</h4>
            {inbox ? (
              <>
                <p className="qc-inbox"><i />The inbox of <b>{inbox}</b> is watched: a reply is read as it arrives.</p>
                <details className="qc-fold">
                  <summary><i className="chev" />Paste a reply by hand</summary>
                  {paste}
                </details>
              </>
            ) : (
              paste
            )}
            {error && <p className="q-error" role="alert">{error}</p>}
          </div>
        </div>
      )}
      <div className="qc-ev out">
        <div className="at num"><b>{clock(mail.sent_at)}</b></div>
        <i className="node"><OutIcon /></i>
        <div className="what">
          <h4><span className="qc-st wait">Sent</span>{questions}</h4>
          <p className="sub">to {mail.to} · {mail.via === "smtp" ? "sent by the app" : "sent from your mail program"}</p>
          {!mail.reply && ozs}
          <details className="qc-fold">
            <summary><i className="chev" />The message as it went out</summary>
            <pre lang="de">{mail.body}</pre>
          </details>
          {mail.reply && error && <p className="q-error" role="alert">{error}</p>}
          {/* Off the line: asked a second time, since the reply and what was decided from it go with it. */}
          <div className="q-actions qc-end">
            {!removing ? (
              <button className="text-link quiet" disabled={busy !== null} onClick={() => setRemoving(true)}>{mail.reply ? "Delete this message and its reply" : "Delete this message"}</button>
            ) : (
              <>
                <span className="q-note">{mail.reply ? "The reply and what was decided from it go too. " : ""}The message itself stays with the recipient.</span>
                <button className="qc-btn ink" disabled={busy !== null} onClick={() => act("discard", () => discardMail(mail.id))}>Delete</button>
                <button className="text-link" disabled={busy !== null} onClick={() => setRemoving(false)}>Keep it</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
