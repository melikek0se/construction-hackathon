/* The bid: the estimator's unit prices on the client's LV. Texts and quantities are the client's and are
   not changed here; what is filled in is a unit price per item. Each row shows the price suggested from
   past bids (never a price until it is taken), the price entered, the risk allowance accepted from an open
   point of the client's answers, and what goes into the bid. The bid goes back as GAEB XML (X84) where the
   LV came as GAEB XML, and as a sheet (CSV) for every LV. */
import { useEffect, useMemo, useState } from "react";
import { getBid, setBidPrices } from "./api";
import { eur } from "./format";
import { BidRiskPanel } from "./Risk";
import { KIND_LABEL, type Bid, type BidRow, type ItemKind } from "./types";

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });
const typed = (v: number | null) => (v === null ? "" : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false }));

export function BidView({
  analysisId,
  amended,
  onItem,
  onQuestions,
}: {
  analysisId: string;
  amended: number; // accepted changes from the client's answers: when it changes, the sheet is read again
  onItem: (oz: string) => void;
  onQuestions: () => void;
}) {
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState<"all" | "missing">("all");

  useEffect(() => {
    getBid(analysisId).then(setBid, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [analysisId, amended]);

  const save = (prices: Record<string, string>, takeSuggestions = false) => {
    setBusy(true);
    setError(null);
    return setBidPrices(analysisId, prices, takeSuggestions).then(
      (next) => {
        setBusy(false);
        setBid(next);
      },
      (e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };

  const groups = useMemo(() => {
    const out: { section: string; rows: BidRow[] }[] = [];
    for (const row of bid?.rows ?? []) {
      if (only === "missing" && row.price !== null) continue;
      const key = `${row.item_oz.split(".")[0]} ${row.section}`.trim();
      if (out.length === 0 || out[out.length - 1].section !== key) out.push({ section: key, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  }, [bid, only]);

  if (!bid) return <div className="bid">{error ? <p className="q-error">{error}</p> : <p className="quiet">Reading the bid…</p>}</div>;

  const open = bid.rows.filter((r) => r.unit_price === null && r.suggestion).length;
  return (
    <div className="bid">
      <div className="bid-head">
        <div className="bid-sum">
          <span className="caption">Bid total, net</span>
          <b className="num">{eur(bid.net)}</b>
          <span className="quiet">
            {bid.priced} of {bid.items} items priced
            {bid.allowances > 0 && ` · ${eur(bid.allowances)} of it risk allowance`}
          </span>
        </div>
        <div className="bid-actions">
          {open > 0 && (
            <button className="btn" disabled={busy} onClick={() => void save({}, true)}>
              Take the {open} suggested {open === 1 ? "price" : "prices"}
            </button>
          )}
          {bid.x84 && (
            <a className="btn bid-out" href={`/api/analyses/${analysisId}/bid.x84`} download>
              Download the bid (X84)
            </a>
          )}
          <a className="text-link" href={`/api/analyses/${analysisId}/bid.csv`} download>
            Download as sheet (CSV)
          </a>
          {/* for the site, once the job is won: where a change order can arise and what the client was asked */}
          <a className="text-link" href={`/api/analyses/${analysisId}/handover.html`} target="_blank" rel="noopener" title="What the estimating found and the site needs to know: change-order points, the client's answers, prices on assumptions">
            Hand-over sheet for the site
          </a>
        </div>
      </div>

      <BidRiskPanel analysisId={analysisId} at={`${bid.net}|${bid.priced}`} onItem={onItem} />

      {bid.missing > 0 && (
        <p className="bid-note is-open">
          <b>{bid.missing}</b> {bid.missing === 1 ? "item has" : "items have"} no price yet; the file would go out incomplete.{" "}
          <button className="text-link" onClick={() => setOnly(only === "all" ? "missing" : "all")}>
            {only === "all" ? "Show only these" : "Show all items"}
          </button>
        </p>
      )}
      {bid.from_suggestions > 0 && (
        <p className="bid-note">
          {bid.from_suggestions} {bid.from_suggestions === 1 ? "price is" : "prices are"} taken from suggestions as they stand
          (marked "suggested": a partner's quote in another tender, or past bids). They are a starting point: check each against its sources on the item.
        </p>
      )}
      {bid.corrected_quantities > 0 && (
        <p className="bid-note">
          The client changed {bid.corrected_quantities === 1 ? "one quantity" : `${bid.corrected_quantities} quantities`} in an answer.
          The bid is made on the file's quantities until the client sends the corrected LV.{" "}
          <button className="text-link" onClick={onQuestions}>
            Bidder questions
          </button>
        </p>
      )}
      {!bid.x84 && (
        <p className="bid-note">
          {bid.format === "gaeb_xml"
            ? "The X84 file is written from the LV file kept in a project; this file was opened on its own."
            : "This LV did not come as GAEB XML, so the bid goes out as a sheet; the X84 file needs the client's X83."}
        </p>
      )}
      {error && <p className="q-error" role="alert">{error}</p>}

      <table className="bid-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th className="r">Quantity</th>
            <th className="r" title="While no quote for this tender is in: a partner's quote for the same work in another tender, else similar items of past bids">Suggested</th>
            <th className="r">Unit price</th>
            <th className="r">Allowance</th>
            <th className="r">In the bid</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.section}>
            <tr className="bid-section">
              <th colSpan={8} lang="de">{g.section}</th>
            </tr>
            {g.rows.map((row) => (
              <Row key={row.item_oz} row={row} busy={busy} onItem={onItem} onPrice={(text) => save({ [row.item_oz]: text })} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Row({ row, busy, onItem, onPrice }: { row: BidRow; busy: boolean; onItem: (oz: string) => void; onPrice: (text: string) => Promise<void> }) {
  const kept = typed(row.unit_price);
  const [text, setText] = useState(kept);
  useEffect(() => setText(kept), [kept]);
  const commit = () => {
    if (text.trim() !== kept) void onPrice(text.trim());
  };
  return (
    <tr className={row.price === null ? "is-open" : undefined}>
      <td>
        <button className="oz-link" onClick={() => onItem(row.item_oz)}>
          {row.item_oz}
        </button>
      </td>
      <td lang="de">
        {row.label}
        {row.kind !== "normal" && <span className="tag">{KIND_LABEL[row.kind as ItemKind] ?? row.kind}</span>}
      </td>
      <td className="r num">
        {row.qty === null ? "—" : num.format(row.qty)} {row.unit}
        {row.qty_answered !== null && <small>client's answer: {num.format(row.qty_answered)}</small>}
      </td>
      <td className="r num">
        {row.suggestion ? (
          <button
            className="text-link"
            disabled={busy}
            title={`${row.suggestion.sources} ${row.suggestion.basis === "partners" ? "quote" : "past price"}${row.suggestion.sources === 1 ? "" : "s"}, confidence ${row.suggestion.confidence}. Click to take it.`}
            onClick={() => void onPrice(typed(row.suggestion!.unit_price))}
          >
            {eur(row.suggestion.unit_price)}
          </button>
        ) : (
          <span className="quiet">no reliable price</span>
        )}
        {row.suggestion && (
          <small>
            {row.suggestion.basis === "partners" ? `partner's quote${row.suggestion.stale ? ", out of date" : ""}` : "past bids"} · {row.suggestion.confidence}
          </small>
        )}
        {row.material && (
          <small title={`${row.material.supplier}, ${row.material.date}${row.material.stale ? ", out of date" : ""}. A supplier's price is the material part only.`}>
            material {eur(row.material.unit_price)}
          </small>
        )}
      </td>
      <td className="r">
        <input
          type="text"
          inputMode="decimal"
          className="num"
          aria-label={`Unit price of item ${row.item_oz}`}
          value={text}
          disabled={row.source === "file"}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {row.source === "suggestion" && <small>suggested</small>}
      </td>
      <td className="r num">{row.allowance_percent !== null ? `+ ${num.format(row.allowance_percent)} %` : ""}</td>
      <td className="r num">{row.price !== null ? eur(row.price) : ""}</td>
      <td className="r num">{row.total !== null ? eur(row.total) : ""}</td>
    </tr>
  );
}
