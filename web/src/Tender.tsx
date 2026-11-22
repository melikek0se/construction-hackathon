// The tender page (D-050): a tender as one thing, whatever files it came in. Left the cover sheet (dates,
// what came, what the bid goes back as); beside it the LVs in one of three views: the map (one mark per
// item), the read view (the LV as a paper, notes in the margin) and the item table. The documents are
// one click away: the sheet of an item says where it stands in each, the drawer what each one gave.
import { cloneElement, isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Sign } from "./components";
import { getBid, getSupply, openCatalogProject } from "./api";
import { ProjectView } from "./ProjectView";
import { TenderDocView, type StepLayer } from "./TenderDoc";
import type { QuestionsLayer } from "./Questions";
import { LvText, eur, qty, quotedFragments } from "./format";
import { PLANNED, dmy } from "./Projects";
import { viewsOf, type TenderPlace, type TenderStep, type TenderView } from "./router";
import { KIND_LABEL, SEVERITIES, SEVERITY_LABEL, countLabel, type Bid, type BidRow, type Finding, type ItemKind, type Plan, type PriceSuggestion, type Project, type ProjectSummary, type QuestionsState, type Run, type Severity, type SupplyState, type Tender, type TenderAward, type TenderDoc, type TenderItem, type TenderLv } from "./types";
import "./tender.css";

const LETTER: Record<ItemKind, string> = { normal: "", lump_sum: "P", hourly: "H", contingency: "B", alternative: "W", surcharge: "Z" };
const KIND_SAYS: Partial<Record<ItemKind, string>> = {
  lump_sum: "One price for all of it; the text is the whole scope.",
  hourly: "Paid by the hour, on proof.",
  contingency: "Carried out only when ordered.",
  alternative: "In place of another item, if chosen.",
  surcharge: "On top of the item it names.",
};
/** The Prices step: where the price of each item comes from. The order is D-049's: a quote for this
 *  tender, then the price book (a partner's price from another tender), then past bids. */
export interface Pricing {
  analysisId: string | null; // of the open LV's carrying document, once read
  byOz: Map<string, PriceSuggestion> | null; // price book and past bids
  inquiries: ReactNode; // the price inquiries of the open LV (Inquiries.tsx)
}
type Source = "quote" | "book" | "past" | "asked" | "held" | "none";
const SOURCES: [Source, string, string][] = [
  ["quote", "Quote for this tender", "a supplier or subcontractor answered the inquiry"],
  ["book", "Price book", "a partner's price from another tender"],
  ["past", "Past bids", "similar items of your old bids"],
  ["asked", "In an inquiry, no price yet", "in a package: to send, or out"],
  ["held", "Waits for the client", "not asked outside until a bidder question is answered"],
  ["none", "No price", "nothing to go by yet"],
];
interface Priced {
  source: Source;
  unit: number | null; // the unit price, or the material part of it
  material: boolean;
  from: string; // who or what it is from, with the day
  stale: boolean;
}
function pricedOf(oz: string, supply: SupplyState | null, byOz: Map<string, PriceSuggestion> | null): Priced {
  const s = supply?.prices[oz];
  const g = byOz?.get(oz);
  const from = (who?: string, day?: string) => [who, day && day.slice(0, 10).split("-").reverse().join(".")].filter(Boolean).join(", ");
  if (s?.status === "quoted" && s.unit_price !== undefined) return { source: "quote", unit: s.unit_price, material: s.part === "material", from: from(s.source, s.date), stale: false };
  if (s?.status === "at_hand" && s.unit_price !== undefined) return { source: "book", unit: s.unit_price, material: s.part === "material", from: from(s.source, s.date), stale: !!s.stale };
  if (g?.unit_price != null && g.basis === "partners") return { source: "book", unit: g.unit_price, material: false, from: "a subcontractor's earlier quote", stale: !!g.stale };
  if (g?.material) return { source: "book", unit: g.material.unit_price, material: true, from: from(g.material.supplier, g.material.date), stale: g.material.stale };
  if (g?.unit_price != null) return { source: "past", unit: g.unit_price, material: false, from: `${g.matches.length} similar ${g.matches.length === 1 ? "item" : "items"}, ${g.confidence} confidence`, stale: false };
  if (s?.status === "asked") return { source: "asked", unit: null, material: false, from: s.source ?? "", stale: false };
  if (s?.status === "waits") return { source: "held", unit: null, material: false, from: s.why ?? "", stale: false };
  return { source: "none", unit: null, material: false, from: "", stale: false };
}

/** The strip of the Prices step: how firm the price of an item is, from a quote down to nothing. */
const PriceStrip = memo(function PriceStrip({ lv, items, sources, selected, onPick, onPoint }: { lv: TenderLv; items: TenderItem[]; sources: Source[]; selected: string | null; onPick: (lv: TenderLv, oz: string) => void; onPoint: (it: TenderItem | null) => void }) {
  return (
    <div className="tn-strip" onMouseLeave={() => onPoint(null)}>
      {items.map((it, n) => (
        <button key={it.oz} className={`${sources[n] === "none" ? "tn-tick" : `tn-src is-${sources[n]}`}${selected === it.oz ? " tn-on" : ""}`} aria-label={`Item ${it.oz}, ${SOURCES.find(([s]) => s === sources[n])![1]}`} onClick={() => onPick(lv, it.oz)} onMouseEnter={() => onPoint(it)} onFocus={() => onPoint(it)} />
      ))}
    </div>
  );
});

const VIEW_LABEL: Record<TenderView, string> = { map: "Map", read: "Read", items: "Items", pages: "Pages", between: "Between LVs", inquiries: "Inquiries", whatif: "What-if" };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The Check step: what the checks found, on the same LVs. The findings are those of the document that
 *  carries an LV; the list and the sheet are the ones of the workspace of before, handed in by App. */
export interface Check {
  summary: ProjectSummary | null; // per document: counts, and one digit per item (0 none .. 3 stop)
  findingsByOz: Map<string, Finding[]> | null; // of the open LV; null while it is read or none is open
  general: Finding[] | null; // its findings that name no item
  selected: string | null;
  onPick: (oz: string | null) => void;
  list: ReactNode; // the findings of the open LV
  sheet: ReactNode; // the open item or finding
}
const RANK: Record<Severity, number> = { info: 1, warn: 2, high: 3 };
const BY_RANK: (Severity | null)[] = [null, "info", "warn", "high"];
const worstOf = (fs: Finding[] | undefined): number => (fs ?? []).reduce((w, f) => Math.max(w, RANK[f.severity]), 0);
export function Counts({ counts }: { counts: Record<Severity, number> }) {
  return (
    <span className="tn-counts">
      {SEVERITIES.filter((sev) => counts[sev] > 0).map((sev) => (
        <span key={sev}><Sign severity={sev} size={14} />{counts[sev]}</span>
      ))}
    </span>
  );
}

/** The strip of the Check step: an item with a finding stands up in its severity colour, with its number. */
const CheckStrip = memo(function CheckStrip({ lv, items, ranks, selected, onPick, onPoint }: { lv: TenderLv; items: TenderItem[]; ranks: number[]; selected: string | null; onPick: (lv: TenderLv, oz: string) => void; onPoint: (it: TenderItem | null) => void }) {
  return (
    <div className="tn-strip" onMouseLeave={() => onPoint(null)}>
      {items.map((it, n) => {
        const sev = BY_RANK[ranks[n] ?? 0];
        return (
          <button
            key={it.oz}
            className={`${sev ? `tn-flag ${sev}` : "tn-tick"}${selected === it.oz ? " tn-on" : ""}`}
            aria-label={`Item ${it.oz}${sev ? `, ${SEVERITY_LABEL[sev]}` : ""}`}
            onClick={() => onPick(lv, it.oz)}
            onMouseEnter={() => onPoint(it)}
            onFocus={() => onPoint(it)}
          >
            {sev && sev !== "info" ? it.oz : ""}
          </button>
        );
      })}
    </div>
  );
});

interface Section {
  no: string;
  name: string;
  items: TenderItem[];
}
/** The sections of an LV: its top titles, or the level below when the whole LV stands under one title. */
export function sectionsOf(lv: TenderLv): Section[] {
  const depth = lv.items.length > 0 && lv.items.every((i) => i.path.length > 1 && i.path[0] === lv.items[0].path[0]) ? 1 : 0;
  const out: Section[] = [];
  const by = new Map<string, Section>();
  for (const it of lv.items) {
    const name = it.path[depth] ?? it.path[0] ?? "";
    let s = by.get(name);
    if (!s) {
      s = { name, no: it.oz.split(".").slice(0, depth + 1).join("."), items: [] };
      by.set(name, s);
      out.push(s);
    }
    s.items.push(it);
  }
  return out;
}
export const lvTitle = (lv: TenderLv) => (lv.no !== null ? `${lv.no} ${lv.label}` : lv.label);
const marked = (i: TenderItem) => i.diff !== null || i.change !== null || i.kind !== "normal";
const CHANGED: Record<NonNullable<TenderItem["change"]>["kind"], string> = { new: "new in this issue", quantity: "another quantity than before", unit: "another unit than before", text: "reworded" };
const pagesOf = (n: number | null) => (n === null ? "" : `${n} ${n === 1 ? "page" : "pages"}`);
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function daysLeft(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : n === -1 ? "yesterday" : `${-n} days ago`;
}
export const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${dmy(iso)}`;
};

/** What the bid goes back as, in words. */
export function backText(lv: TenderLv): string {
  if (lv.back.form === "X84") return `X84, written onto the client's ${lv.back.file}.`;
  if (lv.back.form === "D84") return "D84: the client sent GAEB 90. Polier does not write D84; the bid comes out as a sheet (CSV).";
  return "Not stated in the files. No GAEB file came with this LV.";
}

// ---- marks: what an item is, and where the documents differ. Severity colours belong to the checks. ----
const Strip = memo(function Strip({ lv, items, selected, mini, onPick, onPoint }: { lv: TenderLv; items: TenderItem[]; selected: string | null; mini?: boolean; onPick?: (lv: TenderLv, oz: string) => void; onPoint?: (it: TenderItem | null) => void }) {
  return (
    <div className={`tn-strip${mini ? " mini" : ""}`} onMouseLeave={onPoint && (() => onPoint(null))}>
      {items.map((it) => {
        const cls = `${it.diff || it.change ? "tn-blk diff" : it.kind !== "normal" ? "tn-blk" : "tn-tick"}${selected === it.oz ? " tn-on" : ""}`;
        const label = `Item ${it.oz}${it.kind !== "normal" ? `, ${KIND_LABEL[it.kind]}` : ""}${it.diff ? ", the documents differ" : ""}${it.change ? `, ${CHANGED[it.change.kind]}` : ""}`;
        if (!onPick) return <i key={it.oz} className={cls} />;
        return (
          <button key={it.oz} className={cls} aria-label={label} onClick={() => onPick(lv, it.oz)} onMouseEnter={onPoint && (() => onPoint(it))} onFocus={onPoint && (() => onPoint(it))}>
            {mini ? "" : it.diff ? "≠" : it.change ? (it.change.kind === "new" ? "+" : "Δ") : LETTER[it.kind]}
          </button>
        );
      })}
    </div>
  );
});

function Key({ differ, issued }: { differ: boolean; issued: boolean }) {
  return (
    <div className="tn-key tn-label">
      <span><i className="tn-tick" />Item</span>
      <span><i className="tn-blk">P</i>Lump sum</span>
      <span><i className="tn-blk">H</i>Hourly</span>
      <span><i className="tn-blk">B</i>Contingency</span>
      <span><i className="tn-blk">Z</i>Surcharge</span>
      {differ && <span><i className="tn-blk diff">≠</i>Documents differ</span>}
      {issued && <span><i className="tn-blk diff">Δ</i>Changed in the new issue</span>}
      {issued && <span><i className="tn-blk diff">+</i>New in it</span>}
    </div>
  );
}

function Marks({ it }: { it: TenderItem }) {
  return (
    <>
      {it.change && <span className="tn-mk diff" title={CHANGED[it.change.kind]}>{it.change.kind === "new" ? "+" : "Δ"}</span>}
      {it.kind !== "normal" && <span className="tn-mk" title={KIND_LABEL[it.kind]}>{LETTER[it.kind]}</span>}
      {it.diff && <span className="tn-mk diff" title="The documents differ here">≠</span>}
    </>
  );
}

/** What the latest issue of the LV changed in an item against the issue before. */
export function Changed({ it }: { it: TenderItem }) {
  const c = it.change;
  if (!c) return null;
  if (c.kind === "new") return <p>The issue before did not have this item.</p>;
  if (c.kind === "quantity" || c.kind === "unit") {
    return <p>Before: <b>{c.was_qty == null ? "no quantity" : qty(c.was_qty)} {c.was_unit}</b>. Now: <b>{it.qty === null ? "no quantity" : qty(it.qty)} {it.unit}</b>.</p>;
  }
  return (
    <>
      {(c.was?.length ?? 0) > 0 && <p>Gone from the text:</p>}
      {c.was?.map((line) => <span key={line} className="tn-quote was" lang="de"><LvText text={line} /></span>)}
      {(c.now?.length ?? 0) > 0 && <p>New in the text:</p>}
      {c.now?.map((line) => <span key={line} className="tn-quote" lang="de"><LvText text={line} /></span>)}
      {!c.was?.length && !c.now?.length && <p>The wording is {Math.round((c.alike ?? 1) * 100)} % alike with the issue before.</p>}
    </>
  );
}

/** What another document says differently about an item. */
export function Differs({ it, docs }: { it: TenderItem; docs: TenderDoc[] }) {
  const d = it.diff;
  if (!d) return null;
  const other = docs[d.doc];
  return (
    <>
      {d.qty !== undefined && <p>Quantity in the {other.format} file: <b>{d.qty === null ? "none" : qty(d.qty)}</b>, here {it.qty === null ? "none" : qty(it.qty)}.</p>}
      {d.unit !== undefined && <p>Unit in the {other.format} file: <b>{d.unit}</b>, here {it.unit}.</p>}
      {d.alike !== undefined && (d.only?.length ? (
        <>
          <p>Only in the {other.format} file:</p>
          {d.only.map((line) => <span key={line} className="tn-quote" lang="de"><LvText text={line} /></span>)}
        </>
      ) : (
        <p>The text in the {other.format} file is {Math.round(d.alike * 100)} % alike.</p>
      ))}
    </>
  );
}

type Outcome = NonNullable<Plan["outcome"]>;
const OUTCOMES: [Outcome, string][] = [["won", "Won"], ["lost", "Lost"], ["passed", "No bid"], ["cancelled", "Cancelled"]];
type Change = "quantity" | "unit" | "dropped" | "price" | "added" | "same";
const CHANGE_MARK: Record<Change, string> = { quantity: "Q", unit: "U", dropped: "–", price: "€", added: "+", same: "" };
const CHANGE_SAYS: Record<Change, string> = { quantity: "another quantity than tendered", unit: "another unit than tendered", dropped: "not in the award", price: "another unit price than in the bid", added: "not in the tender", same: "as tendered" };
const changeOf = (award: TenderAward, oz: string): Change => award.changes[oz]?.kind ?? (award.rows[oz]?.differs ? "price" : "same");

/** An item in the award: what was tendered, what was bid, what was awarded. */
function AwardSheet({ award, oz, it, added, tender, onClose }: { award: TenderAward; oz: string; it: TenderItem | null; added: TenderAward["added"][number] | null; tender: Tender; onClose: () => void }) {
  const row = award.rows[oz];
  const change: Change = added ? "added" : changeOf(award, oz);
  const file = tender.documents[award.doc];
  return (
    <div className="tn-sheet">
      <div className="tn-sheet-top">
        <span className="tn-crumb" lang="de"><LvText text={(it?.path ?? added?.path ?? []).join(" › ")} /></span>
        <button className="tn-close" onClick={onClose}>Close</button>
      </div>
      <div className="tn-oz">{oz}</div>
      <h2 lang="de"><LvText text={it?.short ?? added?.short ?? ""} /></h2>
      {change !== "same" && <div className="tn-differ"><h4>{change === "added" ? "Only in the award" : change === "dropped" ? "Not in the award" : "Changed"}</h4><p>{{ quantity: "The award states another quantity than the tender.", unit: "The award states another unit than the tender.", dropped: "The tender has this item, the award does not.", price: "The award carries another unit price than the bid that went out.", added: "The tender does not have this item.", same: "" }[change]}</p></div>}
      <h3 className="tn-label">Tendered, bid, awarded</h3>
      <div className="tn-where">
        <div><span className="tn-tag">Tender</span><span>{it ? `${it.qty === null ? "no quantity" : qty(it.qty)} ${it.unit}` : "not in the tender"}</span><span /></div>
        {award.bid && <div><span className="tn-tag">Bid</span><span>{row?.bid_up != null ? `${eur(row.bid_up)} per ${row.unit}` : "no price in the bid file"}</span><span lang="de"><LvText text={tender.documents[award.bid.doc].name} /></span></div>}
        <div><span className="tn-tag ink">Award</span><span>{row ? `${row.qty === null ? "" : `${qty(row.qty)} ${row.unit} · `}${row.up !== null ? `${eur(row.up)} per ${row.unit}` : "no price"}${row.total !== null ? ` · ${eur(row.total)}` : ""}` : "not in the award"}</span><span lang="de"><LvText text={file.name} /></span></div>
      </div>
      <h3 className="tn-label">Text of the item</h3>
      <div className="tn-long" lang="de"><LvText text={it ? it.long || it.short : added?.long || added?.short || ""} /></div>
    </div>
  );
}

/** A difference among the bidder questions: another quantity or unit always is, another wording when asked. */
export function AskRow({ it, asked, onAsk }: { it: TenderItem; asked: boolean; onAsk: (ask: boolean) => void }) {
  if (it.diff && (it.diff.qty !== undefined || it.diff.unit !== undefined)) return <p className="tn-quiet">It is among the bidder questions: which figure holds is the client's to say.</p>;
  return asked ? (
    <div className="tn-askrow"><span className="tn-tag ink">Among the questions</span><button className="tn-btn out sm" onClick={() => onAsk(false)}>Take it out</button></div>
  ) : (
    <div className="tn-askrow"><button className="tn-btn ink sm" onClick={() => onAsk(true)}>Ask the client</button><span className="tn-quiet">Which wording holds is the client's to say.</span></div>
  );
}

function Sheet({ lv, it, tender, single, onClose, asked, onAsk }: { lv: TenderLv; it: TenderItem; tender: Tender; single: boolean; onClose: () => void; asked: boolean; onAsk: (ask: boolean) => void }) {
  return (
    <div className="tn-sheet">
      <div className="tn-sheet-top">
        <span className="tn-crumb" lang="de">
          {!single && `${lvTitle(lv)} › `}
          <LvText text={it.path.join(" › ")} />
        </span>
        <button className="tn-close" onClick={onClose}>Close</button>
      </div>
      <div className="tn-oz">{it.oz}</div>
      <h2 lang="de"><LvText text={it.short} /></h2>
      <div className="tn-q">
        <b>{it.qty === null ? "no quantity" : qty(it.qty)}</b>
        <span>{it.unit}</span>
        {it.kind !== "normal" && <span className="tn-tag">{KIND_LABEL[it.kind]}</span>}
      </div>
      {it.change && (
        <div className="tn-differ">
          <h4>Changed in issue {lv.issues.length}</h4>
          <Changed it={it} />
          <p className="tn-quiet">A price, a question or an inquiry made on the issue before was made on the earlier state of this item.</p>
        </div>
      )}
      {it.diff && (
        <div className="tn-differ">
          <h4>The documents differ here</h4>
          <Differs it={it} docs={tender.documents} />
          <AskRow it={it} asked={asked} onAsk={onAsk} />
        </div>
      )}
      <h3 className="tn-label">Text of the item</h3>
      <div className="tn-long" lang="de"><LvText text={it.long || it.short} /></div>
      <h3 className="tn-label">Where it stands</h3>
      <div className="tn-where">
        {it.sources.map((s) => {
          const d = tender.documents[s.doc];
          return (
            <div key={s.doc}>
              <span className="tn-tag">{d.format}</span>
              <span className="tn-file"><LvText text={d.name} /></span>
              <span>{s.page !== null ? `page ${s.page}` : `item ${it.oz}`}</span>
            </div>
          );
        })}
        {lv.documents.filter((n) => !it.sources.some((s) => s.doc === n)).map((n) => (
          <div key={n}>
            <span className="tn-tag">{tender.documents[n].format}</span>
            <span className="tn-file"><LvText text={tender.documents[n].name} /></span>
            <span>not in this document</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Drawer({ tender, onClose, onPick, onFiles }: { tender: Tender; onClose: () => void; onPick: (lv: TenderLv, oz: string) => void; onFiles: () => void }) {
  const [all, setAll] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const mine = tender.documents.filter((d) => d.lv !== null);
  const later = tender.documents.filter((d) => d.lv === null);
  const shown = all ? mine : mine.slice(0, 6);
  const differing = tender.lvs.flatMap((lv) => lv.items.filter((i) => i.diff).map((it) => ({ lv, it })));
  return (
    <div className="tn-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="tn-drawer" role="dialog" aria-label="Documents of this tender">
        <header>
          <h2>Documents of this tender</h2>
          <button className="tn-btn plain" onClick={onClose}>Close</button>
        </header>
        <div className="tn-drawer-body">
          <p>The page shows the tender, not a file. Every document the client sent is read and each gives what it has. Where two documents say different things, that is a point for the client.</p>
          <h3 className="tn-label">{count(mine.length, "document")} of the tender</h3>
          {shown.map((d) => {
            const lv = tender.lvs[d.lv!];
            return (
              <div key={d.index} className="tn-doc">
                <div className="tn-doc-top">
                  <span className="tn-tag ink">{d.format}</span>
                  <span className="tn-doc-name"><LvText text={d.name} /></span>
                </div>
                <dl>
                  <dt>Is</dt>
                  <dd>{lv.issues.length > 1 && `issue ${d.issue}${d.current ? "" : ", replaced"} · `}{d.role}{d.pages !== null && `, ${pagesOf(d.pages)}`}{tender.lvs.length > 1 && <span lang="de">{` · ${lvTitle(lv)}`}</span>}</dd>
                  <dt>Holds</dt>
                  <dd>{count(d.items, "item")}, {count(d.remarks, "passage")} of remarks</dd>
                  <dt>Used for</dt>
                  <dd>
                    {!d.current
                      ? `Held against issue ${lv.issues.length} for what changed.`
                      : d.carrier
                      ? lv.documents.length > 1 ? "Item numbers, structure, quantities, units and texts." : "Everything: there is no second document of this LV."
                      : `Where each item stands${d.pages !== null ? " (the page)" : ""}${d.extra_remarks ? `; ${count(d.extra_remarks, "passage")} of remarks that no other file has` : ""}.`}
                  </dd>
                  {d.compare && (
                    <>
                      <dt>Against the {tender.documents[lv.carrier].format} file</dt>
                      <dd>
                        {d.compare.both} of {lv.items.length} items in both; {d.compare.qty} quantities, {d.compare.unit} units and {d.compare.text} texts differ.
                        {d.compare.only_other > 0 && ` ${count(d.compare.only_other, "item")} only here (${d.compare.only_other_items.slice(0, 6).join(", ")}${d.compare.only_other > 6 ? ", …" : ""}).`}
                        {d.compare.only_carrier > 0 && ` ${count(d.compare.only_carrier, "item")} not here.`}
                      </dd>
                    </>
                  )}
                  {d.carrier && lv.back.form && (
                    <>
                      <dt>Bid</dt>
                      <dd>{backText(lv)}</dd>
                    </>
                  )}
                </dl>
              </div>
            );
          })}
          {mine.length > shown.length && <button className="tn-btn out tn-more" onClick={() => setAll(true)}>Show all {mine.length}</button>}
          {later.length > 0 && (
            <>
              <h3 className="tn-label">Of later steps, not part of the tender</h3>
              {later.map((d) => (
                <div key={d.index} className="tn-later">
                  <span className="tn-tag">{d.format}</span>
                  <span className="tn-file"><LvText text={d.name} /></span>
                  <span>{d.readable ? d.role : "could not be read"}</span>
                </div>
              ))}
            </>
          )}
          {differing.length > 0 && (
            <>
              <h3 className="tn-label">{count(differing.length, "item")} the documents say differently</h3>
              {differing.map(({ lv, it }) => (
                <div key={`${lv.id}:${it.oz}`} className="tn-diffrow">
                  <b>{it.oz}</b>
                  <div>
                    <span lang="de"><LvText text={it.short} /></span>
                    <small>{it.diff!.qty !== undefined ? "quantity" : it.diff!.unit !== undefined ? "unit" : it.diff!.only?.length ? `${count(it.diff!.only.length, "line")} only in the ${tender.documents[it.diff!.doc].format} file` : `text ${Math.round((it.diff!.alike ?? 1) * 100)} % alike`}</small>
                  </div>
                  <button className="tn-btn out sm" onClick={() => onPick(lv, it.oz)}>Open</button>
                </div>
              ))}
            </>
          )}
          <button className="tn-btn out tn-more" onClick={onFiles}>Add or remove files</button>
        </div>
      </aside>
    </div>
  );
}

function Cover({ tender, plan, single, onDrawer, onDates }: { tender: Tender; plan: Plan; single: boolean; onDrawer: () => void; onDates: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = PLANNED.filter((d) => plan[d.kind]);
  const next = dates.find((d) => plan[d.kind]! >= today)?.kind;
  const mine = tender.documents.filter((d) => d.lv !== null && d.current);
  const replaced = tender.documents.filter((d) => d.lv !== null && !d.current).length;
  const later = tender.documents.filter((d) => d.lv === null);
  const compared = mine.filter((d) => d.compare);
  const forms = [...new Set(tender.lvs.map((lv) => lv.back.form))];
  return (
    <aside className="tn-cover">
      <p className="tn-client" lang="de">{tender.client ? <>Client <LvText text={tender.client} /></> : "Client not named in the files"}</p>
      <p className="tn-size">{single ? "1 LV" : `${tender.lvs.length} LVs`}, {count(tender.items, "item")}</p>
      {tender.lvs.filter((l) => l.issues.length > 1).map((l) => {
        const of = (k: string) => l.items.filter((i) => i.change?.kind === k).length;
        const said = [[of("quantity") + of("unit"), "another quantity or unit"], [of("text"), "reworded"], [of("new"), "new"], [l.removed.length, "dropped"]].filter(([n]) => n) as [number, string][];
        return (
          <section key={l.id} className="tn-issue">
            <span className="tn-label">{!single && `${lvTitle(l)} · `}Issue {l.issues.length} of {l.issues.length}</span>
            <p className="tn-back">The client sent this LV again. Against issue {l.issues.length - 1}: {said.length ? said.map(([n, w]) => `${n} ${w}`).join(", ") : "nothing changed"}.</p>
            {l.removed.map((r) => (
              <div key={r.oz} className="tn-cfile"><b>{r.oz}</b> <span lang="de"><LvText text={r.short} /></span><small>dropped: {r.qty === null ? "no quantity" : qty(r.qty)} {r.unit} in issue {l.issues.length - 1}</small></div>
            ))}
            <p className="tn-none">What was done on issue {l.issues.length - 1} (questions, inquiries, prices) goes on with this one.</p>
          </section>
        );
      })}
      <section>
        <span className="tn-label">Dates</span>
        {dates.length > 0 ? (
          <div className="tn-dl">
            {dates.map((d) => (
              <div key={d.kind}>
                <span>{d.label}<small>{daysLeft(plan[d.kind]!)}</small></span>
                <b className={d.kind === next ? "next" : undefined}>{dayText(plan[d.kind]!)}</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="tn-none">The files state no date.</p>
        )}
        <button className="tn-btn out sm" onClick={onDates}>{dates.length ? "Change the dates" : "Set the dates"}</button>
      </section>
      <section>
        <span className="tn-label">What came</span>
        {single ? (
          mine.map((d) => (
            <div key={d.index} className="tn-cfile">
              <span className="tn-tag">{d.format}</span> <b><LvText text={d.name} /></b>
              <small>{count(d.items, "item")}, {count(d.remarks, "passage")} of remarks{d.pages !== null && `, ${pagesOf(d.pages)}`}</small>
            </div>
          ))
        ) : (
          <div className="tn-cfile">
            <b>{count(mine.length, "document")} for {tender.lvs.length} LVs</b>
            <small>{[...new Set(mine.map((d) => d.format))].join(", ")}{mine.some((d) => d.pages) && `, ${mine.reduce((n, d) => n + (d.pages ?? 0), 0)} pages`}</small>
          </div>
        )}
        {compared.length > 0 ? (
          compared.map((d) => (
            <p key={d.index} className="tn-cmp">
              {compared.length > 1 && <span className="tn-tag">{d.format}</span>} <b>{d.compare!.both} / {tender.lvs[d.lv!].items.length}</b> items in both · <b>{d.compare!.qty + d.compare!.unit}</b> quantities or units differ · <b>{d.compare!.text}</b> texts differ
            </p>
          ))
        ) : (
          <p className="tn-cmp">One document per LV: nothing to compare.</p>
        )}
        {replaced > 0 && <p className="tn-none">{count(replaced, "document")} of an earlier issue: replaced, kept for what changed.</p>}
        <button className="tn-btn out sm" onClick={onDrawer}>What each document gave</button>
      </section>
      <section>
        <span className="tn-label">The bid goes back as</span>
        <p className="tn-back">{forms.length === 1 ? backText(tender.lvs[0]) : tender.lvs.map((lv) => `${lvTitle(lv)}: ${lv.back.form ?? "not stated"}`).join(" · ")}</p>
      </section>
      {later.length > 0 && (
        <section>
          <span className="tn-label">Later steps among the files</span>
          {later.map((d) => (
            <div key={d.index} className="tn-cfile">
              <span className="tn-tag">{d.format}</span> <b><LvText text={d.name} /></b>
              <small>{d.role}{d.priced > 0 && `, ${count(d.priced, "priced item")}`}</small>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}

export function TenderPage({ tender, plan, place, onPlace, onDocuments, check, questions, prices, bid, onAsk, outcome, onOutcome, run, starting, onRun, onMove, pages, whatif, intake }: { intake: { onTake: () => void; onPass: () => void } | null; tender: Tender; plan: Plan; place: TenderPlace; onPlace: (p: TenderPlace) => void; onDocuments: () => void; check: Check; prices: Pricing; bid: { analysisId: string | null; sheet: ReactNode }; outcome: Outcome | null; onOutcome: (o: Outcome | null) => void; run: Run | null; starting: boolean; onRun: () => void; onMove: (what: "go-on" | "cancel") => void; pages: ReactNode; whatif: ReactNode; questions: { state: QuestionsState | null; view: ReactNode }; onAsk: (lv: number, oz: string, ask: boolean) => void }) {
  const checking = place.step === "check";
  const asking = place.step === "questions";
  const pricing = place.step === "prices";
  const bidding = place.step === "bid";
  const awarding = place.step === "award";
  const picking = checking || pricing || bidding; // the open item is App's selection: the item sheet is the same in all three
  // the bid as it stands: the unit price per item; read again on the way back from the bid sheet
  const [offer, setOffer] = useState<Bid | null>(null);
  useEffect(() => {
    setOffer(null);
    if (!bidding || !bid.analysisId || place.view === "items") return;
    let stale = false;
    getBid(bid.analysisId).then((b) => !stale && setOffer(b), () => undefined);
    return () => void (stale = true);
  }, [bidding, bid.analysisId, place.view]);
  const rowBy = useMemo(() => new Map<string, BidRow>((offer?.rows ?? []).map((r) => [r.item_oz, r])), [offer]);
  /** How an item stands in the bid: a price of the estimator's own, a suggestion taken as it stands, none. */
  const bidOf = (oz: string): "own" | "taken" | "open" => {
    const r = rowBy.get(oz);
    return !r || r.price === null ? "open" : r.source === "suggestion" ? "taken" : "own";
  };
  // the inquiries of the open LV with every item's state in them; read again on the way back from the inquiries view
  const [supply, setSupply] = useState<SupplyState | null>(null);
  useEffect(() => {
    setSupply(null);
    if (!pricing || !prices.analysisId || place.view === "inquiries") return;
    let stale = false;
    const read = () => getSupply(prices.analysisId!).then((s) => !stale && setSupply(s), () => undefined);
    void read();
    // the inquiries on the cover page change what stands beside the items (sent, answered, taken): read again
    const again = window.setInterval(read, 8000);
    return () => (window.clearInterval(again), void (stale = true));
  }, [pricing, prices.analysisId, place.view]);
  const isAsked = (l: TenderLv, oz: string) => tender.asked.some((a) => a.lv === l.id && a.oz === oz);
  const single = tender.lvs.length === 1;
  const lv = single ? tender.lvs[0] : tender.lvs.find((l) => l.id === place.lv) ?? null;
  const sections = useMemo(() => (lv ? sectionsOf(lv) : []), [lv]);
  // on the map of all LVs an item is looked at without going into its LV
  const [peek, setPeek] = useState<{ lv: number; oz: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [query, setQuery] = useState("");
  const [allRemarks, setAllRemarks] = useState(false);
  const readout = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const openLv = lv ?? (peek ? tender.lvs.find((l) => l.id === peek.lv) ?? null : null);
  const openOz = lv ? (picking ? check.selected : place.item) : peek?.oz ?? null;
  // the checks' marks: of the open LV from its findings, of all LVs from the summary of the projects page
  const docOf = (l: TenderLv) => check.summary?.docs.find((d) => d.index === l.carrier);
  const ranksOf = (l: TenderLv, items: TenderItem[]): number[] => {
    if (l === lv && check.findingsByOz) return items.map((i) => worstOf(check.findingsByOz!.get(i.oz)));
    const marks = docOf(l)?.marks ?? "";
    const at = new Map(l.items.map((i, n) => [i, n]));
    return items.map((i) => Number(marks[at.get(i) ?? -1] ?? 0));
  };
  const pricedBy = useMemo(() => new Map<string, Priced>(), [supply, prices.byOz, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const priced = (oz: string): Priced => {
    let p = pricedBy.get(oz);
    if (!p) pricedBy.set(oz, (p = pricedOf(oz, supply, prices.byOz)));
    return p;
  };
  const countsIn = (items: TenderItem[]) => {
    const c: Record<Severity, number> = { high: 0, warn: 0, info: 0 };
    for (const i of items) for (const f of check.findingsByOz?.get(i.oz) ?? []) c[f.severity]++;
    return c;
  };
  const openItem = openLv && openOz ? openLv.items.find((i) => i.oz === openOz) ?? null : null;
  const differ = tender.lvs.some((l) => l.items.some((i) => i.diff));

  const pick = (of: TenderLv, oz: string) => {
    setDrawer(false);
    if (picking && (lv || single)) check.onPick(oz);
    else if (lv || single) onPlace({ ...place, item: oz });
    else if (place.view === "map") setPeek({ lv: of.id, oz });
    else onPlace({ ...place, lv: of.id, item: oz });
  };
  const close = () => (picking && lv ? check.onPick(null) : lv ? onPlace({ ...place, item: null }) : setPeek(null));
  /** To another step: the open item stays open. */
  const toStep = (step: TenderStep) => {
    if (step === place.step || (intake && step !== "check")) return;
    setPeek(null);
    const open = lv ? (picking ? check.selected : asking ? null : place.item) : null;
    if (step === "check" || step === "prices") check.onPick(open);
    if (step === "bid") check.onPick(open);
    // a view the next step has too stays open, but the bid's and the award's "items" are tables of their own
    const keep = viewsOf(step).includes(place.view) && !(place.view === "items" && (step === "bid" || bidding || step === "award" || awarding)) && place.view !== "between";
    onPlace({ ...place, step, view: keep ? place.view : "map", item: step === "award" ? open : null });
  };
  const toLv = (id: number | null) => {
    setPeek(null);
    setQuery("");
    if (picking) check.onPick(null);
    onPlace({ ...place, lv: id, item: null });
    body.current?.scrollTo(0, 0);
  };
  const point = (it: TenderItem | null) => {
    if (!readout.current) return;
    readout.current.textContent = it
      ? `${it.oz}  ${it.short}  ·  ${it.qty === null ? "no quantity" : qty(it.qty)} ${it.unit}${it.kind !== "normal" ? ` · ${KIND_LABEL[it.kind]}` : ""}${it.diff ? " · the documents differ" : ""}${it.change ? ` · ${CHANGED[it.change.kind]}` : ""}`
      : "One mark per item, in LV order. Point at a mark to read it, click to open it.";
  };
  // the open item is brought into view in the read view and the table (a link, Back, the drawer)
  useEffect(() => {
    if (openOz && place.view !== "map") document.getElementById(`tn-${openOz}`)?.scrollIntoView({ block: place.view === "read" ? "center" : "nearest" });
    // again once the sheet stands beside it: the rows get narrower and the item moves down
  }, [openOz, place.view, lv, check.sheet !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !drawer && close();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const later = tender.documents.filter((d) => d.lv === null);
  const bids = later.filter((d) => d.step === "bid").length;
  const award = lv ? tender.awards.find((a) => a.lv === lv.id) : undefined;
  const found = check.summary && check.summary.checked !== false ? check.summary.counts : null;
  const qs = questions.state?.questions;

  const crumbs = !single && lv && (
    <div className="tn-crumbs">
      <button onClick={() => toLv(null)}>All {tender.lvs.length} LVs</button>
      <span>›</span>
      <b lang="de"><LvText text={lvTitle(lv)} /></b>
    </div>
  );
  const sizeOf = (l: TenderLv) => `${count(l.items.length, "item")}${l.documents.length === 1 && tender.documents[l.carrier].pages !== null ? ` · ${pagesOf(tender.documents[l.carrier].pages)}` : ""}`;

  // the views of this step, as its switch shows them
  const views = viewsOf(place.step).filter((v) => v !== "between" || !single);
  const switchTo = (v: TenderView) => (v === "between" ? (setPeek(null), check.onPick(null), onPlace({ ...place, view: v, lv: null, item: null })) : onPlace({ ...place, view: v }));
  const viewSwitch = (
    <div className="tn-views" role="tablist" aria-label="View">
      {views.map((id) => (
        <button key={id} role="tab" aria-selected={place.view === id} onClick={() => switchTo(id)}>{bidding && id === "items" ? "Bid sheet" : checking && id === "map" ? "Document" : VIEW_LABEL[id]}</button>
      ))}
    </div>
  );
  // what the LVs of a building expect of each other: read when its view is opened, every LV analysed for it
  const between = checking && place.view === "between";
  const [building, setBuilding] = useState<Project | null>(null);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  useEffect(() => {
    if (!between || building) return;
    let stale = false;
    openCatalogProject(tender.id).then((p) => !stale && setBuilding(p), (e) => !stale && setBuildingError(e instanceof Error ? e.message : String(e)));
    return () => void (stale = true);
  }, [between, building, tender.id]);

  let main;
  if (place.view === "pages" && lv) {
    main = pages ?? <p className="tn-wait">Reading the pages of this LV.</p>;
  } else if (place.view === "map") {
    main = (
      <>
        <div className="tn-rows" ref={body}>
          {lv
            ? sections.map((s) => {
                const df = s.items.filter((i) => i.diff).length;
                const sp = s.items.filter((i) => i.kind !== "normal").length;
                return (
                  <div key={s.name} className="tn-row">
                    <div className="tn-row-hd">
                      <span className="tn-ix">{s.no}</span>
                      <span className="tn-row-t" lang="de"><LvText text={s.name} /></span>
                      {checking && check.findingsByOz && <Counts counts={countsIn(s.items)} />}
                      <span className="tn-label">{bidding && offer ? `${s.items.filter((i) => bidOf(i.oz) === "open").length} without a price · ${eur(s.items.reduce((sum, i) => sum + (rowBy.get(i.oz)?.total ?? 0), 0))} · ` : ""}{pricing ? `${s.items.filter((i) => priced(i.oz).unit !== null).length} with a price · ` : ""}{awarding && award && s.items.some((i) => changeOf(award, i.oz) !== "same") ? `${s.items.filter((i) => changeOf(award, i.oz) !== "same").length} changed · ` : ""}{!picking && !awarding && s.items.some((i) => i.change) && `${s.items.filter((i) => i.change).length} changed · `}{!picking && !awarding && df > 0 && `${df} differ · `}{!picking && !awarding && sp > 0 && `${sp} not plain · `}{count(s.items.length, "item")}</span>
                    </div>
                    {awarding && award ? (
                      <div className="tn-strip" onMouseLeave={() => point(null)}>
                        {s.items.map((i) => {
                          const c = changeOf(award, i.oz);
                          return <button key={i.oz} className={`${c === "same" ? "tn-tick" : `tn-blk${c === "dropped" ? " is-dropped" : c === "price" ? "" : " diff"}`}${openOz === i.oz ? " tn-on" : ""}`} aria-label={`Item ${i.oz}, ${CHANGE_SAYS[c]}`} onClick={() => pick(lv, i.oz)} onMouseEnter={() => point(i)} onFocus={() => point(i)}>{CHANGE_MARK[c]}</button>;
                        })}
                      </div>
                    ) : bidding ? (
                      <div className="tn-strip" onMouseLeave={() => point(null)}>
                        {s.items.map((i) => (
                          <button key={i.oz} className={`tn-bidmark is-${bidOf(i.oz)}${openOz === i.oz ? " tn-on" : ""}`} aria-label={`Item ${i.oz}, ${bidOf(i.oz) === "open" ? "no price" : bidOf(i.oz) === "taken" ? "suggested price taken as it stands" : "priced"}`} onClick={() => pick(lv, i.oz)} onMouseEnter={() => point(i)} onFocus={() => point(i)} />
                        ))}
                      </div>
                    ) : pricing ? <PriceStrip lv={lv} items={s.items} sources={s.items.map((i) => priced(i.oz).source)} selected={openOz} onPick={pick} onPoint={point} /> : checking ? <CheckStrip lv={lv} items={s.items} ranks={ranksOf(lv, s.items)} selected={openOz} onPick={pick} onPoint={point} /> : <Strip lv={lv} items={s.items} selected={openOz} onPick={pick} onPoint={point} />}
                  </div>
                );
              })
                .concat(
                  awarding && award && award.added.length > 0
                    ? [
                        <div key="+added" className="tn-row">
                          <div className="tn-row-hd"><span className="tn-ix">+</span><span className="tn-row-t">Only in the award</span><span className="tn-label">{count(award.added.length, "item")} the tender does not have</span></div>
                          <div className="tn-strip">
                            {award.added.map((x) => <button key={x.oz} className={`tn-blk diff${place.item === x.oz ? " tn-on" : ""}`} aria-label={`Item ${x.oz}, only in the award`} title={`${x.oz} ${x.short}`} onClick={() => onPlace({ ...place, item: x.oz })}>+</button>)}
                          </div>
                        </div>,
                      ]
                    : [],
                )
            : tender.lvs.map((l) => {
                const sp = l.items.filter((i) => i.kind !== "normal").length;
                const df = l.items.filter((i) => i.diff).length;
                return (
                  <div key={l.id} className="tn-row">
                    <div className="tn-row-hd">
                      <span className="tn-ix">{l.no ?? l.id + 1}</span>
                      <button className="tn-row-t" lang="de" onClick={() => toLv(l.id)} title="Go into this LV"><LvText text={l.label} /></button>
                      {checking && docOf(l)?.counts && <Counts counts={docOf(l)!.counts!} />}
                      <span className="tn-label">{!checking && df > 0 && `${df} differ · `}{!checking && sp > 0 && `${sp} not plain · `}{sizeOf(l)}</span>
                    </div>
                    {checking ? <CheckStrip lv={l} items={l.items} ranks={ranksOf(l, l.items)} selected={null} onPick={(of) => toLv(of.id)} onPoint={point} /> : <Strip lv={l} items={l.items} selected={peek?.lv === l.id ? peek.oz : null} onPick={pick} onPoint={point} />}
                  </div>
                );
              })}
        </div>
        <div className="tn-readout" ref={readout} lang="de">One mark per item, in LV order. Point at a mark to read it, click to open it.</div>
      </>
    );
  } else if (awarding && lv && award) {
    const line = (oz: string, short: string, it: TenderItem | null) => {
      const row = award.rows[oz];
      const c: Change = it ? changeOf(award, oz) : "added";
      return (
        <tr key={oz} id={`tn-${oz}`} className={`it${openOz === oz ? " tn-on" : ""}`} onClick={() => onPlace({ ...place, item: oz })}>
          <td className="ozc first">{oz}</td>
          <td className="mks">{c !== "same" && <span className={`tn-mk${c === "price" || c === "dropped" ? "" : " diff"}`} title={CHANGE_SAYS[c]}>{CHANGE_MARK[c]}</span>}</td>
          <td lang="de"><LvText text={short} /></td>
          <td className="num">{it ? `${it.qty === null ? "" : qty(it.qty)} ${it.unit}` : ""}</td>
          <td className="num">{row ? `${row.qty === null ? "" : qty(row.qty)} ${row.unit}` : ""}</td>
          {award.bid && <td className="num">{row?.bid_up != null ? eur(row.bid_up) : ""}</td>}
          <td className="num">{row?.up != null ? eur(row.up) : ""}</td>
          <td className="num">{row?.total != null ? eur(row.total) : ""}</td>
        </tr>
      );
    };
    const cols = award.bid ? 8 : 7;
    main = (
      <div className="tn-rows" ref={body}>
        <table className="tn-table">
          <thead><tr><th className="first">Item</th><th /><th>Short text</th><th className="num">Tendered</th><th className="num">Awarded</th>{award.bid && <th className="num">Bid price</th>}<th className="num">Award price</th><th className="num">Total</th></tr></thead>
          <tbody>
            {sections.map((s) => [<tr key={`s${s.name}`} className="sec"><td className="first" colSpan={cols} lang="de">{s.no}&nbsp;&nbsp;<LvText text={s.name} /></td></tr>, ...s.items.map((i) => line(i.oz, i.short, i))])}
            {award.added.length > 0 && <tr className="sec"><td className="first" colSpan={cols}>Only in the award</td></tr>}
            {award.added.map((x) => line(x.oz, x.short, null))}
          </tbody>
        </table>
      </div>
    );
  } else if (!lv) {
    // several LVs and none chosen: the register of the LVs (items view) or the contents (read view)
    main = (
      <div className="tn-rows" ref={body}>
        <table className="tn-table">
          <thead>
            <tr><th className="first">LV</th><th>Trade</th><th className="num">Items</th><th className="num">Sections</th><th className="num">{checking ? "Findings" : "Not plain"}</th><th className="num">Pages</th><th className="wide">Its items in order</th></tr>
          </thead>
          <tbody>
            {tender.lvs.map((l) => (
              <tr key={l.id} className="lv" onClick={() => toLv(l.id)}>
                <td className="ozc first">{l.no ?? l.id + 1}</td>
                <td lang="de"><button className="tn-lvname" onClick={() => toLv(l.id)}><LvText text={l.label} /></button></td>
                <td className="num">{l.items.length}</td>
                <td className="num">{sectionsOf(l).length}</td>
                <td className="num">{checking ? docOf(l)?.counts && <Counts counts={docOf(l)!.counts!} /> : l.items.filter((i) => i.kind !== "normal").length || ""}</td>
                <td className="num">{tender.documents[l.carrier].pages ?? ""}</td>
                <td>{checking ? <div className="tn-strip mini">{ranksOf(l, l.items).map((r, n) => <i key={n} className={r ? `tn-flag ${BY_RANK[r]}` : "tn-tick"} />)}</div> : <Strip lv={l} items={l.items} selected={null} mini />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (place.view === "items") {
    const q = query.trim().toLowerCase();
    let shown = 0;
    const rows = sections.map((s) => {
      const its = s.items.filter((i) => (!onlyMarked || (pricing ? priced(i.oz).unit === null : checking ? (check.findingsByOz?.get(i.oz)?.length ?? 0) > 0 : marked(i))) && (!q || i.oz.startsWith(q) || `${i.short} ${i.long}`.toLowerCase().includes(q)));
      shown += its.length;
      if (!its.length) return null;
      return [
        <tr key={`s${s.name}`} className="sec"><td className="first" colSpan={7} lang="de">{s.no}&nbsp;&nbsp;<LvText text={s.name} /></td></tr>,
        ...its.map((i) => (
          <tr key={i.oz} id={`tn-${i.oz}`} className={`it${openOz === i.oz ? " tn-on" : ""}`} onClick={() => pick(lv, i.oz)}>
            <td className="ozc first">{i.oz}</td>
            <td className="mks">{pricing ? priced(i.oz).source !== "none" && <i className={`tn-src is-${priced(i.oz).source}`} title={SOURCES.find(([x]) => x === priced(i.oz).source)![1]} /> : checking ? <Counts counts={countsIn([i])} /> : <Marks it={i} />}</td>
            <td lang="de"><LvText text={i.short} /></td>
            <td className="num">{i.qty === null ? "" : qty(i.qty)}</td>
            <td>{i.unit}</td>
            {pricing ? (
              <>
                <td className="num">{priced(i.oz).unit !== null ? eur(priced(i.oz).unit) : ""}</td>
                <td className="src">{priced(i.oz).source === "none" ? "" : `${priced(i.oz).material ? "material · " : ""}${SOURCES.find(([x]) => x === priced(i.oz).source)![1].toLowerCase()}${priced(i.oz).stale ? ", out of date" : ""}`}</td>
              </>
            ) : (
              <td className="num src">{i.sources.find((s) => s.page !== null)?.page ? `p. ${i.sources.find((s) => s.page !== null)!.page}` : ""}</td>
            )}
          </tr>
        )),
      ];
    });
    main = (
      <>
        <div className="tn-filter">
          <input type="search" placeholder="Item no. or text" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find an item" />
          <button className="tn-toggle" aria-pressed={onlyMarked} onClick={() => setOnlyMarked(!onlyMarked)}><i />{pricing ? "Only without a price" : checking ? "Only with findings" : "Only marked"}</button>
          <span className="tn-label">{shown} of {lv.items.length}</span>
        </div>
        <div className="tn-rows" ref={body}>
          <table className="tn-table">
            <thead><tr><th className="first">Item</th><th /><th>Short text</th><th className="num">Quantity</th><th>Unit</th>{pricing ? <><th className="num">Unit price</th><th>From</th></> : <th className="num">Page</th>}</tr></thead>
            <tbody>{shown ? rows : <tr><td className="first none" colSpan={6}>No item fits.</td></tr>}</tbody>
          </table>
        </div>
      </>
    );
  } else {
    const remarks = allRemarks ? lv.remarks : lv.remarks.slice(0, 4);
    main = (
      <div className="tn-paper-wrap" ref={body}>
        <div className="tn-paper">
          {lv.remarks.length > 0 && (
            <article className="tn-page">
              <h2>Preliminary remarks</h2>
              <p className="tn-sub">{count(lv.remarks.length, "passage")}{lv.documents.length > 1 && `, ${lv.remarks.filter((r) => r.doc !== lv.carrier).length} of them only in another document than the ${tender.documents[lv.carrier].format} file`}. They hold for every item below.</p>
              {remarks.map((r, n) => (
                <div key={n} className="tn-rem" lang="de">
                  {r.doc !== lv.carrier && <span className="tn-tag">only in the {tender.documents[r.doc].format} file</span>}
                  <LvText text={r.text} />
                </div>
              ))}
              {lv.remarks.length > remarks.length && <button className="tn-btn out tn-more" onClick={() => setAllRemarks(true)}>Show all {lv.remarks.length} passages</button>}
            </article>
          )}
          <article className="tn-page">
            {sections.map((s) => (
              <div key={s.name}>
                <div className="tn-sech" lang="de">{s.no}&nbsp;&nbsp;<LvText text={s.name} /></div>
                {s.items.map((i) => {
                  const on = openOz === i.oz;
                  const page = i.sources.find((x) => x.page !== null)?.page;
                  const fs = checking ? check.findingsByOz?.get(i.oz) ?? [] : [];
                  const quoted = fs.flatMap((f) => quotedFragments(f.evidence));
                  return (
                    <div key={i.oz} id={`tn-${i.oz}`} className={`tn-pos${on ? " tn-on" : ""}`} onClick={() => (picking ? check.onPick(on ? null : i.oz) : onPlace({ ...place, item: on ? null : i.oz }))}>
                      <div className="n">{i.oz}</div>
                      <div>
                        <div className="s" lang="de"><LvText text={i.short} marks={quoted} /></div>
                        {i.long && i.long.trim() !== i.short.trim() && <div className="l" lang="de"><LvText text={i.long} marks={quoted} /></div>}
                      </div>
                      <div className="qu">{i.qty === null ? "" : qty(i.qty)} {i.unit}<small>{page ? `p. ${page}` : ""}</small></div>
                      {checking && fs.length > 0 && (
                        <div className="tn-notes">
                          {fs.map((f, n) => (
                            <div key={n} className="tn-note found"><Sign severity={f.severity} size={15} /><span>{f.title || f.explanation}</span></div>
                          ))}
                        </div>
                      )}
                      {pricing && priced(i.oz).source !== "none" && (
                        <div className="tn-notes">
                          <div className="tn-note price">
                            <i className={`tn-src is-${priced(i.oz).source}`} />
                            <span>
                              {priced(i.oz).unit !== null && <b>{eur(priced(i.oz).unit)}{priced(i.oz).material ? " material" : ""} per {i.unit}</b>}
                              {SOURCES.find(([x]) => x === priced(i.oz).source)![1]}{priced(i.oz).from && `: ${priced(i.oz).from}`}{priced(i.oz).stale && ", out of date"}
                            </span>
                          </div>
                        </div>
                      )}
                      {!picking && (marked(i) || on) && (
                        <div className="tn-notes">
                          {i.change && (
                            <div className="tn-note diff">
                              <b>Changed in issue {lv.issues.length}</b>
                              {/* a reworded text is long: the margin says that it is, the open item what */}
                              {i.change.kind === "text" && !on ? <p>Reworded: {i.change.was?.length ?? 0} lines gone, {i.change.now?.length ?? 0} new. Click to read them.</p> : <Changed it={i} />}
                            </div>
                          )}
                          {i.diff && <div className="tn-note diff"><b>The documents differ{isAsked(lv, i.oz) && " · asked"}</b><Differs it={i} docs={tender.documents} /></div>}
                          {i.kind !== "normal" && <div className="tn-note"><b>{KIND_LABEL[i.kind]}</b>{KIND_SAYS[i.kind]}</div>}
                          {on && <div className="tn-note src">{i.sources.map((x) => `${tender.documents[x.doc].format}${x.page !== null ? ` page ${x.page}` : ""}`).join(" · ")}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {!single && tender.lvs[tender.lvs.indexOf(lv) + 1] && (
              <button className="tn-btn ink tn-more" onClick={() => toLv(tender.lvs[tender.lvs.indexOf(lv) + 1].id)}>Next LV: {lvTitle(tender.lvs[tender.lvs.indexOf(lv) + 1])}</button>
            )}
          </article>
        </div>
      </div>
    );
  }

  const differing = lv ? lv.items.filter((i) => i.diff) : [];
  // The Prices step on the tender's document (D-068): where the prices come from and the inquiries are its
  // cover page, the price of an item stands beside it, the strip says how firm each price is.
  const pricesLayer = useMemo<StepLayer | null>(() => {
    if (!pricing || !lv) return null;
    const unitOf = new Map(lv.items.map((i) => [i.oz, i.unit]));
    const name = (src: Source) => SOURCES.find(([x]) => x === src)![1];
    const counts = SOURCES.map(([src]) => lv.items.filter((i) => priced(i.oz).source === src).length);
    return {
      title: "Prices",
      front: (
        <div className="td-pfront">
          {prices.byOz || supply ? (
            <>
              <p className="lede">{lv.items.filter((i) => priced(i.oz).unit !== null).length} of {lv.items.length} items have a price to go by. A quote for this tender comes before the price book, the price book before past bids. A supplier's price is the material part of a unit price, never the whole.</p>
              <div className="td-srcs">
                {SOURCES.map(([src, title, says], n) => (
                  <div key={src} className={`tn-srcrow${counts[n] ? "" : " zero"}`}>
                    <i className={src === "none" ? "tn-tick" : `tn-src is-${src}`} />
                    <div><b>{title}</b><small>{says}</small><span className="tn-bar"><i style={{ width: `${(100 * counts[n]) / Math.max(1, lv.items.length)}%` }} /></span></div>
                    <b className="tn-n">{counts[n]}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="lede">Reading the prices of this LV.</p>
          )}
          <h3>Price inquiries</h3>
          {prices.inquiries ?? <p className="lede">Reading the inquiries of this LV.</p>}
        </div>
      ),
      lv: null,
      item: (oz) => {
        const p = priced(oz);
        if (p.source === "none") return null;
        if (p.source === "asked") {
          // in a package: said with its name, who it went to and when, or that it is still to send
          const pkg = supply?.packages.find((x) => x.items.some((i) => i.oz === oz));
          const out = pkg?.ask.filter((a) => a.mail?.sent_at) ?? [];
          return (
            <div className={`td-cd pr${out.length ? "" : " pt"}`}>
              <h4><i className="tn-src is-asked" />{out.length ? "Asked, no answer yet" : "In a package, not sent yet"}</h4>
              {pkg && <b className="td-pkg" lang="de">{pkg.name}</b>}
              {pkg && <p>{out.length ? `Sent to ${out.map((a) => `${a.supplier} (${a.mail!.sent_at!.slice(8, 10)}.${a.mail!.sent_at!.slice(5, 7)}.)`).join(", ")}.` : pkg.ask.length ? `To ask: ${pkg.ask.map((a) => a.supplier).join(", ")}. The inquiry is on the cover page.` : "Nobody to ask yet: see the cover page."}</p>}
            </div>
          );
        }
        return (
          <div className={`td-cd pr${p.source === "held" ? "" : " has"}`}>
            <h4><i className={`tn-src is-${p.source}`} />{name(p.source)}</h4>
            {p.unit !== null && <b className="td-price">{eur(p.unit)}<small>{p.material ? " material" : ""} per {unitOf.get(oz)}</small></b>}
            {(p.from || p.stale) && <p>{p.from}{p.stale && " · out of date"}</p>}
          </div>
        );
      },
      mark: (oz) => {
        const p = priced(oz);
        return p.source === "none" ? null : { cls: `tn-src is-${p.source}`, text: "", oz: "" };
      },
    };
  }, [pricing, lv, supply, prices.byOz, prices.inquiries]); // eslint-disable-line react-hooks/exhaustive-deps
  const tally = (items: TenderItem[]) => SOURCES.map(([src]) => items.filter((i) => priced(i.oz).source === src).length);
  const addedOpen = awarding && award && place.item ? award.added.find((x) => x.oz === place.item) ?? null : null;
  const noAward = awarding && lv && !award;
  const wide = noAward || asking || between || (pricing && place.view === "inquiries") || (bidding && place.view !== "map"); // one view takes the whole width
  const sheetOpen = awarding ? !!award && (!!openItem || !!addedOpen) : picking ? check.sheet !== null && !wide : openItem && openLv && place.view !== "read";
  const lvsByFindings = checking && !lv ? [...tender.lvs].sort((a, b) => SEVERITIES.reduce((d, sev) => d || (docOf(b)?.counts?.[sev] ?? 0) - (docOf(a)?.counts?.[sev] ?? 0), 0)) : [];
  // in the intake the steps after the tender wait for "Take it on"
  const locked = intake ? " off locked" : "";
  // The pipeline has no strip of its own: what Polier is doing at the moment is said in the cell of the
  // step it belongs to (read, rules, AI review and compare are the Tender step's), under a running stripe.
  const going = (ids: string[]) => (run?.active ? run.stages.find((x) => ids.includes(x.id) && x.status === "running") ?? null : null);
  const atTender = going(["read", "rules", "ai", "compare"]);
  const atQuestions = going(["questions"]);
  const atPrices = going(["prices"]);
  const queued = !!run?.active && !atTender && !atQuestions && !atPrices;
  const stopped = !!run && (run.status === "failed" || run.status === "interrupted" || run.status === "cancelled");
  const lockedWhy = intake ? "In the intake: take the tender on to go on" : undefined;
  return (
    <div className={`tn${picking ? " tn-check" : ""}${wide ? " tn-ask" : ""}`}>
      <nav className="tn-stages" aria-label="Where the tender stands">
        {/* the tender and its checks are one step (D-065): what came, and what the rules and the AI review found in it */}
        <button className={`tn-stage${checking ? " on" : ""}${atTender || queued ? " busy" : ""}`} aria-current={checking ? "step" : undefined} onClick={() => toStep("check")}>
          <b><i>1</i>Tender</b>
          <span>{atTender ? `${atTender.title} · ${atTender.line || "running"}` : queued ? "Polier is about to check it" : stopped ? `the checks stopped (${run!.status}) · ` : ""}{atTender || queued ? "" : <>{single ? "1 LV" : `${tender.lvs.length} LVs`} · {count(tender.items, "item")} · {found ? (SEVERITIES.some((sev) => found[sev] > 0) ? SEVERITIES.filter((sev) => found[sev] > 0).map((sev) => countLabel(found[sev], sev)).join(" · ") : "no finding") : "being read"}</>}</span>
        </button>
        <button className={`tn-stage${asking ? " on" : ""}${locked}${atQuestions ? " busy" : ""}`} disabled={!!intake} title={lockedWhy} aria-current={asking ? "step" : undefined} onClick={() => toStep("questions")}>
          <b><i>2</i>Questions</b>
          <span>{intake ? "after you take it on" : atQuestions ? atQuestions.line || "Polier drafts the questions" : qs ? (qs.length ? `${qs.length} · ${qs.filter((q) => q.status === "new").length} not asked · ${qs.filter((q) => q.status === "partly" || q.status === "answered").length} answered` : "none so far") : "to the client"}</span>
        </button>
        <button className={`tn-stage${pricing ? " on" : ""}${locked}${atPrices ? " busy" : ""}`} disabled={!!intake} title={lockedWhy} aria-current={pricing ? "step" : undefined} onClick={() => toStep("prices")}>
          <b><i>3</i>Prices</b>
          <span>{intake ? "after you take it on" : atPrices ? atPrices.line || "Polier looks up prices" : pricing && lv && supply ? `${lv.items.filter((i) => priced(i.oz).unit !== null).length} of ${lv.items.length} items with a price` : "inquiries, price book, past bids"}</span>
        </button>
        <button className={`tn-stage${bidding ? " on" : ""}${locked}`} disabled={!!intake} title={lockedWhy} aria-current={bidding ? "step" : undefined} onClick={() => toStep("bid")}>
          <b><i>4</i>Bid</b>
          <span>{bidding && offer ? `${offer.priced} of ${offer.items} priced · ${eur(offer.net)} net` : bids ? `${count(bids, "bid file")} came` : "unit prices on the LV"}</span>
        </button>
        <button className={`tn-stage${awarding ? " on" : ""}${tender.awards.length || outcome || awarding ? "" : " off"}${locked}`} disabled={!!intake} title={lockedWhy} aria-current={awarding ? "step" : undefined} onClick={() => toStep("award")}>
          <b><i>5</i>Award</b>
          <span>{tender.awards.length ? `${eur(tender.awards.reduce((n, a) => n + a.net, 0))} net` : outcome ? OUTCOMES.find(([o]) => o === outcome)![1].toLowerCase() : "not yet"}</span>
        </button>
        {(!run || stopped) && (
          <span className="tn-decide">
            <button className="btn-ghost" disabled={starting} title="Rules and AI review on every file of this tender" onClick={onRun}>{stopped ? "Run the checks again" : "Run the checks"}</button>
          </span>
        )}
        {run?.active && (
          <span className="tn-decide">
            <button className="btn-ghost" disabled={run.stopping} title="It stops after the step it is on" onClick={() => onMove("cancel")}>{run.stopping ? "Stopping" : "Stop"}</button>
          </span>
        )}
        {asking && run?.status === "waiting" && (
          <span className="tn-decide">
            <button className="btn-ghost" title="Do not wait for the client's answers: what stays open is priced as a risk" onClick={() => onMove("go-on")}>Close the questions</button>
          </span>
        )}
        {intake && (
          <span className="tn-decide">
            <button className="btn-new" title="It goes on to the questions and the prices" onClick={intake.onTake}>Take it on</button>
            <button className="btn-ghost" title="No bid: it goes to Result as passed" onClick={intake.onPass}>Pass</button>
          </span>
        )}
      </nav>
      {pricesLayer && lv ? (
        <TenderDocView layer={pricesLayer} tender={tender} plan={plan} place={place} views={null} general={null} onAsk={onAsk} onDates={onDocuments} onDrawer={() => setDrawer(true)}
          summary={check.summary} findings={null} findingsLv={lv.id} selected={check.selected} onOpenLv={(id) => onPlace({ ...place, lv: id, item: null })} />
      ) : asking && lv && isValidElement(questions.view) ? (
        // the Questions step is the tender's document as the Tender step shows it (D-069): under a finding
        // the client has to settle stands its question, the message is behind the button at the top right
        cloneElement(questions.view as ReactElement<{ layout?: (layer: QuestionsLayer) => ReactNode }>, {
          layout: (layer: QuestionsLayer) => (
            <TenderDocView ask={layer} tender={tender} plan={plan} place={place} views={layer.action} general={check.general} onAsk={onAsk} onDates={onDocuments} onDrawer={() => setDrawer(true)}
              summary={check.summary} findings={check.findingsByOz} findingsLv={lv.id} selected={check.selected} onOpenLv={(id) => onPlace({ ...place, lv: id, item: null })} />
          ),
        })
      ) : checking && place.view === "map" ? (
        <TenderDocView tender={tender} plan={plan} place={place} views={views.length > 1 ? viewSwitch : null} general={check.general} onAsk={onAsk} onDates={onDocuments} onDrawer={() => setDrawer(true)}
          summary={check.summary} findings={check.findingsByOz} findingsLv={lv?.id ?? null} selected={check.selected}
          onOpenLv={(id) => onPlace({ ...place, lv: id, item: null })} />
      ) : (
      <div className={`tn-work${sheetOpen ? " open" : ""}`}>
        {asking ? (
          lv ? (
            differing.length > 0 && (
              <aside className="tn-found tn-diffs">
                <div className="tn-found-head"><span className="tn-label">The documents differ</span><span className="tn-counts">{differing.filter((i) => isAsked(lv, i.oz)).length} of {differing.length} asked</span></div>
                <p className="tn-wait">Where two documents of this LV word an item differently, the app does not say which holds. Put the ones that change the price among the questions.</p>
                {differing.map((i) => (
                  <div key={i.oz} className="tn-diffitem">
                    <button className="tn-ozlink" onClick={() => (check.onPick(i.oz), onPlace({ ...place, step: "check", view: "map", item: null }))}>{i.oz}</button>
                    <div>
                      <span lang="de"><LvText text={i.short} /></span>
                      <small>{i.diff!.qty !== undefined ? "another quantity" : i.diff!.unit !== undefined ? "another unit" : i.diff!.only?.length ? <>only in the {tender.documents[i.diff!.doc].format} file: <span lang="de">„<LvText text={i.diff!.only[0]} />“</span></> : `text ${Math.round((i.diff!.alike ?? 1) * 100)} % alike`}</small>
                    </div>
                    {i.diff!.qty !== undefined || i.diff!.unit !== undefined ? <span className="tn-tag ink">Asked</span> : isAsked(lv, i.oz) ? <button className="tn-btn plain sm" onClick={() => onAsk(lv.id, i.oz, false)} title="Take it out of the questions">Asked</button> : <button className="tn-btn out sm" onClick={() => onAsk(lv.id, i.oz, true)}>Ask</button>}
                  </div>
                ))}
              </aside>
            )
          ) : (
            <aside className="tn-found tn-lvs">
              <div className="tn-found-head"><span className="tn-label">Questions per LV</span></div>
              {tender.lvs.map((l) => (
                <button key={l.id} onClick={() => toLv(l.id)}>
                  <b>{l.no ?? l.id + 1}</b>
                  <span lang="de"><LvText text={l.label} /></span>
                  <small>{docOf(l) ? `${docOf(l)!.questions} to ask` : ""}</small>
                </button>
              ))}
            </aside>
          )
        ) : awarding ? (
          lv ? (
            award && (
              <aside className="tn-found tn-prices">
                <div className="tn-found-head"><span className="tn-label">The award</span><span className="tn-tag ink">{OUTCOMES.find(([o]) => o === (outcome ?? "won"))![1]}</span></div>
                <div className="tn-net"><span className="tn-label">Contract total, net</span><b>{eur(award.net)}</b><small lang="de">from <LvText text={tender.documents[award.doc].name} />, {award.priced} of {award.items} items priced</small></div>
                {award.bid && (
                  <div className="tn-net"><span className="tn-label">The bid that went out</span><b>{eur(award.bid.net)}</b><small lang="de">from <LvText text={tender.documents[award.bid.doc].name} /> · {Math.abs(award.net - award.bid.net) < 0.005 ? "the same total" : `${eur(award.net - award.bid.net)} ${award.net > award.bid.net ? "more" : "less"} in the award`}</small></div>
                )}
                {(["quantity", "unit", "dropped", "added", "price"] as Change[]).map((k) => {
                  const c = k === "added" ? award.added.length : k === "price" ? (award.bid ? lv.items.filter((i) => changeOf(award, i.oz) === "price").length : -1) : lv.items.filter((i) => changeOf(award, i.oz) === k).length;
                  if (c < 0) return null;
                  return (
                    <div key={k} className={`tn-srcrow${c ? "" : " zero"}`}>
                      <i className={`tn-mk${k === "price" || k === "dropped" ? "" : " diff"}`}>{CHANGE_MARK[k]}</i>
                      <div><b>{{ quantity: "Another quantity", unit: "Another unit", dropped: "Not in the award", added: "Only in the award", price: "Another price than bid", same: "" }[k]}</b><small>{CHANGE_SAYS[k]}</small></div>
                      <b className="tn-n">{c}</b>
                    </div>
                  );
                })}
                <p className="tn-wait">The award is held against the tender's {tender.documents[lv.carrier].format} file by item number. What it changed is what the site has to know first.</p>
                <div className="tn-srcacts">
                  {bid.analysisId && <a className="tn-btn ink sm" href={`/api/analyses/${bid.analysisId}/handover.html`} target="_blank" rel="noopener">Hand-over sheet</a>}
                </div>
              </aside>
            )
          ) : (
            <aside className="tn-found tn-lvs">
              <div className="tn-found-head"><span className="tn-label">The award per LV</span></div>
              {tender.lvs.map((l) => (
                <button key={l.id} onClick={() => toLv(l.id)}>
                  <b>{l.no ?? l.id + 1}</b>
                  <span lang="de"><LvText text={l.label} /></span>
                  <small>{tender.awards.some((a) => a.lv === l.id) ? "awarded" : "no award file"}</small>
                </button>
              ))}
            </aside>
          )
        ) : bidding ? (
          place.view === "map" &&
          (lv ? (
            <aside className="tn-found tn-prices">
              <div className="tn-found-head"><span className="tn-label">The bid as it stands</span></div>
              {offer ? (
                <>
                  <div className="tn-net"><span className="tn-label">Net total</span><b>{eur(offer.net)}</b><small>{offer.allowances > 0 ? `${eur(offer.allowances)} of it risk allowance · ` : ""}from the unit prices entered, on the file's quantities</small></div>
                  {([["own", "Priced", "a unit price of your own, or the file's"], ["taken", "Suggested price, taken as it stands", "a partner's quote or past bids: check it against its sources"], ["open", "No price", "the file would go out incomplete"]] as const).map(([k, name, says]) => {
                    const c = lv.items.filter((i) => bidOf(i.oz) === k).length;
                    return (
                      <div key={k} className={`tn-srcrow${c ? "" : " zero"}`}>
                        <i className={`tn-bidmark is-${k}`} />
                        <div><b>{name}</b><small>{says}</small><span className="tn-bar"><i style={{ width: `${(100 * c) / Math.max(1, lv.items.length)}%` }} /></span></div>
                        <b className="tn-n">{c}</b>
                      </div>
                    );
                  })}
                  <p className="tn-wait">{backText(lv)}</p>
                  <div className="tn-srcacts">
                    <button className="tn-btn ink sm" onClick={() => onPlace({ ...place, view: "items" })}>Bid sheet</button>
                    {offer.x84 && <a className="tn-btn out sm" href={`/api/analyses/${bid.analysisId}/bid.x84`} download>X84</a>}
                    <a className="tn-btn out sm" href={`/api/analyses/${bid.analysisId}/bid.csv`} download>CSV</a>
                  </div>
                </>
              ) : (
                <p className="tn-wait">Reading the bid of this LV.</p>
              )}
            </aside>
          ) : (
            <aside className="tn-found tn-lvs">
              <div className="tn-found-head"><span className="tn-label">The bid per LV</span></div>
              {tender.lvs.map((l) => (
                <button key={l.id} onClick={() => toLv(l.id)}>
                  <b>{l.no ?? l.id + 1}</b>
                  <span lang="de"><LvText text={l.label} /></span>
                  <small>{count(l.items.length, "item")}</small>
                </button>
              ))}
            </aside>
          ))
        ) : pricing ? (
          place.view !== "inquiries" &&
          (lv ? (
            <aside className="tn-found tn-prices">
              <div className="tn-found-head"><span className="tn-label">Where the prices come from</span></div>
              {prices.byOz || supply ? (
                <>
                  {SOURCES.map(([src, name, says], n) => {
                    const c = tally(lv.items)[n];
                    return (
                      <div key={src} className={`tn-srcrow${c ? "" : " zero"}`}>
                        <i className={src === "none" ? "tn-tick" : `tn-src is-${src}`} />
                        <div><b>{name}</b><small>{says}</small><span className="tn-bar"><i style={{ width: `${(100 * c) / Math.max(1, lv.items.length)}%` }} /></span></div>
                        <b className="tn-n">{c}</b>
                      </div>
                    );
                  })}
                  <p className="tn-wait">{lv.items.filter((i) => priced(i.oz).unit !== null).length} of {lv.items.length} items have a price to go by. A quote for this tender comes before the price book, the price book before past bids. A supplier's price is the material part of a unit price, never the whole.</p>
                  <div className="tn-srcacts">
                    <button className="tn-btn ink sm" onClick={() => onPlace({ ...place, view: "inquiries" })}>Price inquiries</button>
                    <button className="tn-btn out sm" onClick={() => toStep("bid")}>To the bid</button>
                  </div>
                </>
              ) : (
                <p className="tn-wait">Reading the prices of this LV.</p>
              )}
            </aside>
          ) : (
            <aside className="tn-found tn-lvs">
              <div className="tn-found-head"><span className="tn-label">Prices per LV</span></div>
              {tender.lvs.map((l) => (
                <button key={l.id} onClick={() => toLv(l.id)}>
                  <b>{l.no ?? l.id + 1}</b>
                  <span lang="de"><LvText text={l.label} /></span>
                  <small>{count(l.items.length, "item")}</small>
                </button>
              ))}
            </aside>
          ))
        ) : !checking ? (
          <Cover tender={tender} plan={plan} single={single} onDrawer={() => setDrawer(true)} onDates={onDocuments} />
        ) : lv ? (
          <aside className="tn-found">{check.list ?? <p className="tn-wait">Reading the findings of this LV.</p>}</aside>
        ) : (
          <aside className="tn-found tn-lvs">
            <div className="tn-found-head"><span className="tn-label">Findings per LV</span>{found && <Counts counts={found} />}</div>
            {check.summary ? (
              lvsByFindings.map((l) => (
                <button key={l.id} onClick={() => toLv(l.id)}>
                  <b>{l.no ?? l.id + 1}</b>
                  <span lang="de"><LvText text={l.label} /></span>
                  {docOf(l)?.counts ? <Counts counts={docOf(l)!.counts!} /> : <small>not read</small>}
                </button>
              ))
            ) : (
              <p className="tn-wait">The LVs are being read.</p>
            )}
          </aside>
        )}
        {asking ? (
          <main className="tn-main">
            {!single && <div className="tn-head">{crumbs || <h2>{tender.lvs.length} LVs</h2>}{!lv && <span className="tn-label">Bidder questions are written per LV: choose one</span>}</div>}
            {lv ? questions.view ?? <p className="tn-wait">Reading the bidder questions of this LV.</p> : null}
          </main>
        ) : between ? (
          <main className="tn-main">
            <div className="tn-head"><h2>Between the LVs</h2><span className="tn-label">what the trades expect of each other</span>{viewSwitch}</div>
            {building ? (
              <ProjectView
                project={building}
                onOpenLv={(id) => {
                  const file = building.lvs.find((l) => l.analysis_id === id)?.file;
                  const to = tender.lvs.find((l) => tender.documents[l.carrier].name === file);
                  if (to) onPlace({ ...place, view: "map", lv: to.id, item: null });
                }}
              />
            ) : (
              <p className="tn-wait">{buildingError ?? `Reading all ${tender.lvs.length} LVs against each other. This takes a moment.`}</p>
            )}
          </main>
        ) : noAward ? (
          <main className="tn-main">
            {!single && <div className="tn-head">{crumbs}</div>}
            <div className="tn-noaward">
              <h2>No award among the files</h2>
              <p>When the client awards the contract it sends the LV again, as awarded (GAEB phase 86, or a PDF headed "Auftrag"). Added to the project, it is held here against the tender and the bid: what was dropped, added or changed.</p>
              <div className="tn-srcacts"><button className="tn-btn ink sm" onClick={onDocuments}>Add the award file</button></div>
              <span className="tn-label">How the tender ended</span>
              <div className="tn-views" role="group" aria-label="How the tender ended">
                {OUTCOMES.map(([o, name]) => (
                  <button key={o} aria-pressed={outcome === o} aria-selected={outcome === o} onClick={() => onOutcome(outcome === o ? null : o)}>{name}</button>
                ))}
              </div>
              <p className="tn-quiet">{outcome ? "It stands under Result on the board. Press it again to take it back." : "Not said yet: the tender is still running."}</p>
            </div>
          </main>
        ) : bidding && place.view !== "map" ? (
          <main className="tn-main">
            <div className="tn-head">
              {crumbs || <h2>{place.view === "whatif" ? "What-if" : "Bid sheet"}</h2>}
              {!lv && <span className="tn-label">A bid is made per LV: choose one</span>}
              {viewSwitch}
            </div>
            {lv ? (place.view === "whatif" ? whatif : bid.sheet) ?? <p className="tn-wait">Reading the bid of this LV.</p> : (
              <div className="tn-found tn-lvs" style={{ border: 0 }}>
                {tender.lvs.map((l) => (
                  <button key={l.id} onClick={() => toLv(l.id)}><b>{l.no ?? l.id + 1}</b><span lang="de"><LvText text={l.label} /></span><small>{count(l.items.length, "item")}</small></button>
                ))}
              </div>
            )}
          </main>
        ) : pricing && place.view === "inquiries" ? (
          <main className="tn-main">
            <div className="tn-head">
              {crumbs || <h2>Price inquiries</h2>}
              {!lv && <span className="tn-label">Inquiries are made per LV: choose one</span>}
              {viewSwitch}
            </div>
            {lv ? prices.inquiries ?? <p className="tn-wait">Reading the inquiries of this LV.</p> : (
              <div className="tn-found tn-lvs" style={{ border: 0 }}>
                {tender.lvs.map((l) => (
                  <button key={l.id} onClick={() => toLv(l.id)}><b>{l.no ?? l.id + 1}</b><span lang="de"><LvText text={l.label} /></span><small>{count(l.items.length, "item")}</small></button>
                ))}
              </div>
            )}
          </main>
        ) : (
        <main className="tn-main">
          <div className="tn-head">
            {crumbs || <h2>{single ? "The LV" : `${tender.lvs.length} LVs`}</h2>}
            <span className="tn-label">{lv ? `${count(sections.length, "section")} · ${count(lv.items.length, "item")}` : "click a name to go into an LV"}</span>
            {viewSwitch}
            {place.view === "map" && awarding && award && (
              <div className="tn-key tn-label">
                <span><i className="tn-tick" />As tendered</span>
                <span><i className="tn-blk diff">Q</i>Another quantity</span>
                <span><i className="tn-blk is-dropped">–</i>Not in the award</span>
                <span><i className="tn-blk diff">+</i>Only in the award</span>
                {award.bid && <span><i className="tn-blk">€</i>Another price than bid</span>}
              </div>
            )}
            {place.view === "map" && bidding && (
              <div className="tn-key tn-label">
                <span><i className="tn-bidmark is-own" />Priced</span>
                <span><i className="tn-bidmark is-taken" />Suggested price, taken as it stands</span>
                <span><i className="tn-bidmark is-open" />No price</span>
              </div>
            )}
            {place.view === "map" && pricing && (
              <div className="tn-key tn-label">
                {SOURCES.map(([src, name]) => <span key={src}><i className={src === "none" ? "tn-tick" : `tn-src is-${src}`} />{name}</span>)}
              </div>
            )}
            {place.view === "map" && !pricing && !bidding && !awarding && (checking ? (
              <div className="tn-key tn-label">
                {SEVERITIES.map((sev) => <span key={sev}><Sign severity={sev} size={14} />{SEVERITY_LABEL[sev]}</span>)}
                <span><i className="tn-tick" />Item without a finding</span>
              </div>
            ) : <Key differ={differ} issued={tender.lvs.some((l) => l.issues.length > 1)} />)}
          </div>
          {main}
        </main>
        )}
        {sheetOpen && !asking && <aside className="tn-side">{awarding && award && openOz ? <AwardSheet award={award} oz={openOz} it={openItem} added={addedOpen} tender={tender} onClose={close} /> : picking ? check.sheet : openItem && openLv && <Sheet lv={openLv} it={openItem} tender={tender} single={single} onClose={close} asked={isAsked(openLv, openItem.oz)} onAsk={(ask) => onAsk(openLv.id, openItem.oz, ask)} />}</aside>}
      </div>
      )}
      {drawer && <Drawer tender={tender} onClose={() => setDrawer(false)} onPick={pick} onFiles={() => (setDrawer(false), onDocuments())} />}
    </div>
  );
}
