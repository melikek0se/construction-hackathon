import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeSample, analyzeUpload, listSamples } from "./api";
import type { Analysis, Finding, Item, Sample, Severity } from "./api";

const SEVERITIES: Severity[] = ["high", "warn", "info"];
const SEVERITY_LABEL: Record<Severity, string> = { high: "Clarify", warn: "Risk", info: "Note" };
const ACTION_LABEL: Record<Finding["action"], string> = {
  ask_client: "Ask the client before bidding",
  add_surcharge: "Price the risk into the bid",
  get_quote: "Get a supplier quote",
  note_for_claims: "Keep for claim management",
  fix_typo: "Correct the figure",
};
const KIND_LABEL: Record<Item["kind"], string> = {
  normal: "",
  lump_sum: "Lump sum",
  contingency: "Contingency",
  alternative: "Alternative",
  hourly: "Hourly",
  surcharge: "Surcharge",
};
const PHASE_LABEL: Record<string, string> = { "83": "Tender", "84": "Bid", "86": "Award" };

const number = (digits: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = number(2);

function formatQty(value: string | null): string {
  if (value === null) return "";
  const n = Number(value);
  return Number.isInteger(n) ? number(0).format(n) : number(3).format(n);
}

function formatMoney(value: string | null): string {
  return value === null ? "" : money.format(Number(value));
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  async function run(label: string, job: () => Promise<Analysis>) {
    setBusy(label);
    setError("");
    try {
      setAnalysis(await job());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const upload = (file: File) => run(file.name, () => analyzeUpload(file));
  const openSample = (sample: Sample) => run(sample.name, () => analyzeSample(sample.path));

  return (
    <div className="app">
      <header className="bar">
        <button className="brand" onClick={() => setAnalysis(null)} title="Back to the start">
          LV check
        </button>
        {analysis && <span className="bar-file">{analysis.boq.file}</span>}
        <span className="bar-space" />
        {busy && <span className="bar-busy">Reading {busy}…</span>}
        <UploadButton onFile={upload} label={analysis ? "Check another LV" : "Choose a file"} />
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {analysis ? (
        <Workspace key={analysis.boq.file} analysis={analysis} />
      ) : (
        <Start samples={samples} onFile={upload} onSample={openSample} busy={busy !== ""} />
      )}
    </div>
  );
}

function UploadButton({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="button" onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".x83,.x84,.x86,.d83,.d84,.d86,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

function Start(props: { samples: Sample[]; onFile: (f: File) => void; onSample: (s: Sample) => void; busy: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <main className="start">
      <div
        className={"sheet drop" + (over ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) props.onFile(file);
        }}
      >
        <div className="sheet-head" aria-hidden="true">
          <span>OZ</span>
          <span>Leistungsbeschreibung</span>
          <span>Menge</span>
          <span>ME</span>
          <span>EP</span>
          <span>GP</span>
        </div>
        <div className="drop-body">
          <h1>Drop a Leistungsverzeichnis here</h1>
          <p>
            Every item is checked for contradictions, missing companion work and wording that moves risk to
            the bidder. GAEB XML (X83, X84, X86), GAEB 90 (D83, D84, D86) or a PDF printout.
          </p>
        </div>
      </div>
      {props.samples.length > 0 && (
        <section className="samples">
          <h2>Or open one from the challenge dataset</h2>
          <ul>
            {props.samples.map((s) => (
              <li key={s.path}>
                <button disabled={props.busy} onClick={() => props.onSample(s)}>
                  <span className="sample-name">{s.name}</span>
                  <span className="sample-meta">
                    {s.path.split("/")[0].replace(/^\d+_/, "").replace(/_/g, " ")}, {Math.round(s.bytes / 1024)} kB
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Workspace({ analysis }: { analysis: Analysis }) {
  const { boq, findings } = analysis;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const byItem = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      if (!shown.has(f.severity) || f.item_oz === null) continue;
      map.set(f.item_oz, [...(map.get(f.item_oz) ?? []), f]);
    }
    return map;
  }, [findings, shown]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, warn: 0, info: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const visibleFindings = findings.filter((f) => shown.has(f.severity));
  const needle = query.trim().toLowerCase();
  const rows = boq.items.filter(
    (i) =>
      (!flaggedOnly || byItem.has(i.oz)) &&
      (!needle || i.oz.startsWith(needle) || `${i.short_text} ${i.long_text}`.toLowerCase().includes(needle)),
  );
  const total = boq.items.reduce((sum, i) => sum + (i.total ? Number(i.total) : 0), 0);
  const priced = boq.items.some((i) => i.total !== null);
  const item = boq.items.find((i) => i.oz === selected) ?? null;

  function toggle(severity: Severity) {
    const next = new Set(shown);
    if (next.has(severity)) next.delete(severity);
    else next.add(severity);
    setShown(next);
  }

  function select(oz: string | null) {
    setSelected(oz);
    if (oz) requestAnimationFrame(() => document.getElementById(`row-${oz}`)?.scrollIntoView({ block: "center" }));
  }

  return (
    <main className="workspace">
      <section className="summary">
        <h1>{boq.name || boq.file}</h1>
        <p>
          {PHASE_LABEL[boq.phase] ?? "LV"} with {boq.items.length} items
          {priced ? `, ${money.format(total)} EUR net` : ", no prices yet"}. {findings.length} findings.
        </p>
        <div className="filters">
          {SEVERITIES.map((s) => (
            <button key={s} className={`chip ${s}`} aria-pressed={shown.has(s)} onClick={() => toggle(s)}>
              <span className={`mark ${s}`} />
              {SEVERITY_LABEL[s]} <b>{counts[s]}</b>
            </button>
          ))}
          <label className="check">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Only items with findings
          </label>
          <input
            className="search"
            type="search"
            placeholder="Search item number or text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      <div className="panes">
        <div className="sheet table-wrap">
          <table>
            <thead>
              <tr>
                <th className="c-mark" aria-label="Findings" />
                <th className="c-oz">OZ</th>
                <th>Leistungsbeschreibung</th>
                <th className="c-num">Menge</th>
                <th className="c-unit">ME</th>
                {priced && <th className="c-num">EP</th>}
                {priced && <th className="c-num">GP</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((it, index) => {
                const titles = newTitles(it, rows[index - 1]);
                const marks = byItem.get(it.oz) ?? [];
                return [
                  ...titles.map((t) => (
                    <tr key={`${it.oz}-t${t.depth}`} className="title-row">
                      <td />
                      <td colSpan={priced ? 6 : 4} style={{ paddingLeft: 12 + t.depth * 16 }}>
                        {t.label}
                      </td>
                    </tr>
                  )),
                  <tr
                    key={it.oz}
                    id={`row-${it.oz}`}
                    className={"item-row" + (it.oz === selected ? " selected" : "") + (marks[0] ? ` has-${marks[0].severity}` : "")}
                    onClick={() => select(it.oz)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && select(it.oz)}
                  >
                    <td className="c-mark">
                      {marks.slice(0, 4).map((f, i) => (
                        <span key={i} className={`mark ${f.severity}`} title={f.title} />
                      ))}
                    </td>
                    <td className="c-oz">{it.oz}</td>
                    <td className="c-text">
                      {it.short_text || it.long_text.split("\n")[0] || <i>no description in this file</i>}
                      {KIND_LABEL[it.kind] && <span className="kind">{KIND_LABEL[it.kind]}</span>}
                    </td>
                    <td className="c-num">{formatQty(it.qty)}</td>
                    <td className="c-unit">{it.unit_raw}</td>
                    {priced && <td className="c-num">{formatMoney(it.up)}</td>}
                    {priced && <td className="c-num">{formatMoney(it.total)}</td>}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">No item matches. Clear the search or the filters.</p>}
        </div>

        <aside className="inspector">
          {item ? (
            <ItemDetail item={item} findings={byItem.get(item.oz) ?? []} onBack={() => select(null)} onOpen={select} />
          ) : (
            <FindingList findings={visibleFindings} onOpen={select} />
          )}
        </aside>
      </div>
    </main>
  );
}

function newTitles(item: Item, previous: Item | undefined) {
  const out: { depth: number; label: string }[] = [];
  let changed = previous === undefined;
  item.path.forEach((label, depth) => {
    if (changed || previous!.path[depth] !== label) {
      changed = true;
      out.push({ depth, label });
    }
  });
  return out;
}

function FindingList({ findings, onOpen }: { findings: Finding[]; onOpen: (oz: string) => void }) {
  if (findings.length === 0) {
    return <p className="empty">No findings with the selected filters.</p>;
  }
  return (
    <>
      <h2>Findings, most serious first</h2>
      <ul className="finding-list">
        {findings.map((f, i) => (
          <li key={i}>
            <button onClick={() => f.item_oz && onOpen(f.item_oz)}>
              <span className={`mark ${f.severity}`} />
              <span className="finding-oz">{f.item_oz ?? "LV"}</span>
              <span className="finding-title">{f.title || f.check_id}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ItemDetail(props: { item: Item; findings: Finding[]; onBack: () => void; onOpen: (oz: string) => void }) {
  const { item, findings } = props;
  return (
    <>
      <button className="back" onClick={props.onBack}>
        All findings
      </button>
      <p className="detail-path">{item.path.join(" / ")}</p>
      <h2>
        <span className="detail-oz">{item.oz}</span> {item.short_text}
      </h2>
      <p className="detail-facts">
        {formatQty(item.qty)} {item.unit_raw}
        {item.up !== null && `, unit price ${formatMoney(item.up)} EUR, total ${formatMoney(item.total)} EUR`}
        {KIND_LABEL[item.kind] && `, ${KIND_LABEL[item.kind].toLowerCase()} item`}
        {item.source.page !== null && `, page ${item.source.page}`}
      </p>

      {findings.length === 0 && <p className="quiet">The rule checks found nothing on this item.</p>}
      {findings.map((f, i) => (
        <article key={i} className={`finding ${f.severity}`}>
          <h3>
            <span className={`mark ${f.severity}`} />
            {f.title || f.check_id}
          </h3>
          <blockquote>{f.evidence}</blockquote>
          <p>{f.explanation}</p>
          <p className="finding-action">
            {ACTION_LABEL[f.action]}
            {f.money_at_stake !== null && `, ${formatMoney(f.money_at_stake)} EUR at stake`}
          </p>
          {f.related_oz.length > 0 && (
            <p className="related">
              Related items:{" "}
              {f.related_oz.slice(0, 12).map((oz) => (
                <button key={oz} onClick={() => props.onOpen(oz)}>
                  {oz}
                </button>
              ))}
            </p>
          )}
        </article>
      ))}

      {item.long_text && (
        <>
          <h3 className="long-head">Langtext</h3>
          <p className="long-text">{item.long_text}</p>
        </>
      )}
    </>
  );
}
