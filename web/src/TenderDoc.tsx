// The tender as one document (D-064): what came, then every LV with its remarks and items, one after the
// other on one page. Nothing beside the text is a panel: the piece of the map for a section stands at the
// left of that section, the card of an item at the right of that item, and both scroll away with it. What
// stays is a narrow index at the far left to jump with, and one line about the tender above the page.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openCatalogProject } from "./api";
import { Sign } from "./components";
import { LvText, eur, qty } from "./format";
import { Fingerprint, PLANNED } from "./Projects";
import type { TenderPlace } from "./router";
import { ACTION_LABEL, CATEGORY_LABEL, KIND_LABEL, SEVERITIES, SEVERITY_LABEL, countLabel, type BidRow, type BuildParts, type Finding, type ItemKind, type Plan, type Project, type ProjectSummary, type Severity, type Tender, type TenderItem, type TenderLv } from "./types";
import { AskRow, Changed, Differs, backText, count, dayText, daysLeft, lvTitle, sectionsOf } from "./Tender";
import "./tenderdoc.css";

const LETTER: Record<ItemKind, string> = { normal: "", lump_sum: "P", hourly: "H", contingency: "B", alternative: "W", surcharge: "Z" };
const CHANGE_HEAD = { new: "New in this issue", quantity: "Another quantity than before", unit: "Another unit than before", text: "Reworded" } as const;
const BY_RANK: (Severity | null)[] = [null, "info", "warn", "high"];
const RANK: Record<Severity, number> = { info: 1, warn: 2, high: 3 };
const NONE: Finding[] = [];
const AFTER = 70; // px the map still turns after its last piece reached the middle: the last part's own length
const ozKey = (oz: string) => oz.split(".").map((x) => x.padStart(5, "0")).join(".");

/** Another step of the tender drawn on the same document (D-068): its cover page in place of the tender's,
 *  its cards beside the items in place of the findings, its marks on the strips. */
export interface StepLayer {
  title: string;
  front: ReactNode | ((go: (oz: string) => void) => ReactNode); // the step's cover page; `go` leads to an item
  lv: ReactNode; // what it says about the LV as a whole
  item: (oz: string) => ReactNode; // what it says about an item, or nothing
  mark: (oz: string) => { cls: string; text: string; oz: string } | null; // the item's mark on the strip, and the class of its number
}

/** The Questions step on the same document: the tender as it stands, and under a finding the client has to
 *  settle its question to tick, reword and follow; the items with a question carry its mark on the map. */
export interface AskLayer {
  card: (f: Finding) => ReactNode; // under the finding's card; nothing for a finding without a question
  mark: (oz: string) => { cls: string; text: string } | null; // in place of the item's mark on the strip
  // While the message is written: only the items with a question stand on the page, each with the findings
  // that carry one, and the message stands where the map was. `go` leads to an item.
  only?: ((oz: string) => boolean) | null;
  panel?: ((go: (oz: string) => void) => ReactNode) | null;
  keep?: (f: Finding) => boolean; // with `only`: the findings that stay beside an item
  wide?: boolean; // the panel needs more room than the message
  extra?: (oz: string) => ReactNode; // beside an item after its findings: its price (D-071)
  cover?: ReactNode; // on the cover sheet: how the questions and the prices stand
  head?: { title: string; note: string }; // what the head over the cards says while `only` holds (default: findings with a question)
}

/** The unit prices on the items of the open LV (D-075): the row of the bid per item, and how a price typed
 *  is kept. `set` is null while the tender is in the intake: the fields stand there, nothing is entered. */
export interface DocPrices {
  rows: Map<string, BidRow>;
  set: ((oz: string, text: string) => void) | null;
  priced: number;
  net: number;
  // a supplier's price for the material of an item, where one is at hand: what a unit price is built on
  material?: (oz: string) => { unit_price: number; supplier: string } | null;
  build?: (oz: string, parts: BuildParts) => void; // keeps the parts and puts their result in as the unit price
  defaults?: { surcharge: number; wage: number }; // what a new build starts with
  why?: string; // why nothing can be typed, where `set` is null
}

/** A number as typed: "12,50", "1.250,5", "12.5". Nothing or nonsense is 0. */
const typedNumber = (text: string) => {
  const x = parseFloat(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(x) ? x : 0;
};

/** A unit price built on a supplier's price (D-078): the supplier prices the material only, so the
 *  estimator adds what the item costs besides. (material × (1 + waste %) + hours × wage + equipment) ×
 *  (1 + surcharge %). Waste goes onto the material, never onto the LV's quantity. The parts are kept with
 *  the item on the server; the result goes into the field as the estimator's own price. */
function Build({ kept, defaults, material, unit, onPut, onClose }: { kept: BuildParts | null; defaults: { surcharge: number; wage: number }; material: { unit_price: number; supplier: string }; unit: string; onPut: (parts: BuildParts) => void; onClose: () => void }) {
  const show = (n: number) => (n ? n.toLocaleString("de-DE", { maximumFractionDigits: 3 }) : "");
  const [v, setV] = useState<Record<keyof BuildParts, string>>({
    material: priceText(material.unit_price), waste: show(kept?.waste ?? 0), hours: show(kept?.hours ?? 0), wage: show(kept?.wage || defaults.wage),
    equipment: show(kept?.equipment ?? 0), surcharge: show(kept?.surcharge ?? defaults.surcharge),
  });
  const n = (k: keyof BuildParts) => typedNumber(v[k]);
  const labour = n("hours") * n("wage");
  const result = (n("material") * (1 + n("waste") / 100) + labour + n("equipment")) * (1 + n("surcharge") / 100);
  const field = (key: keyof BuildParts, label: string, hint: string) => (
    <label>
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={v[key]} placeholder="0" onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      <small>{hint}</small>
    </label>
  );
  return (
    <div className="td-build">
      <b>Build the unit price<small lang="de">on {material.supplier || "the supplier's price"}</small></b>
      <div className="td-buildrow">
        {field("material", "Material", `€/${unit}, as quoted`)}
        <i>+</i>
        {field("waste", "Waste", "% on the material")}
        <i>+</i>
        {field("hours", "Labour", `hours per ${unit}`)}
        <i>×</i>
        {field("wage", "Wage", `€/h${labour ? ` = ${priceText(labour)} €/${unit}` : ""}`)}
        <i>+</i>
        {field("equipment", "Equipment", `€/${unit}`)}
        <i>×</i>
        {field("surcharge", "Surcharge", "% overheads, profit")}
        <i>=</i>
        <span className="td-buildsum"><b>{priceText(result)}</b><small>€/{unit}</small></span>
      </div>
      <div className="tn-askrow">
        <button className="tn-btn ink sm" disabled={result <= 0} onClick={() => {
          onPut({ material: n("material"), waste: n("waste"), hours: n("hours"), wage: n("wage"), equipment: n("equipment"), surcharge: n("surcharge") });
          onClose();
        }}>Put it in as the unit price</button>
        <button className="tn-btn plain sm" onClick={onClose}>Close</button>
        {labour === 0 && n("equipment") === 0 && <span className="td-buildnote">No labour and no equipment yet: this is the material with the surcharge on it.</span>}
      </div>
    </div>
  );
}

/** A row of the board on the cover sheet (D-081): how one station of the tender stands, and at its end the
 *  action that goes on with it. The row that is next carries the ink button; `open` says its panel is open. */
export interface BoardRow {
  key: string;
  n: number | string; // the figure on the plate
  name: string;
  says: ReactNode;
  sub?: ReactNode;
  share?: number | null; // how far it is, 0 to 1: a bar
  act?: { label: string; count?: number; title?: string; onClick: () => void } | null;
  more?: { label: string; title?: string; onClick: () => void } | null; // a second, quieter thing to do in the row
  next?: boolean;
  open?: boolean;
}

const SOURCE_SAYS: Record<string, string> = { own: "yours", quote: "quote", file: "in the file" };
const priceText = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The unit price of an item to type, and its total. A price Polier put there says where it is from under
 *  the field and is set in the quieter face; one the estimator typed is ink. The field is small: an empty
 *  one says what goes into it ("€/m"), a filled one stands beside its quantity's unit and its total in
 *  euros; what the columns are is said once, on the section's head. */
function PriceCells({ row, unit, onSet, material, onBuild, defaults, why }: { why?: string; onBuild: ((parts: BuildParts) => void) | null; defaults: { surcharge: number; wage: number }; row: BidRow | undefined; unit: string; onSet: ((text: string) => void) | null; material: { unit_price: number; supplier: string } | null }) {
  const [building, setBuilding] = useState(false);
  const built = !!row?.build && row.source === "own";
  const kept = row?.unit_price != null ? priceText(row.unit_price) : "";
  const [typed, setTyped] = useState(kept);
  const [busy, setBusy] = useState(false); // typing: what the server says meanwhile does not write over it
  useEffect(() => {
    if (!busy) setTyped(kept);
  }, [kept, busy]);
  const from = row?.source ? SOURCE_SAYS[row.source] ?? (row.suggestion?.basis === "partners" ? `price book${row.suggestion.stale ? ", old" : ""}` : "past bids") : "";
  const fixed = !onSet || row?.source === "file";
  return (
    <>
      <label className={`ep${row?.source && row.source !== "own" ? " auto" : ""}${priceState(row) ? ` p-${priceState(row)}` : ""}`}>
        <input type="text" inputMode="decimal" value={typed} disabled={fixed} placeholder={onSet ? `€/${unit}` : "–"} aria-label={`Unit price in euros per ${unit}`}
          title={!onSet ? why ?? "Take the tender on to price it" : row?.material ? `Material alone: ${priceText(row.material.unit_price)} (${row.material.supplier})` : undefined}
          onFocus={() => setBusy(true)}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onBlur={() => {
            setBusy(false);
            if (typed.trim() !== kept && onSet) onSet(typed.trim());
          }} />
        {from && <small>{`${built ? "built on material" : from}${row?.allowance_percent ? ` · +${row.allowance_percent} %` : ""}`}</small>}
        {material && onSet && row?.source !== "file" && (
          <button type="button" className="ep-build" title={`${material.supplier}: ${priceText(material.unit_price)} €/${unit} for the material alone. Add labour, equipment and your surcharge to make it a unit price.`} onClick={() => setBuilding(!building)}>
            {built ? "change the parts" : `material ${priceText(material.unit_price)}: build`}
          </button>
        )}
      </label>
      <span className="gp">{row?.total != null ? eur(row.total) : "–"}</span>
      {building && material && onBuild && <Build kept={row?.build ?? null} defaults={defaults} material={material} unit={unit} onPut={onBuild} onClose={() => setBuilding(false)} />}
    </>
  );
}

interface Row {
  it: TenderItem;
  gone: boolean; // of the issue before; the latest issue dropped it
  mark: string; // the letter on its mark in the strip, "" for a plain item
  up: boolean; // it stands up: changed, dropped, or the documents differ
}
interface Sec {
  no: string;
  name: string;
  rows: Row[];
}
interface Lv {
  lv: TenderLv;
  secs: Sec[];
  gapBefore: string[]; // LV numbers the files count past before this one ("16" between 15a and 17)
}

function build(tender: Tender): Lv[] {
  let last: number | null = null;
  return tender.lvs.map((lv) => {
    const gone = new Set(lv.removed.map((r) => r.oz));
    const items: TenderItem[] = [...lv.items, ...lv.removed.map((r) => ({ ...r, kind: "normal" as ItemKind, sources: [], diff: null, change: null }))];
    if (gone.size) items.sort((a, b) => ozKey(a.oz).localeCompare(ozKey(b.oz)));
    const secs = sectionsOf({ ...lv, items }).map((s) => ({
      no: s.no,
      name: s.name,
      rows: s.items.map((it) => {
        const isGone = gone.has(it.oz);
        return { it, gone: isGone, up: isGone || !!it.diff || !!it.change, mark: isGone ? "–" : it.diff ? "≠" : it.change ? (it.change.kind === "new" ? "+" : "Δ") : LETTER[it.kind] };
      }),
    }));
    // a gap in the numbers the files carry: the trade between may not have been sent
    const n = lv.no !== null && /^\d+/.test(lv.no) ? parseInt(lv.no, 10) : null;
    const gapBefore = n !== null && last !== null && n - last > 1 && n - last <= 3 ? Array.from({ length: n - last - 1 }, (_, k) => String(last! + k + 1)) : [];
    if (n !== null) last = n;
    return { lv, secs, gapBefore };
  });
}

/** How the price of an item stands, as the foot of its mark and of its number say it: "set" a price that
 *  holds (typed, a quote, in the file), "auto" one Polier put there and nobody confirmed, "" none. */
const priceState = (row: BidRow | undefined) => (row?.unit_price == null ? "" : row.source === "suggestion" ? "auto" : "set");

/** The strip of a section. An item can be in several states at once, so its mark has a place for each
 *  (D-077): the body is what the checks found (severity colour) with the letter of what the item is or of
 *  what changed in it, the round beside it is the question to the client, the foot is the price. */
const Strip = memo(function Strip({ lvId, rows, ranks, onGo, over, ask, prices }: { lvId: number; rows: Row[]; ranks: Map<string, number> | null; onGo: (id: string) => void; over?: StepLayer["mark"]; ask?: AskLayer["mark"]; prices?: Map<string, BidRow> | null }) {
  return (
    <div className="tn-strip td-strip">
      {rows.map(({ it, gone, mark, up }) => {
        const sev = BY_RANK[ranks?.get(it.oz) ?? 0];
        const m = over && !gone ? over(it.oz) : null;
        if (over) return <button key={it.oz} className={m ? m.cls : "tn-tick"} title={`${it.oz} ${it.short}`} aria-label={`Item ${it.oz}`} data-it={`td-${lvId}-${it.oz}`} onClick={() => onGo(`td-${lvId}-${it.oz}`)}>{m?.text}</button>;
        const q = ask && !gone ? ask(it.oz) : null;
        const price = prices && !gone ? priceState(prices.get(it.oz)) : "";
        return (
          <button key={it.oz} className={`td-m${price ? ` p-${price}` : ""}`} title={`${it.oz} ${it.short}`} aria-label={`Item ${it.oz}`} data-it={`td-${lvId}-${it.oz}`} onClick={() => onGo(`td-${lvId}-${it.oz}`)}>
            <i className={sev ? `tn-flag ${sev}` : mark ? `tn-blk${gone ? " is-dropped" : up ? " diff" : ""}` : "tn-tick"}>{mark}</i>
            {q && <i className={q.cls}>{q.text}</i>}
          </button>
        );
      })}
    </div>
  );
});

/** What the marks of the map stand for, above its first piece: only the marks this tender has. */
function Legend({ model, ask, priced }: { model: Lv[]; ask: boolean; priced: boolean }) {
  const rows = model.flatMap((x) => x.secs.flatMap((sec) => sec.rows));
  const has = (m: string) => rows.some((r) => r.mark === m);
  const kinds = (Object.keys(LETTER) as ItemKind[]).filter((k) => LETTER[k] && has(LETTER[k]));
  const e = (mark: ReactNode, says: string) => <div key={says}><dt>{mark}</dt><dd>{says}</dd></div>;
  // Always open, two marks to a line with a word each: with a place per state (D-077) one to a line is too long.
  return (
    <div className="td-legend" aria-label="What the marks mean">
      <span className="tn-label">What the marks mean</span>
      <span className="tn-label td-lg-part">Map</span>
      <dl>
        {e(<i className="td-lg-no lv">1</i>, "LV")}
        {e(<i className="td-lg-no">01</i>, "Section")}
        {model.some((x) => x.gapBefore.length > 0) && e(<i className="td-lg-no hole">2</i>, "LV not sent")}
      </dl>
      <span className="tn-label td-lg-part">Colour · found</span>
      <dl>
        {e(<i className="tn-tick" />, "Nothing")}
        {SEVERITIES.map((sev) => e(<i className={`tn-flag ${sev}`} />, SEVERITY_LABEL[sev]))}
      </dl>
      {(kinds.length > 0 || ["+", "Δ", "≠", "–"].some(has)) && (
        <>
          <span className="tn-label td-lg-part">Letter · the item</span>
          <dl>
            {kinds.map((k) => e(<i className="tn-blk">{LETTER[k]}</i>, KIND_LABEL[k]))}
            {has("+") && e(<i className="tn-blk diff">+</i>, "New")}
            {has("Δ") && e(<i className="tn-blk diff">Δ</i>, "Changed")}
            {has("≠") && e(<i className="tn-blk diff">≠</i>, "Files differ")}
            {has("–") && e(<i className="tn-blk is-dropped">–</i>, "Dropped")}
          </dl>
        </>
      )}
      {ask && (
        <>
          <span className="tn-label td-lg-part">Round · the question</span>
          <dl>
            {e(<i className="td-q is-new">?</i>, "To ask")}
            {e(<i className="td-q is-new on">?</i>, "Ticked")}
            {e(<i className="td-q is-draft">→</i>, "Not sent")}
            {e(<i className="td-q is-out">→</i>, "Sent")}
            {e(<i className="td-q is-done">✓</i>, "Answered")}
          </dl>
        </>
      )}
      {priced && (
        <>
          <span className="tn-label td-lg-part">Foot · the price</span>
          <dl>
            {e(<i className="td-m p-set"><i className="tn-tick" /></i>, "Priced")}
            {e(<i className="td-m p-auto"><i className="tn-tick" /></i>, "Polier’s")}
            {e(<i className="td-m"><i className="tn-tick" /></i>, "None")}
          </dl>
        </>
      )}
    </div>
  );
}

const dayNo = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** What came when, against the tender's dates: a mark per day files arrived, today, the last day for
 *  questions and the day the bid is due. */
function Lane({ tender, plan, onGo }: { tender: Tender; plan: Plan; onGo: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, Tender["documents"]>();
  for (const d of tender.documents) if (d.arrived) byDay.set(d.arrived, [...(byDay.get(d.arrived) ?? []), d]);
  const days = [...byDay.keys()].sort();
  const ahead = [plan.questions_due, plan.due].filter((x): x is string => !!x);
  if (!days.length) days.push(today);
  const from = dayNo(days[0]);
  const to = Math.max(dayNo(today), ...days.map(dayNo), ...ahead.map(dayNo)) + 1;
  const x = (iso: string) => `${(((dayNo(iso) - from) / Math.max(1, to - from)) * 100).toFixed(2)}%`;
  const end = plan.due ?? plan.questions_due;
  return (
    <div className="td-lane">
      <i className="past" style={{ width: x(today) }} />
      <i className="ax" />
      {end && end > today && <i className="ax todo" style={{ left: x(today), right: `${(100 - parseFloat(x(end))).toFixed(2)}%` }} />}
      {days.map((day, n) => {
        const docs = byDay.get(day)!;
        const lv = docs.find((d) => d.lv !== null)?.lv;
        return (
          <span key={day} className={`mk up${n === 0 ? " lft" : ""}`} style={{ left: x(day) }}>
            <button className="arr" title={docs.map((d) => d.name).join("\n")} onClick={() => onGo(lv != null ? `td-lv-${lv}` : "td-top")}>{docs.length}</button>
            <small><b>{dayText(day).slice(4, -5)}</b></small>
          </span>
        );
      })}
      <span className="mk" style={{ left: x(today) }}><i className="tod" /><small>today</small></span>
      {plan.questions_due && <span className="mk" style={{ left: x(plan.questions_due) }}><i className="dia" /><small>questions until <b>{dayText(plan.questions_due).slice(0, -5)}</b></small></span>}
      {plan.due && <span className="mk rgt" style={{ left: x(plan.due) }}><i className="flag" /><small>bid due <b>{dayText(plan.due).slice(0, -5)}</b></small></span>}
      {/* the same days as a row to read: what came and what is due, in the order of time */}
      <div className="td-when">
        {[
          ...days.map((day, n) => {
            const docs = byDay.get(day)!;
            const issue = Math.max(...docs.map((d) => d.issue ?? 1));
            return { day, what: issue > 1 ? `Issue ${issue} of the LV came` : n === 0 ? "The tender came" : `${docs[0].role[0].toUpperCase()}${docs[0].role.slice(1)} came`, sub: count(docs.length, "file"), came: true };
          }),
          ...PLANNED.filter((d) => plan[d.kind]).map((d) => ({ day: plan[d.kind]!, what: d.label, sub: "", came: false })),
        ]
          .sort((a, b) => a.day.localeCompare(b.day) || Number(b.came) - Number(a.came))
          .map((e, n, all) => (
            <div key={n} className={`${e.day < today ? "gone" : ""}${!e.came && e.day >= today && !all.slice(0, n).some((x) => !x.came && x.day >= today) ? " next" : ""}`}>
              <b>{dayText(e.day)}</b>
              <span>{e.what}</span>
              <small>{[e.sub, daysLeft(e.day)].filter(Boolean).join(" · ")}</small>
            </div>
          ))}
      </div>
    </div>
  );
}

/** A row of the page: the text, and at its right what hangs beside it. */
function R({ id, cls, children, side }: { id?: string; cls?: string; children: ReactNode; side?: ReactNode }) {
  return (
    <div id={id} className={`td-r${cls ? ` ${cls}` : ""}`}>
      <div className="td-mid">{children}</div>
      <div className="td-rgt">{side}</div>
    </div>
  );
}
/** The map's piece for a part of the document used to stand beside it in the flow; the map is one column
 *  of its own now (see `TenderDocView`), so here it is nothing. */
function Piece(_: { no: ReactNode; title: string; sub: string; hole?: boolean; children?: ReactNode }) {
  return null;
}

const LvBlock = memo(function LvBlock({ x, tender, single, asked, onAsk, onGo, findings, general, reading, counts, marks, onOpen, layer, ask, prices }: { prices: DocPrices | null; ask: AskLayer | null; layer: StepLayer | null; x: Lv; tender: Tender; single: boolean; asked: Set<string>; onAsk: (lv: number, oz: string, ask: boolean) => void; onGo: (id: string) => void; findings: Map<string, Finding[]> | null; general: Finding[]; reading: boolean; counts: Record<Severity, number> | null; marks: string; onOpen: () => void }) {
  const { lv } = x;
  const only = ask?.only ?? null; // the message is being written: the items with a question, nothing else
  const secs = useMemo(() => (only ? x.secs.map((sec) => ({ ...sec, rows: sec.rows.filter((r) => !r.gone && only(r.it.oz)) })).filter((sec) => sec.rows.length) : x.secs), [x.secs, only]);
  // how bad the worst finding of each item is: from the findings when they are read, else from the
  // summary's one digit per item
  const ranks = useMemo(() => {
    const m = new Map<string, number>();
    if (findings) for (const [oz, fs] of findings) m.set(oz, fs.reduce((w, f) => Math.max(w, RANK[f.severity]), 0));
    else lv.items.forEach((i, n) => Number(marks[n] ?? 0) && m.set(i.oz, Number(marks[n])));
    return m;
  }, [findings, marks, lv]);
  const some = counts !== null && SEVERITIES.some((sev) => counts[sev] > 0);
  const [allRemarks, setAllRemarks] = useState(false);
  const remarks = allRemarks ? lv.remarks : lv.remarks.slice(0, 4);
  const docs = lv.documents.map((n) => tender.documents[n]);
  const issue = lv.issues.length;
  const of = (k: string) => lv.items.filter((i) => i.change?.kind === k).length;
  const said = ([[of("quantity") + of("unit"), "another quantity or unit"], [of("text"), "reworded"], [of("new"), "new"], [lv.removed.length, "dropped"]] as [number, string][]).filter(([n]) => n);
  return (
    <section className="td-lv" id={`td-lv-${lv.id}`} data-lv={lv.id}>
      <div className="td-s td-lvh">
        <div className="td-lft" />
        <div className="td-bod">
          <R cls="first">
            <header className="td-lvhead">
              <span className="tn-ix">{lv.no ?? lv.id + 1}</span>
              <div>
                <b lang="de"><LvText text={lv.label} /></b>
                <small>{count(lv.items.length, "item")} in {count(secs.length, "section")}{issue > 1 && ` · issue ${issue} of ${issue}`}{prices && prices.priced > 0 && ` · ${prices.priced} of ${lv.items.length} priced · ${eur(prices.net)} net`}</small>
              </div>
              <span className="td-files">
                {docs.map((d) => (
                  <span key={d.index} className={`tn-tag${d.carrier ? " ink" : ""}`} title={`${d.name}${d.carrier ? ": the items are read from it" : ""}`}>{d.format}</span>
                ))}
              </span>
            </header>
          </R>
        </div>
      </div>
      {(only ? general.some((f) => ask!.keep?.(f) ?? true) : layer ? !!layer.lv : issue > 1 || lv.back.form === null || general.length > 0 || (!findings && (some || reading))) && (
        <div className="td-s">
          <div className="td-lft" />
          <div className="td-bod">
            <R side={layer ? layer.lv : (
              <>
                {!findings && reading && <div className="td-kn">Reading the findings of this LV.</div>}
                {(only ? general.filter((f) => ask!.keep?.(f) ?? true) : general).map((f, n) => (
                  <div key={n} className={`td-cd fd${f.severity === "info" ? "" : " pt"}`}>
                    <h4><Sign severity={f.severity} size={15} />{CATEGORY_LABEL[f.category]}<span className="td-id">{f.origin === "llm" ? "AI review" : f.check_id}</span></h4>
                    {f.title && <b className="td-ft">{f.title}</b>}
                    <span className="tn-quote">{f.evidence}</span>
                    <p>{f.explanation}</p>
                    <p className="td-act"><span className="tn-label">What to do</span> {ACTION_LABEL[f.action]}</p>
                    {ask?.card(f)}
                  </div>
                ))}
                {!only && !findings && !reading && some && (
                  <div className="td-cd pt">
                    <h4>What the checks found here</h4>
                    <p>{SEVERITIES.filter((sev) => counts![sev] > 0).map((sev) => countLabel(counts![sev], sev)).join(" · ")}. The marks in the strips say where.</p>
                    <div className="tn-askrow"><button className="tn-btn ink sm" onClick={onOpen}>Show them beside the items</button></div>
                  </div>
                )}
                {!only && issue > 1 && (
                  <div className="td-cd pt">
                    <h4>The client sent this LV again</h4>
                    <p>Issue {issue} replaces issue {issue - 1}: {said.length ? said.map(([n, w]) => `${n} ${w}`).join(", ") : "nothing changed"}. What you read here is issue {issue}; what was done on the one before goes on with it.</p>
                  </div>
                )}
                {!only && lv.back.form === null && single && (
                  <div className="td-cd pt">
                    <h4>No GAEB file came</h4>
                    <p>The items are read from the {tender.documents[lv.carrier].format} file. A bid cannot go back as X84 without the client's X83.</p>
                  </div>
                )}
              </>
            )}>
              <p className="td-back"><span className="tn-label">The bid goes back as</span> {backText(lv)}</p>
            </R>
          </div>
        </div>
      )}
      {!only && lv.remarks.length > 0 && (
        <div className="td-s">
          <Piece no="§" title="Remarks" sub={`${count(lv.remarks.length, "passage")} before the items`} />
          <div className="td-bod">
            {remarks.map((r, n) => (
              <R key={n} side={r.doc !== lv.carrier && <div className="td-kn"><i className="tn-blk diff">≠</i>Only in the {tender.documents[r.doc].format} file: the {tender.documents[lv.carrier].format} file does not carry this passage.</div>}>
                <p className={`td-rem${r.doc !== lv.carrier ? " only" : ""}`} lang="de"><LvText text={r.text} /></p>
              </R>
            ))}
            {lv.remarks.length > remarks.length && (
              <R><p className="td-rem"><button className="tn-btn out sm" onClick={() => setAllRemarks(true)}>Show all {lv.remarks.length} passages</button></p></R>
            )}
          </div>
        </div>
      )}
      {secs.map((s, k) => {
        const up = s.rows.filter((r) => r.up).length;
        return (
          <div key={k} className="td-s" id={`td-s-${lv.id}-${k}`} data-s={`${lv.id}-${k}`}>
            <Piece no={s.no} title={s.name} sub={`${count(s.rows.length, "item")}${up ? ` · ${up} stand up` : ""}`}>
              <Strip lvId={lv.id} rows={s.rows} ranks={ranks} onGo={onGo} ask={ask?.mark} prices={prices?.rows} />
            </Piece>
            <div className="td-bod">
              <R><h3 className={`td-sech${prices ? " priced" : ""}`} lang="de"><i>{s.no}</i><LvText text={s.name} />{prices && <span className="td-cols" lang="en"><em>Quantity</em><em>Unit price</em><em>Total</em></span>}</h3></R>
              {s.rows.map(({ it, gone }, j) => {
                const page = it.sources.find((p) => p.page !== null)?.page;
                const where = it.sources.map((p) => `${tender.documents[p.doc].format}${p.page !== null ? ` page ${p.page}` : ""}`).join(" · ");
                const key = `${lv.id}:${it.oz}`;
                const figure = !!it.diff && (it.diff.qty !== undefined || it.diff.unit !== undefined);
                const fs = (gone ? [] : findings?.get(it.oz) ?? []).filter((f) => !only || (ask!.keep?.(f) ?? true));
                const found = fs.map((f, n) => (
                  <div key={n} className={`td-cd fd${f.severity === "info" ? "" : " pt"}`}>
                    <h4><Sign severity={f.severity} size={15} />{CATEGORY_LABEL[f.category]}<span className="td-id">{f.origin === "llm" ? "AI review" : f.check_id}</span></h4>
                    {f.title && <b className="td-ft">{f.title}</b>}
                    <span className="tn-quote">{f.evidence}</span>
                    <p>{f.explanation}</p>
                    <p className="td-act"><span className="tn-label">What to do</span> {ACTION_LABEL[f.action]}{f.money_at_stake !== null && <> · <b>{eur(f.money_at_stake)}</b> at stake</>}</p>
                    {ask?.card(f)}
                  </div>
                ));
                const rest = gone ? (
                  <div className="td-cd">
                    <h4><i className="tn-blk is-dropped">–</i>Dropped in issue {issue}</h4>
                    <p>Issue {issue - 1} had it with {it.qty === null ? "no quantity" : qty(it.qty)} {it.unit}.</p>
                  </div>
                ) : it.change || it.diff ? (
                  <>
                    {it.change && (
                      <div className="td-cd">
                        <h4><i className="tn-blk diff">{it.change.kind === "new" ? "+" : "Δ"}</i>{CHANGE_HEAD[it.change.kind]}</h4>
                        <Changed it={it} />
                        <small className="td-wh">{where}</small>
                      </div>
                    )}
                    {/* a difference the checks made a finding of (D-QTY, D-UNIT, D-TEXT) has its card above: not said twice */}
                    {it.diff && !fs.some((f) => f.check_id.startsWith("D-")) && (
                      <div className={`td-cd${!figure && !asked.has(key) ? " pt" : ""}`}>
                        <h4><i className="tn-blk diff">≠</i>The documents differ here</h4>
                        <Differs it={it} docs={tender.documents} />
                        <AskRow it={it} asked={asked.has(key)} onAsk={(ask) => onAsk(lv.id, it.oz, ask)} />
                      </div>
                    )}
                  </>
                ) : it.kind !== "normal" ? (
                  <div className="td-kn"><i className="tn-blk">{LETTER[it.kind]}</i>{KIND_LABEL[it.kind]}</div>
                ) : null;
                const mine = layer && !gone ? layer.mark(it.oz) : null;
                const qm = !layer && !gone ? ask?.mark(it.oz) ?? null : null;
                const price = prices && !gone ? priceState(prices.rows.get(it.oz)) : "";
                const more = gone ? null : ask?.extra?.(it.oz) ?? null;
                const side = layer ? (gone ? null : layer.item(it.oz)) : only ? <>{found}{more}</> : found.length || rest || more ? <>{found}{more}{rest}</> : null;
                return (
                  <R key={it.oz} id={`td-${lv.id}-${it.oz}`} cls={k === secs.length - 1 && j === s.rows.length - 1 ? "last" : undefined} side={side}>
                    <div className={`td-it${gone ? " gone" : ""}${prices ? " priced" : ""}`}>
                      {/* the item's number carries the colour of its worst finding, as its mark in the map and its card do */}
                      <span className={`ozc${price ? ` p-${price}` : ""}`}>
                        <b className={`oz${layer ? (mine?.oz ? ` ${mine.oz}` : "") : !gone && ranks.get(it.oz) ? ` is-${BY_RANK[ranks.get(it.oz)!]}` : ""}`}>{it.oz}</b>
                        {qm && <i className={qm.cls} title="The question to the client on this item">{qm.text}</i>}
                      </span>
                      <div className="tx">
                        <b lang="de"><LvText text={it.short} /></b>
                        {it.long && it.long.trim() !== it.short.trim() && <p lang="de"><LvText text={it.long} /></p>}
                      </div>
                      <span className="q">{it.qty === null ? "–" : qty(it.qty)} <small lang="de">{it.unit}</small>{page ? <i>PDF page {page}</i> : null}
                        {/* the client corrected the quantity in an answer: said here, the file's quantity stays the bid's */}
                        {!gone && prices?.rows.get(it.oz)?.qty_answered != null && <em className="qa" title="The client gave this quantity in an answer. The bid keeps the quantity of the file until a corrected LV comes.">client: {prices.rows.get(it.oz)!.qty_answered!.toLocaleString("de-DE")}</em>}</span>
                      {prices && (gone ? <><span /><span /></> : <PriceCells row={prices.rows.get(it.oz)} unit={it.unit} onSet={prices.set && ((text) => prices.set!(it.oz, text))} why={prices.why} material={prices.material?.(it.oz) ?? null} onBuild={prices.set && prices.build ? (parts) => prices.build!(it.oz, parts) : null} defaults={prices.defaults ?? { surcharge: 15, wage: 48 }} />)}
                    </div>
                  </R>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
});

export function TenderDocView({ tender, plan, place, views, onAsk, onDates, onDrawer, summary, findings, general, findingsLv, selected, onOpenLv, layer = null, ask = null, board = null, intake = null, back = null, prices = null }: { prices?: DocPrices | null; board?: BoardRow[] | null; intake?: { onTake: () => void; onPass: () => void } | null; back?: (() => void) | null; ask?: AskLayer | null; layer?: StepLayer | null; tender: Tender; plan: Plan; place: TenderPlace; views: ReactNode; onAsk: (lv: number, oz: string, ask: boolean) => void; onDates: () => void; onDrawer: () => void; summary: ProjectSummary | null; findings: Map<string, Finding[]> | null; general: Finding[] | null; findingsLv: number | null; selected: string | null; onOpenLv: (lv: number) => void }) {
  const model = useMemo(() => build(tender), [tender]);
  const asked = useMemo(() => new Set(tender.asked.map((a) => `${a.lv}:${a.oz}`)), [tender.asked]);
  const single = tender.lvs.length === 1;
  const [points, setPoints] = useState(0);
  const barred = !layer && (!!board?.length || !!intake);
  const boardEl = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false); // the board has left the screen upwards: its strip takes over
  const [pointAt, setPointAt] = useState(0); // how many of the rows to look at the reading has reached
  // A tender of several LVs: what they expect of each other and what is tendered twice (the pipeline's
  // "compare" station). Read for the cover sheet, so that the comparison shows also when it found nothing.
  const [between, setBetween] = useState<Project | "failed" | null>(null);
  useEffect(() => {
    if (single) return;
    let stale = false;
    setBetween(null);
    openCatalogProject(tender.id).then((p) => !stale && setBetween(p), () => !stale && setBetween("failed"));
    return () => void (stale = true);
  }, [single, tender.id, tender.documents.length]);
  const page = useRef<HTMLElement>(null);
  const mapBox = useRef<HTMLElement>(null);
  const mapList = useRef<HTMLDivElement>(null);
  const mapAt = useRef(0); // which height of the map's list stands in the middle of its column
  const turning = useRef<number | null>(null); // the same, while the wheel is turning the map

  /** Where an element stands in the page, whatever the page is being moved by (the gate sets it up with a transform). */
  const topOf = (el: HTMLElement) => {
    let y = 0;
    for (let e: HTMLElement | null = el; e && e !== page.current; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    return y;
  };
  /** How much of the page's top the head of an LV covers while it sticks there: a row led to has to stand
   *  below it, or the head lies over the top of the row and of its finding. */
  const lead = () => {
    const r = page.current, h = r?.querySelector<HTMLElement>(".td-lvh");
    // it sticks below the page's own top padding
    return r && h ? h.offsetHeight + (parseFloat(getComputedStyle(h).top) || 0) + (parseFloat(getComputedStyle(r).paddingTop) || 0) : 0;
  };
  /** How far under the page's top the line stands that says which part is being read: under the head of an
   *  LV, and under the strip of actions where the page has one (a part led to stands below both). */
  const readAt = () => 120 + (page.current?.querySelector<HTMLElement>(".td-dock")?.offsetHeight ?? 0);
  /** The rows a card waits beside for the estimator, in reading order, each once. */
  const pointRows = () => {
    const r = page.current;
    if (!r) return [];
    return [...new Set([...r.querySelectorAll<HTMLElement>(".td-cd.pt")].map((c) => c.closest<HTMLElement>(".td-r")))].filter((x): x is HTMLElement => x !== null);
  };
  /** A row is as tall as what hangs beside it (Atahan, 2026-11-22: a card must not run on beside the items
   *  after its own), so nothing is moved here; only how many cards wait for the estimator is counted. */
  const settle = useCallback(() => {
    const r = page.current;
    if (r) setPoints(pointRows().length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Where the reading stands. The map is moved so that the piece of the part being read is in the
   *  middle of its column: as the reading goes through a part, its piece drifts up and the next one
   *  rises from below, so the map travels at the pace of the text. What was read is dimmed. */
  const spy = useCallback(() => {
    const r = page.current, box = mapBox.current, list = mapList.current;
    if (r) {
      // the one the reading stands at: the last whose top has reached the line under the LV's head; at the
      // very end of the page the last one, which may not get that far up
      const rows = pointRows(), line = r.scrollTop + lead() + 28;
      setPointAt(r.scrollTop + r.clientHeight >= r.scrollHeight - 2 && r.scrollTop > 0 ? rows.length : rows.filter((x) => topOf(x) <= line).length);
    }
    if (!r || !box || !list) return;
    const line = r.getBoundingClientRect().top + readAt();
    const pieces = [...list.querySelectorAll<HTMLElement>(".td-mp")];
    const tops = pieces.map((p) => document.getElementById(p.dataset.for!)?.getBoundingClientRect().top ?? Infinity);
    let at = 0;
    for (let n = 0; n < pieces.length; n++) if (tops[n] <= line) at = n;
    const mid = (p: HTMLElement) => p.offsetTop + p.offsetHeight / 2;
    // While the wheel turns the map, the map says where it stands, not the text: a small turn can move
    // the text by less than a pixel, and reading the place back from the text would lose the turn.
    if (turning.current !== null) {
      const y = turning.current;
      at = 0;
      for (let n = 0; n < pieces.length; n++) if (mid(pieces[n]) <= y) at = n;
      list.style.transform = `translateY(${(box.clientHeight / 2 - y).toFixed(1)}px)`;
      pieces.forEach((p, n) => {
        p.classList.toggle("cur", n === at);
        p.classList.toggle("past", n < at);
      });
      return;
    }
    const next = pieces[at + 1];
    const through = next && isFinite(tops[at + 1]) ? Math.min(1, Math.max(0, (line - tops[at]) / Math.max(1, tops[at + 1] - tops[at]))) : 0;
    // the last part has no piece after it: its own goes on up by AFTER while the text runs to its end
    const pageTop = r.getBoundingClientRect().top;
    const start = tops[at] - pageTop + r.scrollTop, end = r.scrollHeight - r.clientHeight + readAt();
    const toEnd = next ? 0 : Math.min(1, Math.max(0, (r.scrollTop + readAt() - start) / Math.max(1, end - start)));
    const y = mid(pieces[at]) + (next ? through * (mid(next) - mid(pieces[at])) : toEnd * AFTER);
    mapAt.current = y;
    list.style.transform = `translateY(${(box.clientHeight / 2 - y).toFixed(1)}px)`;
    pieces.forEach((p, n) => {
      p.classList.toggle("cur", n === at);
      p.classList.toggle("past", n < at);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = useCallback((id: string, mark = true) => {
    const r = page.current, el = document.getElementById(id);
    if (!r || !el) return;
    turning.current = null; // a jump is the text moving: the map follows it again
    const head = el.closest(".td-lv") && !el.classList.contains("td-lv") ? lead() : 0;
    const from = r.scrollTop, to = Math.max(0, topOf(el) - head - 12), t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 240);
      r.scrollTop = from + (to - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (mark && el.classList.contains("td-r")) {
      r.querySelectorAll(".td-r.td-on").forEach((e) => e.classList.remove("td-on"));
      el.classList.add("td-on");
    }
  }, []);
  /** To the row to look at after (+1) or before (-1) the one the reading stands at; round at the ends. */
  const step = (by: 1 | -1) => {
    const rows = pointRows();
    if (!rows.length) return;
    const n = by > 0 ? pointAt % rows.length : (Math.max(pointAt, 1) - 2 + rows.length) % rows.length;
    const to = rows[n];
    go(to.id || (to.id = `td-pt-${n}`));
  };
  // The head of the findings stands over their column from outside the scrolling page: it has to know how
  // wide the page's scrollbar is (none on a Mac with overlay bars, 13 to 17px otherwise), or it stands that
  // much too far right.
  useLayoutEffect(() => {
    const r = page.current;
    if (!r) return;
    const set = () => r.parentElement?.style.setProperty("--td-sb", `${r.offsetWidth - r.clientWidth}px`);
    set();
    const seen = new ResizeObserver(set);
    seen.observe(r);
    return () => seen.disconnect();
  });
  // J and K go on and back through the findings, as the arrows of their head do; not while something is typed
  const stepNow = useRef(step);
  stepNow.current = step;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === "j" || e.key === "k") stepNow.current(e.key === "j" ? 1 : -1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useLayoutEffect(() => {
    settle();
    spy();
  });
  useEffect(() => {
    const r = page.current;
    if (!r) return;
    const again = () => (settle(), spy());
    void document.fonts?.ready.then(again);
    const watch = new ResizeObserver(again);
    watch.observe(r);
    return () => watch.disconnect();
  }, [settle, spy]);
  // The items on the screen are marked in the map: their marks in the strips stand in ink, so the map
  // says which stretch of the LV is being looked at.
  useEffect(() => {
    const r = page.current, list = mapList.current;
    if (!r || !list) return;
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) list.querySelector(`[data-it="${CSS.escape(e.target.id)}"]`)?.classList.toggle("td-vis", e.isIntersecting);
    }, { root: r });
    r.querySelectorAll(".td-lv .td-r[id]").forEach((row) => seen.observe(row));
    return () => (seen.disconnect(), list.querySelectorAll(".td-vis").forEach((t) => t.classList.remove("td-vis")));
  }, [model]);
  // The wheel over the map turns the map, and the text goes with it at once: the part whose piece comes
  // to the middle is the part shown. It is `spy` the other way round, so the two agree.
  useEffect(() => {
    const box = mapBox.current;
    if (!box) return;
    let rest = 0;
    const wheel = (e: WheelEvent) => {
      const r = page.current, list = mapList.current;
      if (!r || !list) return;
      e.preventDefault();
      const pieces = [...list.querySelectorAll<HTMLElement>(".td-mp")];
      const mid = (p: HTMLElement) => p.offsetTop + p.offsetHeight / 2;
      const y = Math.min(mid(pieces[pieces.length - 1]) + AFTER, Math.max(mid(pieces[0]), mapAt.current + e.deltaY));
      let at = 0;
      for (let n = 0; n < pieces.length; n++) if (mid(pieces[n]) <= y) at = n;
      const top = (p: HTMLElement) => {
        const el = document.getElementById(p.dataset.for!);
        return el ? topOf(el) : 0;
      };
      const next = pieces[at + 1];
      const through = (y - mid(pieces[at])) / (next ? Math.max(1, mid(next) - mid(pieces[at])) : AFTER);
      const until = next ? top(next) : r.scrollHeight - r.clientHeight + readAt(); // after the last part: the end of the text
      r.scrollTop = Math.max(0, top(pieces[at]) + through * (until - top(pieces[at])) - readAt());
      mapAt.current = turning.current = y;
      spy();
      window.clearTimeout(rest);
      rest = window.setTimeout(() => (turning.current = null), 180);
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => (window.clearTimeout(rest), box.removeEventListener("wheel", wheel));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // an address that names an item or an LV opens there
  useEffect(() => {
    const lv = single ? tender.lvs[0].id : place.lv;
    if (selected !== null && lv !== null) go(`td-${lv}-${selected}`);
    else if (place.lv !== null && !single) go(`td-lv-${place.lv}`, false);
    // again once the findings stand beside the items: their cards make the rows above taller
  }, [selected, place.lv, tender.id, findings !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = plan.found;
  useEffect(() => {
    const el = boardEl.current, root = page.current;
    if (!el || !root) return void setDocked(false);
    const seen = new IntersectionObserver(([e]) => setDocked(!e.isIntersecting && e.boundingClientRect.bottom < (e.rootBounds?.top ?? 0) + 60), { root, rootMargin: "-48px 0px 0px 0px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [barred, tender.id]);
  const mine = tender.documents.filter((d) => d.lv !== null);
  const later = tender.documents.filter((d) => d.lv === null);
  const dueIn = (() => {
    if (!plan.due) return null;
    const [y, m, d] = plan.due.split("-").map(Number), now = new Date();
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  })();
  const noGaeb = tender.lvs.filter((l) => l.back.form === null).length;
  const reissued = tender.lvs.filter((l) => l.issues.length > 1).length;
  // where the findings are: per section of a single LV once its findings are read, per LV of a building
  // from the summary
  // how bad the worst finding of each item is: from the findings of the LV that is read, else from the
  // summary's one digit per item
  const ranksBy = useMemo(() => new Map(model.map((x) => {
    const m = new Map<string, number>();
    if (x.lv.id === findingsLv && findings) for (const [oz, fs] of findings) m.set(oz, fs.reduce((w, f) => Math.max(w, RANK[f.severity]), 0));
    else {
      const marks = summary?.docs.find((d) => d.index === x.lv.carrier)?.marks ?? "";
      x.lv.items.forEach((i, n) => Number(marks[n] ?? 0) && m.set(i.oz, Number(marks[n])));
    }
    return [x.lv.id, m] as const;
  })), [model, findings, findingsLv, summary]);
  const marksOf = (x: Lv, rows: Row[]) => rows.map((r) => (r.gone ? 0 : ranksBy.get(x.lv.id)?.get(r.it.oz) ?? 0)).join("");
  // the tender as the project card draws it: every item in LV order as one strip, a flagged one standing
  // up in its severity colour, a cut between the LVs of a building
  const strip = model.map((x) => marksOf(x, x.secs.flatMap((sec) => sec.rows)));
  const cuts = strip.slice(0, -1).reduce<number[]>((acc, m) => [...acc, (acc[acc.length - 1] ?? 0) + m.length], []);

  return (
    <>
      <div className={`td-flow${ask?.panel ? " composing" : ""}${ask?.panel && ask.wide ? " wide" : ""}`}>
        {ask?.panel && <aside className="td-compose" aria-label="Message to the client">{ask.panel((oz) => go(`td-${findingsLv ?? tender.lvs[0].id}-${oz}`))}</aside>}
        {/* the map, all of it at once: what was read stands above, what comes below, the part being read
            in the middle; it moves with the reading (see `spy`) */}
        <aside className="td-map" ref={mapBox} aria-label="Map of the tender">
          <div className="td-maplist" ref={mapList}>
            {!layer && <Legend model={model} ask={!!ask} priced={!!prices} />}
            <button className="td-mp" data-for="td-top" onClick={() => go("td-top", false)}>
              <span className="hd"><i>↑</i><b>{layer?.title ?? "Cover sheet"}</b><small>{layer ? "" : count(mine.length, "document")}</small></span>
            </button>
            {model.map((x) => (
              <div key={x.lv.id} className="td-mlv">
                {x.gapBefore.map((n) => (
                  <button key={n} className="td-mp hole" data-for={`td-gap-${n}`} onClick={() => go(`td-gap-${n}`, false)}>
                    <span className="hd"><i>{n}</i><b>did not come</b><small>no file</small></span>
                  </button>
                ))}
                {(
                  <button className="td-mp lv" data-for={`td-lv-${x.lv.id}`} onClick={() => go(`td-lv-${x.lv.id}`, false)}>
                    <span className="hd"><i>{x.lv.no ?? x.lv.id + 1}</i><b lang="de"><LvText text={x.lv.label} /></b><small>{count(x.lv.items.length, "item")}</small></span>
                  </button>
                )}
                {x.secs.map((sec, k) => (
                  <div key={k} className="td-mp" data-for={`td-s-${x.lv.id}-${k}`}>
                    <button className="hd" onClick={() => go(`td-s-${x.lv.id}-${k}`, false)}><i>{sec.no}</i><b lang="de"><LvText text={sec.name} /></b><small>{sec.rows.length}</small></button>
                    <Strip lvId={x.lv.id} rows={sec.rows} ranks={ranksBy.get(x.lv.id) ?? null} onGo={go} over={layer ? (x.lv.id === findingsLv || single ? layer.mark : () => null) : undefined} ask={ask && (x.lv.id === findingsLv || single) ? ask.mark : undefined} prices={x.lv.id === findingsLv || single ? prices?.rows : null} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
        {(points > 0 || views) && (
          <div className="td-tools">
            {points > 0 && (
              // the head of the findings' column, as the document and the panel have theirs: how many there are
              // to look at, which one the reading stands at, back and on
              <div className="td-pts" role="group" aria-label="Findings to look at">
                <span className="tn-ix">{points}</span>
                <div><b>{ask?.only && ask.head ? ask.head.title : "Findings"}</b><small>{pointAt ? `${pointAt} of ${points}` : `${points} to look at`}{ask?.only ? ` · ${ask.head?.note ?? "with a question"}` : ""}</small></div>
                <button onClick={() => step(-1)} aria-label="Previous finding" title="The finding before (K)">‹</button>
                <button onClick={() => step(1)} aria-label="Next finding" title="The next finding (J)">›</button>
              </div>
            )}
            {views}
          </div>
        )}
        <main className={`td-page${barred ? " barred" : ""}${ask?.panel ? " paneled" : ""}`} ref={page} onScroll={spy} onWheel={() => (turning.current = null)} onPointerDown={() => (turning.current = null)}>
          {/* the board of the cover sheet, once it has left the screen: a slim strip with the same actions that
              stays over the whole document (D-081). It takes no room of its own while the cover sheet is read. */}
          {barred && (
            <div className={`td-s td-actbar${docked || ask?.panel ? " on" : ""}`}>
              <div className="td-lft" />
              <div className="td-bod"><R><div className="td-dock">
                <span className="td-dockname"><b lang="de"><LvText text={tender.name} /></b>{plan.due && <small>bid due {daysLeft(plan.due)}{intake ? " · not taken on yet" : ""}</small>}</span>
                {back && <button className="td-chip" onClick={back} title="The whole tender again, with its map">Back to the tender</button>}
                {!back && points > 0 && <button className="td-chip" onClick={() => step(1)} title="The next finding that waits for you">Checks<i>{points}</i></button>}
                {(board ?? []).filter((r) => r.act).map((r) => (
                  <button key={r.key} className={`td-chip${r.open || (r.next && !back) ? " ink" : ""}`} aria-pressed={r.open || undefined} onClick={r.act!.onClick} title={r.act!.title}>{r.name}{r.act!.count ? <i>{r.act!.count}</i> : null}</button>
                ))}
                {intake && <><button className="td-chip ink" onClick={intake.onTake}>Take it on</button><button className="td-chip" onClick={intake.onPass}>Pass</button></>}
              </div></R></div>
            </div>
          )}
          {/* the first page of the document is the tender's cover sheet: what it is, its dates, how and in
              which files it came, what the bid goes back as */}
          {layer ? (
            <section className="td-s" id="td-top">
              <div className="td-lft" />
              <div className="td-bod">
                <R cls="first last">
                  <div className="td-cv">
                    <header>
                      <span className="tn-label">Tender{tender.number && ` · ${tender.number}`}</span>
                      <h2>{layer.title}</h2>
                      <p className="client" lang="de"><LvText text={tender.name} /></p>
                    </header>
                    {typeof layer.front === "function" ? layer.front((oz) => go(`td-${findingsLv ?? tender.lvs[0].id}-${oz}`)) : layer.front}
                  </div>
                </R>
              </div>
            </section>
          ) : (
          <section className="td-s" id="td-top">
            <Piece no="↑" title="Cover sheet" sub={`${count(mine.length, "document")}${later.length ? ` · ${later.length} of later steps` : ""}`} />
            <div className="td-bod">
              <R cls="first last" side={
                <>
                  {!plan.due && (
                    <div className="td-cd pt">
                      <h4>No submission deadline</h4>
                      <p>No file states the day the bid is due. The schedule and the countdown on the card need it.</p>
                      <div className="tn-askrow"><button className="tn-btn ink sm" onClick={onDates}>Set the dates</button></div>
                    </div>
                  )}
                  {!single && noGaeb > 0 && (
                    <div className="td-cd pt">
                      <h4>No GAEB file for {noGaeb === tender.lvs.length ? `any of the ${noGaeb} LVs` : count(noGaeb, "LV")}</h4>
                      <p>Their items are read from the PDF. A bid cannot go back as X84 without the client's X83.</p>
                    </div>
                  )}
                </>
              }>
                <div className="td-cv">
                  <header className="td-title">
                    <div>
                      <span className="tn-label">Tender{tender.number && ` · ${tender.number}`}</span>
                      <h2 lang="de"><LvText text={tender.name} /></h2>
                      <p className="client" lang="de">{tender.client ? <LvText text={tender.client} /> : "The files do not name the client."}</p>
                      <p className="size">
                        {single ? "1 LV" : `${tender.lvs.length} LVs`} · {count(tender.items, "item")} · {count(mine.length, "document")}
                      </p>
                    </div>
                    {/* the one date everything on this page runs towards */}
                    {plan.due && (
                      <div className="td-due">
                        {dueIn !== null && dueIn >= 0 ? <span className="n">{dueIn}<small>{dueIn === 1 ? "day" : "days"}</small></span> : <span className="n over">due</span>}
                        <p>bid due <b>{dayText(plan.due)}</b>{dueIn !== null && dueIn < 0 ? `, ${daysLeft(plan.due)}` : ""}</p>
                        {plan.questions_due && <p>questions until {dayText(plan.questions_due)}</p>}
                      </div>
                    )}
                  </header>
                  {/* in the intake: the decision, beside what it rests on */}
                  {intake && (
                    <div className="td-decide">
                      <div>
                        {found?.why ? (
                          <p className="read"><span className={`tn-tag${found.fit === "yes" ? " td-fit" : ""}`}>{found.fit === "yes" ? "Fits your work" : found.fit === "no" ? "Not your trade" : "Fits in part"}</span> {found.why}</p>
                        ) : (
                          <p className="read">Checked as it arrived. Nothing is drafted for the client and nobody is asked for a price before you take it on.</p>
                        )}
                        <p className="facts">
                          {plan.due && <span><b>{daysLeft(plan.due)}</b> the bid is due</span>}
                          <span><b>{tender.items.toLocaleString("en")}</b> {tender.items === 1 ? "item" : "items"} in {single ? "1 LV" : `${tender.lvs.length} LVs`}</span>
                          {summary && summary.checked !== false && <span><b>{summary.counts.high}</b> {summary.counts.high === 1 ? "stop" : "stops"} · <b>{summary.counts.warn}</b> {summary.counts.warn === 1 ? "caution" : "cautions"}</span>}
                        </p>
                      </div>
                      <div className="btns">
                        <button className="td-actbtn on" title="It goes on to the questions and the prices" onClick={intake.onTake}>Take it on</button>
                        <button className="td-actbtn plain" title="No bid: it goes to Award as passed" onClick={intake.onPass}>Pass</button>
                      </div>
                    </div>
                  )}
                  {/* the board (D-081): how the tender stands, a row per station in the pipeline's order, and
                      at the end of each row the action that goes on with it */}
                  {(barred || (summary && summary.checked !== false)) && (
                    <div className={`td-board${intake ? " under" : ""}`} ref={boardEl}>
                      {summary && summary.checked !== false && (
                        <div className="td-brow">
                          <span className="plate">{SEVERITIES.reduce((n, sev) => n + summary.counts[sev], 0)}</span>
                          <span className="name">Checks</span>
                          <span className="td-bsays">
                            {SEVERITIES.some((sev) => summary.counts[sev] > 0) ? SEVERITIES.filter((sev) => summary.counts[sev] > 0).map((sev, n) => <span key={sev}>{n > 0 && " · "}{sev === "high" ? <b>{countLabel(summary.counts[sev], sev)}</b> : countLabel(summary.counts[sev], sev)}</span>) : <b>No finding</b>}
                            <small>{points > 0 ? `${points} to look at` : "every item in LV order; one with a finding stands up"}</small>
                          </span>
                          <span className="card-lv td-fp"><Fingerprint marks={strip.join("")} cuts={cuts} /></span>
                          {points > 0 ? <button className="td-actbtn plain" onClick={() => step(1)}>Next to look at</button> : <span />}
                        </div>
                      )}
                      {(board ?? []).map((r) => (
                        <div key={r.key} className={`td-brow${r.next ? " next" : ""}`}>
                          <span className="plate">{r.n}</span>
                          <span className="name">{r.name}</span>
                          <span className="td-bsays">{r.says}{r.sub && <small>{r.sub}</small>}</span>
                          {r.share != null ? <span className="td-bbar" aria-hidden><i style={{ width: `${Math.round(100 * Math.min(1, Math.max(0, r.share)))}%` }} /></span> : <span />}
                          <span className="td-bacts">
                            {r.more && <button className="text-link" onClick={r.more.onClick} title={r.more.title}>{r.more.label}</button>}
                            {r.act && <button className={`td-actbtn ${r.next ? "on" : "plain"}`} onClick={r.act.onClick} title={r.act.title}>{r.act.label}{r.act.count ? <b>{r.act.count}</b> : null}</button>}
                          </span>
                        </div>
                      ))}
                      {intake && ([["Client", "Questions are drafted once you take it on"], ["Prices", "Nobody is asked for a price before that"], ["Bid", `${count(tender.items, "item")} to price`]] as const).map(([name, says]) => (
                        <div key={name} className="td-brow held"><span className="plate">–</span><span className="name">{name}</span><span className="td-bsays">{says}</span><span /><span /></div>
                      ))}
                    </div>
                  )}
                  <div className="td-cvgrid">
                    {(
                      <section className="wide">
                        <h3>Dates<span>what came when, and what is due</span><button className="tn-btn out sm" onClick={onDates}>Change the dates</button></h3>
                        <Lane tender={tender} plan={plan} onGo={(id) => go(id, false)} />
                      </section>
                    )}
                    {ask?.cover}
                    {!single && (
                      <section className="wide">
                        <h3>Between the LVs<span>what one LV expects of another, and work tendered twice</span></h3>
                        {between === null ? (
                          <p className="quiet">Holding the {tender.lvs.length} LVs against each other.</p>
                        ) : between === "failed" ? (
                          <p className="quiet">The LVs could not be held against each other.</p>
                        ) : between.findings.length === 0 ? (
                          <p>The {tender.lvs.length} LVs were held against each other: {between.statements.total ? `${count(between.statements.total, "passage")} that name another trade, ` : ""}nothing an LV expects of another that no LV contains, and nothing tendered twice.</p>
                        ) : (
                          <div className="td-btw">
                            {between.findings.map((f, n) => (
                              <div key={n}>
                                <Sign severity={f.severity} size={15} />
                                <div>
                                  <b>{f.title}</b>
                                  <small lang="de">{f.lvs.join(" · ")}</small>
                                  <p>{f.explanation}</p>
                                  {f.statements.slice(0, 3).map((q, k) => {
                                    const lv = tender.lvs.find((l) => q.lv.includes(l.label) || l.label.includes(q.lv) || lvTitle(l) === q.lv);
                                    return (
                                      <span key={k} className="tn-quote" lang="de">
                                        {q.item_oz && lv ? <button className="tn-ozlink" onClick={() => go(`td-${lv.id}-${q.item_oz}`)}>{q.item_oz}</button> : q.item_oz ? <b>{q.item_oz}</b> : null} „{q.quote}“
                                      </span>
                                    );
                                  })}
                                  <p className="td-act"><span className="tn-label">What to do</span> {ACTION_LABEL[f.action]}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                    <section>
                      <h3>How it came</h3>
                      {found?.subject || found?.summary ? (
                        <div className="td-mail">
                          <span className="tn-tag">{found.via ?? "Mail"}</span>
                          <b lang="de"><LvText text={found.subject ?? ""} /></b>
                          <small>{[found.received && dayText(found.received), found.sender].filter(Boolean).join(" · ")}</small>
                          {found.summary && <p>{found.summary}</p>}
                          {found.why && <p><span className={`tn-tag${found.fit === "yes" ? " td-fit" : ""}`}>{found.fit === "yes" ? "Fits your work" : found.fit === "no" ? "Not your trade" : "Fits in part"}</span> {found.why}</p>}
                        </div>
                      ) : (
                        <p className="quiet">Its files were added by hand.</p>
                      )}
                    </section>
                    <section>
                      <h3>What came</h3>
                      {single || mine.length <= 8 ? (
                        <div className="td-docs">
                          {mine.map((d) => {
                            const l = tender.lvs[d.lv!];
                            return (
                              <div key={d.index} className={d.current ? undefined : "old"}>
                                <span className={`tn-tag${d.carrier ? " ink" : ""}`}>{d.format}</span>
                                <b lang="de"><LvText text={d.name} /></b>
                                <small>{l.issues.length > 1 && `issue ${d.issue}${d.current ? "" : ", replaced"} · `}{count(d.items, "item")}{d.pages !== null && ` · ${d.pages} pages`}{d.carrier && " · the items are read from it"}</small>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p>{count(mine.length, "document")} for {tender.lvs.length} LVs: {[...new Set(mine.map((d) => d.format))].join(", ")}{mine.some((d) => d.pages) && `, ${mine.reduce((n, d) => n + (d.pages ?? 0), 0)} pages`}.</p>
                      )}
                      {later.length > 0 && <p className="quiet">{count(later.length, "file")} of later steps among them ({[...new Set(later.map((d) => d.role))].join(", ")}).</p>}
                      <button className="tn-btn out sm" onClick={onDrawer}>What each document gave</button>
                    </section>
                    <section>
                      <h3>The bid goes back as</h3>
                      <p>{new Set(tender.lvs.map((l) => l.back.form)).size === 1 ? backText(tender.lvs[0]) : tender.lvs.map((l) => `${lvTitle(l)}: ${l.back.form ?? "not stated"}`).join(" · ")}</p>
                      {reissued > 0 && <p className="quiet">{single ? `This is issue ${tender.lvs[0].issues.length} of the LV: the client sent it again.` : `${count(reissued, "LV")} came again in a later issue.`} What changed stands beside the items.</p>}
                    </section>
                  </div>
                </div>
              </R>
            </div>
          </section>
          )}
          {model.map((x) => (
            <div key={x.lv.id}>
              {x.gapBefore.map((n) => (
                <section key={n} className="td-s" id={`td-gap-${n}`}>
                  <Piece no={n} title="did not come" sub="no file" hole />
                  <div className="td-bod">
                    <R cls="first last hole" side={<div className="td-cd pt"><h4>No LV {n} came</h4><p>The numbers on the files count past it. A trade may be missing from what you were given: a point for the client.</p></div>}>
                      <div className="td-front"><h2>LV {n}</h2><p className="lede">No file came for it. The numbers on the files count past it; the next one is LV {x.lv.no}.</p></div>
                    </R>
                  </div>
                </section>
              ))}
              <LvBlock prices={x.lv.id === findingsLv || single ? prices : null} ask={ask && (x.lv.id === findingsLv || single) ? ask : null} layer={layer && (x.lv.id === findingsLv || single) ? layer : layer ? { ...layer, lv: null, item: () => null, mark: () => null } : null} x={x} tender={tender} single={single} asked={asked} onAsk={onAsk} onGo={go} onOpen={() => onOpenLv(x.lv.id)} general={x.lv.id === findingsLv ? general ?? NONE : NONE}
                findings={x.lv.id === findingsLv ? findings : null} reading={x.lv.id === findingsLv && !findings}
                counts={summary?.docs.find((d) => d.index === x.lv.carrier)?.counts ?? null} marks={summary?.docs.find((d) => d.index === x.lv.carrier)?.marks ?? ""} />
            </div>
          ))}
          <p className="td-end">End of the tender · {count(tender.items, "item")}</p>
        </main>
      </div>
    </>
  );
}
