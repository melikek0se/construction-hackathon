/* Price inquiries. The agent works out which items of the LV have to be asked for outside and groups them
   into packages: material groups for suppliers, trades the firm does not do for subcontractors. The
   estimator reads each inquiry and sends it (nothing goes out by itself), the replies are read into one
   line per item, and each package gets a comparison on what it costs on site with a proposal. Items that
   cannot be priced as written wait for the client's answer and are not asked for. */
import { useEffect, useRef, useState } from "react";
import { chooseQuote, composeInquiry, getSupply, mailInquiry, markMailSent, planSupply, quotesToBid, readQuote, setPackageSuppliers } from "./api";
import { dayText } from "./controls";
import { ClockIcon, InIcon, OutIcon, clock, since } from "./Questions";
import { eur } from "./format";
import type { AnswerPoint, Comparison, InquiryTurn, SupplyPackage, SupplyState } from "./types";
import "./supply.css";
import WebFinds from "./WebFinds";

const STATUS: Record<SupplyPackage["ask"][number]["status"], string> = {
  new: "Not asked",
  drafted: "Draft",
  sent: "Sent",
  answered: "Quote in",
  question: "Asks back",
  declined: "Declined",
  later: "Quote promised",
};
// the plates of the correspondence (questions.css): dashed = not sent, ink = with the firm, yellow = its
// quote is in, yellow with a keyline = the estimator's move
const PLATE: Record<SupplyPackage["ask"][number]["status"], string> = { new: "plain", drafted: "draft", sent: "wait", answered: "read", question: "decide", declined: "plain", later: "wait" };
const dm = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
const num = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: number | null) => (v === null ? "–" : v.toLocaleString("de-DE", { maximumFractionDigits: 3 }));
const say = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Open = { kind: "write" | "remind" | "answer"; pkg: string; supplier: string } | null;


export function InquiriesView({
  analysisId,
  at,
  onItem,
  onQuestions,
  onBid,
  onDirectory,
}: {
  analysisId: string;
  at: string; // changes when the directory or the bidder questions changed: the state is read again
  onItem: (oz: string) => void;
  onQuestions: () => void;
  onBid: () => void;
  /** Opens the partners page: on one firm, or on the firm's own particulars. */
  onDirectory: (partner?: string) => void;
}) {
  const [state, setState] = useState<SupplyState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    getSupply(analysisId).then(setState, (e) => setError(say(e)));
  }, [analysisId, at]);

  /** One request at a time, with what it is said on the button that started it. */
  async function act(label: string, job: () => Promise<SupplyState | void>) {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      const next = await job();
      if (next) setState(next);
      return next;
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <div className="questions sup">{error ? <p className="q-error">{error}</p> : <p className="quiet">Reading the price inquiries…</p>}</div>;

  const c = state.counts;
  const asked = state.packages.reduce((n, p) => n + p.items.length, 0);
  const firm = state.company.name.trim();
  const subTaken = state.packages.some((p) => p.kind === "subcontract" && p.chosen && p.chosen.mode !== "assume");

  return (
    <div className="questions sup">
      <header className="q-head">
        <p>
          {state.plan ? (
            <>
              <b>{state.packages.length}</b> package{state.packages.length === 1 ? "" : "s"} · <b>{asked}</b> items asked outside
              {c.quoted ? <> · <b>{c.quoted}</b> with a quote</> : null}
              {c.at_hand ? <> · <b>{c.at_hand}</b> on an earlier quote until this tender's is in</> : null}
              {c.assumed ? <> · <b>{c.assumed}</b> assumed from past bids</> : null}
              {state.waits.length ? <> · <b>{state.waits.length}</b> wait for the client</> : null}
            </>
          ) : (
            "No inquiries planned for this LV yet."
          )}
        </p>
        {state.reply_by && (
          <p>
            Quotes needed by <b>{dayText(state.reply_by)}</b>
          </p>
        )}
        <button className="btn-ghost small" onClick={() => onDirectory()} title="Suppliers and subcontractors: their prices, the conversations with them">
          Partners ({state.suppliers.length})
        </button>
        <button className="btn-new" disabled={busy !== null || state.priced_file} onClick={() => void act("plan", () => planSupply(analysisId))}>
          {busy === "plan" ? "Polier is grouping the items…" : state.plan ? "Plan again" : "Plan the inquiries"}
        </button>
      </header>

      {error && <p className="q-error">{error}</p>}
      {note && <p className="sup-note">{note}</p>}
      {state.priced_file && <p className="sup-note">This file carries its prices already (a bid or an award): there is nothing to ask for.</p>}
      {!firm && (
        <p className="sup-note is-open">
          A supplier asks first who is asking. <button className="text-link" onClick={() => onDirectory("firm")}>Set your firm's name and contact</button> before the first inquiry goes out.
        </p>
      )}
      {state.released.length > 0 && (
        <p className="sup-note is-open">
          The client has answered on <b>{state.released.length}</b> item{state.released.length === 1 ? "" : "s"} that waited when this plan was made. Plan again to put them into a package.
        </p>
      )}
      {!state.plan && !state.priced_file && (
        <p className="q-none">
          Polier reads the items and decides which have to be asked for outside: material without a current price goes to suppliers as one package per material group, a trade your firm does not do goes to
          subcontractors as a whole. What your own people do is left to you. Items that cannot be priced as written wait for the client's answer. Every inquiry is yours to read and send.
        </p>
      )}

      {state.packages.map((p) => (
        <Package
          key={p.id}
          p={p}
          state={state}
          analysisId={analysisId}
          busy={busy}
          open={open?.pkg === p.id ? open : null}
          onOpen={setOpen}
          act={act}
          onItem={onItem}
          onNote={setNote}
          onPartner={onDirectory}
        />
      ))}

      {subTaken && (
        <p className="sup-note">
          A subcontractor's price is a whole unit price: with your {state.company.nu_surcharge.toLocaleString("de-DE")} % on it, it can go straight into the bid.{" "}
          <button
            className="text-link"
            disabled={busy !== null}
            onClick={() =>
              void act("bid", async () => {
                const next = await quotesToBid(analysisId);
                setNote(next.taken ? `${next.taken} price${next.taken === 1 ? "" : "s"} put into the bid.` : "Nothing new to put into the bid: the items have a price there already.");
                return next;
              })
            }
          >
            Put the taken subcontractor prices into the bid
          </button>{" "}
          · <button className="text-link" onClick={onBid}>Open the bid</button>
        </p>
      )}

      {state.waits.length > 0 && (
        <section className="sup-waits">
          <h2>Waiting for the client</h2>
          <p className="quiet">
            These items cannot be priced as written, so nobody is asked for them yet. They come into a package once the client has answered or you close the question.{" "}
            <button className="text-link" onClick={onQuestions}>Bidder questions</button>
          </p>
          <ul>
            {state.waits.map((w) => (
              <li key={w.oz}>
                <button className="oz" onClick={() => onItem(w.oz)}>{w.oz}</button>
                <span lang="de">{w.label}</span>
                <small lang="de">{w.question}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Package({
  p,
  state,
  analysisId,
  busy,
  open,
  onOpen,
  act,
  onItem,
  onNote,
  onPartner,
}: {
  onPartner: (partner: string) => void;
  p: SupplyPackage;
  state: SupplyState;
  analysisId: string;
  busy: string | null;
  open: Open;
  onOpen: (o: Open) => void;
  act: (label: string, job: () => Promise<SupplyState | void>) => Promise<SupplyState | void>;
  onItem: (oz: string) => void;
  onNote: (text: string) => void;
}) {
  const want = p.kind === "subcontract" ? "subcontractor" : "supplier";
  const others = state.suppliers.filter((s) => s.kind === want && !p.ask.some((a) => a.supplier_id === s.id));
  const answered = p.ask.filter((a) => a.status === "answered").length;
  const provisional = p.items.filter((i) => i.provisional).length;
  const setAsk = (ids: string[]) => void act("ask", () => setPackageSuppliers(analysisId, p.id, ids));

  return (
    <section className={`sup-pkg is-${p.kind}`} id={`sup-pkg-${p.id}`}>
      <header>
        {/* on the tender's page the head of a package is a section head as in the document: its items on a plate */}
        <i className="sup-n">{p.items.length}</i>
        <h2 lang="de">{p.name}</h2>
        <span className={`sup-kind is-${p.kind}`}>{p.kind === "subcontract" ? "Subcontractor · whole unit price" : "Supplier · material only"}</span>
        <span className="sup-cov">
          {p.items.length} item{p.items.length === 1 ? "" : "s"} · {answered} of {p.ask.length} answered
        </span>
      </header>
      <p className="sup-why">{p.why}</p>

      <details className="sup-items">
        <summary>
          The {p.items.length} item{p.items.length === 1 ? "" : "s"} asked for
          {provisional > 0 && <em> · {provisional} with an open question, priced on an assumption</em>}
        </summary>
        <ul>
          {p.items.map((i) => (
            <li key={i.oz}>
              <button className="oz" onClick={() => onItem(i.oz)}>{i.oz}</button>
              <span lang="de">{i.label}</span>
              <span className="num">
                {qty(i.qty)} {i.unit}
              </span>
              {i.provisional && <small lang="de">Open question: {i.provisional}</small>}
            </li>
          ))}
        </ul>
      </details>

      <ul className="sup-ask">
        {p.ask.map((a) => (
          <li key={a.supplier_id} className={`sup-firm is-${a.status}`}>
            {/* who, how it stands, the one thing to do next; under it the line of time with this firm */}
            <div className="sup-firmhead">
              <button className="text-link sup-who" onClick={() => onPartner(a.supplier_id)} title="What is known about this partner: prices, conversations, how it writes">
                {a.supplier}
              </button>
              <span className={`qc-st ${PLATE[a.status]}`}>{a.status === "drafted" ? "Not sent yet" : STATUS[a.status]}</span>
              {a.thread.length === 0 && <small>{a.email || "no address on record"}</small>}
              <span className="sup-acts">
                {a.status === "new" && (
                  <button className="btn-ghost small" onClick={() => onOpen({ kind: "write", pkg: p.id, supplier: a.supplier_id })}>
                    Write the inquiry
                  </button>
                )}
                {a.status === "question" && (
                  <button className="btn-new" title="Polier writes the answer from the LV; you read and send it" onClick={() => onOpen({ kind: "answer", pkg: p.id, supplier: a.supplier_id })}>
                    Write the answer
                  </button>
                )}
                {a.mail && (a.status === "sent" || a.status === "later") && (
                  <button className="btn-ghost small" onClick={() => onOpen({ kind: "remind", pkg: p.id, supplier: a.supplier_id })}>
                    Remind{a.mail.reminders ? ` (${a.mail.reminders}× so far)` : ""}
                  </button>
                )}
                {!a.mail && (
                  <button className="sup-x" aria-label={`Do not ask ${a.supplier}`} title="Do not ask this one" onClick={() => setAsk(p.ask.filter((x) => x.supplier_id !== a.supplier_id).map((x) => x.supplier_id))}>
                    ×
                  </button>
                )}
              </span>
            </div>
            {open && open.supplier === a.supplier_id && (
              <Composer
                analysisId={analysisId}
                pkg={p.id}
                supplier={a.supplier_id}
                supplierName={a.supplier}
                kind={open.kind === "remind" ? "reminder" : open.kind === "answer" ? "answer" : "inquiry"}
                account={state.account}
                onDone={(next) => (act("", async () => next), onOpen(null))}
                onCancel={() => onOpen(null)}
              />
            )}
            {a.mail && a.thread.length > 0 && (
              <FirmLine
                ask={a}
                mailId={a.mail.id}
                to={a.mail.to}
                inbox={state.inbox}
                replyBy={state.reply_by}
                busy={busy}
                onSent={() => void act("sent", async () => (await markMailSent(a.mail!.id, true), getSupply(analysisId)))}
                onRead={(text) => (onNote(text), void act("", () => getSupply(analysisId)))}
              />
            )}
          </li>
        ))}
        {p.ask.length === 0 && (
          <li className="sup-nobody">
            {/* the gap shows here, in the tender, and is closed here: firms from the web, one press to add and ask */}
            <WebFinds what={p.name} kind={want} region={state.company.place} onTaken={(id) => setAsk([...p.ask.map((x) => x.supplier_id), id])} />
          </li>
        )}
        {others.length > 0 && p.ask.length < 5 && (
          <li className="sup-add">
            <select value="" disabled={busy !== null} aria-label={`Ask another ${want} about ${p.name}`} onChange={(e) => e.target.value && setAsk([...p.ask.map((a) => a.supplier_id), e.target.value])}>
              <option value="">Ask another {want}…</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.groups.length ? ` · ${s.groups.slice(0, 3).join(", ")}` : ""}
                </option>
              ))}
            </select>
          </li>
        )}
      </ul>

      {p.comparison.columns.length > 0 && (
        <Compare
          p={p}
          cmp={p.comparison}
          busy={busy}
          onChoose={(mode, quote) => void act("choose", () => chooseQuote(analysisId, p.id, mode, quote))}
          onItem={onItem}
          surcharge={state.company.nu_surcharge}
        />
      )}
    </section>
  );
}

const TURN = { inquiry: "Inquiry", reminder: "Reminder", answer: "Our answer" } as const;
const REPLY: Record<NonNullable<InquiryTurn["reply"]>["kind"], [string, string]> = {
  quote: ["read", "Quote"],
  question: ["decide", "Asks back"],
  decline: ["plain", "Declined"],
  later: ["part", "Quote promised"],
  other: ["read", "Reply"],
};

/** The conversation with one firm about one package on a line of time, the newest on top: our messages
 *  and what came back. While the last message waits, the place for the reply stands over it: the inbox is
 *  watched where the app may look into one, and a reply (sheet, PDF, text) can always be read in by hand. */
function FirmLine({ ask, mailId, to, inbox, replyBy, busy, onSent, onRead }: { ask: SupplyPackage["ask"][number]; mailId: string; to: string; inbox: string | null; replyBy: string | null; busy: string | null; onSent: () => void; onRead: (note: string) => void }) {
  const last = ask.thread[ask.thread.length - 1];
  const waits = last.sent_at !== null && !last.reply;
  const reader = <Reader mailId={mailId} onDone={onRead} />;
  return (
    <>
      <div className="qc-line sup-line">
        {waits && (
          <div className="qc-ev slot">
            <div className="at num"><small>{since(last.sent_at!)}</small></div>
            <i className="node" />
            <div className="what">
              <h4><ClockIcon />{ask.status === "later" ? "A quote is promised, none is in yet" : "No quote yet"}</h4>
              {replyBy && <p className="sub">needed by {dayText(replyBy)}</p>}
              {inbox && <p className="qc-inbox"><i />The inbox of <b>{inbox}</b> is watched: a reply is read as it arrives.</p>}
              {inbox ? (
                <details className="qc-fold">
                  <summary><i className="chev" />Read a reply by hand</summary>
                  {reader}
                </details>
              ) : (
                reader
              )}
            </div>
          </div>
        )}
        {[...ask.thread].reverse().map((t) => {
          const r = t.reply;
          return [
            r && (
              <div key={`r${t.id}`} className="qc-ev in">
                <div className="at num">{r.at && <><b>{dm(r.at)}</b><small>{clock(r.at)}</small></>}</div>
                <i className="node"><InIcon /></i>
                <div className="what">
                  <h4><span className={`qc-st ${REPLY[r.kind][0]}`}>{REPLY[r.kind][1]}</span>{ask.supplier}</h4>
                  <p className="sub">{r.via === "imap" ? "found in the inbox" : "read in by hand"}{r.kind === "quote" ? " · the prices stand in the comparison below" : ""}</p>
                  {r.summary && <p>{r.summary}</p>}
                  {r.asks.length > 0 && (
                    <ul className="sup-asks">
                      {r.asks.map((q, i) => (
                        <li key={i}>
                          <b>Asks{q.pos ? ` about ${q.pos}` : ""}: {q.question}</b>
                          {q.quote && <p className="q-quote" lang="de">„{q.quote}“</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.unmatched.length > 0 && (
                    <p className="quiet">{r.unmatched.length} line{r.unmatched.length === 1 ? "" : "s"} fit no asked item and {r.unmatched.length === 1 ? "was" : "were"} left out.</p>
                  )}
                  <details className="qc-fold">
                    <summary><i className="chev" />The reply as it came</summary>
                    <pre lang="de">{r.text}</pre>
                  </details>
                </div>
              </div>
            ),
            <div key={t.id} className={`qc-ev ${t.sent_at ? "out" : "draft"}`}>
              <div className="at num"><b>{dm(t.sent_at ?? t.created)}</b><small>{clock(t.sent_at ?? t.created)}</small></div>
              <i className="node">{t.sent_at && <OutIcon />}</i>
              <div className="what">
                <h4><span className={`qc-st ${t.sent_at ? "wait" : "draft"}`}>{t.sent_at ? "Sent" : "Not sent yet"}</span>{TURN[t.kind]}</h4>
                <p className="sub">to {to} · {!t.sent_at ? "opened in your mail program" : t.via === "smtp" ? "sent by the app" : "sent from your mail program"}</p>
                <details className="qc-fold">
                  <summary><i className="chev" />{t.sent_at ? "The message as it went out" : "The message as it was written"}</summary>
                  <p className="qc-subject" lang="de">{t.subject}</p>
                  <pre lang="de">{t.body}</pre>
                </details>
                {!t.sent_at && (
                  <div className="q-actions">
                    <button className="qc-btn yel" disabled={busy !== null} onClick={onSent}>Mark as sent</button>
                    <a className="text-link" href={`/api/mails/${t.id}/items.xlsx`} download title="The items as the sheet the supplier fills in: attach it to your message">The sheet to attach</a>
                    <span className="q-note">Nothing counts as sent until you say so.</span>
                  </div>
                )}
              </div>
            </div>,
          ];
        })}
      </div>
      {!waits && last.sent_at !== null && (
        <details className="qc-fold sup-more">
          <summary><i className="chev" />Read another reply by hand</summary>
          {reader}
        </details>
      )}
    </>
  );
}

/** The inquiry, a reminder, or the answer to a question back, as the server wrote it: to read, change and send. */
function Composer({
  analysisId,
  pkg,
  supplier,
  supplierName,
  kind,
  account,
  onDone,
  onCancel,
}: {
  analysisId: string;
  pkg: string;
  supplier: string;
  supplierName: string;
  kind: "inquiry" | "reminder" | "answer";
  account: string | null;
  onDone: (next: SupplyState) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<AnswerPoint[]>([]);
  // the inquiry was worded the way this partner is written to (Partners page, "How they write")
  const [styled, setStyled] = useState<{ changed: string[]; summary: string; plain: string } | null>(null);
  const [plain, setPlain] = useState(false);
  const fitted = useRef("");
  const [writing, setWriting] = useState(true);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"draft" | "smtp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setWriting(true);
    composeInquiry(analysisId, pkg, supplier, kind)
      .then(
        (m) => (setTo(m.to), setSubject(m.subject), setBody(m.body), setPoints(m.points), setStyled(m.styled), setPlain(false)),
        (e) => setError(say(e)),
      )
      .finally(() => setWriting(false));
  }, [analysisId, pkg, supplier, kind]);

  async function send(via: "draft" | "smtp") {
    setBusy(via);
    setError(null);
    try {
      const next = await mailInquiry(analysisId, { package: pkg, supplier_id: supplier, to: to.trim(), subject, body, via, kind });
      if (via === "draft") {
        // the estimator's own mail program, with the message filled in; the sheet is attached by hand
        const link = document.createElement("a");
        link.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        link.target = "_blank";
        link.rel = "noopener";
        link.click();
      }
      onDone(next);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="qc-desk sup-desk">
      <div className="qc-paper">
        {writing && <p className="quiet">{kind === "answer" ? "Polier is writing the answer from the LV…" : kind === "reminder" ? "Polier is writing the reminder…" : "Polier is writing the inquiry…"}</p>}
        {styled && (
          <div className="sup-styled">
            <b>{plain ? "The plain template" : "Written the way this partner is written to"}</b>
            {!plain && <span>{styled.changed.join(" ")} The items and what is asked for are as in every inquiry.</span>}
            <button
              className="text-link"
              onClick={() => {
                if (!plain) fitted.current = body;
                setBody(plain ? fitted.current : styled.plain);
                setPlain(!plain);
              }}
            >
              {plain ? "Use their style again" : "Use the plain template instead"}
            </button>
          </div>
        )}
        {points.length > 0 && (
          <ul className="sup-points">
            {points.map((pt, i) => (
              <li key={i} className={pt.settled ? "is-settled" : "is-open"}>
                <b>{pt.question}</b>
                <span>{pt.answer}</span>
                {pt.settled ? (
                  <small lang="de">
                    LV{pt.pos ? `, item ${pt.pos}` : ""}: „{pt.lv_quote}“
                  </small>
                ) : (
                  <small>Not in the LV: the message says so and asks for a quote on a stated assumption. Decide it yourself, or ask the client.</small>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="qc-head">
          <label>
            <span>To</span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="address of the supplier" />
          </label>
          <label>
            <span>Subject</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} lang="de" />
          </label>
        </div>
        <textarea className="qc-text" aria-label="The text of the message" rows={14} value={body} onChange={(e) => setBody(e.target.value)} lang="de" />
        {error && <p className="q-error">{error}</p>}
        <div className="qc-foot">
          <p>
            <b>{kind === "reminder" ? "Reminder" : kind === "answer" ? "Answer" : "Inquiry"} to {supplierName}</b>
            <span>{account ? `from ${account}${kind === "inquiry" ? " · the items attached as an Excel sheet" : ""}` : "sent by you: attach the sheet from the line below afterwards"}</span>
          </p>
          <button className="qc-btn line" onClick={onCancel}>Cancel</button>
          {account && (
            <button className="qc-btn line" disabled={busy !== null || !body} onClick={() => void send("draft")} title="Opens the message in your mail program. Attach the sheet from the line below afterwards.">
              {busy === "draft" ? "Opening" : "Mail program"}
            </button>
          )}
          <button className="qc-btn yel" disabled={busy !== null || !body} onClick={() => void send(account ? "smtp" : "draft")}>
            <OutIcon />
            {account ? (busy === "smtp" ? "Sending" : "Send") : busy === "draft" ? "Opening" : "Open in mail program"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A reply: the filled-in sheet, the quote as PDF, or the text of the e-mail. */
function Reader({ mailId, onDone }: { mailId: string; onDone: (note: string) => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const got = await readQuote(mailId, text, file);
      onDone(
        (got.lines === 0
          ? got.kind === "question"
            ? `No prices: the supplier asks back (${got.asks.length} question${got.asks.length === 1 ? "" : "s"}). ${got.summary}`
            : got.kind === "decline"
              ? `The supplier declines. ${got.summary}`
              : `No prices in this reply. ${got.summary}`
          : `${got.lines} price${got.lines === 1 ? "" : "s"} read${got.asks.length ? `, and ${got.asks.length} question${got.asks.length === 1 ? "" : "s"} back` : ""}`) +
          (got.unmatched.length ? `; ${got.unmatched.length} line${got.unmatched.length === 1 ? "" : "s"} fit no asked item and were left out (${got.unmatched.map((u) => u.pos || u.note || "?").slice(0, 3).join(", ")})` : "") +
          (got.dropped ? `; ${got.dropped} dropped because the passage was not in the reply` : "") +
          ".",
      );
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qc-paste sup-reader">
      <label>
        <span>The reply as a file</span>
        <input type="file" accept=".xlsx,.xlsm,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <small>The filled-in sheet is read as it is. A quote as PDF, or pasted text, is read by Claude against the items you asked for.</small>
      </label>
      <label>
        <span>or the text of the e-mail</span>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} lang="de" disabled={file !== null} placeholder="Paste the supplier's reply here" />
      </label>
      {error && <p className="q-error">{error}</p>}
      <div className="q-actions">
        <button className="qc-btn ink" disabled={busy || (!file && text.trim().length < 10)} onClick={() => void go()}>
          {busy ? "Reading the reply" : "Read the reply"}
        </button>
      </div>
    </div>
  );
}

/** The quotes of one package side by side, on what the goods cost on site. */
function Compare({
  p,
  cmp,
  busy,
  onChoose,
  onItem,
  surcharge,
}: {
  p: SupplyPackage;
  cmp: Comparison;
  busy: string | null;
  onChoose: (mode: "single" | "split" | "assume" | null, quote?: string | null) => void;
  onItem: (oz: string) => void;
  surcharge: number;
}) {
  const taken = p.chosen;
  const shown = taken ?? cmp.proposal; // what the prices follow: the estimator's choice, else the proposal
  const cheapest = (oz: string) => cmp.split.lines[oz]?.quote;
  return (
    <div className="sup-cmp">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Quantity</th>
            {cmp.columns.map((c) => (
              <th key={c.quote} className={`r${shown?.mode === "single" && shown.quote === c.quote ? " is-taken" : ""}`}>
                {c.supplier}
                <small>{dayText(c.date)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.items.map((i) => (
            <tr key={i.oz}>
              <th>
                <button className="oz" onClick={() => onItem(i.oz)}>{i.oz}</button> <span lang="de">{i.label}</span>
              </th>
              <td className="r num">
                {qty(i.qty)} {i.unit}
              </td>
              {cmp.columns.map((c) => {
                const line = c.lines[i.oz];
                const mine = shown?.mode === "split" ? cheapest(i.oz) === c.quote : shown?.mode === "single" && shown.quote === c.quote;
                return (
                  <td key={c.quote} className={`r num${line && cheapest(i.oz) === c.quote ? " is-low" : ""}${line && mine ? " is-taken" : ""}`} title={line?.quote ?? undefined}>
                    {line ? (
                      <>
                        {num(line.net)}
                        {line.alternative && <small className="warn" lang="de" title="Another product than tendered">≠ {line.product || "other product"}</small>}
                        {!line.alternative && line.product && <small lang="de">{line.product}</small>}
                        {line.unit_differs && <small className="warn">per {line.unit}, asked per {i.unit}</small>}
                        {line.note && <small>{line.note}</small>}
                      </>
                    ) : (
                      <span className="sup-gap">no price</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>Goods, net{cmp.columns.some((c) => c.terms.discount_pct) ? " after discount" : ""}</th>
            {cmp.columns.map((c) => (
              <td key={c.quote} className="r num">
                {eur(c.goods)}
                {c.terms.discount_pct ? <small>{c.terms.discount_pct.toLocaleString("de-DE")} % off every price</small> : null}
              </td>
            ))}
          </tr>
          <tr>
            <th colSpan={2}>Freight</th>
            {cmp.columns.map((c) => (
              <td key={c.quote} className="r num">
                {c.freight ? eur(c.freight) : c.terms.basis === "free_to_site" ? "free to site" : "not stated"}
              </td>
            ))}
          </tr>
          <tr className="sup-total">
            <th colSpan={2}>On site, net</th>
            {cmp.columns.map((c) => (
              <td key={c.quote} className="r num">
                <b>{eur(c.total)}</b>
                <small>
                  {c.covered} of {p.items.length} items
                </small>
              </td>
            ))}
          </tr>
          <tr>
            <th colSpan={2}>Terms</th>
            {cmp.columns.map((c) => (
              <td key={c.quote} className="r">
                <small>{c.terms.valid_until ? `valid until ${dayText(c.terms.valid_until)}` : "no validity stated"}</small>
                {c.terms.skonto && <small lang="de">Skonto: {c.terms.skonto} (not worked in)</small>}
                {c.terms.note && <small>{c.terms.note}</small>}
              </td>
            ))}
          </tr>
          <tr>
            <th colSpan={2}>Watch</th>
            {cmp.columns.map((c) => (
              <td key={c.quote} className="sup-flags">
                {c.flags.length ? c.flags.map((f) => <small key={f} className="warn">{f}</small>) : <small>nothing</small>}
              </td>
            ))}
          </tr>
          <tr>
            <th colSpan={2} />
            {cmp.columns.map((c) => (
              <td key={c.quote} className="r">
                <button className={taken?.mode === "single" && taken.quote === c.quote ? "btn-new" : "btn-ghost small"} disabled={busy !== null} onClick={() => onChoose("single", c.quote)}>
                  {taken?.mode === "single" && taken.quote === c.quote ? "Taken" : "Take this quote"}
                </button>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <p className={`sup-proposal${taken ? " is-taken" : ""}`}>
        {taken ? (
          <>
            <b>Taken:</b>{" "}
            {taken.mode === "single" ? `the quote of ${cmp.columns.find((c) => c.quote === taken.quote)?.supplier ?? "a supplier"}` : taken.mode === "split" ? `the cheapest line per item, ${eur(cmp.split.total)} with freight` : "no quote: prices assumed from past bids"}
            . <button className="text-link" disabled={busy !== null} onClick={() => onChoose(null)}>Take it back</button>
          </>
        ) : cmp.proposal ? (
          <>
            <b>Polier proposes {cmp.proposal.mode === "single" ? "one supplier" : "to split"}:</b> {cmp.proposal.why}
          </>
        ) : null}{" "}
        {!taken && cmp.split.suppliers > 1 && (
          <button className="text-link" disabled={busy !== null} onClick={() => onChoose("split")}>
            Take the cheapest per item ({eur(cmp.split.total)} from {cmp.split.suppliers} suppliers)
          </button>
        )}{" "}
        {!taken && (
          <button className="text-link" disabled={busy !== null} onClick={() => onChoose("assume")}>
            Take none: assume from past bids
          </button>
        )}
      </p>
      <p className="quiet sup-part">
        {p.kind === "subcontract"
          ? `A subcontractor's price is the whole unit price; your ${surcharge.toLocaleString("de-DE")} % go on top.`
          : "A supplier's price is the material part of the unit price only. Labour, equipment, waste and overheads come on top in the bid."}
      </p>
    </div>
  );
}
