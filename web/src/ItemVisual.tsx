import { eur } from "./format";
import type { Finding, Item } from "./types";

/* Pictures of the selected item: what the contradiction looks like, and what the item weighs in the bid. */

/** Two nominal diameters named for the same item, drawn to scale. */
function DiameterCompare({ finding }: { finding: Finding }) {
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
    <figure className="viz">
      <svg viewBox="0 0 360 180" role="img" aria-label={`Short text says DN ${short}, long text says DN ${long}`}>
        {pipe(92, short, "Short text")}
        {pipe(268, long, "Long text")}
        <text x="180" y="84" textAnchor="middle" className="viz-vs">
          ≠
        </text>
      </svg>
      <figcaption>
        The two sizes this item names, drawn to scale. The larger bore has {area} % more cross-section; if both
        mean the same part, only one of them can be priced.
      </figcaption>
    </figure>
  );
}

/** Where this item's total sits among all priced items of the LV, largest first. */
function ValueRank({ item, items }: { item: Item; items: Item[] }) {
  if (item.total === null) return null;
  const priced = items.filter((i) => i.total !== null && Number(i.total) > 0).sort((a, b) => Number(b.total) - Number(a.total));
  const rank = priced.findIndex((i) => i.oz === item.oz);
  if (rank < 0 || priced.length < 5) return null;
  const net = priced.reduce((n, i) => n + Number(i.total), 0);
  const top = Number(priced[0].total);
  const [W, H] = [360, 110];
  const bw = W / priced.length;
  const x = rank * bw;
  return (
    <figure className="viz">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Rank ${rank + 1} of ${priced.length} items by total`}>
        {priced.map((i, n) => {
          const h = Math.max(1.5, (Number(i.total) / top) * H);
          return <rect key={i.oz} x={n * bw} y={H - h} width={Math.max(0.6, bw - 0.4)} height={h} fill="#9aa093" />;
        })}
        <rect x={x - 1.5} y={0} width={Math.max(4, bw + 3)} height={H} fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.5" />
        <rect x={x} y={H - Math.max(3, (Number(item.total) / top) * H)} width={Math.max(1, bw)} height={Math.max(3, (Number(item.total) / top) * H)} fill="var(--ink)" />
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ink)" strokeWidth="2" />
        <text x="0" y={H + 15} className="viz-label">
          largest item
        </text>
        <text x={W} y={H + 15} textAnchor="end" className="viz-label">
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

export function ItemVisual({ item, findings, items }: { item: Item; findings: Finding[]; items: Item[] }) {
  const dim = findings.find((f) => f.check_id === "R-DIM-MISMATCH");
  return (
    <>
      {dim && <DiameterCompare finding={dim} />}
      <ValueRank item={item} items={items} />
    </>
  );
}
