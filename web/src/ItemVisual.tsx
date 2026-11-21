import type { ReactNode } from "react";
import { eur, qty, quotedFragments } from "./format";
import type { Finding, Item } from "./types";

/* Pictures of a finding: what the problem looks like on this item. Every number in them comes from the
   LV itself; a finding type without anything to draw gets no picture. */

interface Ctx {
  finding: Finding;
  item: Item | undefined;
  items: Item[];
  itemByOz: Map<string, Item>;
  onOz: (oz: string) => void;
}

function Figure({ label, caption, children }: { label: string; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="viz" aria-label={label}>
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------- two diameters, to scale */

function DiameterCompare({ finding }: Ctx) {
  const dn = [...finding.evidence.matchAll(/DN\s*(\d{2,4})/g)].map((m) => Number(m[1]));
  const [short, long] = [dn[0], dn[dn.length - 1]];
  if (!short || !long || short === long) return null;
  const max = Math.max(short, long);
  const r = (d: number) => (d / max) * 62;
  const area = Math.round((Math.max(short, long) ** 2 / Math.min(short, long) ** 2 - 1) * 100);
  const pipe = (cx: number, d: number, label: string) => (
    <g>
      <circle cx={cx} cy={78} r={r(d)} fill="var(--ground)" stroke="var(--ink)" strokeWidth={Math.max(5, r(d) * 0.14)} />
      <line x1={cx - r(d)} x2={cx + r(d)} y1={78} y2={78} stroke="var(--red)" strokeWidth="2.5" />
      <text x={cx} y={72} textAnchor="middle" className="viz-big">
        DN {d}
      </text>
      <text x={cx} y={168} textAnchor="middle" className="viz-label">
        {label}
      </text>
    </g>
  );
  return (
    <Figure
      label={`Short text says DN ${short}, long text says DN ${long}`}
      caption={
        <>
          The two sizes this item names, drawn to scale. The larger bore has {area} % more cross-section; if both mean
          the same part, only one of them can be priced.
        </>
      }
    >
      <svg viewBox="0 0 360 180" role="img" aria-hidden>
        {pipe(92, short, "Short text")}
        {pipe(268, long, "Long text")}
        <text x="180" y="84" textAnchor="middle" className="viz-vs">
          ≠
        </text>
      </svg>
    </Figure>
  );
}

/* ------------------------------------------- quantity × unit price = total */

function Equation({ finding, item }: Ctx) {
  if (!item) return null;
  const kind = finding.check_id;
  const expected = item.qty !== null && item.up !== null ? Number(item.qty) * Number(item.up) : null;
  const term = (label: string, value: string, bad: boolean) => (
    <div className={`eq-term${bad ? " bad" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
  return (
    <Figure
      label="Quantity times unit price and the stated total"
      caption={
        kind === "R-ARITHMETIC" && expected !== null ? (
          <>
            Quantity times unit price gives {eur(expected)}. The file states {eur(item.total)}, a difference of{" "}
            {eur(Math.abs(expected - Number(item.total)))}.
          </>
        ) : kind === "R-QTY-ZERO" ? (
          <>
            With a quantity of zero the item adds nothing to the total
            {item.up !== null ? `, but its unit price of ${eur(item.up)} is still agreed` : ""}. What is executed later
            is paid at that price.
          </>
        ) : (
          <>The item has a description but no quantity, so it cannot be priced as a total.</>
        )
      }
    >
      <div className="eq">
        {term(item.unit_raw || "Quantity", item.qty === null ? "?" : qty(item.qty), kind !== "R-ARITHMETIC")}
        <i>×</i>
        {term("Unit price", item.up === null ? "open" : eur(item.up), false)}
        <i>=</i>
        {term("Stated total", item.total === null ? "open" : eur(item.total), kind === "R-ARITHMETIC")}
      </div>
    </Figure>
  );
}

/* --------------------------------------------- item plates joined by arrows */

function Plate({ oz, note, missing, onOz }: { oz: string; note?: string; missing?: boolean; onOz?: (oz: string) => void }) {
  const body = (
    <>
      <b>{oz}</b>
      {note && <span>{note}</span>}
    </>
  );
  return missing || !onOz ? (
    <div className={`flow-plate${missing ? " missing" : ""}`}>{body}</div>
  ) : (
    <button className="flow-plate" onClick={() => onOz(oz)}>
      {body}
    </button>
  );
}

const short = (text: string, n = 34) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function BrokenReference({ item, itemByOz, onOz }: Ctx) {
  if (!item) return null;
  const broken = item.refs.filter((oz) => !itemByOz.has(oz));
  if (!broken.length) return null;
  return (
    <Figure
      label={`Item ${item.oz} refers to item ${broken.join(", ")}, which is not in the LV`}
      caption={
        <>
          The description says "as item {broken.join(", ")}", and no item with that number exists in this file. What
          this item includes cannot be read from the LV.
        </>
      }
    >
      <div className="flow">
        <Plate oz={item.oz} note="this item" onOz={onOz} />
        <i className="flow-arrow">wie Position</i>
        {broken.map((oz) => (
          <Plate key={oz} oz={oz} note="not in this LV" missing />
        ))}
      </div>
    </Figure>
  );
}

/** Companion rules: work that needs a second item, which is missing or hidden inside another one. */
function Companion({ finding, item, itemByOz, onOz }: Ctx) {
  const what = finding.title.replace(/^(Missing item|No separate item):\s*/, "");
  const inside = finding.category === "contract_risk";
  const triggers = (inside ? finding.related_oz : [finding.item_oz ?? "", ...finding.related_oz]).filter(Boolean);
  if (!triggers.length || !what) return null;
  const shown = triggers.slice(0, 3);
  return (
    <Figure
      label={inside ? `${what} is only mentioned inside item ${finding.item_oz}` : `${what} has no item in the LV`}
      caption={
        inside ? (
          <>
            {triggers.length} item{triggers.length > 1 ? "s" : ""} need {what}. The LV has no item for it; it is only
            mentioned inside the description of {finding.item_oz}, so its cost has to sit in that unit price.
          </>
        ) : (
          <>
            {triggers.length} item{triggers.length > 1 ? "s" : ""} need {what}. No item and no description in this LV
            covers it.
          </>
        )
      }
    >
      <div className="flow">
        <div className="flow-stack">
          {shown.map((oz) => (
            <Plate key={oz} oz={oz} note={short(itemByOz.get(oz)?.short_text ?? "")} onOz={onOz} />
          ))}
          {triggers.length > shown.length && <span className="flow-more">and {triggers.length - shown.length} more</span>}
        </div>
        <i className="flow-arrow">needs</i>
        {inside && item ? (
          <Plate oz={item.oz} note={`${short(what, 40)}: only in this text`} onOz={onOz} />
        ) : (
          <Plate oz="No item" note={short(what, 40)} missing />
        )}
      </div>
    </Figure>
  );
}

/* --------------------------------------------------------------- two bars */

function Bars({ rows, unit }: { rows: { label: string; value: number; strong?: boolean }[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className={`bar-row${r.strong ? " strong" : ""}`}>
          <span>{r.label}</span>
          <i style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          <b>
            {r.value.toLocaleString("de-DE", { maximumFractionDigits: 3 })} {unit}
          </b>
        </div>
      ))}
    </div>
  );
}

function SuppliedInstalled({ finding }: Ctx) {
  const m = finding.explanation.match(/([\d.]+) (\S+) supplied but ([\d.]+) (\S+) installed/);
  if (!m) return null;
  const [supplied, installed] = [Number(m[1]), Number(m[3])];
  return (
    <Figure
      label={`${supplied} ${m[2]} supplied, ${installed} ${m[4]} installed`}
      caption={
        <>
          The same pipe size is supplied and installed in different quantities. The gap is{" "}
          {Math.abs(supplied - installed).toLocaleString("de-DE", { maximumFractionDigits: 3 })} {m[2]}.
        </>
      }
    >
      <Bars
        unit={m[2]}
        rows={[
          { label: "Supplied", value: supplied, strong: supplied > installed },
          { label: "Installed", value: installed, strong: installed > supplied },
        ]}
      />
    </Figure>
  );
}

function LumpSumScope({ item, items }: Ctx) {
  if (!item) return null;
  const lengths = items.map((i) => i.long_text.length).filter((n) => n > 0).sort((a, b) => a - b);
  if (lengths.length < 5) return null;
  const median = lengths[Math.floor(lengths.length / 2)];
  const mine = item.long_text.length;
  return (
    <Figure
      label={`Description of ${mine} characters against a median of ${median}`}
      caption={
        <>
          One lump sum carries a description {(mine / median).toLocaleString("de-DE", { maximumFractionDigits: 1 })} times
          as long as the median item of this LV. Everything in that text is included in one fixed price.
        </>
      }
    >
      <Bars
        unit="characters"
        rows={[
          { label: "This item", value: mine, strong: true },
          { label: "Median item", value: median },
        ]}
      />
    </Figure>
  );
}

/* ------------------------------------- where in the description the quote is */

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

function TextMap({ finding, item }: Ctx) {
  if (!item) return null;
  const text = squash(`${item.short_text} ${item.long_text}`);
  const quotes = [
    ...quotedFragments(finding.evidence),
    ...[...finding.evidence.matchAll(/…([^…]{8,})…/g)].map((m) => m[1]),
  ]
    .map(squash)
    .filter((q) => q.length >= 8);
  const spans = quotes.flatMap((q) => {
    const at = text.indexOf(q);
    return at < 0 ? [] : [[at, at + q.length] as const];
  });
  const WIDTH = 64;
  if (!spans.length || text.length < WIDTH * 4) return null;
  const lines = Math.ceil(text.length / WIDTH);
  const rows = Math.min(lines, 44);
  const perRow = text.length / rows;
  const hit = (row: number) => spans.some(([a, b]) => a < (row + 1) * perRow && b > row * perRow);
  const marked = Array.from({ length: rows }, (_, i) => hit(i));
  const first = marked.indexOf(true);
  return (
    <Figure
      label="Where the quoted passage sits in the item description"
      caption={
        <>
          The whole description as lines ({text.length.toLocaleString("de-DE")} characters). The quoted passage is the
          marked part, {Math.round((first / rows) * 100)} % of the way down.
        </>
      }
    >
      <svg viewBox={`0 0 360 ${rows * 5 + 2}`} className="textmap" role="img" aria-hidden>
        {marked.map((on, i) => (
          <rect
            key={i}
            x="0"
            y={i * 5 + 1}
            width="360"
            height="3"
            fill={on ? "var(--ink)" : "#b4b9ac"}
          />
        ))}
        {marked.map((on, i) => on && <rect key={`m${i}`} x="0" y={i * 5} width="360" height="5" fill="var(--yellow)" opacity="0.55" />)}
      </svg>
    </Figure>
  );
}

/** The picture for one finding, or nothing when its type has none. */
export function FindingVisual(ctx: Ctx) {
  const id = ctx.finding.check_id;
  if (id === "R-DIM-MISMATCH") return <DiameterCompare {...ctx} />;
  if (id === "R-ARITHMETIC" || id === "R-QTY-ZERO" || id === "R-QTY-MISSING") return <Equation {...ctx} />;
  if (id === "R-REF-BROKEN") return <BrokenReference {...ctx} />;
  if (id === "R-LUMP-SUM-SCOPE") return <LumpSumScope {...ctx} />;
  if (id.startsWith("C-") && id.endsWith("-QTY")) return <SuppliedInstalled {...ctx} />;
  // A companion finding whose only trigger is the item itself has no pair to draw: show the passage instead.
  if (id.startsWith("C-")) return Companion(ctx) ?? TextMap(ctx);
  return <TextMap {...ctx} />;
}

/* ------------------------------------------------ value among all items */

/** Where this item's total sits among all priced items of the LV, largest first. */
export function ValueRank({ item, items }: { item: Item; items: Item[] }) {
  if (item.total === null) return null;
  const priced = items.filter((i) => i.total !== null && Number(i.total) > 0).sort((a, b) => Number(b.total) - Number(a.total));
  const rank = priced.findIndex((i) => i.oz === item.oz);
  if (rank < 0 || priced.length < 5) return null;
  const net = priced.reduce((n, i) => n + Number(i.total), 0);
  const top = Number(priced[0].total);
  const [W, H] = [360, 110];
  const bw = W / priced.length;
  const mine = Math.max(3, (Number(item.total) / top) * H);
  return (
    <figure className="viz boxed" aria-label={`Rank ${rank + 1} of ${priced.length} items by total`}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-hidden>
        {priced.map((i, n) => {
          const h = Math.max(1.5, (Number(i.total) / top) * H);
          return <rect key={i.oz} x={n * bw} y={H - h} width={Math.max(0.6, bw - 0.4)} height={h} fill="#b4b9ac" />;
        })}
        <rect x={rank * bw - 1.5} y={0} width={Math.max(4, bw + 3)} height={H} fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.5" />
        <rect x={rank * bw} y={H - mine} width={Math.max(1, bw)} height={mine} fill="var(--ink)" />
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ink)" strokeWidth="2" />
        <text x="0" y={H + 16} className="viz-label">
          largest item
        </text>
        <text x={W} y={H + 16} textAnchor="end" className="viz-label">
          smallest
        </text>
      </svg>
      <figcaption>
        {eur(item.total)} is rank {rank + 1} of {priced.length} priced items and{" "}
        {((Number(item.total) / net) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} % of the net total.
        Source: the prices in this file.
      </figcaption>
    </figure>
  );
}
