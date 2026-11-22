/* Partners: the suppliers and subcontractors the firm asks for prices, and everything Polier knows about each.

   A page of its own (/partners), not a dialog. The directory is one register of both kinds of firm, side by
   side (replies, speed, prices that hold, what is open), under a line of what needs a look today; a firm
   opened from it shows what is open with it, four measures set against the directory, and its prices (one row
   per thing, with the course), its conversations (one thread per inquiry), its terms and particulars and how
   it writes. Beside the directory: what waits across all tenders, the price book (every firm's price for a
   thing on one line), what the web search found, and the firm's own particulars. Server side:
   src/boq/partners.py. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  composeFollowUp,
  getPartner,
  getPartners,
  handOverMessages,
  mailInquiry,
  putExamples,
  readMailboxHistory,
  readPartnerFirm,
  removeSupplier,
  saveCompany,
  saveSupplier,
  takeWarmPartners,
  type HistoryRead,
} from "./api";
import { Select } from "./controls";
import type { PartnerTab, PartnersPlace } from "./router";
import type { AnswerPoint, Company, PartnerEvent, PartnerPrice, PartnerProfile, PartnerRow, PartnerThread, PartnersOverview, Supplier, SupplierMore } from "./types";
import "./partners.css";


const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const words = (text: string) => text.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "–");
const money = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (n: number) => `${money.format(n)} €`;
const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const took = (h: number | null) => (h === null ? "–" : h < 36 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const KIND: Record<Supplier["kind"], string> = { supplier: "Supplier", subcontractor: "Subcontractor" };
const STATUS: Record<PartnerThread["status"], string> = {
  question: "asked something back",
  drafted: "written, not sent",
  sent: "no reply yet",
  later: "promised for later",
  answered: "quoted",
  declined: "declined",
};
const yours = (t: PartnerThread) => t.status === "question" || t.status === "drafted";

const TABS: { id: PartnerTab; label: string }[] = [
  { id: "suppliers", label: "Firms" },
];

/** Whose move: a yellow square is the estimator's, an open one the partner's (the marks of the board cards). */
const Mark = ({ you }: { you: boolean }) => <i className={`pt-mark${you ? " is-you" : ""}`} aria-label={you ? "Your move" : "Their move"} />;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;


/** Where a firm's prices stand: of the things another firm priced too (prices that hold only), on how many it is
    the lowest, and by how much it lies over the lowest on the others. */
function priceLevel(book: PartnersOverview["book"], id: string): { low: number; n: number; pct: number } | null {
  let sum = 0;
  let n = 0;
  let low = 0;
  for (const b of book) {
    const fresh = b.offers.filter((o) => o.fresh && o.net > 0);
    if (new Set(fresh.map((o) => o.supplier_id)).size < 2) continue;
    const own = fresh.filter((o) => o.supplier_id === id);
    if (own.length === 0) continue;
    const lowest = Math.min(...fresh.map((o) => o.net));
    const mine = Math.min(...own.map((o) => o.net));
    if (mine <= lowest) low += 1;
    else sum += ((mine - lowest) / lowest) * 100;
    n += 1;
  }
  return n ? { low, n, pct: n > low ? sum / (n - low) : 0 } : null;
}

type Filter = "all" | "supplier" | "subcontractor";
type Sort = "open" | "name" | "answers" | "speed" | "prices" | "level" | "contact";

export function PartnersPage({
  place,
  onPlace,
  onOpenTender,
  onChanged,
  bandSlot = null,
}: {
  place: PartnersPlace;
  onPlace: (place: PartnersPlace) => void;
  /** Opens the price inquiries of a tender's file. */
  onOpenTender: (projectId: string, file: number) => void;
  onChanged: () => void;
  /** The place in the band (App.tsx) where the tabs and "Your firm" stand. */
  bandSlot?: HTMLElement | null;
}) {
  // the copy read in the background after the projects page stood, if there is one; read again right away
  const [data, setData] = useState<PartnersOverview | null>(takeWarmPartners);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("open");
  const [adding, setAdding] = useState(false);

  // the first time the directory is there, its rows come in one after the other (partners.css, `pt-fresh`);
  // not when the copy read in the background stood on the page from the start (it slid in with it)
  const [fresh, setFresh] = useState(false);
  const shown = useRef(data !== null);
  const load = useCallback(
    () =>
      getPartners().then(
        (d) => {
          setData(d);
          if (shown.current) return;
          shown.current = true;
          setFresh(true);
          window.setTimeout(() => setFresh(false), 1400);
        },
        (e) => setError(say(e)),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const changed = useCallback(() => (onChanged(), load()), [onChanged, load]);

  // suppliers and subcontractors are one directory now; the old address of the second list leads there
  const directory = place.tab !== "firm"; // the firms; the addresses of the tabs that are gone lead here too
  useEffect(() => {
    if (directory && place.tab !== "suppliers") onPlace({ tab: "suppliers", partner: place.partner });
  }, [place, onPlace]);

  const all = data?.partners ?? [];
  const rows = useMemo(() => {
    const list = all.filter((p) => filter === "all" || p.kind === filter);
    const rate = (p: PartnerRow) => p.card.answer_rate ?? -1;
    const last = (p: PartnerRow) => p.card.last_contact ?? "";
    const move = (p: PartnerRow) => (p.card.open.some(yours) ? 2 : p.card.open.length ? 1 : 0);
    const share = (p: PartnerRow) => {
      const l = priceLevel(data?.book ?? [], p.id);
      return l ? l.low / l.n : -1;
    };
    const by: Record<Sort, (a: PartnerRow, b: PartnerRow) => number> = {
      open: (a, b) => move(b) - move(a) || last(b).localeCompare(last(a)),
      name: (a, b) => a.name.localeCompare(b.name),
      answers: (a, b) => rate(b) - rate(a) || b.card.asked - a.card.asked,
      speed: (a, b) => (a.card.reply_hours ?? Infinity) - (b.card.reply_hours ?? Infinity),
      prices: (a, b) => b.card.prices - b.card.stale - (a.card.prices - a.card.stale),
      level: (a, b) => share(b) - share(a),
      contact: (a, b) => last(b).localeCompare(last(a)),
    };
    return [...list].sort(by[sort]);
  }, [all, filter, sort, data]);

  const count = (tab: PartnerTab) =>
    !data
      ? null
      : tab === "suppliers"
        ? data.partners.length
        : null;
  const openPartner = (id: string) => onPlace({ tab: "suppliers", partner: id });
  const unsigned = data !== null && (!data.company.name.trim() || !data.company.email.trim());

  const nav = (
    <nav className="pt-nav" aria-label="Partners">
      <div className="pt-band-tabs" role="tablist" aria-label="Partners">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="pt-band-tab" aria-selected={place.tab === t.id || (t.id === "suppliers" && directory)} onClick={() => onPlace({ tab: t.id, partner: null })}>
            {t.label}
            {count(t.id) !== null && <span className={`pt-count${t.id === "suppliers" && data?.waiting.some(yours) ? " is-you" : ""}`}>{count(t.id)}</span>}
          </button>
        ))}
      </div>
      <div className="pt-band-tools">
        <button className={`band-slab pt-band-firm${place.tab === "firm" ? " is-on" : ""}`} aria-pressed={place.tab === "firm"} onClick={() => onPlace({ tab: "firm", partner: null })}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <path d="M2 20V9l9-6 9 6v11h-6v-6H8v6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
          </svg>
          <b>
            Your firm
            {unsigned && (
              <i className="pt-band-warn" role="img" aria-label="Name and e-mail are not entered" title="Your firm's name and e-mail are not entered: an inquiry says who is asking, and a supplier gives an unknown sender the list price, or nothing">
                !
              </i>
            )}
          </b>
          <small className={unsigned ? "is-missing" : ""} title={unsigned ? "An inquiry says who is asking: a supplier gives an unknown sender the list price, or nothing" : undefined}>
            {unsigned ? "Name and e-mail are not entered" : data?.company.name || "Who asks, and what you do yourselves"}
          </small>
        </button>
      </div>
    </nav>
  );

  return (
    <div className={`pt${fresh ? " pt-fresh" : ""}`}>
      {/* the tabs and the firm stand in the band (App.tsx gives the place); without it, here */}
      {bandSlot ? createPortal(nav, bandSlot) : <div className="pt-tabs">{nav}</div>}
      {error && (
        <p className="q-error pt-error">
          {error}{" "}
          <button className="text-link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {!data ? (
        <p className="pt-empty quiet">Reading the firms…</p>
      ) : directory ? (
        <>
          {place.partner ? (
            <Profile
              key={place.partner}
              id={place.partner}
              book={data.book}
              speeds={all.filter((x) => x.card.reply_hours !== null).map((x) => ({ id: x.id, name: x.name, hours: x.card.reply_hours! }))}
              onBack={() => onPlace({ tab: "suppliers", partner: null })}
              onChanged={changed}
              onGone={() => (onPlace({ tab: "suppliers", partner: null }), void changed())}
              onOpenTender={onOpenTender}
              onError={setError}
            />
          ) : (
            <Register
              lead={<Waiting rows={data.waiting} partners={all} onOpen={openPartner} onOpenTender={onOpenTender} onChanged={changed} onError={setError} />}
              rows={rows}
              all={all}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              adding={adding}
              onAdded={(id) => (setAdding(false), void changed(), openPartner(id))}
              onAdd={() => setAdding(true)}
              onCancelAdd={() => setAdding(false)}
              onOpen={openPartner}
              onExamples={() => putExamples(true).then(changed, (e) => setError(say(e)))}
              onError={setError}
            />
          )}
        </>
      ) : (
        <Firm data={data} onChanged={changed} onError={setError} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the firms, one row each */

function Register({
  lead,
  rows,
  all,
  filter,
  onFilter,
  sort,
  onSort,
  adding,
  onAdded,
  onAdd,
  onCancelAdd,
  onOpen,
  onExamples,
  onError,
}: {
  /** What is open with the firms right now, shown above the table. */
  lead: ReactNode;
  rows: PartnerRow[];
  all: PartnerRow[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  adding: boolean;
  onAdded: (id: string) => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  onOpen: (id: string) => void;
  onExamples: () => void;
  onError: (e: string) => void;
}) {
  const [fresh, setFresh] = useState<{ name: string; email: string; groups: string; kind: Supplier["kind"] }>({ name: "", email: "", groups: "", kind: filter === "subcontractor" ? "subcontractor" : "supplier" });
  const add = () =>
    saveSupplier({ name: fresh.name.trim(), kind: fresh.kind, email: fresh.email.trim(), groups: words(fresh.groups) }).then(
      (s) => (setFresh({ ...fresh, name: "", email: "", groups: "" }), onAdded(s.id)),
      (e) => onError(say(e)),
    );
  const chips: [Filter, string, number][] = [
    ["all", "All", all.length],
    ["supplier", "Suppliers", all.filter((p) => p.kind === "supplier").length],
    ["subcontractor", "Subcontractors", all.filter((p) => p.kind === "subcontractor").length],
  ];
  const head = (key: Sort, label: string) => (
    <th aria-sort={sort === key ? "descending" : undefined}>
      <button className={sort === key ? "is-on" : ""} onClick={() => onSort(sort === key ? "open" : key)} title="Sort by this column">
        {label}
      </button>
    </th>
  );
  return (
    <section className="pt-wide pt-reg">
      {lead}
      <div className="pt-chips" role="group" aria-label="Show">
        {chips.map(([f, label, n]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => onFilter(f)}>
            {label} <span className="num">{n}</span>
          </button>
        ))}
        {/* a new firm, top right of the list (as "New project" on the projects page) */}
        <button className="btn pt-reg-new" disabled={adding} onClick={onAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
          </svg>
          Add a firm
        </button>
      </div>
      {adding && (
        <form className="pt-add" onSubmit={(e) => (e.preventDefault(), fresh.name.trim() && void add())}>
          <b>New firm</b>
          <Select value={fresh.kind} options={[{ value: "supplier", label: "Supplier" }, { value: "subcontractor", label: "Subcontractor" }]} onChange={(kind) => setFresh({ ...fresh, kind })} aria-label="Kind of firm" />
          <input type="text" autoFocus placeholder="Name of the firm" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
          <input type="text" placeholder="E-mail for inquiries" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} />
          <input type="text" lang="de" placeholder={fresh.kind === "supplier" ? "Sells: Rohre, Armaturen …" : "Does: Asphaltarbeiten, Markierung …"} value={fresh.groups} onChange={(e) => setFresh({ ...fresh, groups: e.target.value })} />
          <button className="btn-new" disabled={!fresh.name.trim()}>
            Add
          </button>
          <button type="button" className="btn-ghost" onClick={onCancelAdd}>
            Cancel
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        !adding && (
          <div className="pt-none">
            <p>No firm here{all.length ? " of that kind" : " yet"}.</p>
            {all.length === 0 && (
              <>
                <p className="quiet">An LV does not say who sells a product. The list fills from what you enter, from the quotes that come in and from what the web search finds.</p>
                <button className="btn-ghost" onClick={onExamples}>
                  Put in six example firms with a history
                </button>
              </>
            )}
          </div>
        )
      ) : (
        <table className="pt-firms">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              {head("name", "Firm")}
              <th>Sells or does</th>
              {head("answers", "Answers our inquiries")}
              {head("contact", "Last contact")}
              {head("open", "Right now")}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = p.card;
              const you = c.open.some(yours);
              return (
                <tr key={p.id} className={p.more.blocked ? "is-blocked" : ""} onClick={() => onOpen(p.id)}>
                  <td>
                    <button className="pt-firms-name" onClick={(e) => (e.stopPropagation(), onOpen(p.id))}>
                      {p.name}
                    </button>
                    <small>
                      {[KIND[p.kind], p.place, p.more.preferred && "preferred", p.more.blocked && "not asked"].filter(Boolean).join(" · ")}
                    </small>
                  </td>
                  <td lang="de">{p.groups.slice(0, 4).join(", ") || <span className="quiet" lang="en">nothing entered</span>}</td>
                  <td>
                    {c.asked === 0 ? (
                      <span className="quiet">not asked yet</span>
                    ) : (
                      <>
                        <b className="num">
                          {c.answered} of {c.asked}
                        </b>
                        <small>{c.reply_hours === null ? "no reply so far" : `usually within ${took(c.reply_hours)}`}</small>
                      </>
                    )}
                  </td>
                  <td className="num">{c.last_contact ? day(c.last_contact) : <span className="quiet">–</span>}</td>
                  <td>
                    {c.open.length === 0 ? (
                      <span className="quiet">–</span>
                    ) : (
                      <span className="pt-firms-now">
                        <Mark you={you} />
                        <span className={you ? "" : "pt-firms-wait"}>{you ? "Your reply needed" : "Waiting for their reply"}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ one firm */

/** The conversation a message belongs to: a package of a tender; older inquiries without a package stand alone;
    mail that is part of no inquiry is one group (""). */
const threadKey = (e: PartnerEvent) => (!e.mail_id ? "" : e.package ? `${e.project_id ?? e.project}|${e.package}` : e.mail_id);

const TOPIC: Record<string, string> = { terms: "Terms", questions: "Asks before quoting", reliability: "Reliability", products: "Products", prices: "Price trend", other: "Worth knowing" };

/** One firm. Top: who it is and how to reach it. Then what is open right now beside how it answers (three small
    drawings), what Polier knows as cards with their evidence, and its prices beside the conversations.
    Entering and changing is behind "Edit". */
function Profile({
  id,
  book,
  speeds,
  onBack,
  onChanged,
  onGone,
  onOpenTender,
  onError,
}: {
  id: string;
  book: PartnersOverview["book"];
  /** Every firm's median hours to the first reply, this one among them: the scale its speed is shown on. */
  speeds: { id: string; name: string; hours: number }[];
  onBack: () => void;
  onChanged: () => void;
  onGone: () => void;
  onOpenTender: (projectId: string, file: number) => void;
  onError: (e: string) => void;
}) {
  const [p, setP] = useState<PartnerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [summing, setSumming] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dropping, setDropping] = useState(false);
  const load = useCallback(() => getPartner(id).then(setP, (e) => onError(say(e))), [id, onError]);
  useEffect(() => void load(), [load]);
  const level = useMemo(() => priceLevel(book, id), [book, id]);

  const back = (
    <button className="pt-fp-back" onClick={onBack}>
      <svg width="9" height="14" viewBox="0 0 9 14" aria-hidden>
        <path d="M7.5 1L1.5 7l6 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      All firms
    </button>
  );
  if (!p)
    return (
      <section className="pt-fp">
        <div className="pt-fp-in">
          {back}
          <p className="quiet">Reading…</p>
        </div>
      </section>
    );

  const save = (values: Partial<Supplier>) => saveSupplier(values, p.id).then(() => (void load(), onChanged()), (e) => onError(say(e)));
  const more = (values: Partial<SupplierMore>) => save({ more: values as SupplierMore });
  const text = (key: "name" | "contact" | "email" | "phone" | "place") => (e: { target: { value: string } }) => {
    const v = e.target.value.trim();
    if (v !== p[key] && (key !== "name" || v)) void save({ [key]: v });
  };
  const drop = (files: File[]) =>
    handOverMessages(files.filter((f) => f.name.toLowerCase().endsWith(".eml"))).then(
      (r) => (void load(), onChanged(), r.kept === 0 && onError(`None of these messages is from or to an address of ${p.name}${r.known ? ` (${r.known} are in a conversation already)` : ""}.`)),
      (e) => onError(say(e)),
    );
  const c = p.card;
  const sum = p.more.read;
  const sumUp = () => {
    setSumming(true);
    readPartnerFirm(p.id)
      .then(() => (void load(), onChanged()), (e) => onError(say(e)))
      .finally(() => setSumming(false));
  };
  const bare = c.asked === 0 && p.timeline.length === 0 && p.prices.length === 0;
  const initials = p.name.split(/[\s&-]+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const open = [...c.open].sort((x, y) => Number(yours(y)) - Number(yours(x)));

  // every inquiry as one square: answered, declined, still open, never answered
  const declined = Math.min(c.declined, c.answered);
  const waiting = Math.min(c.asked - c.answered, c.open.filter((t) => t.status === "sent" || t.status === "later").length);
  const silent = Math.max(0, c.asked - c.answered - waiting);
  const squares = [
    ...Array<string>(c.answered - declined).fill("is-yes"),
    ...Array<string>(declined).fill("is-declined"),
    ...Array<string>(waiting).fill("is-waiting"),
    ...Array<string>(silent).fill("is-silent"),
  ];
  const answered = [c.answered - declined && `${c.answered - declined} answered`, declined && `${declined} declined`, waiting && `${waiting} still open`, silent && `${silent} never answered`].filter(Boolean).join(", ");
  // where this firm's speed stands among all firms, on a scale from the fastest to the slowest
  const fastest = Math.min(...speeds.map((x) => x.hours));
  const slowest = Math.max(...speeds.map((x) => x.hours));
  const at = (h: number) => (slowest === fastest ? 50 : ((Math.log(h + 1) - Math.log(fastest + 1)) / (Math.log(slowest + 1) - Math.log(fastest + 1))) * 100);

  return (
    <section
      className={`pt-fp${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && (e.preventDefault(), e.stopPropagation(), setDropping(true))}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setDropping(false), void drop([...e.dataTransfer.files]))}
    >
      <div className="pt-fp-in">
        {back}

        <header className="pt-fp-id">
          <span className="pt-fp-plate" aria-hidden>
            {initials}
          </span>
          <div className="pt-fp-who">
            <h2>{p.name}</h2>
            <p>{[KIND[p.kind], p.place, p.more.preferred && "preferred", p.more.blocked && "not asked", p.more.example && "example firm"].filter(Boolean).join(" · ")}</p>
          </div>
          <button className="btn-ghost" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "Edit"}
          </button>
        </header>

        {editing ? (
          <div className="pt-fp-edit">
            <div className="pt-fields" key={p.id}>
              <label className="wide">
                <span>Name</span>
                <input type="text" defaultValue={p.name} onBlur={text("name")} />
              </label>
              {(
                [
                  ["contact", "Contact person"],
                  ["email", "E-mail for inquiries"],
                  ["phone", "Phone"],
                  ["place", "Place"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input type="text" defaultValue={p[key]} onBlur={text(key)} />
                </label>
              ))}
              <label className="wide">
                <span>{p.kind === "supplier" ? "Sells" : "Does"}</span>
                <input type="text" lang="de" defaultValue={p.groups.join(", ")} onBlur={(e) => e.target.value.trim() !== p.groups.join(", ") && void save({ groups: words(e.target.value) })} />
                <small>Material groups or trades, in your words. Polier picks whom to ask by these.</small>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={p.more.preferred} onChange={(e) => void more({ preferred: e.target.checked })} /> Preferred: asked first where several firms fit
            </label>
            <label className="check">
              <input type="checkbox" checked={p.more.blocked} onChange={(e) => void more({ blocked: e.target.checked })} /> Do not ask: stays in the list, goes on no inquiry
            </label>
            <p className="pt-fp-remove">
              <span className="quiet">A field is kept when you leave it.</span>
              <button className={`btn-ghost small${armed ? " armed" : ""}`} onBlur={() => setArmed(false)} onClick={() => (armed ? removeSupplier(p.id).then(onGone, (e) => onError(say(e))) : setArmed(true))}>
                {armed ? "Remove for good?" : "Remove this firm"}
              </button>
            </p>
          </div>
        ) : (
          <div className="pt-fp-reach">
            {p.contact && (
              <span>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <rect x="4" y="1" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M1.5 13.5v-3h11v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                {p.contact}
              </span>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M1 2.5h12v9H1zM1 3l6 4.5L13 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                {p.email}
              </a>
            )}
            {p.phone && (
              <span>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M3.5 1h7v12h-7zM6 10.8h2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                {p.phone}
              </span>
            )}
            {!p.contact && !p.email && !p.phone && <span className="quiet">No contact entered yet: press Edit</span>}
            {p.groups.length > 0 && (
              <span className="pt-fp-sells" lang="de">
                {p.groups.map((g) => (
                  <em key={g} className="tag">
                    {g}
                  </em>
                ))}
              </span>
            )}
          </div>
        )}

        {p.more.found && (
          <p className="pt-note">
            Found on the web on {day(p.more.found.at)} while looking for <span lang="de">„{p.more.found.what}“</span>:{" "}
            <a href={p.more.found.url} target="_blank" rel="noreferrer">
              {p.more.found.title || p.more.found.url}
            </a>
            . Check the contact on its page before the first inquiry goes out.
          </p>
        )}

        <div className={`pt-fp-cols${open.length ? "" : " is-single"}`}>
          {open.length > 0 && (
            <section className="pt-fp-part">
              <h3>Right now</h3>
              <ul className="pt-fp-now">
                {open.map((t, i) => (
                  <li key={i} className={yours(t) ? "is-you" : ""}>
                    <Mark you={yours(t)} />
                    <div>
                      <b>{yours(t) ? "Your reply is needed" : "Waiting for their reply"}</b>
                      <span>
                        {STATUS[t.status]}
                        {t.days !== null && (t.days === 0 ? " today" : ` for ${plural(t.days, "day")}`)}
                        {t.reminders > 0 && `, reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`} · <span lang="de">{[t.package, t.project].filter(Boolean).join(" · ")}</span>
                      </span>
                      {t.questions.length > 0 ? (
                        <ol className="pt-fp-asks">
                          {t.questions.map((q, n) => (
                            <li key={n}>{q}</li>
                          ))}
                        </ol>
                      ) : (
                        t.summary && <small>{t.summary}</small>
                      )}
                    </div>
                    {t.project_id && t.file !== null && (
                      <button className={yours(t) ? "btn-new" : "btn-ghost"} onClick={() => onOpenTender(t.project_id!, t.file!)}>
                        {t.status === "question" ? "Answer" : "Open the inquiry"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="pt-fp-part">
            <h3>How this firm answers</h3>
            <div className="pt-fp-draws">
              <div>
                <b>Answers our inquiries</b>
                {c.asked === 0 ? (
                  <p className="quiet">No inquiry has gone to this firm yet.</p>
                ) : (
                  <>
                    <span className="pt-squares" role="img" aria-label={`${c.asked} inquiries: ${answered}`}>
                      {squares.map((k, i) => (
                        <i key={i} className={k} />
                      ))}
                    </span>
                    <p>
                      <strong className="num">
                        {c.answered} of {c.asked}
                      </strong>{" "}
                      {answered && `· ${answered}`}
                    </p>
                  </>
                )}
              </div>
              <div>
                <b>First reply</b>
                {c.reply_hours === null ? (
                  <p className="quiet">Has not replied to an inquiry yet.</p>
                ) : (
                  <>
                    {speeds.length > 1 && (
                      <span className="pt-scale" role="img" aria-label={`Usually within ${took(c.reply_hours)}; all firms between ${took(fastest)} and ${took(slowest)}`}>
                        {speeds.map((x) => (
                          <i key={x.id} className={x.id === p.id ? "is-this" : ""} style={{ left: `${at(x.hours)}%` }} title={`${x.name}: ${took(x.hours)}`} />
                        ))}
                      </span>
                    )}
                    <p>
                      <strong className="num">usually within {took(c.reply_hours)}</strong>
                      {speeds.length > 1 && ` · all firms: ${took(fastest)} to ${took(slowest)}`}
                    </p>
                  </>
                )}
              </div>
              <div title="Of the items another firm priced too. Net prices as quoted; ex works and free to site are not evened out.">
                <b>Cheapest</b>
                {!level ? (
                  <p className="quiet">No item yet that another firm priced too.</p>
                ) : (
                  <>
                    <span className="pt-squares" role="img" aria-label={`Cheapest on ${level.low} of ${level.n} items`}>
                      {Array.from({ length: level.n }, (_, i) => (
                        <i key={i} className={i < level.low ? "is-low" : "is-not"} />
                      ))}
                    </span>
                    <p>
                      <strong className="num">
                        on {level.low} of {level.n}
                      </strong>{" "}
                      · items another firm priced too
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        {(sum || !bare) && (
          <section className="pt-fp-part">
            <h3>
              What Polier knows about this firm
              {sum && <small>read from {[sum.basis.inquiries && plural(sum.basis.inquiries, "inquiry", "inquiries"), sum.basis.quotes && plural(sum.basis.quotes, "quote"), sum.basis.messages && plural(sum.basis.messages, "message")].filter(Boolean).join(", ")}</small>}
              <button className="btn-ghost small" disabled={summing} onClick={sumUp} title="Asks Claude: a few seconds, a few cents">
                {summing ? "Reading the record…" : sum ? "Write again" : "Write it"}
              </button>
            </h3>
            {!sum ? (
              <p className="quiet">Polier reads the inquiries, quotes and messages on record and says what to know before asking this firm. Every point shows what it rests on.</p>
            ) : sum.points.length === 0 ? (
              <p className="quiet">Nothing Polier wrote stood against the record, so nothing is shown.</p>
            ) : (
              <ul className="pt-fp-cards">
                {sum.points.map((pt, i) => {
                  const facts = pt.sources.filter((s) => s.kind === "fact").length;
                  const mails = pt.sources.filter((s) => s.kind === "message");
                  return (
                    <li key={i}>
                      <b>{TOPIC[pt.topic ?? "other"]}</b>
                      <p>{pt.text}</p>
                      {pt.quote && <q lang="de">{pt.quote}</q>}
                      <small title={pt.sources.map((s) => (s.kind === "fact" ? s.text : `${s.who === "them" ? "Their" : "Our"} message of ${day(s.at)}: ${s.text}`)).join("\n")}>
                        {[mails.length > 0 && `${mails.some((m) => m.kind === "message" && m.who === "them") ? "their" : "our"} ${mails.length === 1 ? "message" : "messages"} of ${[...new Set(mails.map((m) => (m.kind === "message" ? day(m.at) : "")))].join(", ")}`, facts > 0 && "counted from the record"].filter(Boolean).join(" · ")}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <div className="pt-fp-cols is-lower">
          <section className="pt-fp-part">
            <h3>
              Prices <small>{p.prices.length ? "the latest quote for each item" : ""}</small>
            </h3>
            {p.prices.length === 0 ? <p className="quiet">No price from this firm yet. A quote read in the price inquiries of a tender shows here.</p> : <FirmPrices rows={p.prices} book={book} id={p.id} sub={p.kind === "subcontractor"} />}
          </section>
          <section className="pt-fp-part">
            <h3>
              Conversations <small>{p.timeline.length ? "one per inquiry, newest first" : ""}</small>
            </h3>
            {p.timeline.length === 0 ? <p className="quiet">Nothing yet. Inquiries and replies from the tenders show here.</p> : <Threads events={p.timeline} open={c.open} />}
          </section>
        </div>
      </div>
    </section>
  );
}

/** A firm's prices, quote by quote: the tender and the day stand once above its items; each item with its price,
    the one before where there was one, and where it stands against the other firms' price for the same thing.
    Quotes that are out of date are folded away. */
function FirmPrices({ rows, book, id, sub }: { rows: PartnerPrice[]; book: PartnersOverview["book"]; id: string; sub: boolean }) {
  const quotes = useMemo(() => {
    // the latest quote of each item, with the price before it
    const byItem = new Map<string, PartnerPrice[]>();
    for (const r of rows) byItem.set(`${r.label}|${r.unit}`, [...(byItem.get(`${r.label}|${r.unit}`) ?? []), r]);
    const latest = [...byItem.values()].map((list) => [...list].sort((a, b) => b.date.localeCompare(a.date)));
    const byQuote = new Map<string, PartnerPrice[][]>();
    for (const list of latest) byQuote.set(list[0].quote, [...(byQuote.get(list[0].quote) ?? []), list]);
    return [...byQuote.values()].sort((a, b) => b[0][0].date.localeCompare(a[0][0].date));
  }, [rows]);
  const against = (r: PartnerPrice) => {
    const others = (book.find((b) => b.label === r.label && b.unit === r.unit)?.offers ?? []).filter((o) => o.fresh && o.supplier_id !== id && o.net > 0);
    if (!r.fresh || others.length === 0) return null;
    const best = others.reduce((a, b) => (b.net < a.net ? b : a));
    return r.net <= best.net ? { low: true, text: "cheapest", who: `${best.supplier}: ${price(best.net)}` } : { low: false, text: `+${pct.format(((r.net - best.net) / best.net) * 100)} %`, who: `${best.supplier}: ${price(best.net)}` };
  };
  const table = (items: PartnerPrice[][]) => (
    <table className="pt-fp-prices">
      <colgroup>
        <col />
        <col style={{ width: "128px" }} />
        <col style={{ width: "118px" }} />
      </colgroup>
      <tbody>
        {items.map((list) => {
          const r = list[0];
          const was = list[1];
          const change = was && was.net > 0 ? ((r.net - was.net) / was.net) * 100 : null;
          const vs = against(r);
          return (
            <tr key={`${r.label}|${r.unit}`}>
              <td lang="de">
                <b>{r.label}</b>
                {r.alternative ? <small lang="en">offered another product: <span lang="de">{r.product}</span></small> : r.product && r.product !== r.label && <small>{r.product}</small>}
              </td>
              <td className="r num">
                <b>{price(r.net)}</b>
                <small>
                  per {r.unit || "unit"}
                  {change !== null && <span className={change > 0 ? "pt-rise" : ""} title={`${price(was.net)} on ${day(was.date)}`}> · {change > 0 ? "↑" : "↓"} {pct.format(Math.abs(change))} %</span>}
                </small>
              </td>
              <td>{vs ? <span className={`pt-vs${vs.low ? " is-low" : ""}`} title={`Against the lowest other price that holds: ${vs.who}`}>{vs.text}</span> : <span className="quiet pt-vs-none">only price</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const fresh = quotes.filter((q) => q[0][0].fresh);
  const old = quotes.filter((q) => !q[0][0].fresh);
  const head = (q: PartnerPrice[][]) => {
    const r = q[0][0];
    return (
      <>
        <b lang="de">{[r.package, r.project].filter(Boolean).join(" · ") || "No tender on record"}</b>
        <span className="num">
          quoted {day(r.date)}
          {r.valid_until && ` · valid until ${day(r.valid_until)}`} · {plural(q.length, "item")}
        </span>
      </>
    );
  };
  return (
    <div className="pt-fp-quotes">
      <p className="pt-fp-colhead" aria-hidden>
        <span>{sub ? "Work" : "Item"}</span>
        <span>Price, net</span>
        <span>Against others</span>
      </p>
      {fresh.map((q) => (
        <div key={q[0][0].quote} className="pt-fp-quote">
          <p className="pt-fp-quotehead">{head(q)}</p>
          {table(q)}
        </div>
      ))}
      {old.length > 0 && (
        <details className="pt-fp-old" open={fresh.length === 0}>
          <summary>
            Earlier quotes, out of date <span className="num">{plural(old.reduce((n, q) => n + q.length, 0), "item")}</span>
          </summary>
          {old.map((q) => (
            <div key={q[0][0].quote} className="pt-fp-quote">
              <p className="pt-fp-quotehead">{head(q)}</p>
              {table(q)}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

const STEP: Partial<Record<PartnerEvent["kind"], string>> = { inquiry: "Asked", reminder: "Reminded", answer: "We answered", reply: "Replied" };

/** A firm's conversations, one per inquiry: the steps it went through on one line (asked, asked back, quoted),
    where it stands now, and behind a press the messages themselves, ours at the right and theirs at the left. */
function Threads({ events, open }: { events: PartnerEvent[]; open: PartnerThread[] }) {
  const threads = useMemo(() => {
    const by = new Map<string, PartnerEvent[]>();
    for (const e of events) by.set(threadKey(e), [...(by.get(threadKey(e)) ?? []), e]);
    return [...by.entries()]
      .map(([key, list]) => ({ key, list: [...list].sort((a, b) => a.at.localeCompare(b.at)) }))
      .sort((a, b) => Number(a.key === "") - Number(b.key === "") || b.list[b.list.length - 1].at.localeCompare(a.list[a.list.length - 1].at));
  }, [events]);
  return (
    <div className="pt-threads">
      {threads.map(({ key, list }) => {
        const head = list.find((e) => e.kind === "inquiry") ?? list[0];
        const waits = key ? open.find((t) => t.subject === head.subject && t.project === head.project) : undefined;
        const steps = list
          .map((e) => ({ at: e.at, text: e.kind === "reply" ? (e.priced ? "Quoted" : e.reply_kind === "question" ? "Asked back" : e.reply_kind === "decline" || e.reply_kind === "declined" ? "Declined" : "Replied") : (STEP[e.kind] ?? ""), theirs: e.direction === "in" }))
          .filter((x) => x.text);
        const unkept = list.filter((e) => !e.text).length;
        return (
          <details key={key || "other"} className={`pt-thread${waits ? (yours(waits) ? " is-you" : " is-open") : ""}`}>
            <summary>
              <b lang="de">{key ? head.package || head.subject.replace(/^Preisanfrage\s*[–-]\s*/, "") : "Other mail with this firm"}</b>
              <span lang="de">{key ? head.project : plural(list.length, "message")}</span>
              {steps.length > 0 && (
                <ol className="pt-track">
                  {steps.map((x, i) => (
                    <li key={i} className={x.theirs ? "is-theirs" : ""}>
                      {x.text} <span className="num">{day(x.at).slice(0, 6)}</span>
                    </li>
                  ))}
                  {waits && <li className={`is-now${yours(waits) ? " is-you" : ""}`}>{yours(waits) ? "your reply is needed" : "waiting for their reply"}</li>}
                </ol>
              )}
            </summary>
            <ol className="pt-talk">
              {list.map((e) => (
                <Entry key={e.id} e={e} />
              ))}
            </ol>
            {unkept > 0 && <p className="quiet pt-unkept">The text of {unkept === list.length ? (unkept === 1 ? "this message" : "these messages") : plural(unkept, "message")} was not kept.</p>}
          </details>
        );
      })}
    </div>
  );
}

const WHAT: Partial<Record<PartnerEvent["kind"], string>> = { inquiry: "Inquiry", reminder: "Reminder", answer: "Our answer", reply: "Their reply", mail: "E-mail" };

function Entry({ e }: { e: PartnerEvent }) {
  return (
    <li className={e.direction === "in" ? "is-theirs" : "is-ours"}>
      <header>
        <b>{e.kind === "mail" ? (e.direction === "in" ? "Their e-mail" : "Our e-mail") : WHAT[e.kind]}</b>
        <span className="num">{day(e.at)}</span>
        {e.draft && <em className="tag">not sent</em>}
        {e.reply_kind && e.kind === "reply" && <em className="tag">{e.priced ? "with prices" : e.reply_kind}</em>}
        {!e.mail_id && <span lang="de">{e.subject}</span>}
      </header>
      {e.summary && <p className="pt-talk-sum">{e.summary}</p>}
      {e.text ? (
        <details>
          <summary lang="de">{e.text.replace(/\s+/g, " ").slice(0, 150)}</summary>
          <pre lang="de">{e.text}</pre>
        </details>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ what waits, across all tenders */

type Message = { kind: "reminder" | "answer" | "inquiry"; analysis_id: string; to: string; subject: string; body: string; points: AnswerPoint[] };
type FollowDraft = Message & { n: number };

const DRAFT: Record<Message["kind"], string> = { answer: "Polier's answer, for you to read", reminder: "The reminder, for you to read", inquiry: "The inquiry, for you to read" };

/** A message Polier wrote, to read and change before it goes out: to, subject, text, and for an answer what
    each part of it rests on. Nothing is sent without the press on "Send". */
function DraftPanel<T extends Message>({ draft, sending, onChange, onSend, onDiscard }: { draft: T; sending: boolean; onChange: (d: T) => void; onSend: (via: "smtp" | "draft") => void; onDiscard: () => void }) {
  return (
    <div className="pt-follow-draft">
      <b>{DRAFT[draft.kind]}</b>
      <label>
        <span>To</span>
        <input type="text" value={draft.to} onChange={(e) => onChange({ ...draft, to: e.target.value })} />
      </label>
      <label>
        <span>Subject</span>
        <input type="text" lang="de" value={draft.subject} onChange={(e) => onChange({ ...draft, subject: e.target.value })} />
      </label>
      <textarea lang="de" rows={Math.min(18, Math.max(8, draft.body.split("\n").length + 1))} value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })} aria-label="Text of the message" />
      {draft.kind === "inquiry" && <small>The items go with it as an Excel sheet for the firm to fill in.</small>}
      {draft.points.length > 0 && (
        <ul className="pt-follow-points">
          {draft.points.map((pt, i) => (
            <li key={i} className={pt.settled ? "" : "is-open"}>
              <span lang="de">{pt.question}</span>
              {pt.settled ? (
                <small>
                  rests on {pt.pos && <b className="num">{pt.pos}</b>} <q lang="de">{pt.lv_quote}</q>
                </small>
              ) : (
                <small className="pt-up">the LV does not settle this: check the answer before it goes out</small>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="pt-acts">
        <button className="btn-new" disabled={sending || !draft.to.includes("@") || !draft.body.trim()} onClick={() => onSend("smtp")}>
          {sending ? "Sending…" : `Send to ${draft.to}`}
        </button>
        <button className="btn-ghost" disabled={sending} onClick={() => onSend("draft")} title="Kept in the conversation as written and not sent">
          Keep unsent
        </button>
        <button className="text-link" disabled={sending} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

/** Every open conversation as a card: the firm and what it is about, the firm's questions or how long it has
    been silent (against how long it usually takes), the steps so far on one line, and the next message one
    press away. Your replies first. */
function Waiting({
  rows,
  partners,
  onOpen,
  onOpenTender,
  onChanged,
  onError,
}: {
  rows: PartnerThread[];
  partners: PartnerRow[];
  onOpen: (id: string) => void;
  onOpenTender: (projectId: string, file: number) => void;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [draft, setDraft] = useState<FollowDraft | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const order = useMemo(() => [...rows].sort((a, b) => Number(yours(b)) - Number(yours(a)) || (b.days ?? 0) - (a.days ?? 0)), [rows]);
  if (rows.length === 0) return null;

  const write = (n: number, t: PartnerThread, kind: "reminder" | "answer") => {
    setBusy(n);
    composeFollowUp({ project_id: t.project_id!, file: t.file_name!, package: t.package_id!, supplier_id: t.supplier_id }, kind)
      .then((d) => setDraft({ n, kind, analysis_id: d.analysis_id, to: d.to, subject: d.subject, body: d.body, points: d.points ?? [] }), (e) => onError(say(e)))
      .finally(() => setBusy(null));
  };
  const send = (t: PartnerThread, via: "smtp" | "draft") => {
    if (!draft) return;
    setSending(true);
    mailInquiry(draft.analysis_id, { package: t.package_id!, supplier_id: t.supplier_id, to: draft.to, subject: draft.subject, body: draft.body, via, kind: draft.kind })
      .then(() => (setDraft(null), onChanged()), (e) => onError(say(e)))
      .finally(() => setSending(false));
  };
  const card = (t: PartnerThread) => {
    const n = order.indexOf(t);
    const can = Boolean(t.project_id && t.package_id && t.file_name) && !t.example;
    const usual = partners.find((p) => p.id === t.supplier_id)?.card.reply_hours ?? null;
    const usualDays = usual === null ? null : usual / 24;
    const waited = t.days ?? 0;
    const span = Math.max(waited, usualDays ?? 0, 1) * 1.15;
    const mine = draft?.n === n ? draft : null;
    return (
      <li key={n} className={yours(t) ? "is-you" : ""}>
        <div className="pt-fu-row">
          <div>
            <button className="pt-fu-firm" onClick={() => onOpen(t.supplier_id)}>
              {t.supplier}
            </button>
            <small lang="de">{[t.package || t.subject.replace(/^Preisanfrage\s*[–-]\s*/, ""), t.project].filter(Boolean).join(" · ")}</small>
            <ol className="pt-track">
              {t.first_sent && (
                <li>
                  Asked <span className="num">{day(t.first_sent).slice(0, 6)}</span>
                </li>
              )}
              {t.reminders > 0 && <li>Reminded{t.reminders > 1 ? ` ${t.reminders}×` : ""}</li>}
              {t.status === "question" && (
                <li className="is-theirs">
                  Asked back <span className="num">{day(t.since).slice(0, 6)}</span>
                </li>
              )}
              <li className={`is-now${yours(t) ? " is-you" : ""}`}>{yours(t) ? "your reply is needed" : "waiting for their reply"}</li>
            </ol>
          </div>
          <div className="pt-fu-what">
            {t.questions.length > 0 ? (
              <ol className="pt-fu-asks">
                {t.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            ) : t.status === "sent" || t.status === "later" ? (
              <>
                <span className="pt-wait" role="img" aria-label={`Waited ${plural(waited, "day")}${usualDays !== null ? `, usually answers within ${took(usual)}` : ""}`}>
                  <b className={usualDays !== null && waited > usualDays ? "is-over" : ""} style={{ width: `${(waited / span) * 100}%` }} />
                  {usualDays !== null && <i style={{ left: `${(usualDays / span) * 100}%` }} />}
                </span>
                <p>
                  <strong>No reply for {plural(waited, "day")}</strong>
                  {usual !== null ? ` · usually answers within ${took(usual)}` : " · has not answered an inquiry yet"}
                  {t.reminders > 0 && ` · reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`}
                </p>
              </>
            ) : (
              <p>{STATUS[t.status]}{t.summary && `: ${t.summary}`}</p>
            )}
          </div>
          <div className="pt-fu-act">
            {can && t.status === "question" && (
              <button className="btn-new" disabled={busy !== null || Boolean(mine)} onClick={() => write(n, t, "answer")} title="Polier answers from the LV: asks Claude, a few seconds, a few cents">
                {busy === n ? "Writing…" : "Write the answer"}
              </button>
            )}
            {can && (t.status === "sent" || t.status === "later") && (
              <button className="btn-ghost" disabled={busy !== null || Boolean(mine)} onClick={() => write(n, t, "reminder")}>
                {busy === n ? "Writing…" : "Write a reminder"}
              </button>
            )}
            {t.project_id && t.file !== null && (
              <button className="text-link" onClick={() => onOpenTender(t.project_id!, t.file!)}>
                {t.status === "drafted" ? "Open the draft" : "Open the inquiry"}
              </button>
            )}
          </div>
        </div>
        {mine && <DraftPanel draft={mine} sending={sending} onChange={setDraft} onSend={(via) => send(t, via)} onDiscard={() => setDraft(null)} />}
      </li>
    );
  };
  const mineRows = order.filter(yours);
  const theirRows = order.filter((t) => !yours(t));
  return (
    <div className="pt-fu">
      {mineRows.length > 0 && (
        <>
          <h2>
            Your reply is needed <span className="num">{mineRows.length}</span>
          </h2>
          <ul className="pt-fu-list">{mineRows.map(card)}</ul>
        </>
      )}
      {theirRows.length > 0 && (
        <>
          <h2>
            Waiting for their reply <span className="num">{theirRows.length}</span>
          </h2>
          <ul className="pt-fu-list">{theirRows.map(card)}</ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the firm itself */

/** Who asks: the firm's own name and contact, as every inquiry carries them; what its own people do and what
    comes on a subcontractor's price. Below, small, what is only there for the demo. */
function Firm({ data, onChanged, onError }: { data: PartnersOverview; onChanged: () => void; onError: (e: string) => void }) {
  const [company, setCompany] = useState<Company>(data.company);
  const [read, setRead] = useState<HistoryRead | null>(null);
  const [busy, setBusy] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const firm = (values: Partial<Company>) => saveCompany(values).then((c) => (setCompany(c), onChanged()), (e) => onError(say(e)));
  const history = (job: () => Promise<HistoryRead>) => {
    setBusy(true);
    job()
      .then((r) => (setRead(r), onChanged()), (e) => onError(say(e)))
      .finally(() => setBusy(false));
  };
  const examples = data.partners.some((p) => p.more.example);
  const needed: (keyof Company)[] = ["name", "email"];
  const line = (value: string, what: string) => (value.trim() ? <span>{value}</span> : <span className="pt-up">{what} missing</span>);
  return (
    <section className="pt-wide pt-yf">
      <h2>Your firm</h2>
      <p className="quiet">Every inquiry says who is asking: a supplier gives an unknown sender the list price, or nothing.</p>
      <div className="pt-yf-cols">
        <div className="pt-fields">
          {(
            [
              ["name", "Firm"],
              ["contact", "Contact person"],
              ["email", "E-mail"],
              ["phone", "Phone"],
              ["place", "Place"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={needed.includes(key) && !company[key].trim() ? "is-missing" : ""}>
              <span>
                {label}
                {needed.includes(key) && !company[key].trim() && " · needed"}
              </span>
              <input type="text" defaultValue={company[key]} onBlur={(e) => e.target.value.trim() !== company[key] && void firm({ [key]: e.target.value.trim() })} />
            </label>
          ))}
          <label>
            <span>On a subcontractor's price, per cent</span>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={String(company.nu_surcharge).replace(".", ",")}
              onBlur={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (Number.isFinite(n) && n !== company.nu_surcharge) void firm({ nu_surcharge: n });
              }}
            />
            <small>usual are 8 to 15</small>
          </label>
          <label className="wide">
            <span>What your own people do</span>
            <input type="text" lang="de" defaultValue={company.own_trades} onBlur={(e) => e.target.value.trim() !== company.own_trades && void firm({ own_trades: e.target.value.trim() })} />
            <small>Everything else in an LV is a trade for a subcontractor. Polier reads this when it groups the items.</small>
          </label>
        </div>
        <aside className="pt-yf-card" aria-label="How an inquiry names your firm">
          <b>An inquiry names you as</b>
          <p>
            {line(company.name, "Firm's name")}
            {company.contact.trim() && <span>{company.contact}</span>}
            {line(company.email, "E-mail")}
            {company.phone.trim() && <span>{company.phone}</span>}
            {company.place.trim() && <span>{company.place}</span>}
          </p>
          <small>A field is kept when you leave it.</small>
        </aside>
      </div>

      <div className="pt-yf-demo">
        <b>For the demo</b>
        <button className="btn-ghost small" onClick={() => putExamples(!examples).then(onChanged, (e) => onError(say(e)))} title="Six made-up firms with mail, quotes and prices over a year">
          {examples ? "Take the example firms out" : "Put six example firms in"}
        </button>
        <button className="btn-ghost small" disabled={busy || !data.inbox} onClick={() => history(readMailboxHistory)} title={data.inbox ? `Reads ${data.inbox}: the mail of the last two years with your firms, only read, never changed` : "No mailbox is set"}>
          {busy ? "Reading…" : "Read older mail from the mailbox"}
        </button>
        <button className="btn-ghost small" disabled={busy} onClick={() => files.current?.click()}>
          Hand over saved e-mails (.eml)
        </button>
        <input ref={files} type="file" accept=".eml" multiple hidden onChange={(e) => (history(() => handOverMessages([...(e.target.files ?? [])])), (e.target.value = ""))} />
        {read && (
          <span className="quiet">
            {plural(read.kept, "message")} put to {read.kept === 1 ? "its firm" : "their firms"}
            {read.unknown.length > 0 && `, ${plural(read.unknown.length, "address", "addresses")} of no firm`}
          </span>
        )}
      </div>
    </section>
  );
}
