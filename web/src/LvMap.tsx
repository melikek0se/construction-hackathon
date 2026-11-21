import { Sign } from "./components";
import { LvText } from "./format";
import { weight, worst, type Section } from "./sections";
import { SEVERITIES, SEVERITY_LABEL, type Finding, type Item, type Severity } from "./types";

/* The LV as a strip map: one row per section, one mark per item in file order.
   Items without a finding are grey ticks; items with one are sign-coloured blocks carrying their number. */

export function LvMap({
  sections,
  findingsByOz,
  visible,
  selectedOz,
  relatedOz,
  section,
  onSection,
  onSelect,
  onHover,
}: {
  sections: Section[];
  findingsByOz: Map<string, Finding[]>;
  visible: Set<Severity>;
  selectedOz: string | null;
  relatedOz: Set<string>;
  section: string | null;
  onSection: (key: string | null) => void;
  onSelect: (oz: string) => void;
  onHover: (item: Item | null) => void;
}) {
  return (
    <div className="map">
      <ul className="key" aria-label="How to read the map">
        {SEVERITIES.map((sev) => (
          <li key={sev}>
            <Sign severity={sev} size={22} />
            {SEVERITY_LABEL[sev]}
          </li>
        ))}
        <li>
          <i className="tick" aria-hidden />
          Item without a rule finding
        </li>
      </ul>

      <ol className="rows">
        {sections.map((sec) => (
          <li key={sec.key} className={`row${section === sec.key ? " active" : ""}`}>
            <button
              className="row-head"
              aria-pressed={section === sec.key}
              title="Show only this section's findings"
              onClick={() => onSection(section === sec.key ? null : sec.key)}
            >
              <span className="row-no">{sec.key}</span>
              <span className="row-title" lang="de">
                <LvText text={sec.title || `Section ${sec.key}`} />
              </span>
              <span className="row-counts">
                {SEVERITIES.filter((sev) => sec.counts[sev] > 0).map((sev) => (
                  <span key={sev}>
                    <Sign severity={sev} size={18} />
                    {sec.counts[sev]}
                  </span>
                ))}
                {weight(sec.counts) === 0 && <span className="none">no rule finding</span>}
                {weight(sec.counts) > 0 && (
                  <span className="row-size" title="Risk points: 5 per Stop, 2 per Caution, 1 per Note">
                    {weight(sec.counts)} pts
                  </span>
                )}
                <span className="row-size">{sec.items.length} items</span>
              </span>
            </button>
            <div className="strip">
              {sec.items.map((item, i) => {
                const found = findingsByOz.get(item.oz);
                const worstSev = worst(found);
                const sev = worstSev && visible.has(worstSev) ? worstSev : null;
                const sub = (oz: string) => oz.split(".").slice(0, -1).join(".");
                const cls = [
                  sev ? `block sev-${sev}` : "tick",
                  i > 0 && sub(sec.items[i - 1].oz) !== sub(item.oz) ? "lead" : "",
                  selectedOz === item.oz ? "selected" : "",
                  relatedOz.has(item.oz) ? "related" : "",
                ];
                return (
                  <button
                    key={item.oz}
                    className={cls.filter(Boolean).join(" ")}
                    tabIndex={sev ? 0 : -1}
                    aria-label={`Item ${item.oz}${found ? `, ${found.length} finding${found.length > 1 ? "s" : ""}` : ""}`}
                    aria-pressed={selectedOz === item.oz}
                    onClick={() => onSelect(item.oz)}
                    onPointerEnter={() => onHover(item)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(item)}
                    onBlur={() => onHover(null)}
                  >
                    {sev && sev !== "info" && item.oz}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
