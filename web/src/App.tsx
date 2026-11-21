import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  catalogSummary,
  createProject,
  intakeFiles,
  listCatalog,
  loadAnalysis,
  loadPrices,
  loadSample,
  openCatalogFile,
  openCatalogProject,
  renameProject,
  deleteProject,
  runLlmReview,
} from "./api";
import { CraneIcon, ProjectsPage } from "./Projects";
import { LoadingTapes } from "./Loading";
import { ProjectView } from "./ProjectView";
import { FindingsList, ItemSheet, ItemsView, RemarksView, Sign, itemLabel, type Selection } from "./components";
import { LvText, eur, qty } from "./format";
import { buildSections, weight, worst } from "./sections";
import { LvMap } from "./LvMap";
import { WhatIfView } from "./WhatIf";
import { FORMAT_LABEL, PHASE_LABEL, SEVERITIES, countLabel, type Analysis, type CatalogProject, type Finding, type Intake, type Item, type Prices, type Project, type ProjectSummary, type Severity } from "./types";

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
  const [catalog, setCatalog] = useState<CatalogProject[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary | "failed">>({});
  // The project that is open, and which of its files when it is one LV in several versions.
  const [current, setCurrent] = useState<{ project: CatalogProject; file: number } | null>(null);
  // Files that were dropped or chosen and are waiting for a decision: what they are, and where they go.
  const [pending, setPending] = useState<{ files: File[]; info: Intake | null; target: string | null } | null>(null);
  const addTarget = useRef<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // A project (several trade LVs) is shown when no single LV is open; an LV opened from it keeps it.
  const [project, setProject] = useState<Project | null>(null);
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

  const refreshCatalog = useCallback(async () => {
    const list = await listCatalog();
    setCatalog(list);
    return list;
  }, []);

  useEffect(() => {
    refreshCatalog().catch(() => setApiDown(true));
  }, [refreshCatalog]);

  // Each project's numbers need its files parsed on the server: ask one after the other, so a building of
  // 27 PDFs does not hold up the small ones.
  // A project is asked once and its answer always kept: the list can be loaded again while answers are
  // still on their way (it is, twice, in development), and dropping them would leave rows empty for good.
  const asked = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    for (const p of catalog) {
      if (asked.current.has(p.id)) continue;
      asked.current.add(p.id);
      queue.current = queue.current.then(async () => {
        const summary = await catalogSummary(p.id).catch(() => "failed" as const);
        setSummaries((s) => ({ ...s, [p.id]: summary }));
      });
    }
  }, [catalog]);

  const runProject = useCallback(async (label: string, job: () => Promise<Project>) => {
    setBusy(label);
    setError(null);
    try {
      setProject(await job());
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
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

  const openProject = useCallback(
    (p: CatalogProject, file = 0) => {
      setCurrent({ project: p, file });
      if (p.kind === "trades") void runProject(p.name, () => openCatalogProject(p.id));
      else {
        setProject(null);
        void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file));
      }
    },
    [run, runProject],
  );

  function closeAll() {
    setPending(null);
    setAnalysis(null);
    setProject(null);
    setCurrent(null);
  }

  // ?project=A[&file=2] reopens a project after a reload; ?sample=<folder>/<file> a single dataset file.
  // Both take &view=table|remarks|whatif and &item=5.1.4.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    const params = new URLSearchParams(location.search);
    const then = () => {
      const v = params.get("view");
      if (v === "table" || v === "remarks" || v === "whatif") setView(v);
      const oz = params.get("item");
      if (oz) setSelection({ oz, finding: null });
    };
    const id = params.get("project");
    const sample = params.get("sample");
    if (id) {
      const p = catalog.find((x) => x.id === id);
      if (!p) return; // the catalogue has not arrived yet
      linked.current = true;
      const file = Number(params.get("file") ?? 0);
      setCurrent({ project: p, file });
      if (p.kind === "trades") void runProject(p.name, () => openCatalogProject(p.id));
      else void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file)).then(then);
    } else if (sample) {
      linked.current = true;
      void run(sample.split("/").pop() ?? sample, () => loadSample(sample)).then(then);
    }
  }, [catalog, run, runProject]);

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

  // Files never open on their own: they are read first (what is each one, which are the same LV), then
  // kept as a project or added to one. See docs/07-user-flows.md.
  const upload = useCallback((files: FileList | File[] | null | undefined, target: string | null = null) => {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    setAnalysis(null);
    setProject(null);
    setCurrent(null);
    setError(null);
    setPending({ files: list, info: null, target });
    intakeFiles(list).then(
      (info) => setPending((p) => (p && p.files === list ? { ...p, info } : p)),
      (e) => {
        setPending((p) => (p && p.files === list ? null : p));
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, []);

  async function confirmIntake(name: string, target: string | null) {
    if (!pending) return;
    setBusy(target ? "the added files" : name || "the new project");
    setError(null);
    try {
      const { id } = await createProject(pending.files, name, target);
      asked.current.delete(id); // its numbers have changed
      setSummaries(({ [id]: _old, ...rest }) => rest);
      const saved = (await refreshCatalog()).find((p) => p.id === id);
      setPending(null);
      setBusy(null);
      if (saved) openProject(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function removeProject(p: CatalogProject) {
    setError(null);
    try {
      await deleteProject(p.id);
      asked.current.delete(p.id);
      setSummaries(({ [p.id]: _old, ...rest }) => rest);
      await refreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function rename(name: string) {
    if (!current || !name.trim() || name.trim() === current.project.name) return;
    try {
      const renamed = await renameProject(current.project.id, name.trim());
      setCurrent({ ...current, project: renamed });
      setProject((p) => (p ? { ...p, name: renamed.name } : p));
      void refreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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

  return (
    <div
      className={`app${dragging ? " dragging" : ""}${!analysis && !project ? " home" : ""}`}
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept=".x83,.x84,.x86,.d83,.d84,.d86,.pdf,.xlsx,.xls"
        onChange={(e) => {
          upload(e.target.files, addTarget.current);
          addTarget.current = null;
          e.target.value = "";
        }}
      />

      <header className="band">
        <button className="brand" onClick={closeAll} title="All projects">
          <CraneIcon size={26} />
          LV Check
        </button>
        {project && !analysis && (
          <>
            <div className="doc">
              {current ? (
                <input
                  key={current.project.name}
                  className="doc-name"
                  defaultValue={current.project.name}
                  aria-label="Project name"
                  maxLength={80}
                  onBlur={(e) => void rename(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              ) : (
                <strong lang="de">{project.name}</strong>
              )}
              <span>
                {[current?.project.number, `${project.lvs.length} trade LVs`].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="actions">
              <button className="btn" onClick={closeAll}>
                All projects
              </button>
            </div>
          </>
        )}
        {analysis && stats && (
          <>
            <div className="doc">
              <strong lang="de">
                <LvText text={current && !project ? current.project.name : analysis.boq.name || analysis.boq.file} />
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
              {project && (
                <button className="btn" onClick={() => setAnalysis(null)}>
                  Back to project
                </button>
              )}
              <button className="btn" onClick={closeAll}>
                All projects
              </button>
            </div>
          </>
        )}
      </header>

      {analysis && current && !project && current.project.kind === "versions" && current.project.files.length > 1 && (
        <nav className="versions" aria-label="Versions of this LV">
          <span className="caption">This LV as</span>
          {current.project.files.map((f, n) => (
            <button
              key={n}
              aria-pressed={current.file === n}
              disabled={busy !== null}
              title={f.name}
              onClick={() => current.file !== n && openProject(current.project, n)}
            >
              <b>{f.role}</b> {f.format}
            </button>
          ))}
        </nav>
      )}

      {busy && <LoadingTapes what={busy} />}
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

      {project && !analysis ? (
        <ProjectView project={project} onOpenLv={(id) => void run("LV", () => loadAnalysis(id))} />
      ) : !analysis || !stats ? (
        <ProjectsPage
          projects={catalog}
          summaries={summaries}
          busy={busy !== null}
          pending={pending}
          onOpen={(p, file) => {
            if (file === undefined || p.kind === "versions") return openProject(p, file ?? 0);
            // one trade LV of a building, opened straight from the list
            setCurrent({ project: p, file });
            setProject(null);
            void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file));
          }}
          onChooseFiles={(target) => {
            addTarget.current = target;
            fileInput.current?.click();
          }}
          onDropFiles={upload}
          onConfirm={(name, target) => void confirmIntake(name, target)}
          onCancel={() => setPending(null)}
          onDelete={(p) => void removeProject(p)}
        />
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
                        . Most risk points: section <b>{stats.heaviest.key}</b> ({weight(stats.heaviest.counts)})
                      </>
                    )}
                    {prices && `. Past bids price ${prices.with_price} of ${prices.items} items.`}
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
