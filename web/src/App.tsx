import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeFile, listSamples, loadPrices, loadSample, runLlmReview } from "./api";
import { FindingsList, ItemSheet, ItemsView, RemarksView, Sign, itemLabel, type Selection } from "./components";
import { LvText, eur, qty } from "./format";
import { buildSections, weight, worst } from "./sections";
import { LvMap } from "./LvMap";
import { WhatIfView } from "./WhatIf";
import { FORMAT_LABEL, PHASE_LABEL, SEVERITIES, countLabel, sampleKind, type Analysis, type Finding, type Item, type Prices, type Sample, type Severity } from "./types";

type View = "plan" | "table" | "remarks" | "whatif";
const VIEWS: [View, string][] = [
  ["plan", "LV map"],
  ["table", "Item table"],
  ["remarks", "Remarks"],
  ["whatif", "What-if"],
];
const ALL = new Set<Severity>(SEVERITIES);
const NONE: Selection = { oz: null, finding: null };

export default function App() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [apiDown, setApiDown] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("plan");
  const [tableKey, setTableKey] = useState(0);
  const [severities, setSeverities] = useState<Set<Severity>>(ALL);
  const [section, setSection] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Item | null>(null);
  const [selection, setSelection] = useState<Selection>(NONE);
  const [dragging, setDragging] = useState(false);
  const [ai, setAi] = useState<"idle" | "running" | "done">("idle");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSamples().then(setSamples, () => setApiDown(true));
  }, []);

  const run = useCallback(async (label: string, job: () => Promise<Analysis>) => {
    setBusy(label);
    setError(null);
    try {
      setAnalysis(await job());
      setAi("idle");
      setView("plan");
      setSeverities(ALL);
      setSection(null);
      setSelection(NONE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // ?sample=<folder>/<file>[&view=table|remarks][&item=5.1.4] reopens the same LV after a reload.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("sample");
    if (!id) return;
    void run(id.split("/").pop() ?? id, () => loadSample(id)).then(() => {
      const v = params.get("view");
      if (v === "table" || v === "remarks" || v === "whatif") setView(v);
      const oz = params.get("item");
      if (oz) setSelection({ oz, finding: null });
    });
  }, [run]);

  // The AI review adds findings to the same list; rule findings stay first within each severity.
  async function review() {
    if (!analysis || ai !== "idle") return;
    setAi("running");
    setError(null);
    try {
      const { findings } = await runLlmReview(analysis.id);
      const added = findings.filter((f) => f.origin === "llm");
      setAnalysis((a) => (a && a.id === analysis.id ? { ...a, findings: [...a.findings, ...added] } : a));
      setAi("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAi("idle");
    }
  }

  const upload = useCallback(
    (file: File | undefined) => {
      if (file) void run(file.name, () => analyzeFile(file));
    },
    [run],
  );

  // Price suggestions arrive after the LV is on screen; the item sheet shows them when they are there.
  const [prices, setPrices] = useState<Prices | null>(null);
  const analysisId = analysis?.id;
  useEffect(() => {
    setPrices(null);
    if (!analysisId) return;
    let current = true;
    loadPrices(analysisId)
      .then((p) => current && setPrices(p))
      .catch(() => undefined); // prices are an extra; the findings do not depend on them
    return () => {
      current = false;
    };
  }, [analysisId]);

  const priceByOz = useMemo(() => new Map((prices?.suggestions ?? []).map((s) => [s.item_oz, s])), [prices]);

  const itemByOz = useMemo(() => {
    const m = new Map<string, Item>();
    for (const item of analysis?.boq.items ?? []) if (!m.has(item.oz)) m.set(item.oz, item);
    return m;
  }, [analysis]);

  const findingsByOz = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of analysis?.findings ?? []) {
      if (f.item_oz === null) continue;
      m.set(f.item_oz, [...(m.get(f.item_oz) ?? []), f]);
    }
    return m;
  }, [analysis]);

  const sections = useMemo(
    () => (analysis ? buildSections(analysis.boq.items, analysis.findings) : []),
    [analysis],
  );

  const stats = useMemo(() => {
    if (!analysis) return null;
    const counts: Record<Severity, number> = { high: 0, warn: 0, info: 0 };
    for (const f of analysis.findings) counts[f.severity]++;
    const totals = analysis.boq.items.flatMap((i) => (i.total === null ? [] : [Number(i.total)]));
    const heaviest = [...sections].sort((a, b) => weight(b.counts) - weight(a.counts))[0];
    return {
      counts,
      priced: totals.length > 0,
      net: totals.reduce((a, b) => a + b, 0),
      heaviest: heaviest && weight(heaviest.counts) > 0 ? heaviest : null,
    };
  }, [analysis, sections]);

  const relatedOz = useMemo(() => {
    const f = selection.finding !== null ? analysis?.findings[selection.finding] : null;
    return new Set(f?.related_oz ?? []);
  }, [analysis, selection]);

  const open = selection.oz !== null || selection.finding !== null;

  function showInTable(oz: string) {
    setSelection({ oz, finding: null });
    setView("table");
    setTableKey((k) => k + 1); // remount so the table scrolls to the row
  }

  const picker = samples.length > 0 && (
    <select
      value=""
      disabled={busy !== null}
      onChange={(e) => {
        const s = samples.find((x) => x.path === e.target.value);
        if (s) void run(s.name, () => loadSample(s.path));
      }}
      aria-label="Open an LV from the dataset"
    >
      <option value="">Open from dataset</option>
      {samples.map((s) => (
        <option key={s.path} value={s.path}>
          {s.name} ({sampleKind(s.name)})
        </option>
      ))}
    </select>
  );

  return (
    <div
      className={`app${dragging ? " dragging" : ""}`}
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".x83,.x84,.x86,.d83,.d84,.d86,.pdf,.xlsx,.xls"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <header className="band">
        <span className="brand">LV Check</span>
        {analysis && stats && (
          <>
          <div className="doc">
            <strong>
              <LvText text={analysis.boq.name || analysis.boq.file} />
            </strong>
            <span>
              {analysis.boq.file} · {FORMAT_LABEL[analysis.boq.format]}
              {PHASE_LABEL[analysis.boq.phase] ? ` · ${PHASE_LABEL[analysis.boq.phase]}` : ""} ·{" "}
              {stats.priced ? `${eur(stats.net)} net` : "no prices in this file"}
            </span>
          </div>
          <div className="actions">
            {/* Server-rendered from the findings so far; includes the AI review once it has run. */}
            <a className="btn" href={`/api/analyses/${analysis.id}/report.html`} target="_blank" rel="noreferrer">
              Risk report
            </a>
            <a className="btn" href={`/api/analyses/${analysis.id}/bieterfragen.txt`} download>
              Bidder questions
            </a>
            {picker}
            <button className="btn" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
              Upload LV
            </button>
          </div>
          </>
        )}
      </header>

      {busy && (
        <div className="notice busy" role="status">
          Analysing {busy}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          <span>{error}</span>
          <button className="text-link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {apiDown && !analysis && (
        <div className="notice error" role="alert">
          <span>
            The analysis service is not answering. Start it with <code>uv run uvicorn boq.api:app --port 8000</code>,
            then reload this page.
          </span>
        </div>
      )}

      {!analysis || !stats ? (
        <main className="landing">
          <div className="landing-inner">
            <div className="hero">
              <div>
                <h1>See where an LV will hurt before you price it.</h1>
                <p className="lede">
                  Drop a Leistungsverzeichnis. It comes back as a map of every section and item, the problem items
                  marked in place, each with its evidence and what to do about it.
                </p>
              </div>
              <ul className="legend" aria-label="What the three signs mean">
                <li>
                  <Sign severity="high" size={56} />
                  <b>Stop</b>
                  <span>The LV contradicts itself or cannot be priced as written. Ask the client first.</span>
                </li>
                <li>
                  <Sign severity="warn" size={56} />
                  <b>Caution</b>
                  <span>Scope or risk is pushed onto the bidder. Price it in or question it.</span>
                </li>
                <li>
                  <Sign severity="info" size={56} />
                  <b>Note</b>
                  <span>Wording worth knowing about before you sign. Keep it for later claims.</span>
                </li>
              </ul>
            </div>
            <div className="pick">
              <button className="drop" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                <strong>Drop an LV, or choose one</strong>
                <span>GAEB XML (.x83 .x84 .x86), GAEB 90 (.d83 .d84 .d86) or a PDF with a text layer.</span>
              </button>
              {samples.length > 0 && (
                <div>
                  <h2>Or open one of the dataset LVs</h2>
                  <ul className="samples">
                    {samples.map((s) => (
                      <li key={s.path}>
                        <button disabled={busy !== null} onClick={() => void run(s.name, () => loadSample(s.path))}>
                          <span className="sample-name">{s.name}</span>
                          <span className="sample-kind">{sampleKind(s.name)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        <div className="work">
          <main className="left">
            <div className="left-head">
              <div className="verdict">
                <h1>
                  {analysis.findings.length === 0
                    ? `No rule finding in ${analysis.boq.items.length} items`
                    : SEVERITIES.filter((s) => stats.counts[s] > 0).map((s) => (
                        <span key={s} className="count">
                          <Sign severity={s} size={36} />
                          {countLabel(stats.counts[s], s)}
                        </span>
                      ))}
                </h1>
                {analysis.findings.length > 0 && (
                  <p>
                    on {findingsByOz.size} of {analysis.boq.items.length} items
                    {stats.heaviest && (
                      <>
                        . Heaviest section: <b>{stats.heaviest.key}</b>{" "}
                        <span lang="de">
                          <LvText text={stats.heaviest.title} />
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="views" role="tablist" aria-label="View">
                {VIEWS.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {view === "plan" && (
              <>
                <LvMap
                  sections={sections}
                  findingsByOz={findingsByOz}
                  visible={severities}
                  selectedOz={selection.oz}
                  relatedOz={relatedOz}
                  section={section}
                  onSection={(key) => {
                    setSection(key);
                    setSelection(NONE);
                  }}
                  onSelect={(oz) => setSelection({ oz, finding: null })}
                  onHover={setHovered}
                />
                <p className="readout" aria-live="off">
                  {hovered ? (
                    <>
                      {worst(findingsByOz.get(hovered.oz)) && (
                        <Sign severity={worst(findingsByOz.get(hovered.oz))!} size={22} />
                      )}
                      <b>{hovered.oz}</b>
                      <span className="readout-text" lang="de">
                        <LvText text={itemLabel(hovered)} />
                      </span>
                      <span className="readout-qty">
                        {qty(hovered.qty)} {hovered.unit_raw || hovered.unit}
                      </span>
                    </>
                  ) : (
                    <span className="hint">
                      One row per section, one mark per item, in LV order. Point at a mark to read it, click to open it.
                    </span>
                  )}
                </p>
              </>
            )}
            {view === "table" && (
              <ItemsView
                key={tableKey}
                analysis={analysis}
                findingsByOz={findingsByOz}
                selectedOz={selection.oz}
                onSelect={(oz) => setSelection({ oz, finding: null })}
              />
            )}
            {view === "remarks" && <RemarksView analysis={analysis} />}
            {view === "whatif" && <WhatIfView key={analysis.id} analysisId={analysis.id} sections={sections} />}
          </main>

          <aside className="right">
            {open ? (
              <ItemSheet
                analysis={analysis}
                itemByOz={itemByOz}
                findingsByOz={findingsByOz}
                price={selection.oz ? priceByOz.get(selection.oz) : undefined}
                selection={selection}
                onSelect={setSelection}
                onBack={() => setSelection(NONE)}
                onShowInTable={showInTable}
              />
            ) : (
              <FindingsList
                analysis={analysis}
                itemByOz={itemByOz}
                sections={sections}
                severities={severities}
                onSeverities={setSeverities}
                section={section}
                onSection={setSection}
                onSelect={setSelection}
                ai={ai}
                onReview={() => void review()}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
