/* Partners: the suppliers and subcontractors the firm asks for prices, and everything Polier knows about each.

   A page of its own (/partners), not a dialog. The directory is one register of both kinds of firm, side by
   side (replies, speed, prices that hold, what is open), under a line of what needs a look today; a firm
   opened from it shows what is open with it, four measures set against the directory, and its prices (one row
   per thing, with the course), its conversations (one thread per inquiry), its terms and particulars and how
   it writes. Beside the directory: what waits across all tenders, the price book (every firm's price for a
   thing on one line), what the web search found, and the firm's own particulars. Server side:
   src/boq/partners.py. */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  composeFollowUp,
  decideCandidate,
  discoverPartners,
  findFollowUp,
  fetchCallRecord,
  getPartner,
  getPartners,
  handOverMessages,
  listPartnerSearches,
  mailInquiry,
  putExamples,
  readMailboxHistory,
  readPartnerFirm,
  removeSupplier,
  saveCompany,
  saveDiscovery,
  saveSupplier,
  takeWarmPartners,
  type HistoryRead,
} from "./api";
import { Select } from "./controls";
import type { PartnerTab, PartnersPlace } from "./router";
import type { AnswerPoint, Company, PartnerCard, PartnerEvent, PartnerNeed, PartnerPrice, PartnerProfile, PartnerRow, PartnerSearch, PartnerThread, PartnersOverview, Supplier, SupplierMore } from "./types";
import "./partners.css";

const CallPanel = lazy(() => import("./Call")); // the voice agent, as in the price inquiries

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const words = (text: string) => text.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "–");
const money = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (n: number) => `${money.format(n)} €`;
const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const took = (h: number | null) => (h === null ? "–" : h < 36 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const KIND: Record<Supplier["kind"], string> = { supplier: "Supplier", subcontractor: "Subcontractor" };
const BASIS: Record<string, string> = { free_to_site: "free to site", ex_works: "ex works, freight on top", unknown: "not stated" };
const BINDING: Record<string, string> = { binding: "binding", non_binding: "not binding", unknown: "not stated" };
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
  { id: "coverage", label: "Coverage" },
  { id: "waiting", label: "Follow-ups" },
  { id: "prices", label: "Price book" },
];

/** Whose move: a yellow square is the estimator's, an open one the partner's (the marks of the board cards). */
const Mark = ({ you }: { you: boolean }) => <i className={`pt-mark${you ? " is-you" : ""}`} aria-label={you ? "Your move" : "Their move"} />;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (iso: string) => Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today())) / 864e5);


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
  /** The place in the band (App.tsx) where the tabs, the search and "Your firm" stand. */
  bandSlot?: HTMLElement | null;
}) {
  // the copy read in the background after the projects page stood, if there is one; read again right away
  const [data, setData] = useState<PartnersOverview | null>(takeWarmPartners);
  const [searches, setSearches] = useState<PartnerSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("open");
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState<string | null>(null); // the package a web search runs for (Coverage)

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
    listPartnerSearches().then(setSearches, (e) => setError(say(e)));
  }, [load]);
  const changed = useCallback(() => (onChanged(), load()), [onChanged, load]);

  // suppliers and subcontractors are one directory now; the old address of the second list leads there
  const directory = place.tab === "suppliers" || place.tab === "subcontractors";
  useEffect(() => {
    if (place.tab === "subcontractors") onPlace({ tab: "suppliers", partner: place.partner });
  }, [place, onPlace]);

  const all = data?.partners ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter(
      (p) =>
        (filter === "all" ||
          p.kind === filter) &&
        (!q || [p.name, p.place, ...p.groups, ...p.products.map((x) => x.name)].some((t) => t.toLowerCase().includes(q))),
    );
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
  }, [all, query, filter, sort, data]);

  const count = (tab: PartnerTab) =>
    !data
      ? null
      : tab === "suppliers"
        ? data.partners.length
        : tab === "coverage"
          ? data.needs.filter((n) => n.active && !n.firms.some((f) => data.partners.some((p) => p.id === f.id))).length || null
          : tab === "waiting"
          ? data.waiting.length
          : tab === "prices"
            ? soon || data.book.length
            : tab === "discovered"
              ? (searches ?? []).reduce((n, s) => n + s.candidates.filter((c) => c.status === "new").length, 0)
              : null;
  const openPartner = (id: string) => onPlace({ tab: "suppliers", partner: id });
  // prices that still hold and run out within a week: the ones to use or ask again while they stand
  const soon = useMemo(() => (data?.book ?? []).reduce((n, b) => n + b.offers.filter((o) => o.fresh && o.valid_until && daysTo(o.valid_until) <= 7).length, 0), [data]);
  const unsigned = data !== null && (!data.company.name.trim() || !data.company.email.trim());

  const nav = (
    <nav className="pt-nav" aria-label="Partners">
      <div className="pt-band-tabs" role="tablist" aria-label="Partners">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="pt-band-tab" aria-selected={place.tab === t.id || (t.id === "suppliers" && directory) || (t.id === "coverage" && place.tab === "discovered")} onClick={() => onPlace({ tab: t.id, partner: null })}>
            {t.label}
            {count(t.id) !== null && <span className={`pt-count${t.id === "waiting" && data?.waiting.some(yours) ? " is-you" : t.id === "coverage" ? " is-gap" : t.id === "prices" && soon ? " is-soon" : ""}`} title={t.id === "coverage" ? "Packages of tenders in work with nobody to ask" : t.id === "prices" && soon ? `${soon} of the prices that hold run out within 7 days` : undefined}>{count(t.id)}</span>}
          </button>
        ))}
      </div>
      <div className="pt-band-tools">
        {directory && (
          <div className="pt-band-find">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
            <input type="search" className="pt-search" placeholder="Find a firm, a material, a place" aria-label="Find a firm" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="pt-band-add" onClick={() => (setAdding(true), onPlace({ tab: "suppliers", partner: null }))}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" />
              </svg>
              Add a firm
            </button>
          </div>
        )}
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
      {/* the tabs, the search and the firm stand in the band (App.tsx gives the place); without it, here */}
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
              voice={data.voice}
              book={data.book}
              onBack={() => onPlace({ tab: "suppliers", partner: null })}
              onChanged={changed}
              onGone={() => (onPlace({ tab: "suppliers", partner: null }), void changed())}
              onOpenTender={onOpenTender}
              onError={setError}
            />
          ) : (
            <Register
              rows={rows}
              all={all}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              adding={adding}
              onAdded={(id) => (setAdding(false), void changed(), openPartner(id))}
              onCancelAdd={() => setAdding(false)}
              onOpen={openPartner}
              onExamples={() => putExamples(true).then(changed, (e) => setError(say(e)))}
              onError={setError}
            />
          )}
        </>
      ) : place.tab === "coverage" ? (
        <Coverage
          data={data}
          searches={searches ?? []}
          searching={searching}
          onOpen={openPartner}
          onOpenTender={onOpenTender}
          onChanged={changed}
          onError={setError}
          onDecide={(sr, k, take) =>
            decideCandidate(sr.id, k, take).then((next) => (setSearches((before) => (before ?? []).map((x) => (x.id === next.id ? next : x))), take && void changed()), (e) => setError(say(e)))
          }
          onFound={() => onPlace({ tab: "discovered", partner: null })}
          onSearch={(n) => {
            setSearching(n.package);
            discoverPartners(n.package, n.kind, (data.discovery.region || data.company.place).trim(), n.project_id)
              .then((s) => (setSearches((before) => [s, ...(before ?? [])]), onPlace({ tab: "discovered", partner: null })), (e) => setError(say(e)))
              .finally(() => setSearching(null));
          }}
        />
      ) : place.tab === "waiting" ? (
        <Waiting rows={data.waiting} partners={all} voice={data.voice} onOpen={openPartner} onOpenTender={onOpenTender} onChanged={changed} onError={setError} />
      ) : place.tab === "prices" ? (
        <PriceBook book={data.book} onOpen={openPartner} />
      ) : place.tab === "discovered" ? (
        <Discovered data={data} searches={searches ?? []} onSearches={setSearches} onChanged={changed} onOpen={openPartner} onError={setError} />
      ) : (
        <Firm data={data} onChanged={changed} onError={setError} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the firms, one row each */

function Register({
  rows,
  all,
  filter,
  onFilter,
  sort,
  onSort,
  adding,
  onAdded,
  onCancelAdd,
  onOpen,
  onExamples,
  onError,
}: {
  rows: PartnerRow[];
  all: PartnerRow[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  adding: boolean;
  onAdded: (id: string) => void;
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
      <div className="pt-chips" role="group" aria-label="Show">
        {chips.map(([f, label, n]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => onFilter(f)}>
            {label} <span className="num">{n}</span>
          </button>
        ))}
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
            <p>No firm here{all.length ? " by that search" : " yet"}.</p>
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

/** One firm, read from top to bottom: who it is and how to reach it, what is open with it right now, how it
    answers, what Polier knows about it, its prices, the conversations. Entering and changing is behind "Edit". */
function Profile({
  id,
  voice,
  book,
  onBack,
  onChanged,
  onGone,
  onOpenTender,
  onError,
}: {
  id: string;
  voice: boolean;
  book: PartnersOverview["book"];
  onBack: () => void;
  onChanged: () => void;
  onGone: () => void;
  onOpenTender: (projectId: string, file: number) => void;
  onError: (e: string) => void;
}) {
  const [p, setP] = useState<PartnerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [summing, setSumming] = useState(false);
  const [point, setPoint] = useState<number | null>(null);
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
    setPoint(null);
    readPartnerFirm(p.id)
      .then(() => (void load(), onChanged()), (e) => onError(say(e)))
      .finally(() => setSumming(false));
  };
  const bare = c.asked === 0 && p.timeline.length === 0 && p.prices.length === 0;

  return (
    <section
      className={`pt-fp${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && (e.preventDefault(), e.stopPropagation(), setDropping(true))}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setDropping(false), void drop([...e.dataTransfer.files]))}
    >
      <div className="pt-fp-in">
        {back}

        <header className="pt-fp-head">
          <div>
            <h2>{p.name}</h2>
            <p>
              {[KIND[p.kind], p.place, p.more.preferred && "preferred", p.more.blocked && "not asked", p.more.example && "example firm"].filter(Boolean).join(" · ")}
            </p>
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
          <dl className="pt-fp-facts">
            <div>
              <dt>Contact</dt>
              <dd>{p.contact || <span className="quiet">not entered</span>}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="quiet">not entered</span>}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{p.phone ? <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}>{p.phone}</a> : <span className="quiet">not entered</span>}</dd>
            </div>
            <div>
              <dt>{p.kind === "supplier" ? "Sells" : "Does"}</dt>
              <dd lang="de">{p.groups.join(", ") || <span className="quiet" lang="en">not entered</span>}</dd>
            </div>
          </dl>
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

        {c.open.length > 0 && (
          <section className="pt-fp-part">
            <h3>Right now</h3>
            <ul className="pt-fp-now">
              {[...c.open].sort((x, y) => Number(yours(y)) - Number(yours(x))).map((t, i) => (
                <li key={i} className={yours(t) ? "is-you" : ""}>
                  <Mark you={yours(t)} />
                  <div>
                    <b>{yours(t) ? "Your reply is needed" : "Waiting for their reply"}</b>
                    <span>
                      {STATUS[t.status]}
                      {t.days !== null && (t.days === 0 ? " today" : ` for ${plural(t.days, "day")}`)}
                      {t.reminders > 0 && `, reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`} · <span lang="de">{[t.package, t.project].filter(Boolean).join(" · ")}</span>
                    </span>
                    {t.summary && <small>{t.summary}</small>}
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
          <dl className="pt-fp-figures">
            <div>
              <dt>Answers our inquiries</dt>
              <dd className="num">{c.asked ? `${c.answered} of ${c.asked}` : "–"}</dd>
              <small>{c.asked === 0 ? "no inquiry has gone to this firm yet" : c.reply_hours === null ? "no reply so far" : `usually within ${took(c.reply_hours)}`}</small>
            </div>
            <div>
              <dt>Quotes received</dt>
              <dd className="num">{c.quotes}</dd>
              <small>{c.taken > 0 ? `taken into a bid ${c.taken === 1 ? "once" : `${c.taken} times`}` : c.declined > 0 ? `declined ${c.declined === 1 ? "once" : `${c.declined} times`}` : "none taken into a bid yet"}</small>
            </div>
            <div title="Of the items another firm priced too. Net prices as quoted; ex works and free to site are not evened out.">
              <dt>Cheapest</dt>
              <dd className="num">{level ? `on ${level.low} of ${level.n}` : "–"}</dd>
              <small>{level ? "items another firm priced too" : "no item yet that another firm priced too"}</small>
            </div>
          </dl>
        </section>

        {(sum || !bare) && (
          <section className="pt-fp-part">
            <h3>
              What Polier knows about this firm
              <button className="btn-ghost small" disabled={summing} onClick={sumUp} title="Asks Claude: a few seconds, a few cents">
                {summing ? "Reading the record…" : sum ? "Write again" : "Write it"}
              </button>
            </h3>
            {!sum ? (
              <p className="quiet">Polier reads the inquiries, quotes and messages on record and says in a few sentences what to know before asking this firm. Every sentence shows what it rests on.</p>
            ) : sum.points.length === 0 ? (
              <p className="quiet">Nothing Polier wrote stood against the record, so nothing is shown.</p>
            ) : (
              <ol className="pt-points">
                {sum.points.map((pt, i) => (
                  <li key={i}>
                    <div>
                      <button className={point === i ? "is-on" : ""} aria-expanded={point === i} onClick={() => setPoint(point === i ? null : i)} title="Show what this rests on">
                        {pt.text}
                      </button>
                      {point === i && (
                        <ul className="pt-point-src">
                          {pt.sources.map((s) =>
                            s.kind === "fact" ? (
                              <li key={s.id}>
                                <em className="tag">the record</em> {s.text}
                              </li>
                            ) : (
                              <li key={s.id}>
                                <em className="tag">{s.who === "them" ? "their message" : "our message"}</em> <span className="num">{day(s.at)}</span> <span lang="de">{s.text}</span>
                              </li>
                            ),
                          )}
                          {pt.quote && (
                            <li>
                              <q lang="de">{pt.quote}</q>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {sum && sum.points.length > 0 && <p className="quiet pt-fp-hint">Press a sentence to see the count or the passage it rests on.</p>}
          </section>
        )}

        <section className="pt-fp-part">
          <h3>
            Prices <small>{p.prices.length ? "the latest quote for each item" : ""}</small>
          </h3>
          {p.prices.length === 0 ? <p className="quiet">No price from this firm yet. A quote read in the price inquiries of a tender shows here.</p> : <FirmPrices rows={p.prices} sub={p.kind === "subcontractor"} />}
        </section>

        <section className="pt-fp-part">
          <h3>
            Conversations <small>{p.timeline.length ? "one per inquiry, newest first" : ""}</small>
          </h3>
          {p.timeline.length === 0 ? <p className="quiet">Nothing yet. Inquiries, replies and calls from the tenders show here.</p> : <Threads events={p.timeline} open={c.open} voice={voice} onRecord={load} onError={onError} />}
        </section>
      </div>
    </section>
  );
}

/** A firm's prices: the latest quote for each item, with the price before where there was one. */
function FirmPrices({ rows, sub }: { rows: PartnerPrice[]; sub: boolean }) {
  const items = useMemo(() => {
    const by = new Map<string, PartnerPrice[]>();
    for (const r of rows) by.set(`${r.label}|${r.unit}`, [...(by.get(`${r.label}|${r.unit}`) ?? []), r]);
    return [...by.values()].map((list) => [...list].sort((a, b) => b.date.localeCompare(a.date))).sort((a, b) => b[0].date.localeCompare(a[0].date));
  }, [rows]);
  return (
    <table className="pt-fp-prices">
      <colgroup>
        <col style={{ width: "44%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "24%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>{sub ? "Work" : "Item"}</th>
          <th className="r">Price, net</th>
          <th>Quoted</th>
          <th>For the tender</th>
        </tr>
      </thead>
      <tbody>
        {items.map((list) => {
          const r = list[0];
          const was = list[1];
          const change = was && was.net > 0 ? ((r.net - was.net) / was.net) * 100 : null;
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
                  {change !== null && ` · was ${price(was.net)} (${change > 0 ? "+" : ""}${pct.format(change)} %)`}
                </small>
              </td>
              <td className="num">
                {day(r.date)}
                {r.valid_until && <small>valid until {day(r.valid_until)}</small>}
              </td>
              <td lang="de">{r.project || <span className="quiet">–</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A firm's messages and calls, one thread per inquiry: what was asked, what came back, where it stands. */
function Threads({ events, open, voice, onRecord, onError }: { events: PartnerEvent[]; open: PartnerThread[]; voice: boolean; onRecord: () => void; onError: (e: string) => void }) {
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
        const replies = list.filter((e) => e.direction === "in");
        const stands = !key
          ? plural(list.length, "message")
          : waits
            ? STATUS[waits.status]
            : replies.some((e) => e.priced)
              ? "quoted"
              : replies.some((e) => e.reply_kind === "declined")
                ? "declined"
                : replies.length
                  ? "answered"
                  : "never answered";
        const from = day(list[0].at);
        const to = day(list[list.length - 1].at);
        const unkept = list.filter((e) => !e.text && e.kind !== "call").length;
        return (
          <details key={key || "other"} className={`pt-thread${waits ? (yours(waits) ? " is-you" : " is-open") : ""}`} open={Boolean(waits) || threads.length === 1}>
            <summary>
              {waits && <Mark you={yours(waits)} />}
              <b lang="de">{key ? head.package || head.subject : "Other mail with this firm"}</b>
              <em className="tag">{stands}</em>
              <span lang="de">{key ? head.project : "not part of an inquiry"}</span>
              <span className="num pt-thread-when">{from === to ? from : `${from} to ${to}`}</span>
            </summary>
            <ol className="pt-talk">
              {list.map((e) => (
                <Entry key={e.id} e={e} voice={voice} onRecord={onRecord} onError={onError} />
              ))}
            </ol>
            {unkept > 0 && <p className="quiet pt-unkept">The text of {unkept === list.length ? (unkept === 1 ? "this message" : "these messages") : plural(unkept, "message")} was not kept.</p>}
          </details>
        );
      })}
    </div>
  );
}

function Prices({ rows, sub, who, onOpen }: { rows: PartnerPrice[]; sub?: boolean; who?: boolean; onOpen?: (id: string) => void }) {
  return (
    <table className="pt-prices">
      <thead>
        <tr>
          <th>{who ? "From" : sub ? "Work" : "Product"}</th>
          <th className="r">Net price</th>
          <th>Since last</th>
          <th>Quoted</th>
          <th>Valid until</th>
          <th>Terms</th>
          <th>For</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.fresh ? "" : "is-stale"}>
            <td lang="de">
              {who ? (
                <button className="text-link" onClick={() => onOpen?.(r.supplier_id)}>
                  {r.supplier}
                </button>
              ) : (
                <b>{r.label}</b>
              )}
              {r.product && r.product !== r.label && <small>{r.alternative ? "another product: " : ""}{r.product}</small>}
              {r.note && <small lang="en">{r.note}</small>}
            </td>
            <td className="r num">
              <b>{price(r.net)}</b>
              <small>per {r.unit || "unit"}</small>
            </td>
            <td className="num">
              {r.before?.change_pct != null ? (
                <span className={r.before.change_pct > 0 ? "pt-up" : ""} title={`${price(r.before.net)} on ${day(r.before.date)}`}>
                  {r.before.change_pct > 0 ? "+" : ""}
                  {pct.format(r.before.change_pct)} %
                </span>
              ) : (
                <span className="quiet">first</span>
              )}
            </td>
            <td className="num">
              {day(r.date)}
              <small>{r.via}</small>
            </td>
            <td className="num">
              {r.valid_until ? day(r.valid_until) : <span className="quiet">not stated</span>}
              {!r.fresh && <em className="tag">out of date</em>}
            </td>
            <td>
              {BASIS[r.basis]}
              <small>{BINDING[r.binding]}</small>
            </td>
            <td lang="de">
              {r.project}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const WHAT: Record<PartnerEvent["kind"], string> = { inquiry: "Inquiry", reminder: "Reminder", answer: "Our answer", call: "Call by Polier", reply: "Their reply", transcript: "What was said", mail: "E-mail" };

function Entry({ e, voice, onRecord, onError }: { e: PartnerEvent; voice: boolean; onRecord: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false);
  const call = e.kind === "call";
  return (
    <li className={e.direction === "in" ? "is-theirs" : "is-ours"}>
      <header>
        <b>{e.kind === "mail" ? (e.direction === "in" ? "Their e-mail" : "Our e-mail") : WHAT[e.kind]}</b>
        <span className="num">{day(e.at)}</span>
        {e.draft && <em className="tag">not sent</em>}
        {e.reply_kind && e.kind === "reply" && <em className="tag">{e.priced ? "with prices" : e.reply_kind}</em>}
        {!e.mail_id && <span lang="de">{e.subject}</span>}
        {call && voice && e.mail_id && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => (setBusy(true), fetchCallRecord(e.mail_id!).then(onRecord, (x) => onError(say(x))).finally(() => setBusy(false)))}
            title="Fetches what ElevenLabs kept of this call: who said what"
          >
            {busy ? "Fetching…" : "Fetch the record"}
          </button>
        )}
      </header>
      {e.summary && <p className="pt-talk-sum">{e.summary}</p>}
      {e.audio && e.mail_id && <audio controls preload="none" src={`/api/mails/${e.mail_id}/call-audio`} />}
      {e.text ? (
        <details>
          <summary lang="de">{e.text.replace(/\s+/g, " ").slice(0, 150)}</summary>
          <pre lang="de">{e.text}</pre>
        </details>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ coverage: what the tenders need, who can be asked */

const NEED: Record<PartnerNeed["firms"][number]["status"], string> = {
  unasked: "not asked yet",
  drafted: "written, not sent",
  sent: "asked, no reply yet",
  later: "promised for later",
  question: "asked something back",
  answered: "quote in",
  declined: "declined",
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Coverage({
  data,
  searches,
  searching,
  onOpen,
  onOpenTender,
  onFound,
  onSearch,
  onDecide,
  onChanged,
  onError,
}: {
  data: PartnersOverview;
  searches: PartnerSearch[];
  /** The package a web search is running for. */
  searching: string | null;
  onOpen: (id: string) => void;
  onOpenTender: (projectId: string, file: number) => void;
  onFound: () => void;
  onSearch: (need: PartnerNeed) => void;
  /** Take a firm a web search found into the directory, or pass. */
  onDecide: (search: PartnerSearch, n: number, take: boolean) => void;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [looking, setLooking] = useState<string | null>(null); // the gap whose web finds are open
  const [draft, setDraft] = useState<(Message & { key: string; pkg: string; supplier_id: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const write = (n: PartnerNeed, supplier_id: string) => {
    const key = `${n.project_id}|${n.file_name}|${n.package_id}|${supplier_id}`;
    setBusy(key);
    composeFollowUp({ project_id: n.project_id!, file: n.file_name, package: n.package_id, supplier_id }, "inquiry")
      .then((d) => setDraft({ key, pkg: n.package_id, supplier_id, kind: "inquiry", analysis_id: d.analysis_id, to: d.to, subject: d.subject, body: d.body, points: [] }), (e) => onError(say(e)))
      .finally(() => setBusy(null));
  };
  const send = (via: "smtp" | "draft") => {
    if (!draft) return;
    setSending(true);
    mailInquiry(draft.analysis_id, { package: draft.pkg, supplier_id: draft.supplier_id, to: draft.to, subject: draft.subject, body: draft.body, via, kind: "inquiry" })
      .then(() => (setDraft(null), onChanged()), (e) => onError(say(e)))
      .finally(() => setSending(false));
  };
  const inWork = data.needs.filter((n) => n.active);
  const [every, setEvery] = useState(inWork.length === 0);
  const names = useMemo(() => new Map(data.partners.map((p) => [p.id, p.name])), [data.partners]);
  const shown = every ? data.needs : inWork;
  const tenders = useMemo(() => {
    const by = new Map<string, PartnerNeed[]>();
    for (const n of shown) by.set(`${n.project_id}|${n.file}|${n.project}`, [...(by.get(`${n.project_id}|${n.file}|${n.project}`) ?? []), n]);
    return [...by.values()].sort((a, b) => Number(b[0].active) - Number(a[0].active) || a[0].project.localeCompare(b[0].project));
  }, [shown]);
  if (data.needs.length === 0)
    return <p className="pt-empty quiet">No tender has its packages worked out yet. Open an LV and its price inquiries: Polier groups the items into what is bought and what is subcontracted, and this page shows who can be asked for each.</p>;
  const firmsOf = (n: PartnerNeed) => n.firms.filter((f) => names.has(f.id));
  const count = (fits: (n: PartnerNeed) => boolean) => shown.filter(fits).length;
  const nobody = count((n) => firmsOf(n).length === 0);
  const quoted = count((n) => firmsOf(n).some((f) => f.status === "answered"));
  const you = count((n) => firmsOf(n).some((f) => f.status === "question" || f.status === "drafted"));
  const unasked = count((n) => firmsOf(n).length > 0 && firmsOf(n).every((f) => f.status === "unasked"));
  return (
    <section className="pt-wide">
      <h2>
        {plural(shown.length, "package")} in {plural(tenders.length, "tender")}
      </h2>
      <p className="quiet">
        What each tender needs bought or subcontracted, and which of your firms can be asked for it.{" "}
        {[quoted > 0 && `${quoted} with a quote in`, you > 0 && `${you} ${you === 1 ? "waits" : "wait"} for you`, unasked > 0 && `${unasked} not asked yet`, nobody > 0 && `${nobody} with nobody to ask`].filter(Boolean).join(", ")}.
      </p>
      <div className="pt-chips" role="group" aria-label="Show">
        <button aria-pressed={!every} disabled={inWork.length === 0} onClick={() => setEvery(false)} title="Tenders an inquiry has gone out for">
          Tenders in work <span className="num">{inWork.length}</span>
        </button>
        <button aria-pressed={every} onClick={() => setEvery(true)}>
          Every plan <span className="num">{data.needs.length}</span>
        </button>
        <button onClick={onFound} title="Every web search with its queries and what it found; look for something else; let Polier look on its own">
          Web searches <span className="num">{searches.length}</span>
        </button>
        <span className="pt-chips-note pt-key">
          <i className="pt-dot is-answered" /> quote in
          <i className="pt-dot is-sent" /> asked
          <i className="pt-dot is-question" /> your move
          <i className="pt-dot is-unasked" /> not asked
          <i className="pt-dot is-declined" /> declined
        </span>
      </div>
      {tenders.map((list) => {
        const t = list[0];
        return (
          <div key={`${t.project_id}|${t.file}|${t.project}`} className="pt-cov">
            <h3>
              <span lang="de">{t.project}</span>
              <small>
                {plural(list.length, "package")}, {plural(list.reduce((n, x) => n + x.items, 0), "item")}
              </small>
              {t.project_id && t.file !== null && (
                <button className="btn-ghost small" onClick={() => onOpenTender(t.project_id!, t.file!)}>
                  Open the price inquiries
                </button>
              )}
            </h3>
            <ul>
              {list.map((n) => {
                const firms = firmsOf(n);
                const found = searches.filter((s) => same(s.what, n.package)).reduce((k, s) => k + s.candidates.filter((c) => c.status === "new").length, 0);
                const quotes = firms.filter((f) => f.status === "answered").length;
                const gapKey = `${n.project_id}|${n.file_name}|${n.package_id}`;
                return (
                  <li key={n.package_id} className={firms.length === 0 ? "is-gap" : ""}>
                    <span>
                      <b lang="de">{n.package}</b>
                      <small>
                        {KIND[n.kind].toLowerCase()} · {plural(n.items, "item")}
                        {n.why && ` · ${n.why}`}
                      </small>
                    </span>
                    <span className="pt-cov-firms">
                      {firms.length === 0 ? (
                        <b className="pt-up">nobody to ask</b>
                      ) : (
                        firms.map((f) => (
                          <button key={f.id} onClick={() => onOpen(f.id)} title={`${names.get(f.id)}: ${NEED[f.status]}`}>
                            <i className={`pt-dot is-${f.status}`} />
                            {names.get(f.id)}
                            <small>{NEED[f.status]}</small>
                          </button>
                        ))
                      )}
                    </span>
                    <span className="pt-cov-stands">
                      {firms.length === 0 ? (
                        searching === n.package ? (
                          <span className="quiet">Polier is searching the web: about half a minute…</span>
                        ) : found > 0 ? (
                          <button className="btn-new small" aria-expanded={looking === gapKey} onClick={() => setLooking(looking === gapKey ? null : gapKey)}>
                            {looking === gapKey ? "Close" : `Look at the ${found} found on the web`}
                          </button>
                        ) : (
                          <button className="btn-ghost small" disabled={searching !== null} onClick={() => onSearch(n)} title="Claude searches the web and reports firms with the page each was found on: about half a minute and a few cents">
                            Search the web
                          </button>
                        )
                      ) : n.chosen ? (
                        <b>taken into the bid</b>
                      ) : quotes > 1 ? (
                        <>{quotes} quotes to compare</>
                      ) : quotes === 1 ? (
                        <>
                          1 quote in{firms.length === 1 ? <em className="tag">only one firm</em> : <small>{plural(firms.length - 1, "other")} still out</small>}
                        </>
                      ) : firms.some((f) => f.status === "question" || f.status === "drafted") ? (
                        <b>
                          <Mark you /> your move
                        </b>
                      ) : firms.every((f) => f.status === "unasked") ? (
                        <span className="quiet">not asked yet</span>
                      ) : firms.some((f) => f.status === "unasked") ? (
                        <>waiting, {plural(firms.filter((f) => f.status === "unasked").length, "firm")} not asked</>
                      ) : (
                        <>waiting for {firms.length === 1 ? "the firm" : "the firms"}</>
                      )}
                    </span>
                    {looking === gapKey && firms.length === 0 && (
                      <ul className="pt-cands pt-cov-ask">
                        {searches
                          .filter((sr) => same(sr.what, n.package))
                          .flatMap((sr) => sr.candidates.map((c, k) => ({ sr, c, k })))
                          .filter(({ c }) => c.status !== "dismissed")
                          .map(({ sr, c, k }) => (
                            <li key={`${sr.id}/${k}`} className={`is-${c.status}`}>
                              <div>
                                <b>{c.name}</b>
                                <span lang="de">{c.place}</span>
                                <p>{c.why}</p>
                                <p className="pt-src">
                                  Found on{" "}
                                  <a href={c.source_url} target="_blank" rel="noreferrer">
                                    {c.source_title || c.source_url}
                                  </a>
                                  {(c.email || c.phone) && <> · contact as the search reported it, to be checked on the page: {[c.email, c.phone].filter(Boolean).join(", ")}</>}
                                </p>
                              </div>
                              <div className="pt-cand-act">
                                {c.status === "added" ? (
                                  <button className="text-link" onClick={() => c.supplier_id && onOpen(c.supplier_id)}>
                                    Among your firms
                                  </button>
                                ) : (
                                  <>
                                    <button className="btn-ghost small" onClick={() => onDecide(sr, k, true)}>
                                      Add to your firms
                                    </button>
                                    <button className="text-link" onClick={() => onDecide(sr, k, false)}>
                                      Pass
                                    </button>
                                  </>
                                )}
                              </div>
                            </li>
                          ))}
                      </ul>
                    )}
                    {n.project_id &&
                      firms
                        .filter((f) => f.status === "unasked")
                        .map((f) => {
                          const key = `${n.project_id}|${n.file_name}|${n.package_id}|${f.id}`;
                          return draft?.key === key ? (
                            <div key={f.id} className="pt-cov-ask">
                              <DraftPanel draft={draft} sending={sending} onChange={setDraft} onSend={send} onDiscard={() => setDraft(null)} />
                            </div>
                          ) : (
                            <div key={f.id} className="pt-cov-ask">
                              <button className="btn-ghost small" disabled={busy !== null || draft !== null} onClick={() => write(n, f.id)} title="Polier writes the inquiry with the items of this package; you read it before it goes out">
                                {busy === key ? "Writing…" : `Write the inquiry to ${names.get(f.id)}`}
                              </button>
                            </div>
                          );
                        })}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
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

/** What the record says about how this firm answers, set against how long this conversation has waited. */
function habit(t: PartnerThread, c: PartnerCard | undefined): string {
  if (!c || t.status !== "sent") return "";
  const says: string[] = [];
  if (c.reply_hours !== null) {
    const usual = c.reply_hours / 24;
    const over = t.days !== null ? Math.floor(t.days - usual) : 0;
    says.push(`usually answers within ${took(c.reply_hours)}${over >= 1 ? `: ${plural(over, "day")} over` : ""}`);
  } else if (c.asked > 0) says.push("has not answered an inquiry yet");
  if (c.answer_rate !== null && c.answer_rate < 70 && c.asked > 1) says.push(`answers ${c.answer_rate} % of inquiries`);
  if (t.reminders > 0) says.push("a reminder went out already: a call may do more");
  return says.join(" · ");
}

function Waiting({
  rows,
  partners,
  voice,
  onOpen,
  onOpenTender,
  onChanged,
  onError,
}: {
  rows: PartnerThread[];
  partners: PartnerRow[];
  /** The voice agent is set up: a firm can be phoned from here. */
  voice: boolean;
  onOpen: (id: string) => void;
  onOpenTender: (projectId: string, file: number) => void;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [draft, setDraft] = useState<FollowDraft | null>(null);
  const [calling, setCalling] = useState<{ n: number; analysis_id: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  // your moves first, then what the earliest submission day presses, then what has waited longest
  const order = useMemo(
    () => [...rows].sort((a, b) => Number(yours(b)) - Number(yours(a)) || (a.due ?? "9").localeCompare(b.due ?? "9") || (b.days ?? 0) - (a.days ?? 0)),
    [rows],
  );
  if (rows.length === 0) return <p className="pt-empty quiet">Nothing is open with a supplier or subcontractor: every inquiry that went out has its answer.</p>;
  const you = rows.filter(yours).length;

  const write = (n: number, t: PartnerThread, kind: "reminder" | "answer") => {
    setBusy(n);
    composeFollowUp({ project_id: t.project_id!, file: t.file_name!, package: t.package_id!, supplier_id: t.supplier_id }, kind)
      .then((d) => setDraft({ n, kind, analysis_id: d.analysis_id, to: d.to, subject: d.subject, body: d.body, points: d.points ?? [] }), (e) => onError(say(e)))
      .finally(() => setBusy(null));
  };
  const phone = (n: number, t: PartnerThread) => {
    setBusy(n);
    findFollowUp({ project_id: t.project_id!, file: t.file_name!, package: t.package_id!, supplier_id: t.supplier_id })
      .then((d) => (setDraft(null), setCalling({ n, analysis_id: d.analysis_id })), (e) => onError(say(e)))
      .finally(() => setBusy(null));
  };
  const send = (t: PartnerThread, via: "smtp" | "draft") => {
    if (!draft) return;
    setSending(true);
    mailInquiry(draft.analysis_id, { package: t.package_id!, supplier_id: t.supplier_id, to: draft.to, subject: draft.subject, body: draft.body, via, kind: draft.kind })
      .then(() => (setDraft(null), onChanged()), (e) => onError(say(e)))
      .finally(() => setSending(false));
  };

  return (
    <section className="pt-wide">
      <h2>
        {plural(rows.length, "conversation")} open
      </h2>
      <p className="quiet">
        {you > 0 ? `${you} ${you === 1 ? "waits" : "wait"} for you (a question back, or a message written and not sent). ` : ""}
        The others wait for the firm. Polier writes the next message here; you read it, change it and send it. Nothing goes out on its own.
      </p>
      <ul className="pt-follow">
        {order.map((t, n) => {
          const can = Boolean(t.project_id && t.package_id && t.file_name) && !t.example;
          const left = t.due ? daysTo(t.due) : null;
          const firm = partners.find((p) => p.id === t.supplier_id);
          const says = habit(t, firm?.card);
          const mine = draft?.n === n ? draft : null;
          return (
            <li key={n} className={`${yours(t) ? "is-you" : ""}${mine ? " is-writing" : ""}`}>
              <div className="pt-follow-row">
                <span className="pt-follow-who">
                  <Mark you={yours(t)} /> {yours(t) ? "You" : "They"}
                </span>
                <span>
                  <button className="text-link" onClick={() => onOpen(t.supplier_id)}>
                    {t.supplier}
                  </button>
                  <small lang="de">{[t.package || t.subject, t.project].filter(Boolean).join(" · ")}</small>
                </span>
                <span>
                  {STATUS[t.status]}
                  {t.days !== null && (t.days === 0 ? ", today" : ` for ${plural(t.days, "day")}`)}
                  {t.asks > 0 && `: ${plural(t.asks, "question")}`}
                  <small>{[t.reminders > 0 && `reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`, t.calls > 0 && `phoned ${t.calls === 1 ? "once" : `${t.calls} times`}`, t.summary].filter(Boolean).join(" · ")}</small>
                  {says && <small className="pt-follow-habit">{says}</small>}
                </span>
                <span className="num">
                  {left === null ? (
                    <span className="quiet">no day in the tender</span>
                  ) : (
                    <>
                      <span className={left <= 3 ? "pt-up" : ""}>{left < 0 ? "submission is past" : left === 0 ? "submission today" : `submission in ${plural(left, "day")}`}</span>
                      <small>{day(t.due)}</small>
                    </>
                  )}
                </span>
                <span className="pt-follow-act">
                  {can && t.status === "question" && (
                    <button className="btn-new small" disabled={busy !== null || Boolean(mine)} onClick={() => write(n, t, "answer")} title="Polier answers from the LV: asks Claude, a few seconds, a few cents">
                      {busy === n ? "Writing the answer…" : "Write the answer"}
                    </button>
                  )}
                  {can && (t.status === "sent" || t.status === "later") && (
                    <button className="btn-ghost small" disabled={busy !== null || Boolean(mine)} onClick={() => write(n, t, "reminder")}>
                      {busy === n ? "Writing…" : "Write a reminder"}
                    </button>
                  )}
                  {can && voice && t.status !== "drafted" && !firm?.more.no_call && (
                    <button className="btn-ghost small" disabled={busy !== null || calling?.n === n} onClick={() => phone(n, t)} title="The voice agent phones the firm from this browser, says it is an AI and for whom it calls, and asks for the prices">
                      Let Polier phone
                    </button>
                  )}
                  {t.project_id && t.file !== null && (
                    <button className="text-link" onClick={() => onOpenTender(t.project_id!, t.file!)} title="The price inquiries of this tender: the whole conversation, the quote">
                      {t.status === "drafted" ? "Open the draft" : "Open the inquiry"}
                    </button>
                  )}
                  {t.example && <span className="quiet">an example: nothing to send</span>}
                </span>
              </div>
              {mine && <DraftPanel draft={mine} sending={sending} onChange={setDraft} onSend={(via) => send(t, via)} onDiscard={() => setDraft(null)} />}
              {calling?.n === n && (
                <div className="pt-follow-draft pt-follow-call">
                  <Suspense fallback={<p className="quiet">Getting the voice agent…</p>}>
                    <CallPanel analysisId={calling.analysis_id} pkg={t.package_id!} supplier={t.supplier_id} supplierName={t.supplier ?? ""} onDone={() => (setCalling(null), onChanged())} />
                  </Suspense>
                  <button className="text-link" onClick={() => setCalling(null)}>
                    Close
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ the price book */

/** Every firm's price for one thing on one line: a mark per quote, the lowest that holds in yellow, what is out
    of date hollow. The lowest quote stands at the left; a mark's distance from it is how many per cent it lies
    above, on one scale for the whole book (`full` per cent is the whole line), so a wide gap reads as wide. */
function Range({ offers, low, full }: { offers: PartnerPrice[]; low: number | null; full: number }) {
  const lo = Math.min(...offers.map((o) => o.net));
  const hi = Math.max(...offers.map((o) => o.net));
  const at = (v: number) => 4 + Math.min(1, lo > 0 ? ((v / lo - 1) * 100) / full : 0) * 92;
  return (
    <span className="pt-range" role="img" aria-label={hi === lo ? `one price level, ${price(lo)}` : `from ${price(lo)} to ${price(hi)}`}>
      {hi > lo && <u style={{ left: `${at(lo)}%`, width: `${at(hi) - at(lo)}%` }} />}
      {offers.map((o, i) => (
        <i key={i} className={!o.fresh ? "is-stale" : low !== null && o.net === low ? "is-low" : ""} style={{ left: `${at(o.net)}%` }} title={`${o.supplier ?? ""} ${price(o.net)}, ${day(o.date)}${o.fresh ? "" : ", out of date"}`} />
      ))}
    </span>
  );
}

type Shelf = "all" | "soon" | "holds" | "several" | "stale";

function PriceBook({ book, onOpen }: { book: PartnersOverview["book"]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState<Shelf>("all");
  const [grouped, setGrouped] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const fits: Record<Shelf, (b: PartnersOverview["book"][number]) => boolean> = {
    all: () => true,
    soon: (b) => b.offers.some((o) => o.fresh && o.valid_until !== null && daysTo(o.valid_until) <= 7),
    holds: (b) => b.low !== null,
    several: (b) => b.suppliers > 1,
    stale: (b) => b.low === null,
  };
  const rows = book
    .filter((b) => fits[shelf](b) && (!q || b.label.toLowerCase().includes(q) || b.offers.some((o) => (o.supplier ?? "").toLowerCase().includes(q) || o.product.toLowerCase().includes(q))))
    // what can be compared first, then what still has a price, then by name
    .sort((a, b) => Number(b.suppliers > 1) - Number(a.suppliers > 1) || Number(b.low !== null) - Number(a.low !== null) || a.label.localeCompare(b.label));
  // what a thing was last asked for: the package of a tender, or the tender alone where no package is on record
  const group = (b: PartnersOverview["book"][number]) => {
    const o = [...b.offers].sort((x, y) => y.date.localeCompare(x.date))[0];
    return [o.project, o.package].filter(Boolean).join(" · ") || "No tender on record";
  };
  const listed = grouped ? [...rows].sort((a, b) => group(a).localeCompare(group(b))) : rows;
  // the widest gap between the lowest and the highest quote of one thing, in per cent: the whole line of a range
  const full = Math.min(40, Math.max(5, Math.ceil(Math.max(0, ...book.map((b) => { const n = b.offers.map((o) => o.net); const lo = Math.min(...n); return lo > 0 ? (Math.max(...n) / lo - 1) * 100 : 0; })))));
  if (book.length === 0) return <p className="pt-empty quiet">No price on record yet. Every quote read in the price inquiries of a tender is kept here, per item, with who gave it and when.</p>;
  const shelves: [Shelf, string][] = [
    ["all", "All"],
    ["soon", "Runs out within 7 days"],
    ["holds", "A price holds"],
    ["several", "Two firms or more"],
    ["stale", "Nothing holds"],
  ];
  return (
    <section className="pt-wide">
      <h2>{book.length} things priced</h2>
      <p className="quiet">Every line of every quote, by what was priced. A supplier's price is the material part of a unit price, a subcontractor's the whole. Net as quoted: ex works and free to site are not evened out.</p>
      <div className="pt-chips" role="group" aria-label="Show">
        <input type="search" className="pt-search" placeholder="Find a product, a work, a firm" value={query} onChange={(e) => setQuery(e.target.value)} />
        {shelves.map(([s, label]) => (
          <button key={s} aria-pressed={shelf === s} onClick={() => setShelf(s)}>
            {label} <span className="num">{book.filter(fits[s]).length}</span>
          </button>
        ))}
        <button aria-pressed={grouped} onClick={() => setGrouped(!grouped)} title="Under the package of the tender each thing was last asked for">
          By package
        </button>
        <span className="pt-chips-note pt-key">
          <span className="pt-range is-key"><i className="is-low" style={{ left: "50%" }} /></span> lowest that holds
          <span className="pt-range is-key"><i style={{ left: "50%" }} /></span> holds
          <span className="pt-range is-key"><i className="is-stale" style={{ left: "50%" }} /></span> out of date
          <span className="pt-range-scale">the lowest stands left, a full line is +{full} %</span>
        </span>
      </div>
      {rows.length === 0 && <p className="quiet">Nothing here by that search.</p>}
      <ul className="pt-book">
        {listed.map((b, at) => {
          const key = `${b.label}|${b.unit}`;
          const shown = open === key;
          const head = grouped && (at === 0 || group(listed[at - 1]) !== group(b)) ? group(b) : null;
          const mixed = new Set(b.offers.filter((o) => o.fresh && o.basis !== "unknown").map((o) => o.basis)).size > 1;
          const fresh = b.offers.filter((o) => o.fresh);
          const best = b.low !== null ? fresh.find((o) => o.net === b.low) : undefined;
          // each other firm's lowest price that holds, against the lowest of all
          const others = [...new Map(fresh.filter((o) => o.supplier_id !== best?.supplier_id).sort((x, y) => y.net - x.net).map((o) => [o.supplier_id, o])).values()].sort((x, y) => x.net - y.net);
          const latest = [...b.offers].sort((x, y) => y.date.localeCompare(x.date))[0];
          return (
            <li key={key} className={shown ? "is-open" : ""}>
              {head && (
                <h3 lang="de">
                  {head} <small lang="en">{plural(listed.filter((x) => group(x) === head).length, "thing")}</small>
                </h3>
              )}
              <button onClick={() => setOpen(shown ? null : key)} aria-expanded={shown}>
                <b lang="de">{b.label}</b>
                <Range offers={b.offers} low={b.low} full={full} />
                <span className="num pt-book-low">
                  {b.low !== null ? (
                    <>
                      <b>{price(b.low)}</b> <small>per {b.unit || "unit"}</small>
                    </>
                  ) : (
                    <span className="quiet">none holds</span>
                  )}
                </span>
                <span className="pt-book-from">
                  {best ? (
                    <>
                      {best.supplier}
                      {best.basis !== "unknown" && <span className="quiet">, {BASIS[best.basis]}</span>}
                      {others.map((o) => (
                        <span key={o.supplier_id}>
                          {" "}· {o.supplier} <b className="num">+{pct.format(((o.net - b.low!) / b.low!) * 100)} %</b>
                        </span>
                      ))}
                      {others.length === 0 && b.offers.length > 1 && <span className="quiet"> · {plural(b.offers.length, "quote")}</span>}
                      {mixed && others.length > 0 && (
                        <em className="tag" title="One price is ex works (freight comes on top), another free to site: the gap between them is not the whole difference">
                          terms differ
                        </em>
                      )}
                    </>
                  ) : (
                    <span className="quiet">
                      {plural(b.offers.length, "price")} from {plural(b.suppliers, "firm")}, the latest {price(latest.net)} of {day(latest.date)}
                    </span>
                  )}
                </span>
              </button>
              {shown && <Prices rows={b.offers} who onOpen={onOpen} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ found on the web */

function Discovered({
  data,
  searches,
  onSearches,
  onChanged,
  onOpen,
  onError,
}: {
  data: PartnersOverview;
  searches: PartnerSearch[];
  onSearches: (s: PartnerSearch[]) => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
  onError: (e: string) => void;
}) {
  const [what, setWhat] = useState("");
  const [kind, setKind] = useState<Supplier["kind"]>("supplier");
  const [region, setRegion] = useState(data.discovery.region || data.company.place);
  const [busy, setBusy] = useState<string | null>(null);
  const [auto, setAuto] = useState(data.discovery);
  const latest = useRef(searches);
  latest.current = searches;

  const look = (w: string, k: Supplier["kind"], projectId?: string | null) => {
    setBusy(w);
    discoverPartners(w, k, region.trim(), projectId)
      .then((s) => onSearches([s, ...latest.current]), (e) => onError(say(e)))
      .finally(() => setBusy(null));
  };
  const decide = (s: PartnerSearch, n: number, take: boolean) =>
    decideCandidate(s.id, n, take).then((next) => (onSearches(latest.current.map((x) => (x.id === next.id ? next : x))), take && onChanged()), (e) => onError(say(e)));
  const setting = (values: Partial<PartnersOverview["discovery"]>) => saveDiscovery(values).then(setAuto, (e) => onError(say(e)));

  return (
    <div className="pt-two pt-found">
      <aside className="pt-look">
        <h3>Look for</h3>
        <form onSubmit={(e) => (e.preventDefault(), what.trim().length > 2 && look(what.trim(), kind))}>
          <input type="text" lang="de" placeholder="PE-Rohre, Schachtbauwerke, Asphaltarbeiten …" value={what} onChange={(e) => setWhat(e.target.value)} />
          <Select value={kind} options={[{ value: "supplier", label: "Suppliers of it" }, { value: "subcontractor", label: "Subcontractors for it" }]} onChange={setKind} aria-label="Kind of firm" />
          <input type="text" lang="de" placeholder="Region: Hamburg, Raum Kiel …" value={region} onChange={(e) => setRegion(e.target.value)} onBlur={() => region.trim() !== auto.region && void setting({ region: region.trim() })} />
          <button className="btn-new" disabled={busy !== null || what.trim().length < 3}>
            {busy !== null ? "Searching the web…" : "Search the web"}
          </button>
          <small>Claude searches and reports the firms with the page each was found on: about half a minute and a few cents.</small>
        </form>

        <h3>Nobody to ask</h3>
        {data.gaps.length === 0 ? (
          <p className="quiet">Every package of every plan has a firm to ask.</p>
        ) : (
          <ul className="pt-gaps">
            {data.gaps.map((g) => (
              <li key={g.what}>
                <b lang="de">{g.what}</b>
                <span>
                  {KIND[g.kind].toLowerCase()} · <span lang="de">{g.project}</span>
                </span>
                <button className="btn-ghost small" disabled={busy !== null} onClick={() => look(g.what, g.kind, g.project_id)}>
                  {busy === g.what ? "Searching…" : "Search"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3>On its own</h3>
        <label className="check pt-auto">
          <input type="checkbox" checked={auto.auto} onChange={(e) => void setting({ auto: e.target.checked })} />
          Polier looks for a package with nobody to ask
        </label>
        <p className="quiet">
          Every{" "}
          <input
            className="pt-days"
            type="text"
            inputMode="numeric"
            defaultValue={auto.every_days}
            aria-label="Days between searches for the same thing"
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n !== auto.every_days) void setting({ every_days: n });
            }}
          />{" "}
          days at most for the same thing, two searches a pass. What it finds waits here like any other result.
        </p>
        <p className="pt-note">A firm found is a candidate. You take it among your firms or pass; the app writes to nobody on its own, and the first inquiry to a new firm goes out from you.</p>
      </aside>

      <section className="pt-searches">
        {busy !== null && (
          <article className="pt-search-card is-running">
            <header>
              <b lang="de">{busy}</b>
              <span>Polier is searching the web…</span>
            </header>
          </article>
        )}
        {searches.length === 0 && busy === null && <p className="pt-empty quiet">No search yet. Look for a material group or a trade at the left; every search stays here with its queries and what it found.</p>}
        {searches.map((s) => (
          <article key={s.id} className="pt-search-card">
            <header>
              <b lang="de">{s.what}</b>
              <em className="tag">{KIND[s.kind]}s</em>
              <em className={`tag${s.by === "polier" ? " pt-by" : ""}`}>{s.by === "polier" ? "Polier, on its own" : "you asked"}</em>
              <span>
                {day(s.created)} · {s.region || "no region"} · {s.candidates.length} found{s.usd !== null && ` · $${s.usd.toFixed(2)}`}
              </span>
            </header>
            {s.reason && s.reason !== "asked for" && <p className="quiet">Why: {s.reason}</p>}
            {s.queries.length > 0 && (
              <p className="pt-queries" lang="de">
                <span lang="en">Searched</span>
                {s.queries.map((q, i) => (
                  <q key={i}>{q}</q>
                ))}
              </p>
            )}
            {s.note && <p className="quiet">{s.note}</p>}
            <ul className="pt-cands">
              {s.candidates.map((c, n) => (
                <li key={n} className={`is-${c.status}`}>
                  <div>
                    <b>{c.name}</b>
                    <span lang="de">{c.place}</span>
                    <span className="pt-sells" lang="de">
                      {c.sells.map((w) => (
                        <em key={w} className="tag">
                          {w}
                        </em>
                      ))}
                    </span>
                    <p>{c.why}</p>
                    <p className="pt-src">
                      Found on{" "}
                      <a href={c.source_url} target="_blank" rel="noreferrer">
                        {c.source_title || c.source_url}
                      </a>
                      {(c.email || c.phone) && (
                        <>
                          {" "}
                          · contact as the search reported it, to be checked on the page: {[c.email, c.phone].filter(Boolean).join(", ")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="pt-cand-act">
                    {c.status === "added" ? (
                      <button className="text-link" onClick={() => c.supplier_id && onOpen(c.supplier_id)}>
                        Among your firms
                      </button>
                    ) : (
                      <>
                        <button className="btn-ghost small" disabled={c.status === "dismissed"} onClick={() => void decide(s, n, true)}>
                          Add to your firms
                        </button>
                        <button className="text-link" onClick={() => void decide(s, n, false)}>
                          {c.status === "dismissed" ? "Passed · take back" : "Pass"}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ the firm itself, and the mail history */

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
  return (
    <section className="pt-wide pt-firm">
      <h2>Your firm</h2>
      <p className="quiet">Every inquiry says who is asking and for which job: a supplier gives an unknown caller the list price, or nothing.</p>
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
          <label key={key}>
            <span>{label}</span>
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

      <h2>The mail you have already exchanged</h2>
      <p className="quiet">
        Older mail with one of your firms shows in its conversations and is what Polier reads its way of writing from. A message goes to the firm whose address it is from or to; the mailbox is only read, never changed.
      </p>
      <div className="pt-acts">
        <button className="btn-ghost" disabled={busy || !data.inbox} onClick={() => history(readMailboxHistory)} title={data.inbox ? `Reads ${data.inbox}: inbox and sent mail of the last two years, per partner address` : "No inbox is set (IMAP_HOST in .env)"}>
          {busy ? "Reading…" : data.inbox ? `Read ${data.inbox}` : "No mailbox set"}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => files.current?.click()}>
          Hand over saved e-mails (.eml)
        </button>
        <input ref={files} type="file" accept=".eml" multiple hidden onChange={(e) => (history(() => handOverMessages([...(e.target.files ?? [])])), (e.target.value = ""))} />
      </div>
      {read && (
        <div className="pt-read">
          <p>
            <b>{read.kept}</b> message{read.kept === 1 ? "" : "s"} put to {read.kept === 1 ? "its firm" : "their firms"}
            {read.known > 0 && `, ${read.known} already in a conversation`}
            {read.looked !== undefined && `, ${read.looked} addresses looked for`}.
          </p>
          {read.unknown.length > 0 && (
            <>
              <p className="quiet">From addresses that belong to none of your firms. Add the firm, then hand the messages over again:</p>
              <ul>
                {read.unknown.map((u) => (
                  <li key={u.email}>
                    <b>{u.name}</b> <span>{u.email}</span> <span className="quiet">{u.messages} message{u.messages === 1 ? "" : "s"}</span>
                    <button className="btn-ghost small" onClick={() => saveSupplier({ name: u.name, email: u.email, kind: "supplier" }).then(() => (setRead({ ...read, unknown: read.unknown.filter((x) => x.email !== u.email) }), onChanged()), (e) => onError(say(e)))}>
                      Add to your firms
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <h2>Examples</h2>
      <p className="quiet">
        Six made-up firms with mail, quotes and prices over a year, to see the page with a history. Everything of theirs is marked "example", their addresses reach nobody, and an example price never prices a real item.
      </p>
      <div className="pt-acts">
        <button className="btn-ghost" onClick={() => putExamples(!examples).then(onChanged, (e) => onError(say(e)))}>
          {examples ? "Take the examples out" : "Put the examples in"}
        </button>
      </div>
    </section>
  );
}
