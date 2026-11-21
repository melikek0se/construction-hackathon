import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  catalogSummary,
  changeProject,
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
  setFileStep,
  runLlmReview,
  getQuestions,
} from "./api";
import { HardHatIcon, Opening, ProjectsPage, ScheduleSwitch } from "./Projects";
import { Mascot } from "./Mascot";
import { Gate, LoadingTapes, ReviewTapes, type GateInfo } from "./Loading";
import { ProjectView } from "./ProjectView";
import { FindingsList, ItemSheet, ItemsView, RemarksView, Sign, itemLabel, type Selection } from "./components";
import { LvText, eur, qty } from "./format";
import { buildSections, weight, worst } from "./sections";
import { Chat } from "./Chat";
import "./chat.css";
import "./questions.css";
import { LvMap } from "./LvMap";
import { PdfView } from "./PdfView";
import { WhatIfView } from "./WhatIf";
import { QuestionsView } from "./Questions";
import { HOME, docKey, formatRoute, isLv, parseRoute, writeRoute, type LvPlace, type Route } from "./router";
import { FORMAT_LABEL, PHASE_LABEL, SEVERITIES, countLabel, type Analysis, type CatalogProject, type Finding, type Intake, type Item, type Plan, type Prices, type Project, type ProjectSummary, type ChatCitation, type ChatTurn, type Severity, type TenderDate, type QuestionsState } from "./types";

type View = "plan" | "table" | "remarks" | "whatif" | "pdf" | "questions";
const VIEWS: [View, string][] = [
  ["plan", "LV map"],
  ["table", "Item table"],
  ["remarks", "Remarks"],
  ["whatif", "What-if"],
  ["pdf", "PDF"], // the LV's pages: its own PDF, or pages drawn from a GAEB / Excel file (Analysis.pdf)
  ["questions", "Questions"], // bidder questions: asked by e-mail, the client's reply read back in
];
const CHATS_KEY = "lvcheck.chats.v2"; // v2: answers carry scope, cost and the whole-project offer
const ALL = new Set<Severity>(SEVERITIES);
const NONE: Selection = { oz: null, finding: null };
// A link straight into a project or a file: the page opens behind the sheet, without the opening.
// The address the page was loaded with (router.ts); one of before the routes is rewritten to what it means.
const START = parseRoute();
writeRoute(START, true);
const DEEP_LINK = START.at !== "home";
const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));
// The shutter over the page (styles.css, "the gate"): on the way in it stays down at least this long, so
// the name on it can be read; on the way back it only has to come down; then the time it takes to roll up.
const GATE_HOLD = 950;
const GATE_BACK = 380;
const GATE_CUT = 780;

export default function App() {
  const [catalog, setCatalog] = useState<CatalogProject[]>([]);
  // The schedule under the band: open on every load, closed only for this visit, opened again when a project is added.
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const projectCount = useRef<number | null>(null);
  useEffect(() => {
    if (projectCount.current !== null && catalog.length > projectCount.current) setScheduleOpen(true);
    projectCount.current = catalog.length;
  }, [catalog.length]);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary | "failed">>({});
  // The project that is open, and which of its files when it is one LV in several versions.
  const [current, setCurrent] = useState<{ project: CatalogProject; file: number } | null>(null);
  // Files that were dropped or chosen and are waiting for a decision: what they are, and where they go.
  // With no files yet the dialog is open and asks for them.
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
  // Pages of the item table and of the findings list, from 1. Both are part of the address.
  const [page, setPage] = useState(1);
  const [fpage, setFpage] = useState(1);
  // A dataset file opened by its path, with no project around it (/samples/...).
  const [sample, setSample] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ai, setAi] = useState<"idle" | "running" | "done">("idle");
  // The bidder questions of the open LV and where each stands (asked, sent, answered); read again when the
  // findings change, since the AI review writes most of them.
  const [questions, setQuestions] = useState<QuestionsState | null>(null);
  const openId = analysis?.id ?? null;
  const loadQuestions = useCallback(() => {
    if (!openId) return;
    getQuestions(openId).then(
      (q) => setQuestions(q),
      () => undefined, // the view says that it is still reading; the next change asks again
    );
  }, [openId]);
  useEffect(() => {
    setQuestions(null);
    loadQuestions();
  }, [loadQuestions, ai]);
  // A finding's question to the client, by the finding (check | item | evidence), once it is in a message.
  const askedByFinding = useMemo(() => {
    const map = new Map<string, QuestionsState["questions"][number]>();
    for (const q of questions?.questions ?? []) if (q.status !== "new") for (const f of q.findings) map.set(f, q);
    return map;
  }, [questions]);
  // The right pane: the findings (list or item sheet), or the questions about the project. A conversation
  // belongs to the project, so it stays when another file of the project is opened from an answer.
  const [side, setSide] = useState<"findings" | "ask">("findings");
  // Conversations survive a reload: kept in this browser, per project.
  const [chats, setChats] = useState<Record<string, ChatTurn[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHATS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    } catch {
      /* storage full or switched off: the conversation still works for this visit */
    }
  }, [chats]);
  // The passage of an answer that was clicked, to be outlined on the page.
  const [passage, setPassage] = useState<{ oz: string; quote: string; at: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The way into an LV or a project, and back out: the band is the shutter. It is let down over the page,
  // the page changes behind it, and it rolls up into the band again. A link straight into a project starts
  // with it down.
  const [gate, setGate] = useState<{ dir: "in" | "out"; phase: "closing" | "opening"; info: GateInfo | null; held: boolean } | null>(
    () => (DEEP_LINK ? { dir: "in", phase: "closing", info: null, held: true } : null),
  );
  const [arriving, setArriving] = useState(false); // the opened page is still setting itself up
  const gateTimers = useRef<number[]>([]);
  /** Draws the sheet across; resolves once the page is covered (and, on the way in, its name was readable). */
  const closeGate = useCallback((dir: "in" | "out", info: GateInfo | null) => {
    gateTimers.current.forEach(clearTimeout);
    setArriving(false);
    // a sheet that is across already stays as it is, with the new lettering
    setGate((g) => ({ dir, info, phase: "closing", held: g?.phase === "closing" }));
    return new Promise<void>((done) => window.setTimeout(done, dir === "in" ? GATE_HOLD : GATE_BACK));
  }, []);
  const openGate = useCallback(() => {
    setGate((g) => g && { ...g, phase: "opening" });
    setArriving(true);
    window.dispatchEvent(new CustomEvent("polier", { detail: "hop" }));
    gateTimers.current = [
      window.setTimeout(() => setGate((g) => (g?.phase === "opening" ? null : g)), GATE_CUT),
      window.setTimeout(() => setArriving(false), GATE_CUT + 900),
    ];
  }, []);
  const summariesNow = useRef(summaries);
  summariesNow.current = summaries;
  /** What the sheet says about a project (or one file of it): the numbers it was last read with. */
  const gateInfo = useCallback((p: CatalogProject, file?: number): GateInfo => {
    const s = summariesNow.current[p.id];
    const known = s && s !== "failed" ? s : null;
    if (p.kind === "trades" && file === undefined) {
      return {
        caption: "Opening the project",
        title: p.name,
        sub: [p.number, `${p.files.length} trade LVs`].filter(Boolean).join(" · "),
        marks: known?.docs.filter((d) => d.counts).map((d) => d.marks).join(""),
        counts: known?.counts,
        items: known?.items,
      };
    }
    const f = p.files[file ?? 0];
    const d = known?.docs.find((x) => x.index === (file ?? 0));
    return {
      caption: "Opening the LV",
      title: p.name,
      sub: f && `${f.name} · ${f.format} · ${f.role}`,
      marks: d?.counts ? d.marks : undefined,
      counts: d?.counts ?? undefined,
      items: d?.counts ? d.items : undefined,
    };
  }, []);

  const refreshCatalog = useCallback(async () => {
    const list = await listCatalog();
    setCatalog(list);
    return list;
  }, []);

  // The opening: full yellow with barrier tape until the projects are there (and for at least a moment,
  // so it does not flicker), then the yellow rolls up like a shutter and the page stands. A link straight into a
  // project skips it. "entering" lasts while the rows of the page are still being uncovered.
  const [intro, setIntro] = useState<"loading" | "opening" | "entering" | "done">(() => (DEEP_LINK ? "done" : "loading"));
  useEffect(() => {
    const shown = Date.now();
    let timers: number[] = [];
    const open = () => {
      const wait = Math.max(0, 1100 - (Date.now() - shown));
      timers = [
        window.setTimeout(() => setIntro((i) => (i === "loading" ? "opening" : i)), wait),
        window.setTimeout(() => setIntro((i) => (i === "opening" ? "entering" : i)), wait + 950),
        window.setTimeout(() => setIntro("done"), wait + 3200),
      ];
    };
    refreshCatalog()
      .then((list) => {
        // a link to a project that is not there: nothing will open, so the sheet must not stay across
        if ("id" in START && !list.some((p) => p.id === START.id)) {
          openGate();
          settle(START);
        }
      })
      .catch(() => {
        setApiDown(true);
        if (DEEP_LINK) openGate();
      })
      .then(open);
    return () => timers.forEach(clearTimeout);
  }, [refreshCatalog, openGate]);

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

  // With `through` the page is changed behind the sheet (a way into another page); without it the page
  // stays and the tapes are pulled across it (another version of the LV that is open).
  const runProject = useCallback(async (label: string, job: () => Promise<Project>, through?: GateInfo) => {
    setBusy(label);
    setError(null);
    const covered = through && closeGate("in", through);
    try {
      const opened = await job();
      await covered;
      setProject(opened);
      setAnalysis(null);
    } catch (e) {
      await covered;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (through) openGate();
    }
  }, [closeGate, openGate]);

  const run = useCallback(async (label: string, job: () => Promise<Analysis>, through?: GateInfo) => {
    setBusy(label);
    setError(null);
    const covered = through && closeGate("in", through);
    try {
      const opened = await job();
      await covered;
      setAnalysis(opened);
      setPassage(null); // a passage belongs to the file it was clicked for; cite() sets it again after this
      setAi("idle");
      setView("plan");
      setSeverities(ALL);
      setSection(null);
      setSelection(NONE);
      setPage(1);
      setFpage(1);
    } catch (e) {
      await covered;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (through) openGate();
    }
  }, [closeGate, openGate]);

  // `inPlace`: another version of the LV that is open, so the page stays and only its content changes.
  const openProject = useCallback(
    (p: CatalogProject, file = 0, inPlace = false) => {
      if (p.kind === "trades") {
        setCurrent({ project: p, file });
        void runProject(p.name, () => openCatalogProject(p.id), gateInfo(p));
      } else if (inPlace) {
        setCurrent({ project: p, file });
        void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file));
      } else {
        setCurrent({ project: p, file });
        setProject(null);
        void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file), gateInfo(p, file));
      }
    },
    [run, runProject, gateInfo],
  );

  /** Leaves the open page behind the sheet, drawn back the other way. */
  function leave(swap: () => void) {
    void closeGate("out", null).then(() => {
      swap();
      openGate();
    });
  }

  function closeAll() {
    const swap = () => {
      setPending(null);
      setAnalysis(null);
      setProject(null);
      setCurrent(null);
      setSample(null);
    };
    if (analysis || project) leave(swap);
    else swap();
  }

  // ---- The address bar (router.ts). The state above is what is shown; `here` is the address that says it.
  // It is written whenever the state changes; on load and on Back / Forward the address is read and the
  // state brought to it (`navigate`), through the same sheet as a click.
  const place: LvPlace = { view, item: selection.oz, page: view === "table" ? page : 1, fpage };
  const here: Route =
    analysis && current
      ? project
        ? { at: "lv", id: current.project.id, analysis: analysis.id, ...place }
        : { at: "file", id: current.project.id, file: current.file, ...place }
      : analysis && sample
        ? { at: "sample", path: sample, ...place }
        : project && current
          ? { at: "project", id: current.project.id }
          : HOME;
  // The address being loaded (from the address bar, not from a click): until the state has reached it,
  // the state is not written back over it.
  const target = useRef<Route | null>(DEEP_LINK ? START : null);
  const [settled, setSettled] = useState(0);
  /** The address `r` was not reached (no such project, the file did not load): the address follows the state again. */
  function settle(r: Route) {
    if (target.current !== r) return;
    target.current = null;
    setSettled((n) => n + 1);
  }
  const url = formatRoute(here);
  const written = useRef(0); // `settled` as of the last write: an address given up is replaced, not added to
  useEffect(() => {
    if (busy) return; // a page is on its way; the address changes with it
    const t = target.current;
    if (t) {
      if (docKey(t) !== docKey(here)) return;
      target.current = null; // arrived; what is open in it (view, item, page) is set from the address next
      return;
    }
    writeRoute(here, settled !== written.current);
    written.current = settled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, busy, settled]);
  /** Brings the state to an address. Null when its project is not in the catalogue. */
  function navigate(r: Route): Promise<void> | null {
    const inside = () => {
      if (!isLv(r)) return;
      setView(r.view);
      if (r.item) setSelection({ oz: r.item, finding: null });
      setPage(r.page);
      setFpage(r.fpage);
    };
    const done = () => (inside(), settle(r));
    if (r.at === "home") {
      closeAll();
      return Promise.resolve();
    }
    if (r.at === "sample") {
      const name = r.path.split("/").pop() ?? r.path;
      setCurrent(null);
      setProject(null);
      setSample(r.path);
      return run(name, () => loadSample(r.path), { caption: "Opening the LV", title: name }).then(done);
    }
    const p = catalog.find((x) => x.id === r.id);
    if (!p) return null;
    const sameProject = current?.project.id === p.id;
    if (r.at === "project" && p.kind === "versions") {
      // a project that is one LV: its first file
      const first: Route = { at: "file", id: p.id, file: 0, view: "plan", item: null, page: 1, fpage: 1 };
      target.current = first;
      writeRoute(first, true);
      return navigate(first);
    }
    if (r.at === "project") {
      if (sameProject && project && analysis) leave(() => setAnalysis(null)); // back from one of its LVs
      else if (!(sameProject && project)) openProject(p);
      return Promise.resolve();
    }
    if (r.at === "file") {
      const inPlace = sameProject && !project && analysis !== null; // another version of the LV that is open
      setCurrent({ project: p, file: r.file });
      setProject(null);
      return run(p.files[r.file]?.name ?? p.name, () => openCatalogFile(p.id, r.file), inPlace ? undefined : gateInfo(p, r.file)).then(done);
    }
    // one trade LV of a building: the building is needed around it
    const lv = sameProject ? project?.lvs.find((l) => l.analysis_id === r.analysis) : undefined;
    if (sameProject && project) {
      const through: GateInfo = { caption: "Opening the LV", title: lv?.name ?? "LV", sub: lv && `${lv.file} · ${project.name}`, counts: lv?.counts, items: lv?.items };
      return run(lv?.name ?? "LV", () => loadAnalysis(r.analysis), through).then(done);
    }
    setCurrent({ project: p, file: 0 });
    const job = async () => {
      // the building is put in place once the sheet is across, the LV on top of it when it has loaded
      const [building] = await Promise.all([openCatalogProject(p.id), wait(GATE_HOLD)]);
      setProject(building);
      setAnalysis(null);
      return loadAnalysis(r.analysis);
    };
    return run(p.name, job, gateInfo(p)).then(done);
  }
  const navigateNow = useRef(navigate);
  navigateNow.current = navigate;
  const hereNow = useRef(here);
  hereNow.current = here;

  // The address the page was loaded with, once the catalogue is there to find its project in.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !DEEP_LINK) return;
    if (START.at !== "sample" && !catalog.some((p) => "id" in START && p.id === START.id)) return; // not arrived yet
    linked.current = true;
    navigateNow.current(START);
  }, [catalog]);

  // Back and Forward. Inside the same LV only what is open changes; another page is loaded like a click.
  useEffect(() => {
    const onPop = () => {
      const r = parseRoute();
      if (docKey(r) === docKey(hereNow.current)) {
        if (!isLv(r)) return;
        setView(r.view);
        setSelection((s) => (s.oz === r.item ? s : { oz: r.item, finding: null }));
        setPage(r.page);
        setFpage(r.fpage);
        return;
      }
      target.current = r;
      if (navigateNow.current(r) === null) {
        target.current = null;
        setSettled((n) => n + 1);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
  // Reads `list` as the files waiting in the dialog: what each one is, which tender they are.
  const readPending = useCallback((list: File[], target: string | null) => {
    setError(null);
    setPending({ files: list, info: null, target });
    if (list.length === 0) return; // the dialog is back at asking for files
    intakeFiles(list, target).then(
      (info) => setPending((p) => (p && p.files === list ? { ...p, info } : p)),
      (e) => {
        // the dialog stays open and says why, so other files can be chosen
        setPending((p) => (p && p.files === list ? { files: [], info: null, target } : p));
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, []);

  const pendingNow = useRef(pending);
  pendingNow.current = pending;

  // Files dropped or chosen. With the dialog already holding files they are added to those (a file that is
  // there already is not taken twice); the whole set is then read again, since what a file is depends on
  // the others (same LV, same prices).
  const upload = useCallback(
    (files: FileList | File[] | null | undefined, target: string | null = null) => {
      const had = pendingNow.current;
      const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
      const added = [...(files ?? [])].filter((f) => !had?.files.some((h) => same(h, f)));
      if (added.length === 0) return;
      setAnalysis(null);
      setProject(null);
      setCurrent(null);
      readPending([...(had?.files ?? []), ...added], had ? had.target : target);
    },
    [readPending],
  );

  // A file taken out of the dialog again, before anything is kept.
  const dropPendingFile = useCallback(
    (file: File) => {
      const had = pendingNow.current;
      if (had) readPending(had.files.filter((f) => f !== file), had.target);
    },
    [readPending],
  );

  async function confirmIntake(name: string, target: string | null, roles: (string | null)[], dates: Partial<Record<TenderDate, string>>) {
    if (!pending) return;
    setBusy(target ? "the added files" : name || "the new project");
    setError(null);
    try {
      const { id } = await createProject(pending.files, name, target, roles, dates);
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

  async function moveFile(p: CatalogProject, index: number, step: string) {
    setError(null);
    try {
      await setFileStep(p.id, index, step);
      asked.current.delete(p.id); // the row's step lines are worked out again
      setSummaries(({ [p.id]: _old, ...rest }) => rest);
      await refreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // A date or the stage of a tender, set on the projects page: shown at once, then kept.
  async function changePlan(p: CatalogProject, change: { [K in keyof Plan]?: Plan[K] | null }) {
    setError(null);
    const plan = Object.fromEntries(Object.entries({ ...p.plan, ...change }).filter(([, v]) => v != null)) as Plan;
    setCatalog((list) => list.map((x) => (x.id === p.id ? { ...x, plan } : x)));
    try {
      const saved = await changeProject(p.id, change);
      setCatalog((list) => list.map((x) => (x.id === p.id ? saved : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void refreshCatalog();
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

  const chatKey = current?.project.id ?? analysis?.id ?? "";
  const setTurns = (turns: ChatTurn[]) => setChats((all) => ({ ...all, [chatKey]: turns }));

  // A passage of an answer: show its item, in this file or in the file of the project it stands in.
  function cite(c: ChatCitation) {
    const show = () => {
      setSelection({ oz: c.oz || null, finding: null });
      setView("pdf");
      setSide("ask");
      setPassage({ oz: c.oz, quote: c.quote, at: Date.now() });
    };
    if (analysis && c.file === analysis.boq.file) return show();
    const lv = project?.lvs.find((l) => l.file === c.file);
    if (lv) void run(lv.name, () => loadAnalysis(lv.analysis_id)).then(show);
    else if (current && current.project.kind !== "trades" && c.index !== null) {
      const { project: p } = current;
      setCurrent({ project: p, file: c.index });
      void run(c.file, () => openCatalogFile(p.id, c.index!)).then(show);
    }
  }

  function showInTable(oz: string) {
    setSelection({ oz, finding: null });
    setView("table");
    setTableKey((k) => k + 1); // remount so the table scrolls to the row
  }

  return (
    <div
      className={`app${dragging ? " dragging" : ""}${!analysis && !project ? " home" : ""}${gate ? " gated" : ""}${gate?.phase === "closing" ? " covering" : ""}${arriving && gate?.dir !== "out" ? " arriving" : ""}${intro === "entering" ? " entering" : ""}`}
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
          <HardHatIcon size={24} />
          Polier
        </button>
        {!project && (!analysis || !stats) && catalog.length > 0 && (
          <div className="actions">
            <ScheduleSwitch projects={catalog} summaries={summaries} open={scheduleOpen} onToggle={() => setScheduleOpen(!scheduleOpen)} />
          </div>
        )}
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
                {/* what the project says the file is (read at intake, or corrected there) before the parser's phase */}
                {current && !project && current.project.files[current.file]
                  ? ` · ${current.project.files[current.file].role.replace(/^./, (c) => c.toUpperCase())}`
                  : PHASE_LABEL[analysis.boq.phase]
                    ? ` · ${PHASE_LABEL[analysis.boq.phase]}`
                    : ""}{" "}
                ·{" "}
                {stats.priced ? `${eur(stats.net)} net` : "no prices in this file"}
              </span>
            </div>
            <div className="actions">
              {/* Server-rendered from the findings so far; includes the AI review once it has run. */}
              <a className="btn" href={`/api/analyses/${analysis.id}/report.html`} target="_blank" rel="noreferrer">
                Risk report
              </a>
              <button className="btn" onClick={() => setView("questions")}>
                Bidder questions
              </button>
              {project && (
                <button className="btn" onClick={() => leave(() => setAnalysis(null))}>
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
              onClick={() => current.file !== n && openProject(current.project, n, true)}
            >
              <b>{f.role}</b> {f.format}
            </button>
          ))}
        </nav>
      )}

      {(intro === "loading" || intro === "opening") && <Opening phase={intro} />}
      {/* while the new-project dialog is open it says itself that it is working */}
      {gate && <Gate {...gate} />}
      {busy && !pending && !gate && <LoadingTapes what={busy} />}
      {/* the AI review reads every section with Claude: seconds when cached, a minute or two otherwise;
          the board under the tapes says which section is being read and what was found so far */}
      {!busy && ai === "running" && analysis && (
        <ReviewTapes id={analysis.id} what={analysis.boq.name || analysis.boq.file} />
      )}
      {/* while the new-project dialog is open it shows the error itself */}
      {error && !pending && (
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
        <ProjectView
          project={project}
          onOpenLv={(id) => {
            const lv = project.lvs.find((l) => l.analysis_id === id);
            const through: GateInfo = {
              caption: "Opening the LV",
              title: lv?.name ?? "LV",
              sub: lv && `${lv.file} · ${project.name}`,
              counts: lv?.counts,
              items: lv?.items,
            };
            void run(lv?.name ?? "LV", () => loadAnalysis(id), through);
          }}
          chat={{ turns: chats[chatKey] ?? [], onTurns: setTurns, onCite: cite }}
        />
      ) : !analysis || !stats ? (
        <ProjectsPage
          projects={catalog}
          scheduleOpen={scheduleOpen}
          onShowSchedule={() => setScheduleOpen(true)}
          summaries={summaries}
          busy={busy !== null}
          pending={pending}
          error={error}
          onNew={() => setPending({ files: [], info: null, target: null })}
          onChange={(p, change) => void changePlan(p, change)}
          onOpen={(p, file) => {
            if (file === undefined || p.kind === "versions") return openProject(p, file ?? 0);
            // one trade LV of a building, opened straight from the list
            setCurrent({ project: p, file });
            setProject(null);
            void run(p.files[file]?.name ?? p.name, () => openCatalogFile(p.id, file), gateInfo(p, file));
          }}
          onChooseFiles={(target) => {
            addTarget.current = target;
            fileInput.current?.click();
          }}
          onDropFiles={upload}
          onConfirm={(name, target, roles, dates) => void confirmIntake(name, target, roles, dates)}
          onRemoveFile={dropPendingFile}
          onCancel={() => (setPending(null), setError(null))}
          onDelete={(p) => void removeProject(p)}
          onSetStep={(p, index, step) => void moveFile(p, index, step)}
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
                {VIEWS.filter(([id]) => id !== "pdf" || analysis.pdf).map(([id, label]) => (
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
                page={page}
                onPage={setPage}
                onSelect={(oz) => setSelection({ oz, finding: null })}
              />
            )}
            {view === "remarks" && <RemarksView analysis={analysis} />}
            {view === "pdf" && analysis.pdf && (
              <PdfView
                key={analysis.id}
                analysis={analysis}
                visible={severities}
                selection={selection}
                onSelect={setSelection}
                passage={passage}
              />
            )}
            {view === "pdf" && !analysis.pdf && (
              <p className="pdf-status">This PDF was uploaded on its own and not kept, so there are no pages to show. Add it to a project to read it here.</p>
            )}
            {view === "whatif" && <WhatIfView key={analysis.id} analysisId={analysis.id} sections={sections} />}
            {view === "questions" && (
              <QuestionsView
                key={analysis.id}
                analysisId={analysis.id}
                state={questions}
                onState={setQuestions}
                onReload={loadQuestions}
                onItem={(oz) => setSelection({ oz, finding: null })}
              />
            )}
          </main>

          <aside className="right">
            <div className="side-tabs" role="tablist" aria-label="Right pane">
              <button role="tab" aria-selected={side === "findings"} onClick={() => setSide("findings")}>
                Findings
              </button>
              <button role="tab" aria-selected={side === "ask"} onClick={() => setSide("ask")}>
                Ask the project
              </button>
            </div>
            {side === "ask" ? (
              <Chat
                analysisId={analysis.id}
                openFile={analysis.boq.file}
                turns={chats[chatKey] ?? []}
                onTurns={setTurns}
                onCite={cite}
              />
            ) : (
              <>
            {open ? (
              <ItemSheet
                analysis={analysis}
                itemByOz={itemByOz}
                findingsByOz={findingsByOz}
                price={selection.oz ? priceByOz.get(selection.oz) : undefined}
                selection={selection}
                asked={askedByFinding}
                onAsked={() => setView("questions")}
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
                page={fpage}
                onPage={setFpage}
                ai={ai}
                onReview={() => void review()}
              />
            )}
              </>
            )}
          </aside>
        </div>
      )}
      {/* Polier, the agent, lives in the bottom-right corner (not wired to anything yet) */}
      <div className="agent-dock">
        <Mascot size={112} free />
      </div>
    </div>
  );
}
