import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "./controls";
import { LvText, eur, qty, quotedFragments } from "./format";
import { FindingVisual, PriceRange, ValueRank } from "./ItemVisual";
import { sectionOf, worst, type Section } from "./sections";
import { Pager, pageOf } from "./Pager";
import {
  ACTION_LABEL,
  CATEGORY_LABEL,
  KIND_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  type Analysis,
  type BidderQuestion,
  type Category,
  type Finding,
  type Item,
  type PriceSuggestion,
  type Severity,
  type Amendment,
} from "./types";

const ITEMS_PER_PAGE = 50;
const FINDINGS_PER_PAGE = 20; // rows of the findings list: one per item

export interface Selection {
  oz: string | null;
  finding: number | null; // index into analysis.findings
}

/** The three sign shapes. Shape and colour both carry severity. */
export function Sign({ severity, size = 20 }: { severity: Severity; size?: number }) {
  return (
    <svg className="sign" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={SEVERITY_LABEL[severity]}>
      {severity === "high" && (
        <>
          <circle cx="12" cy="12" r="11" fill="var(--red)" />
          <rect x="5" y="9.75" width="14" height="4.5" fill="#fff" />
        </>
      )}
      {severity === "warn" && (
        <>
          <path d="M12 2.6 22.6 21H1.4Z" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.7" strokeLinejoin="round" />
          <rect x="10.9" y="9" width="2.2" height="6.2" fill="var(--ink)" />
          <circle cx="12" cy="17.8" r="1.25" fill="var(--ink)" />
        </>
      )}
      {severity === "info" && (
        <>
          <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="var(--blue)" />
          <circle cx="12" cy="7.2" r="1.6" fill="#fff" />
          <rect x="10.7" y="10.4" width="2.6" height="8.4" fill="#fff" />
        </>
      )}
    </svg>
  );
}

export function itemLabel(item: Item | undefined): string {
  if (!item) return "";
  return item.short_text || item.long_text.split("\n", 1)[0];
}

/* ----------------------------------------------------------- findings list */

export function FindingsList({
  analysis,
  itemByOz,
  sections,
  severities,
  onSeverities,
  section,
  onSection,
  onSelect,
  page,
  onPage,
  ai,
  onReview,
  find,
}: {
  find?: { text: string; n: number } | null; // put into the search box from outside (a step of the pipeline)
  page: number; // of the rows, from 1 (kept in the address)
  onPage: (page: number) => void;
  ai: "idle" | "running" | "done";
  onReview: () => void;
  analysis: Analysis;
  itemByOz: Map<string, Item>;
  sections: Section[];
  severities: Set<Severity>;
  onSeverities: (s: Set<Severity>) => void;
  section: string | null;
  onSection: (key: string | null) => void;
  onSelect: (s: Selection) => void;
}) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const asked = find?.n;
  useEffect(() => {
    if (find) setQuery(find.text);
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, warn: 0, info: 0 };
    for (const f of analysis.findings) c[f.severity]++;
    return c;
  }, [analysis]);

  const categories = useMemo(() => [...new Set(analysis.findings.map((f) => f.category))], [analysis]);

  // One row per item: an item with two findings is one place in the LV, not two problems to scan past.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = analysis.findings
      .map((finding, index) => ({ finding, index }))
      .filter(({ finding: f }) => {
        if (!severities.has(f.severity)) return false;
        if (category !== "all" && f.category !== category) return false;
        if (section !== null && (f.item_oz === null || sectionOf(f.item_oz) !== section)) return false;
        if (!q) return true;
        if (q.startsWith("check:")) return f.check_id.toLowerCase().startsWith(q.slice(6)); // from the pipeline strip
        const hay = `${f.item_oz ?? ""} ${f.check_id} ${f.evidence} ${itemLabel(itemByOz.get(f.item_oz ?? ""))}`;
        return hay.toLowerCase().includes(q);
      });
    const out: { oz: string | null; first: number; findings: Finding[] }[] = [];
    const byOz = new Map<string, (typeof out)[number]>();
    for (const { finding, index } of kept) {
      const row = finding.item_oz === null ? undefined : byOz.get(finding.item_oz);
      if (row) row.findings.push(finding);
      else {
        const fresh = { oz: finding.item_oz, first: index, findings: [finding] };
        out.push(fresh);
        if (finding.item_oz !== null) byOz.set(finding.item_oz, fresh);
      }
    }
    const rank = { high: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[worst(a.findings)!] - rank[worst(b.findings)!]); // stable: file order within a severity
  }, [analysis, severities, category, section, query, itemByOz]);

  const shownFindings = rows.reduce((n, r) => n + r.findings.length, 0);

  // The worst rows come first, so page 1 is where to start; a changed filter starts there again.
  const paged = pageOf(rows, page, FINDINGS_PER_PAGE);
  const filter = `${category}|${query}|${section}|${SEVERITIES.filter((s) => severities.has(s)).join()}`;
  const filtered = useRef(filter);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (filtered.current === filter) return;
    filtered.current = filter;
    onPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [paged.page]);

  function toggle(sev: Severity) {
    const next = new Set(severities);
    if (next.has(sev)) next.delete(sev);
    else next.add(sev);
    onSeverities(next);
  }

  const sectionTitle = sections.find((s) => s.key === section)?.title;

  return (
    <div className="panel">
      <header className="panel-head">
        <h2>Findings</h2>
        <span className="tally">
          {shownFindings === analysis.findings.length
            ? `${analysis.findings.length} on ${rows.length} item${rows.length === 1 ? "" : "s"}`
            : `${shownFindings} of ${analysis.findings.length}`}
        </span>
      </header>

      {analysis.findings.length > 0 && (
      <div className="filters">
        <div className="sev-toggles" role="group" aria-label="Show or hide a severity, in the list and on the plan">
          {SEVERITIES.map((sev) => (
            <button key={sev} className="sev-toggle" aria-pressed={severities.has(sev)} onClick={() => toggle(sev)}>
              <Sign severity={sev} size={24} />
              <span className="sev-name">{SEVERITY_LABEL[sev]}</span>
              <span className="sev-count">{counts[sev]}</span>
            </button>
          ))}
        </div>
        <div className="filter-row">
          <input
            type="search"
            placeholder="Item no. or text"
            aria-label="Search findings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select<Category | "all">
            value={category}
            options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
            onChange={setCategory}
            aria-label="Category"
          />
        </div>
        {section !== null && (
          <button className="section-chip" onClick={() => onSection(null)}>
            <b>Section {section}</b>
            {sectionTitle && (
              <span>
                <LvText text={sectionTitle} />
              </span>
            )}
            <span className="clear">Show all sections</span>
          </button>
        )}
      </div>
      )}

      <div className="scroll" ref={listRef}>
        {analysis.findings.length === 0 && (
          <p className="empty">
            The rule checks found nothing in this file. That is a valid result, not a clean bill: unclear scope
            and missing items need the AI review.
          </p>
        )}
        <div className={`ai-bar ${ai}`}>
          {ai === "done" ? (
            <span>
              AI review added {analysis.findings.filter((f) => f.origin === "llm").length} findings, each quoting the
              LV.
            </span>
          ) : (
            <>
              <span>
                {ai === "running"
                  ? "Reading every section with Claude. A large LV takes a minute or two."
                  : "The rules cannot judge unclear scope or missing items. The AI review reads the LV for those."}
              </span>
              <button className="btn" disabled={ai === "running"} onClick={onReview}>
                {ai === "running" ? "Reviewing" : "Run AI review"}
              </button>
            </>
          )}
        </div>
        {analysis.findings.length > 0 && rows.length === 0 && (
          <p className="empty">No finding matches. Switch a severity back on or clear the search.</p>
        )}
        <ol className="findings">
          {paged.rows.map(({ oz, first, findings }) => {
            // the findings of one item are about the same money: the largest amount, not their sum
            const money = Math.max(0, ...findings.map((f) => Number(f.money_at_stake ?? 0)));
            return (
              <li key={first}>
                <button
                  className="finding"
                  onClick={() => onSelect({ oz, finding: findings.length === 1 ? first : null })}
                >
                  <Sign severity={worst(findings)!} size={26} />
                  <span className="finding-oz">{oz ?? "LV"}</span>
                  <span className="finding-text">
                    <span className="finding-title" lang="de">
                      <LvText text={itemLabel(itemByOz.get(oz ?? "")) || "Whole LV"} />
                    </span>
                    <span className="finding-why">
                      {findings.some((f) => f.origin === "llm") && <b className="ai-tag">AI</b>}
                      {[...new Set(findings.map((f) => CATEGORY_LABEL[f.category]))].join(", ")}
                      {money > 0 && ` · ${eur(money)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <Pager page={paged.page} pages={paged.pages} total={rows.length} size={FINDINGS_PER_PAGE} what="items" onPage={onPage} />
    </div>
  );
}

/* ------------------------------------------------------------- item sheet */

function FindingPlate({
  finding,
  priced,
  onOz,
  item,
  items,
  itemByOz,
  asked,
  settled,
  onAsked,
}: {
  finding: Finding;
  priced: boolean;
  onOz: (oz: string) => void;
  item: Item | undefined;
  items: Item[];
  itemByOz: Map<string, Item>;
  asked?: BidderQuestion;
  settled?: boolean; // closed by an answer of the client that the estimator accepted
  onAsked?: () => void;
}) {
  return (
    <section className={`plate-card sev-${finding.severity}${settled ? " is-settled" : ""}`}>
      <header>
        <Sign severity={finding.severity} size={30} />
        <h3>{CATEGORY_LABEL[finding.category]}</h3>
        <span className="check-id" title={finding.origin === "rule" ? "Found by a deterministic rule" : "Found by the AI review"}>
          {finding.origin === "llm" ? "AI review" : finding.check_id}
        </span>
      </header>
      {finding.title && <p className="plate-title">{finding.title}</p>}
      <p className="evidence">{finding.evidence}</p>
      <FindingVisual finding={finding} item={item} items={items} itemByOz={itemByOz} onOz={onOz} />
      <dl>
        <dt>Why it matters</dt>
        <dd>{finding.explanation}</dd>
        <dt>What to do</dt>
        <dd className="action">{ACTION_LABEL[finding.action]}</dd>
        <dt>Money at stake</dt>
        <dd>
          {finding.money_at_stake !== null ? (
            <>
              <b className="num">{eur(finding.money_at_stake)}</b>
              {finding.money_basis && <span className="quiet"> · the value of this item, from {finding.money_basis}</span>}
            </>
          ) : (
            <span className="quiet">Not quantified: {priced ? "this item has no price" : "nobody has a price for this item yet"}</span>
          )}
        </dd>
        {finding.related_oz.length > 0 && (
          <>
            <dt>Related items</dt>
            <dd className="oz-links">
              {finding.related_oz.map((oz) => (
                <button key={oz} className="oz-link" onClick={() => onOz(oz)}>
                  {oz}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>
      {asked && (
        <div className={`asked is-${asked.status}`}>
          <span className="caption">
            {settled
              ? "Settled by the client's answer"
              : asked.answer
              ? asked.status === "partly" ? "The client answered in part" : "The client answered"
              : asked.status === "sent" ? "Asked the client, no answer yet" : "Question to the client drafted"}
            <button className="text-link" onClick={onAsked}>
              Bidder questions
            </button>
          </span>
          {asked.answer ? (
            <>
              <p className="q-quote" lang="de">
                „{asked.answer.quote}“
              </p>
              {asked.answer.meaning && <p>{asked.answer.meaning}</p>}
            </>
          ) : (
            <p lang="de">{asked.question}</p>
          )}
        </div>
      )}
    </section>
  );
}

export function ItemSheet({
  analysis,
  itemByOz,
  findingsByOz,
  price,
  selection,
  asked,
  settled,
  amended,
  onAsked,
  onSelect,
  onBack,
  onShowInTable,
}: {
  analysis: Analysis;
  itemByOz: Map<string, Item>;
  findingsByOz: Map<string, Finding[]>;
  price?: PriceSuggestion;
  selection: Selection;
  asked: Map<string, BidderQuestion>; // the finding's question to the client, once it is in a message
  settled: Set<string>; // findings closed by an accepted answer, by `check | item | evidence`
  amended: Amendment[]; // what the client's answers changed for the selected item, accepted
  onAsked: () => void;
  onSelect: (s: Selection) => void;
  onBack: () => void;
  onShowInTable: (oz: string) => void;
}) {
  const priced = analysis.boq.items.some((i) => i.total !== null);
  const selected = selection.finding !== null ? analysis.findings[selection.finding] : null;
  const item = selection.oz ? itemByOz.get(selection.oz) : undefined;
  const goTo = (oz: string) => onSelect({ oz, finding: null });
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    top.current?.scrollTo({ top: 0 }); // scrollTo returns a promise in current Chrome; an effect must not
  }, [selection.oz, selection.finding]);

  const back = (
    <button className="back" onClick={onBack}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      All findings
    </button>
  );

  if (!item) {
    return (
      <div className="panel sheet">
        <header className="panel-head">{back}</header>
        <div className="scroll" ref={top}>
          <h2 className="sheet-oz">{selection.oz ?? "Whole LV"}</h2>
          {selection.oz && <p className="quiet">This item number is not in the parsed file.</p>}
          {selected && (
            <FindingPlate
              finding={selected}
              asked={asked.get(`${selected.check_id}|${selected.item_oz}|${selected.evidence}`)}
              settled={settled.has(`${selected.check_id}|${selected.item_oz}|${selected.evidence}`)}
              onAsked={onAsked}
              priced={priced}
              onOz={goTo}
              item={undefined}
              items={analysis.boq.items}
              itemByOz={itemByOz}
            />
          )}
        </div>
      </div>
    );
  }

  const newQty = amended.find((a) => a.kind === "quantity");
  const newUnit = amended.find((a) => a.kind === "unit");
  const found = findingsByOz.get(item.oz) ?? [];
  const ordered = selected ? [selected, ...found.filter((f) => f !== selected)] : found;
  const marks = (selected ? [selected] : found).flatMap((f) => quotedFragments(f.evidence));

  return (
    <div className="panel sheet">
      <header className="panel-head">
        {back}
        <button className="text-link" onClick={() => onShowInTable(item.oz)}>
          Show in item table
        </button>
      </header>
      <div className="scroll" ref={top}>
        <p className="crumbs">
          <LvText text={item.path.join(" / ")} />
        </p>
        <h2 className="sheet-oz">{item.oz}</h2>
        <p className="sheet-title" lang="de">
          <LvText text={itemLabel(item)} marks={marks} />
        </p>
        <p className="facts">
          <span>
            {newQty || newUnit ? (
              <>
                <s>
                  <span className="num">{qty(item.qty)}</span> {item.unit_raw || item.unit}
                </s>{" "}
                <b className="num">{newQty ? qty(newQty.value.number ?? null) : qty(item.qty)}</b>{" "}
                {newUnit?.value.to ?? (item.unit_raw || item.unit)}
              </>
            ) : (
              <>
                <b className="num">{qty(item.qty)}</b> {item.unit_raw || item.unit}
              </>
            )}
          </span>
          {item.kind !== "normal" && <span className="tag">{KIND_LABEL[item.kind]}</span>}
          {item.up !== null && <span>Unit price {eur(item.up)}</span>}
          {item.total !== null && <span>Total {eur(item.total)}</span>}
        </p>
        {amended.length > 0 && (
          <div className="amended">
            <span className="caption">
              From the client's answers
              <button className="text-link" onClick={onAsked}>
                Bidder questions
              </button>
            </span>
            {amended.map((a) => (
              <p key={a.id}>
                {a.kind === "quantity" && <>The client changed the quantity to <b lang="de">{a.value.to}</b>. The file still has the old one.</>}
                {a.kind === "unit" && <>The client changed the unit to <b lang="de">{a.value.to}</b>.</>}
                {a.kind === "text" && <>The client changed the wording: <span lang="de">{a.value.to}</span></>}
                {(a.kind === "settle" || a.kind === "note") && a.value.note}
                {a.kind === "allowance" && <>Risk allowance of <b>{a.value.percent} %</b> on the price of this item. {a.value.note}</>}
              </p>
            ))}
          </div>
        )}

        {ordered.length === 0 && <p className="quiet none">The rule checks found nothing on this item.</p>}
        {ordered.map((f, i) => (
          <FindingPlate
            key={i}
            finding={f}
            asked={asked.get(`${f.check_id}|${f.item_oz}|${f.evidence}`)}
            settled={settled.has(`${f.check_id}|${f.item_oz}|${f.evidence}`)}
            onAsked={onAsked}
            priced={priced}
            onOz={goTo}
            item={item}
            items={analysis.boq.items}
            itemByOz={itemByOz}
          />
        ))}

        <ValueRank item={item} items={analysis.boq.items} />

        {item.refs.length > 0 && (
          <p className="refs">
            Refers to
            {item.refs.map((oz) => (
              <button key={oz} className="oz-link" onClick={() => goTo(oz)}>
                {oz}
              </button>
            ))}
          </p>
        )}

        {price && <PriceBlock price={price} />}

        <h3 className="lv-head">LV text, as issued</h3>
        <p className="lv-text" lang="de">
          <LvText text={item.long_text || item.short_text} marks={marks} />
        </p>
        <p className="source">
          {item.source.file}
          {item.source.line !== null && `, line ${item.source.line}`}
          {item.source.page !== null && `, page ${item.source.page}`}
          {item.source.xml_id && `, ID ${item.source.xml_id}`}
        </p>
      </div>
    </div>
  );
}

/** What a price for the item can be taken from while no quote for this tender is in: first what partners
 *  quoted for the same thing in other tenders (the price book), then what past bids paid for similar items.
 *  A price with its band and sources, or the reason there is none. */
function PriceBlock({ price }: { price: PriceSuggestion }) {
  const partners = price.basis === "partners";
  const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
  return (
    <section className="price">
      <h3 className="lv-head">{partners ? "Price from your partners' quotes" : "Price from past bids"}</h3>
      {price.unit_price !== null ? (
        <p className="price-value">
          <b className="num">{eur(String(price.unit_price))}</b>
          <span>
            per unit, {eur(String(price.low))} to {eur(String(price.high))} · {price.confidence} confidence
            {price.stale && " · out of date"}
          </span>
        </p>
      ) : (
        <p className="price-none">{price.material ? "No unit price to go by, only the material." : "No reliable price."}</p>
      )}
      <PriceRange price={price} />
      <p className="quiet">
        {price.reason}
        {partners && " A quote for this tender takes its place as soon as one is in."}
        {price.matches.length > 0 && " Each circle is one price; the grey band is the range."}
      </p>
      {price.past && (
        <p className="quiet">
          Past bids say <b className="num">{eur(String(price.past.unit_price))}</b> ({eur(String(price.past.low))} to {eur(String(price.past.high))}, {price.past.confidence} confidence).
        </p>
      )}
      {price.material && (
        <p className="price-material">
          <b className="num">{eur(String(price.material.unit_price))}</b>
          <span>
            for the material alone: {price.material.supplier}, {day(price.material.date)}
            {price.material.stale ? ", out of date" : price.material.valid_until ? `, valid until ${day(price.material.valid_until)}` : ""}. A supplier's price is the material part of a unit price; labour, equipment
            and overheads come on top.
          </span>
        </p>
      )}
      {price.matches.length > 0 && (
        <ul className="price-sources">
          {price.matches.map((m, i) => (
            <li key={i}>
              <b className="num">{eur(String(m.unit_price))}</b>
              <span>
                {m.source.startsWith("quote") ? `${m.project}, ${m.source} of ${day(m.date)}` : `Project ${m.project}, ${m.source}, item ${m.item_oz}`}
                {m.qty !== null && `, ${qty(String(m.qty))} ${m.unit}`}
                {m.same_size === false && ", other nominal size"}
                <span className="price-label" lang="de">
                  <LvText text={m.label} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- item table */

export function ItemsView({
  analysis,
  findingsByOz,
  selectedOz,
  onSelect,
  page,
  onPage,
}: {
  analysis: Analysis;
  findingsByOz: Map<string, Finding[]>;
  selectedOz: string | null;
  onSelect: (oz: string) => void;
  page: number; // from 1 (kept in the address)
  onPage: (page: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const priced = analysis.boq.items.some((i) => i.total !== null);

  const kept = useMemo(() => {
    const q = query.trim().toLowerCase();
    return analysis.boq.items.filter(
      (item) =>
        (!onlyFlagged || findingsByOz.has(item.oz)) &&
        (!q || `${item.oz} ${item.short_text} ${item.long_text}`.toLowerCase().includes(q)),
    );
  }, [analysis, query, onlyFlagged, findingsByOz]);

  const shown = kept.length;
  const paged = pageOf(kept, page, ITEMS_PER_PAGE);

  // The rows of this page under their section heads; a section that runs over the page break is headed again.
  const groups = useMemo(() => {
    const out: { title: string; items: Item[] }[] = [];
    for (const item of paged.rows) {
      const title = item.path.join(" / ") || `Section ${sectionOf(item.oz)}`;
      if (out.length === 0 || out[out.length - 1].title !== title) out.push({ title, items: [] });
      out[out.length - 1].items.push(item);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept, paged.page]);

  // Arriving from the plan or a finding: turn to the page of the row, then bring it into view.
  // A page turned by hand starts at its top.
  const seek = useRef(selectedOz);
  const turned = useRef(paged.page);
  useEffect(() => {
    const was = turned.current;
    turned.current = paged.page;
    if (seek.current === null) {
      if (was !== paged.page) scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    const at = kept.findIndex((i) => i.oz === seek.current);
    const its = at < 0 ? paged.page : Math.floor(at / ITEMS_PER_PAGE) + 1;
    if (its !== paged.page) {
      onPage(its); // runs again on that page
      return;
    }
    scrollRef.current?.querySelector(`[data-oz="${CSS.escape(seek.current)}"]`)?.scrollIntoView({ block: "center" });
    seek.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.page]);

  // A changed search or filter starts at its first page.
  const filter = `${query}|${onlyFlagged}`;
  const filtered = useRef(filter);
  useEffect(() => {
    if (filtered.current === filter) return;
    filtered.current = filter;
    onPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  return (
    <div className="table-view">
      <div className="table-tools">
        <input
          type="search"
          placeholder="Item no. or text"
          aria-label="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Only items with findings
        </label>
        <span className="tally">
          {shown} of {analysis.boq.items.length}
        </span>
      </div>
      <div className="scroll" ref={scrollRef}>
        <table className="items">
          <thead>
            <tr>
              <th className="col-sign">
                <span className="visually-hidden">Findings</span>
              </th>
              <th>Item</th>
              <th>Short text</th>
              <th className="num">Quantity</th>
              <th>Unit</th>
              {priced && <th className="num">Unit price</th>}
              {priced && <th className="num">Total</th>}
            </tr>
          </thead>
          {groups.map((group, gi) => (
            <tbody key={gi}>
              <tr className="group">
                <th colSpan={priced ? 7 : 5} scope="colgroup">
                  <LvText text={group.title} />
                </th>
              </tr>
              {group.items.map((item) => {
                const sev = worst(findingsByOz.get(item.oz));
                return (
                  <tr
                    key={item.oz}
                    data-oz={item.oz}
                    tabIndex={0}
                    aria-selected={selectedOz === item.oz}
                    onClick={() => onSelect(item.oz)}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(item.oz)}
                  >
                    <td className="col-sign">{sev && <Sign severity={sev} size={20} />}</td>
                    <td className="oz">{item.oz}</td>
                    <td className="short" lang="de">
                      <LvText text={itemLabel(item)} />
                      {item.kind !== "normal" && <span className="tag">{KIND_LABEL[item.kind]}</span>}
                    </td>
                    <td className="num">{qty(item.qty)}</td>
                    <td>{item.unit_raw || item.unit}</td>
                    {priced && <td className="num">{eur(item.up)}</td>}
                    {priced && <td className="num">{eur(item.total)}</td>}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
        {shown === 0 && <p className="empty">No item matches. Clear the search or the filter.</p>}
      </div>
      <Pager page={paged.page} pages={paged.pages} total={shown} size={ITEMS_PER_PAGE} what="items" onPage={onPage} />
    </div>
  );
}

/* ----------------------------------------------------------------- remarks */

export function RemarksView({ analysis }: { analysis: Analysis }) {
  const { remarks } = analysis.boq;
  return (
    <div className="scroll remarks">
      {remarks.length === 0 && <p className="empty">This file carries no preliminary remarks.</p>}
      {remarks.map((r, i) => (
        <details key={i} open={i === 0}>
          <summary>
            <span className="remark-path">
              <LvText text={r.path.join(" / ") || "General"} />
            </span>
            <span className="remark-first">{r.text.split("\n", 1)[0]}</span>
          </summary>
          <p className="lv-text" lang="de">
            <LvText text={r.text} />
          </p>
        </details>
      ))}
    </div>
  );
}
