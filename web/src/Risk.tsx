/* The bid's price risk. A buffer that follows where each price comes from instead of a flat percentage:
   a binding quote needs little, a price from an old bid more, an item priced over an open question the
   most. Shown: the total as a range, the allowance that covers four cases out of five, and the items
   that cause most of it (confirming those is what brings it down). */
import { useEffect, useState } from "react";
import { getBidRisk } from "./api";
import { eur } from "./format";
import type { BidRisk } from "./types";
import "./supply.css";

export function BidRiskPanel({ analysisId, at, onItem }: { analysisId: string; at: string; onItem: (oz: string) => void }) {
  const [risk, setRisk] = useState<BidRisk | null>(null);
  useEffect(() => {
    getBidRisk(analysisId).then(setRisk, () => setRisk(null));
  }, [analysisId, at]);
  if (!risk || risk.priced === 0) return null;
  const span = Math.max(risk.p80 - risk.total, 1);
  return (
    <details className="risk" open>
      <summary>
        <span className="caption">Price risk</span>
        <b className="num">{eur(risk.allowance)}</b>
        <span>
          covers the priced items in four cases out of five: <b>{risk.allowance_percent.toLocaleString("de-DE")} %</b> on {eur(risk.total)}
          {risk.gaps > 0 && `, ${risk.gaps} unpriced items not counted`}
        </span>
      </summary>
      <div className="risk-body">
        <table>
          <thead>
            <tr>
              <th>What the prices rest on</th>
              <th className="r">Items</th>
              <th className="r">Value</th>
              <th className="r">May be off by</th>
            </tr>
          </thead>
          <tbody>
            {risk.by_basis.map((b) => (
              <tr key={b.basis}>
                <th>{b.label}</th>
                <td className="r num">{b.items}</td>
                <td className="r num">{eur(b.value)}</td>
                <td className="r num">
                  ± {risk.bands[b.basis].toLocaleString("de-DE")} %{b.basis === "history" ? " or more" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {risk.top.length > 0 && (
          <div>
            <h3>The items behind it</h3>
            <ol>
              {risk.top.map((t) => (
                <li key={t.oz}>
                  <button className="oz" onClick={() => onItem(t.oz)}>
                    {t.oz}
                  </button>
                  <span lang="de">{t.label}</span>
                  <i style={{ width: `${Math.min(100, (t.exposure / span) * 100)}%` }} aria-hidden />
                  <span className="num">
                    {eur(t.exposure)} <small>± {t.band.toLocaleString("de-DE")} % · {t.why}</small>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="quiet">
          The bands are rules of thumb by the source of a price, not measured. A price in the bid moves the range only by its own band, so one confirmed
          quote on a large item lowers the allowance more than a flat percentage ever shows. The allowance is a proposal: it is not added to the bid.
        </p>
      </div>
    </details>
  );
}
