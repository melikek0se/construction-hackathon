/* Partners: the suppliers and subcontractors the firm asks for prices, and everything Polier knows about each.

   A page of its own (/partners), not a dialog. Six tabs: the two kinds of firm (a list at the left, the open
   firm at the right: what is open with it, how it behaves, its prices with their dates, its usual terms, how
   it writes, every message and call), what waits across all tenders, the price book, what the web search
   found, and the firm's own particulars. Server side: src/boq/partners.py. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  decideCandidate,
  discoverPartners,
  fetchCallRecord,
  getPartner,
  getPartners,
  handOverMessages,
  listPartnerSearches,
  putExamples,
  readMailboxHistory,
  readPartnerStyle,
  removeSupplier,
  saveCompany,
  saveDiscovery,
  saveSupplier,
  takeWarmPartners,
  type HistoryRead,
} from "./api";
import { Select } from "./controls";
import type { PartnerTab, PartnersPlace } from "./router";
import type { Company, PartnerEvent, PartnerPrice, PartnerProfile, PartnerRow, PartnerSearch, PartnerThread, PartnersOverview, Supplier, SupplierMore } from "./types";
import "./partners.css";

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const words = (text: string) => text.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "–");
const money = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (n: number) => `${money.format(n)} €`;
const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const took = (h: number | null) => (h === null ? "–" : h < 36 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const KIND: Record<Supplier["kind"], string> = { supplier: "Supplier", subcontractor: "Subcontractor" };
const SOURCE: Record<Supplier["source"], string> = { user: "entered", quote: "from a quote", web: "found on the web", demo: "example" };
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
  { id: "suppliers", label: "Suppliers" },
  { id: "subcontractors", label: "Subcontractors" },
  { id: "waiting", label: "Waiting" },
  { id: "prices", label: "Price book" },
  { id: "discovered", label: "Found on the web" },
  { id: "firm", label: "Your firm" },
];

/** Whose move: a yellow square is the estimator's, an open one the partner's (the marks of the board cards). */
const Mark = ({ you }: { you: boolean }) => <i className={`pt-mark${you ? " is-you" : ""}`} aria-label={you ? "Your move" : "Their move"} />;

export function PartnersPage({
  place,
  onPlace,
  onOpenTender,
  onChanged,
}: {
  place: PartnersPlace;
  onPlace: (place: PartnersPlace) => void;
  /** Opens the price inquiries of a tender's file. */
  onOpenTender: (projectId: string, file: number) => void;
  onChanged: () => void;
}) {
  // the copy read in the background after the projects page stood, if there is one; read again right away
  const [data, setData] = useState<PartnersOverview | null>(takeWarmPartners);
  const [searches, setSearches] = useState<PartnerSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  // the first time the directory is there, its rows come in one after the other (partners.css, `pt-fresh`)
  const [fresh, setFresh] = useState(false);
  const shown = useRef(false);
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

  const directory = place.tab === "suppliers" || place.tab === "subcontractors";
  const kind: Supplier["kind"] = place.tab === "subcontractors" ? "subcontractor" : "supplier";
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.partners ?? []).filter(
      (p) => p.kind === kind && (!q || [p.name, p.place, ...p.groups, ...p.products.map((x) => x.name)].some((t) => t.toLowerCase().includes(q))),
    );
  }, [data, kind, query]);
  // a firm opened by its address shows under its own kind
  useEffect(() => {
    const open = place.partner && data?.partners.find((p) => p.id === place.partner);
    if (open && directory && open.kind !== kind) onPlace({ tab: open.kind === "supplier" ? "suppliers" : "subcontractors", partner: open.id });
  }, [data, place.partner, directory, kind, onPlace]);

  const count = (tab: PartnerTab) =>
    !data
      ? null
      : tab === "suppliers"
        ? data.partners.filter((p) => p.kind === "supplier").length
        : tab === "subcontractors"
          ? data.partners.filter((p) => p.kind === "subcontractor").length
          : tab === "waiting"
            ? data.waiting.length
            : tab === "prices"
              ? data.book.length
              : tab === "discovered"
                ? (searches ?? []).reduce((n, s) => n + s.candidates.filter((c) => c.status === "new").length, 0)
                : null;
  const openPartner = (id: string) => {
    const p = data?.partners.find((x) => x.id === id);
    onPlace({ tab: p?.kind === "subcontractor" ? "subcontractors" : "suppliers", partner: id });
  };

  return (
    <div className={`pt${fresh ? " pt-fresh" : ""}`}>
      <div className="pt-tabs">
        <div className="views" role="tablist" aria-label="Partners">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={place.tab === t.id} onClick={() => onPlace({ tab: t.id, partner: null })}>
              {t.label}
              {count(t.id) !== null && <span className={`pt-count${t.id === "waiting" && data?.waiting.some(yours) ? " is-you" : ""}`}>{count(t.id)}</span>}
            </button>
          ))}
        </div>
        {directory && (
          <>
            <input type="search" className="pt-search" placeholder={`Find a ${KIND[kind].toLowerCase()}, a material, a place`} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn-ghost" onClick={() => onPlace({ tab: "discovered", partner: null })}>
              Find on the web
            </button>
            <button className="btn-new" onClick={() => setAdding(true)}>
              Add a {KIND[kind].toLowerCase()}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="q-error pt-error">
          {error}{" "}
          <button className="text-link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {!data ? (
        <p className="pt-empty quiet">Reading the directory…</p>
      ) : directory ? (
        <div className="pt-two">
          <List
            rows={rows}
            kind={kind}
            total={data.partners.length}
            open={place.partner}
            adding={adding}
            onAdded={(id) => (setAdding(false), void changed(), onPlace({ tab: place.tab, partner: id }))}
            onCancelAdd={() => setAdding(false)}
            onOpen={(id) => onPlace({ tab: place.tab, partner: id })}
            onExamples={() => putExamples(true).then(changed, (e) => setError(say(e)))}
            onError={setError}
          />
          {place.partner ? (
            <Profile key={place.partner} id={place.partner} voice={data.voice} onChanged={changed} onGone={() => (onPlace({ tab: place.tab, partner: null }), void changed())} onOpenTender={onOpenTender} onError={setError} />
          ) : (
            <Summary data={data} kind={kind} onOpen={openPartner} onTab={(tab) => onPlace({ tab, partner: null })} />
          )}
        </div>
      ) : place.tab === "waiting" ? (
        <Waiting rows={data.waiting} onOpen={openPartner} onOpenTender={onOpenTender} />
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

/* ------------------------------------------------------------------ the list */

function List({
  rows,
  kind,
  total,
  open,
  adding,
  onAdded,
  onCancelAdd,
  onOpen,
  onExamples,
  onError,
}: {
  rows: PartnerRow[];
  kind: Supplier["kind"];
  total: number;
  open: string | null;
  adding: boolean;
  onAdded: (id: string) => void;
  onCancelAdd: () => void;
  onOpen: (id: string) => void;
  onExamples: () => void;
  onError: (e: string) => void;
}) {
  const [fresh, setFresh] = useState({ name: "", email: "", groups: "" });
  const add = () =>
    saveSupplier({ name: fresh.name.trim(), kind, email: fresh.email.trim(), groups: words(fresh.groups) }).then(
      (s) => (setFresh({ name: "", email: "", groups: "" }), onAdded(s.id)),
      (e) => onError(say(e)),
    );
  return (
    <nav className="pt-list" aria-label={`${KIND[kind]}s`}>
      {adding && (
        <form className="pt-add" onSubmit={(e) => (e.preventDefault(), fresh.name.trim() && void add())}>
          <b>New {KIND[kind].toLowerCase()}</b>
          <input type="text" autoFocus placeholder="Name of the firm" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
          <input type="text" placeholder="E-mail for inquiries" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} />
          <input type="text" lang="de" placeholder={kind === "supplier" ? "Sells: Rohre, Armaturen …" : "Does: Asphaltarbeiten, Markierung …"} value={fresh.groups} onChange={(e) => setFresh({ ...fresh, groups: e.target.value })} />
          <div>
            <button className="btn-new" disabled={!fresh.name.trim()}>
              Add
            </button>
            <button type="button" className="btn-ghost" onClick={onCancelAdd}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {rows.length === 0 && !adding && (
        <div className="pt-none">
          <p>No {KIND[kind].toLowerCase()} here{total ? " by that search" : " yet"}.</p>
          {total === 0 && (
            <>
              <p className="quiet">An LV does not say who sells a product. The directory fills from what you enter, from the quotes that come in and from what the web search finds.</p>
              <button className="btn-ghost" onClick={onExamples}>
                Put in six example firms with a history
              </button>
            </>
          )}
        </div>
      )}
      {rows.map((p) => {
        const c = p.card;
        const move = c.open.some(yours);
        return (
          <button key={p.id} className={`pt-row${open === p.id ? " is-open" : ""}${p.more.blocked ? " is-blocked" : ""}`} aria-current={open === p.id} onClick={() => onOpen(p.id)}>
            <span className="pt-row-name">
              <b>{p.name}</b>
              {p.more.preferred && <em className="tag pt-pref">preferred</em>}
              {p.more.blocked && <em className="tag">not asked</em>}
              {p.more.example ? <em className="tag">example</em> : p.source === "web" && <em className="tag">web</em>}
            </span>
            <span className="pt-row-sub" lang="de">
              {[p.place, p.groups.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || "nothing entered yet"}
            </span>
            <span className="pt-row-facts">
              {c.open.length > 0 && (
                <span>
                  <Mark you={move} />
                  {move ? "your move" : `${c.open.length} open`}
                </span>
              )}
              {c.asked > 0 ? (
                <span title="Inquiries answered, of those sent">
                  answers <b className="num">{c.answer_rate} %</b>
                  {c.reply_hours !== null && <> in <b className="num">{took(c.reply_hours)}</b></>}
                </span>
              ) : (
                <span className="quiet">never asked</span>
              )}
              {c.latest_price && (
                <span title={c.stale ? `${c.stale} of ${c.prices} prices are out of date` : "All prices still hold"}>
                  price <b className="num">{day(c.latest_price)}</b>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ nobody open: the directory at a glance */

function Summary({ data, kind, onOpen, onTab }: { data: PartnersOverview; kind: Supplier["kind"]; onOpen: (id: string) => void; onTab: (tab: PartnerTab) => void }) {
  const mine = data.partners.filter((p) => p.kind === kind);
  const cover = data.coverage.filter((c) => c.kind === kind);
  const gaps = data.gaps.filter((g) => g.kind === kind);
  const waiting = data.waiting.filter((w) => mine.some((p) => p.id === w.supplier_id));
  const asked = mine.reduce((n, p) => n + p.card.asked, 0);
  const answered = mine.reduce((n, p) => n + p.card.answered, 0);
  const stale = mine.reduce((n, p) => n + p.card.stale, 0);
  const prices = mine.reduce((n, p) => n + p.card.prices, 0);
  return (
    <section className="pt-profile pt-summary">
      <h2>{KIND[kind]}s at a glance</h2>
      <p className="quiet">Pick a firm at the left for its prices, its conversations and how it writes.</p>
      <dl className="pt-figures">
        <Figure n={mine.length} label="in the directory" />
        <Figure n={asked ? `${Math.round((answered / asked) * 100)} %` : "–"} label={`of ${asked} inquiries answered`} />
        <Figure n={prices} label={`prices on record${stale ? `, ${stale} out of date` : ""}`} />
        <Figure n={waiting.length} label="conversations open" />
      </dl>
      {waiting.length > 0 && (
        <>
          <h3>
            Open now <button className="text-link" onClick={() => onTab("waiting")}>all that waits</button>
          </h3>
          <ul className="pt-open">
            {waiting.slice(0, 6).map((w, i) => (
              <li key={i}>
                <Mark you={yours(w)} />
                <button className="text-link" onClick={() => onOpen(w.supplier_id)}>
                  {w.supplier}
                </button>
                <span>
                  {STATUS[w.status]}
                  {w.days !== null && `, ${w.days} day${w.days === 1 ? "" : "s"}`} · <span lang="de">{w.package || w.project}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Who covers what</h3>
      {gaps.length > 0 && (
        <ul className="pt-gaps">
          {gaps.map((g) => (
            <li key={g.what}>
              <b lang="de">{g.what}</b>
              <span>
                nobody to ask · {g.items} item{g.items === 1 ? "" : "s"} in <span lang="de">{g.project}</span>
              </span>
              <button className="btn-ghost small" onClick={() => onTab("discovered")}>
                Look on the web
              </button>
            </li>
          ))}
        </ul>
      )}
      {cover.length === 0 ? (
        <p className="quiet">Nothing entered yet: say what each firm sells or does, and Polier picks whom to ask by it.</p>
      ) : (
        <ul className="pt-cover">
          {cover.map((c) => (
            <li key={c.group} className={c.partners.length === 1 ? "is-thin" : ""}>
              <b lang="de">{c.group}</b>
              <span>
                {c.partners.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <button className="text-link" onClick={() => onOpen(p.id)}>
                      {p.name}
                    </button>
                  </span>
                ))}
              </span>
              {c.partners.length === 1 && <em className="tag">only one</em>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const Figure = ({ n, label }: { n: ReactNode; label: string }) => (
  <div>
    <dt>{label}</dt>
    <dd className="num">{n}</dd>
  </div>
);

/* ------------------------------------------------------------------ one firm */

function Profile({
  id,
  voice,
  onChanged,
  onGone,
  onOpenTender,
  onError,
}: {
  id: string;
  voice: boolean;
  onChanged: () => void;
  onGone: () => void;
  onOpenTender: (projectId: string, file: number) => void;
  onError: (e: string) => void;
}) {
  const [p, setP] = useState<PartnerProfile | null>(null);
  const [reading, setReading] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dropping, setDropping] = useState(false);
  const load = useCallback(() => getPartner(id).then(setP, (e) => onError(say(e))), [id, onError]);
  useEffect(() => void load(), [load]);

  if (!p) return <section className="pt-profile"><p className="quiet">Reading…</p></section>;

  const save = (values: Partial<Supplier>) => saveSupplier(values, p.id).then(() => (void load(), onChanged()), (e) => onError(say(e)));
  const more = (values: Partial<SupplierMore>) => save({ more: values as SupplierMore });
  const text = (key: "name" | "contact" | "email" | "phone" | "place" | "note") => (e: { target: { value: string } }) => {
    const v = e.target.value.trim();
    if (v !== p[key] && (key !== "name" || v)) void save({ [key]: v });
  };
  const extra = (key: "website" | "customer_no") => (e: { target: { value: string } }) => e.target.value.trim() !== p.more[key] && void more({ [key]: e.target.value.trim() });
  const style = p.more.style;
  const c = p.card;
  const theirs = p.timeline.filter((e) => e.direction === "in" && e.kind !== "transcript").length;
  const readStyle = () => {
    setReading(true);
    readPartnerStyle(p.id)
      .then(() => (void load(), onChanged()), (e) => onError(say(e)))
      .finally(() => setReading(false));
  };
  const drop = (files: File[]) =>
    handOverMessages(files.filter((f) => f.name.toLowerCase().endsWith(".eml"))).then(
      (r) => (void load(), onChanged(), r.kept === 0 && onError(`None of these messages is from or to an address of ${p.name}${r.known ? ` (${r.known} are in a conversation already)` : ""}.`)),
      (e) => onError(say(e)),
    );

  return (
    <section
      className={`pt-profile${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && (e.preventDefault(), e.stopPropagation(), setDropping(true))}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setDropping(false), void drop([...e.dataTransfer.files]))}
    >
      <header className="pt-head">
        <div>
          <input key={p.name} className="pt-name" defaultValue={p.name} aria-label="Name" onBlur={text("name")} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          <p className="pt-head-sub">
            <em className="tag">{KIND[p.kind]}</em>
            <em className="tag">{p.more.example ? "example" : SOURCE[p.source]}</em>
            {c.last_contact ? <span>last contact {day(c.last_contact)}</span> : <span>no contact on record</span>}
            <span>in the directory since {day(p.created)}</span>
          </p>
        </div>
        <div className="pt-flags">
          <label className="check" title="Asked first where several fit">
            <input type="checkbox" checked={p.more.preferred} onChange={(e) => void more({ preferred: e.target.checked })} /> Preferred
          </label>
          <label className="check" title="Stays in the directory with its prices, but Polier does not put it on an inquiry">
            <input type="checkbox" checked={p.more.blocked} onChange={(e) => void more({ blocked: e.target.checked })} /> Do not ask
          </label>
          <label className="check" title="The voice agent does not phone this firm">
            <input type="checkbox" checked={p.more.no_call} onChange={(e) => void more({ no_call: e.target.checked })} /> Do not phone
          </label>
          <button className={`btn-ghost small${armed ? " armed" : ""}`} onBlur={() => setArmed(false)} onClick={() => (armed ? removeSupplier(p.id).then(onGone, (e) => onError(say(e))) : setArmed(true))}>
            {armed ? "Remove for good?" : "Remove"}
          </button>
        </div>
      </header>
      {p.more.example && <p className="pt-note">An example: this firm, its mail and its prices are made up, to show the page with a history. They never price a real item. Take them out under "Your firm".</p>}
      {p.more.found && (
        <p className="pt-note">
          Found on the web on {day(p.more.found.at)} while looking for <span lang="de">„{p.more.found.what}“</span>:{" "}
          <a href={p.more.found.url} target="_blank" rel="noreferrer">
            {p.more.found.title || p.more.found.url}
          </a>
          . {p.more.found.why} Check the contact on its page before the first inquiry goes out; Polier writes to nobody on its own.
        </p>
      )}

      {c.open.length > 0 && (
        <div className="pt-block">
          <h3>Open with {p.name}</h3>
          <ul className="pt-open">
            {c.open.map((t, i) => (
              <li key={i}>
                <Mark you={yours(t)} />
                <b>{yours(t) ? "Your move" : "Their move"}</b>
                <span>
                  {STATUS[t.status]}
                  {t.days !== null && ` for ${t.days} day${t.days === 1 ? "" : "s"}`}
                  {t.reminders > 0 && `, reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`} · <span lang="de">{[t.package, t.project].filter(Boolean).join(" · ")}</span>
                  {t.summary && <small>{t.summary}</small>}
                </span>
                {t.project_id && t.file !== null && (
                  <button className="btn-ghost small" onClick={() => onOpenTender(t.project_id!, t.file!)}>
                    Open the inquiry
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="pt-figures">
        <Figure n={c.asked} label="times asked" />
        <Figure n={c.answer_rate === null ? "–" : `${c.answer_rate} %`} label="answered" />
        <Figure n={took(c.reply_hours)} label="to the first reply (median)" />
        <Figure n={c.quotes} label={`quotes${c.declined ? `, ${c.declined} declined` : ""}`} />
        <Figure n={c.taken} label="times taken" />
        <Figure n={c.reminders} label={`reminders${c.calls ? `, ${c.calls} call${c.calls === 1 ? "" : "s"}` : ""}`} />
      </dl>

      <div className="pt-cols">
        <div className="pt-block">
          <h3>Particulars</h3>
          <div className="pt-fields" key={p.id}>
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
            <label>
              <span>Web page</span>
              <input type="text" defaultValue={p.more.website} onBlur={extra("website")} />
            </label>
            <label>
              <span>Our customer number there</span>
              <input type="text" defaultValue={p.more.customer_no} onBlur={extra("customer_no")} />
            </label>
            <label className="wide">
              <span>{p.kind === "supplier" ? "Sells" : "Does"}</span>
              <input type="text" lang="de" defaultValue={p.groups.join(", ")} onBlur={(e) => e.target.value.trim() !== p.groups.join(", ") && void save({ groups: words(e.target.value) })} />
              <small>Material groups or trades, in your words. Polier picks whom to ask by these and by what was quoted before.</small>
            </label>
            <label className="wide">
              <span>Note</span>
              <input type="text" defaultValue={p.note} onBlur={text("note")} />
            </label>
          </div>
          {p.more.contacts.length > 0 && (
            <p className="pt-contacts">
              <span>Also</span>
              {p.more.contacts.map((x, i) => (
                <span key={i}>
                  {x.name}
                  {x.role && ` (${x.role})`}
                  {x.email && `, ${x.email}`}
                </span>
              ))}
            </p>
          )}
          {p.products.length > 0 && (
            <p className="pt-products" lang="de">
              <span lang="en">Offered before</span>
              {p.products.map((x) => (
                <em key={x.name} className="tag">
                  {x.name}
                </em>
              ))}
            </p>
          )}
        </div>
        <div className="pt-block">
          <h3>Usual terms {p.usual && <small>from {p.usual.quotes} quote{p.usual.quotes === 1 ? "" : "s"}</small>}</h3>
          {p.usual ? (
            <dl className="pt-terms">
              <dt>Prices</dt>
              <dd>{p.usual.basis ? BASIS[p.usual.basis] : "not stated"}{p.usual.freight !== null && `, freight about ${price(p.usual.freight)}`}</dd>
              <dt>Discount</dt>
              <dd>{p.usual.discount_pct !== null ? `${pct.format(p.usual.discount_pct)} % on all items` : "none stated"}</dd>
              <dt>Payment</dt>
              <dd lang="de">{p.usual.skonto || "–"}</dd>
              <dt>Valid for</dt>
              <dd>{p.usual.valid_days !== null ? `about ${p.usual.valid_days} days` : "not stated"}</dd>
              <dt>Binding</dt>
              <dd>{p.usual.binding ? BINDING[p.usual.binding] : "not stated"}</dd>
            </dl>
          ) : (
            <p className="quiet">No quote from this firm yet, so nothing is known about its terms.</p>
          )}
          {p.kind === "subcontractor" && <Documents list={p.more.documents} onSave={(documents) => void more({ documents })} />}
        </div>
      </div>

      <div className="pt-block pt-style">
        <h3>
          How they write
          {style && <small>read from {style.messages} of their messages on {day(style.at)}</small>}
          <button className="btn-ghost small" disabled={reading || theirs === 0} onClick={readStyle} title={theirs === 0 ? "There is no message from this firm yet" : "Asks Claude: a few seconds, a few cents"}>
            {reading ? "Reading their messages…" : style ? "Read again" : "Read their style"}
          </button>
        </h3>
        {style ? (
          <>
            <p className="pt-style-sum">{style.summary}</p>
            <dl className="pt-traits">
              <Trait label="Addresses us with" value={style.address === "unknown" ? "not shown" : style.address} quote={style.address_quote} />
              <Trait label="Opens with" value={style.salutation || "no salutation"} de />
              <Trait label="Closes with" value={style.closing || "no closing"} de />
              <Trait label="Tone" value={`${style.register}, ${style.length} messages`} />
              <Trait label="Prices arrive as" value={style.answers_with} />
              <Trait label="Who writes" value={style.person || "not signed"} de />
            </dl>
            {style.habits.length > 0 && (
              <ul className="pt-habits">
                {style.habits.map((h, i) => (
                  <li key={i}>
                    {h.text}
                    <q lang="de">{h.quote}</q>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-like">
              <b>Polier writes to them like this</b>
              {style.write_like} The items of an inquiry and what is asked for stay as they are; only the opening and the closing follow this. You read every message before it goes out.
            </p>
            {style.dropped > 0 && <p className="quiet">{style.dropped} trait{style.dropped === 1 ? " was" : "s were"} left out: the passage was not in their messages.</p>}
          </>
        ) : (
          <p className="quiet">
            {theirs === 0
              ? "Nothing to read yet. Once this firm has answered, or its older mail is here (drop .eml files on this page, or read the mailbox under \"Your firm\"), Polier reads how it writes and words the next inquiry to match."
              : `${theirs} message${theirs === 1 ? "" : "s"} from this firm ${theirs === 1 ? "is" : "are"} on record. Polier can read how it writes (form of address, tone, habits, each with its passage) and word the next inquiry to match.`}
          </p>
        )}
      </div>

      <div className="pt-block">
        <h3>
          Prices <small>{p.prices.length ? `${p.prices.length} on record, newest first${c.stale ? `; ${c.stale} out of date` : ""}` : ""}</small>
        </h3>
        {p.prices.length === 0 ? <p className="quiet">No price from this firm yet. A quote read in the price inquiries of a tender lands here with its day and validity.</p> : <Prices rows={p.prices} sub={p.kind === "subcontractor"} />}
      </div>

      <div className="pt-block">
        <h3>
          Conversations <small>{p.timeline.length ? `${p.timeline.length} messages and calls, newest first` : ""}</small>
        </h3>
        {p.timeline.length === 0 ? (
          <p className="quiet">Nothing yet. Inquiries, replies and calls from the tenders show here; older mail comes in as .eml files dropped on this page.</p>
        ) : (
          <ol className="pt-talk">
            {p.timeline.map((e) => (
              <Entry key={e.id} e={e} voice={voice} onRecord={load} onError={onError} />
            ))}
          </ol>
        )}
        <p className="quiet pt-drop-hint">Drop saved e-mails (.eml) anywhere on this page: each is put to the firm it is from or to.</p>
      </div>
    </section>
  );
}

const Trait = ({ label, value, quote, de }: { label: string; value: string; quote?: string; de?: boolean }) => (
  <div>
    <dt>{label}</dt>
    <dd lang={de ? "de" : undefined}>
      {value}
      {quote && <q lang="de">{quote}</q>}
    </dd>
  </div>
);

/** A subcontractor's papers: what a main contractor has to hold before the firm may work for it. */
function Documents({ list, onSave }: { list: SupplierMore["documents"]; onSave: (list: SupplierMore["documents"]) => void }) {
  const [name, setName] = useState("");
  const [until, setUntil] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  return (
    <>
      <h3 className="pt-sub">Papers</h3>
      {list.length === 0 && <p className="quiet">None on record (prequalification, § 48b exemption, liability insurance).</p>}
      <ul className="pt-docs">
        {list.map((d, i) => (
          <li key={i} className={d.valid_until && d.valid_until < today ? "is-over" : d.valid_until && d.valid_until < soon ? "is-soon" : ""}>
            <span lang="de">{d.name}</span>
            <span className="num">
              {d.valid_until ? (d.valid_until < today ? `ran out ${day(d.valid_until)}` : `until ${day(d.valid_until)}`) : "no date"}
            </span>
            <button className="sup-x" aria-label={`Remove ${d.name}`} onClick={() => onSave(list.filter((_, n) => n !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form className="pt-doc-add" onSubmit={(e) => (e.preventDefault(), name.trim() && (onSave([...list, { name: name.trim(), valid_until: /^\d{2}\.\d{2}\.\d{4}$/.test(until) ? until.split(".").reverse().join("-") : "" }]), setName(""), setUntil("")))}>
        <input type="text" lang="de" placeholder="Paper" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" placeholder="valid until, TT.MM.JJJJ" value={until} onChange={(e) => setUntil(e.target.value)} />
        <button className="btn-ghost small" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </>
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
              {r.example && <em className="tag" lang="en">example</em>}
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
        {e.example && <em className="tag">example</em>}
        <span lang="de">{[e.package, e.project].filter(Boolean).join(" · ") || e.subject}</span>
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
      ) : (
        !call && <p className="quiet">The text of this message was not kept.</p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ what waits, across all tenders */

function Waiting({ rows, onOpen, onOpenTender }: { rows: PartnerThread[]; onOpen: (id: string) => void; onOpenTender: (projectId: string, file: number) => void }) {
  if (rows.length === 0) return <p className="pt-empty quiet">Nothing is open with a supplier or subcontractor: every inquiry that went out has its answer.</p>;
  const you = rows.filter(yours).length;
  return (
    <section className="pt-wide">
      <h2>
        {rows.length} conversation{rows.length === 1 ? "" : "s"} open
      </h2>
      <p className="quiet">
        {you > 0 ? `${you} wait${you === 1 ? "s" : ""} for you (a question back, or a message written and not sent). ` : ""}
        The others wait for the firm; the tender's submission day is what they have to make.
      </p>
      <table className="pt-prices pt-waiting">
        <thead>
          <tr>
            <th>Whose move</th>
            <th>Partner</th>
            <th>About</th>
            <th>Stands</th>
            <th>Since</th>
            <th>Tender due</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={i} className={yours(t) ? "is-you" : ""}>
              <td>
                <Mark you={yours(t)} /> {yours(t) ? "You" : "They"}
              </td>
              <td>
                <button className="text-link" onClick={() => onOpen(t.supplier_id)}>
                  {t.supplier}
                </button>
              </td>
              <td lang="de">
                <b>{t.package || t.subject}</b>
                <small>
                  {t.project}
                  {t.example && " · example"}
                </small>
              </td>
              <td>
                {STATUS[t.status]}
                <small>
                  {[t.reminders > 0 && `reminded ${t.reminders === 1 ? "once" : `${t.reminders} times`}`, t.calls > 0 && `phoned ${t.calls === 1 ? "once" : `${t.calls} times`}`, t.summary].filter(Boolean).join(" · ")}
                </small>
              </td>
              <td className="num">
                {t.days === null ? "–" : `${t.days} day${t.days === 1 ? "" : "s"}`}
                <small>{day(t.since)}</small>
              </td>
              <td className="num">{t.due ? day(t.due) : <span className="quiet">no date</span>}</td>
              <td>
                {t.project_id && t.file !== null && (
                  <button className="btn-ghost small" onClick={() => onOpenTender(t.project_id!, t.file!)}>
                    Open the inquiry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------------ the price book */

function PriceBook({ book, onOpen }: { book: PartnersOverview["book"]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const rows = book.filter((b) => !q || b.label.toLowerCase().includes(q) || b.offers.some((o) => (o.supplier ?? "").toLowerCase().includes(q) || o.product.toLowerCase().includes(q)));
  if (book.length === 0) return <p className="pt-empty quiet">No price on record yet. Every quote read in the price inquiries of a tender is kept here, per item, with who gave it and when.</p>;
  return (
    <section className="pt-wide">
      <h2>{book.length} things priced</h2>
      <p className="quiet">Every line of every quote, by what was priced. "Lowest" counts only prices that still hold; a supplier's price is the material part of a unit price, a subcontractor's the whole.</p>
      <input type="search" className="pt-search" placeholder="Find a product, a work, a firm" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="pt-book">
        {rows.map((b) => {
          const key = `${b.label}|${b.unit}`;
          const shown = open === key || rows.length <= 3;
          return (
            <li key={key} className={shown ? "is-open" : ""}>
              <button onClick={() => setOpen(shown ? null : key)} aria-expanded={shown}>
                <b lang="de">
                  {b.label}
                  {b.offers.every((o) => o.example) && <em className="tag" lang="en">example</em>}
                </b>
                <span className="num">
                  {b.low !== null ? (
                    <>
                      <b>{price(b.low)}</b> per {b.unit || "unit"}, lowest that holds
                    </>
                  ) : (
                    <span className="quiet">no price that still holds</span>
                  )}
                </span>
                <span className="num">
                  {b.offers.length} price{b.offers.length === 1 ? "" : "s"} from {b.suppliers} firm{b.suppliers === 1 ? "" : "s"}, latest {day(b.latest)}
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
          <p className="quiet">Every package of every plan has someone in the directory.</p>
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
        <p className="pt-note">A firm found is a candidate. You take it into the directory or pass; the app writes to nobody on its own, and the first inquiry to a new firm goes out from you.</p>
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
                        In the directory
                      </button>
                    ) : (
                      <>
                        <button className="btn-ghost small" disabled={c.status === "dismissed"} onClick={() => void decide(s, n, true)}>
                          Take into the directory
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
        Older mail with a firm of the directory shows in its conversations and is what Polier reads its way of writing from. A message goes to the firm whose address it is from or to; the mailbox is only read, never changed.
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
              <p className="quiet">From addresses that are in no directory entry. Add the firm, then hand the messages over again:</p>
              <ul>
                {read.unknown.map((u) => (
                  <li key={u.email}>
                    <b>{u.name}</b> <span>{u.email}</span> <span className="quiet">{u.messages} message{u.messages === 1 ? "" : "s"}</span>
                    <button className="btn-ghost small" onClick={() => saveSupplier({ name: u.name, email: u.email, kind: "supplier" }).then(() => (setRead({ ...read, unknown: read.unknown.filter((x) => x.email !== u.email) }), onChanged()), (e) => onError(say(e)))}>
                      Add to the directory
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
