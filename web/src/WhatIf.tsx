import { useEffect, useState } from "react";
import { runWhatIf } from "./api";
import { Select } from "./controls";
import { LvText, eur } from "./format";
import type { Section } from "./sections";
import type { Adjustment, WhatIfResult } from "./types";

const START: Adjustment = { kind: "price", percent: 10, section: null, keyword: "" };

/**
 * What-if on a priced LV: change unit prices or quantities of a group of items, leave optional items
 * out, and read the new total. The server does the arithmetic; this view is the form and the readout.
 */
export function WhatIfView({ analysisId, sections }: { analysisId: string; sections: Section[] }) {
  const [rows, setRows] = useState<Adjustment[]>([START]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      runWhatIf(analysisId, { adjustments: rows.filter((r) => Number.isFinite(r.percent)), exclude: excluded })
        .then((r) => {
          if (current) {
            setResult(r);
            setError(null);
          }
        })
        .catch((e) => current && setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [analysisId, rows, excluded]);

  const update = (i: number, patch: Partial<Adjustment>) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  if (result && !result.priced) {
    return (
      <div className="whatif">
        <p className="quiet none">
          This file has no prices, so there is no total to vary. Open a bid or an award (GAEB 84 / 86, or a
          priced PDF).
        </p>
      </div>
    );
  }

  return (
    <div className="whatif">
      <div className="whatif-form">
        {rows.map((r, i) => (
          <div className="whatif-row" key={i}>
            <Select
              aria-label="What changes"
              value={r.kind}
              options={[
                { value: "price", label: "Unit prices" },
                { value: "quantity", label: "Quantities" },
              ]}
              onChange={(kind) => update(i, { kind })}
            />
            <span>of</span>
            <Select
              aria-label="Section"
              className="section"
              value={r.section ?? ""}
              options={[{ value: "", label: "all sections" }, ...sections.map((s) => ({ value: s.key, label: `${s.key} ${s.title.slice(0, 40)}` }))]}
              onChange={(key) => update(i, { section: key || null })}
            />
            <input
              type="search"
              aria-label="Word in the item text"
              placeholder="items containing… (Guss, Asphalt, DN 300)"
              value={r.keyword}
              onChange={(e) => update(i, { keyword: e.target.value })}
            />
            <span>change by</span>
            <input
              className="percent"
              type="number"
              aria-label="Percent"
              step={5}
              value={Number.isFinite(r.percent) ? r.percent : ""}
              onChange={(e) => update(i, { percent: e.target.value === "" ? NaN : Number(e.target.value) })}
            />
            <span>%</span>
            {result?.adjustments[i] && (
              <span className="whatif-hit">
                {result.adjustments[i].items} items, {eur(result.adjustments[i].value)}
              </span>
            )}
            {rows.length > 1 && (
              <button className="text-link" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button className="text-link" onClick={() => setRows((rs) => [...rs, { ...START, percent: 0 }])}>
          Add another change
        </button>
      </div>

      {error && <p className="quiet none">{error}</p>}

      {result?.priced && (
        <div className="whatif-result">
          <p className="whatif-total">
            <span>
              <small>Total in the file</small>
              <b className="num">{eur(result.before)}</b>
            </span>
            <span>
              <small>With these changes</small>
              <b className="num">{eur(result.after)}</b>
            </span>
            <span className={result.delta > 0 ? "up" : result.delta < 0 ? "down" : ""}>
              <small>Difference</small>
              <b className="num">
                {result.delta > 0 ? "+" : ""}
                {eur(result.delta)} ({result.delta_percent > 0 ? "+" : ""}
                {result.delta_percent.toFixed(1)} %)
              </b>
            </span>
          </p>
          <div className="bars whatif-bars" aria-hidden>
            {[
              ["In the file", result.before],
              ["With changes", result.after],
            ].map(([label, value], i) => (
              <div key={label} className={`bar-row${i === 1 ? " strong" : ""}`}>
                <span>{label}</span>
                <i style={{ width: `${(Number(value) / Math.max(result.before, result.after, 1)) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="quiet">
            The file gives one unit price per item and no split into labour and material, so a change applies to
            the whole unit price of every matching item.
            {result.quantity_beyond_10_percent &&
              " A quantity change above 10 % lets either side renegotiate the unit price (VOB/B §2 Abs. 3); the figure here keeps the price fixed."}
          </p>

          <div className="whatif-tables">
            <table>
              <thead>
                <tr>
                  <th>Section</th>
                  <th className="r">Before</th>
                  <th className="r">After</th>
                  <th className="r">Difference</th>
                </tr>
              </thead>
              <tbody>
                {result.sections.map((s) => (
                  <tr key={s.key} className={s.delta ? "changed" : ""}>
                    <td>
                      <b className="num">{s.key}</b>{" "}
                      <span lang="de">
                        <LvText text={s.title} />
                      </span>
                    </td>
                    <td className="r">{eur(s.before)}</td>
                    <td className="r">{eur(s.after)}</td>
                    <td className="r">{s.delta ? eur(s.delta) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.top_items.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Items that move the total most ({result.changed_items} changed)</th>
                    <th className="r">Before</th>
                    <th className="r">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {result.top_items.map((r) => (
                    <tr key={r.item_oz}>
                      <td>
                        <b className="num">{r.item_oz}</b>{" "}
                        <span lang="de">
                          <LvText text={r.label.slice(0, 70)} />
                        </span>
                        {r.excluded && <span className="tag">left out</span>}
                      </td>
                      <td className="r">{eur(r.before)}</td>
                      <td className="r">{eur(r.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {result.optional_items.length > 0 && (
            <fieldset className="whatif-optional">
              <legend>Alternative and contingency items: tick to leave out of the total</legend>
              {result.optional_items.map((o) => (
                <label key={o.item_oz}>
                  <input
                    type="checkbox"
                    checked={excluded.includes(o.item_oz)}
                    onChange={(e) =>
                      setExcluded((x) => (e.target.checked ? [...x, o.item_oz] : x.filter((oz) => oz !== o.item_oz)))
                    }
                  />
                  <b className="num">{o.item_oz}</b>
                  <span lang="de">
                    <LvText text={o.label.slice(0, 80)} />
                  </span>
                  <span className="tag">{o.kind === "alternative" ? "Alternative" : "Contingency"}</span>
                  <span className="r">{eur(o.total)}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
