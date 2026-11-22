import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import { catalogSummary, changeProject, createProject, intakeFiles, listRuns, changeRun, startRun, listCatalog, loadPrices, openCatalogFile, openTender, askDifference, renameProject, deleteProject, removeProjectFile, setFileStep, runLlmReview, getQuestions, getInbox, scanInbox, sortMessages, warmPartners, type MailSorted } from "./api";
import { HardHatIcon, Opening, ProjectsPage, datesOf, outcomeOf, stageOf } from "./Projects";
import { ProjectSettings } from "./Settings";
import { PipelinePage, PipelineStrip, RunsSwitch } from "./Runs";
import { Agent } from "./Agent";
import { Gate, LoadingTapes, ReviewTapes, type GateInfo } from "./Loading";
import { TenderPage } from "./Tender";
import { FindingsList, ItemSheet, type Selection } from "./components";
import { buildSections, weight } from "./sections";
import "./chat.css";
import "./questions.css";
import { PdfView } from "./PdfView";
import { WhatIfView } from "./WhatIf";
import { BidView } from "./Bid";
import { InquiriesView } from "./Inquiries";
import { QuestionsView } from "./Questions";

import { HOME, docKey, formatRoute, parseRoute, viewsOf, writeRoute, type PartnersPlace, type PipelinePlace, type Route, type TenderPlace } from "./router";
import { SEVERITIES, type Analysis, type CatalogProject, type Finding, type Intake, type Item, type Plan, type Prices, type ProjectSummary, type ChatCitation, type ChatTurn, type Severity, type Tender, type TenderDate, type QuestionsState, type Run, type Amendment } from "./types";

const CHATS_KEY = "lvcheck.chats.v2"; // v2: answers carry scope, cost and the whole-project offer
// The partners page is its own piece of the build: fetched when it is opened, or in the background once
// the page the app opened on stands (see `warmed` below), never before it.
// Once its code is there it is drawn straight from the module (`ReadyPartners`): through `lazy` the first
// drawing waits a turn, and the page sliding in (`swapPage`) would be blank.
let ReadyPartners: typeof import("./Partners").PartnersPage | null = null;
const loadPartners = () => import("./Partners").then((m) => ((ReadyPartners = m.PartnersPage), m));
const LazyPartners = lazy(() => loadPartners().then((m) => ({ default: m.PartnersPage })));
/** The partners page, from the module if it is there when the page is put up, else through `lazy`; chosen
 *  once, so the page is not put up anew when the code arrives later. */
function PartnersNow(props: ComponentProps<typeof LazyPartners>) {
  const [Page] = useState(() => ReadyPartners ?? LazyPartners);
  return <Page {...props} />;
}
const ALL = new Set<Severity>(SEVERITIES);
const NONE: Selection = { oz: null, finding: null };
// A link straight into a project or a file: the page opens behind the sheet, without the opening.
// The address the page was loaded with (router.ts); one of before the routes is rewritten to what it means.
const START = parseRoute();
writeRoute(START, true);
const DEEP_LINK = START.at !== "home";
// The shutter over the page (styles.css, "the gate"): on the way in it stays down at least this long, so
// the name on it can be read; on the way back it only has to come down; then the time it takes to roll up.
const GATE_HOLD = 950;
const GATE_BACK = 380;
const GATE_CUT = 780;

/** A change of page without the shutter: the screen slides sideways, the new page pushing the old one out
 *  (View Transitions; styles.css says how). "forward" comes in from the right, "back" from the left. Without
 *  the API the page just changes. It ignores reduced motion, as every animation of the app does. */
function swapPage(swap: () => void, dir: "forward" | "back") {
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition) return swap();
  const root = document.documentElement;
  root.dataset.swap = dir;
  doc
    .startViewTransition(() => flushSync(swap))
    .finished.catch(() => undefined)
    .finally(() => delete root.dataset.swap);
}

export default function App() {
  const [catalog, setCatalog] = useState<CatalogProject[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary | "failed">>({});
  // The project that is open, and which of its files when it is one LV in several versions.
  const [current, setCurrent] = useState<{ project: CatalogProject; file: number } | null>(null);
  // Files that were dropped or chosen and are waiting for a decision: what they are, and where they go.
  // With no files yet the dialog is open and asks for them.
  const [pending, setPending] = useState<{ files: File[]; info: Intake | null; target: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false); // the settings of the open project, a dialog
  // The tender page (D-050): the tender of `current`, read from all its documents, and what is open in it.
  // `key` says which files the data was read from, so that it is read again when they change.
  const [tender, setTender] = useState<({ id: string } & TenderPlace) | null>(null);
  const [tenderData, setTenderData] = useState<{ key: string; data: Tender } | null>(null);
  const addTarget = useRef<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severities, setSeverities] = useState<Set<Severity>>(ALL);
  const [section, setSection] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(NONE);
  // The page of the findings list, from 1.
  const [fpage, setFpage] = useState(1);
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
  // What the client's answers changed on our side, once the estimator accepted it: the findings they
  // settle (by `check | item | evidence`) and the amendments per item.
  const settledFindings = useMemo(
    () => new Set((questions?.amendments ?? []).filter((a) => a.status === "accepted" && a.kind === "settle").flatMap((a) => a.value.findings ?? [])),
    [questions],
  );
  const amendedByOz = useMemo(() => {
    const map = new Map<string, Amendment[]>();
    for (const a of questions?.amendments ?? [])
      if (a.status === "accepted" && a.item_oz) map.set(a.item_oz, [...(map.get(a.item_oz) ?? []), a]);
    return map;
  }, [questions]);
  // Questions about the project are asked in the panel a click on Polier opens (Agent.tsx). A conversation
  // belongs to the project, so it stays when another file of the project is opened from an answer.
  const [agentOpen, setAgentOpen] = useState(false);
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
    // the partners page has nothing to load behind the sheet: it opens bare
    () => (DEEP_LINK && START.at !== "partners" && START.at !== "pipeline" ? { dir: "in", phase: "closing", info: null, held: true } : null),
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

  // The pipeline runs in the background on the server (src/boq/runs.py): asked every second while one is
  // going, now and then otherwise (a run can be started from another window).
  const [runs, setRuns] = useState<Run[]>([]);
  // The pipeline page (Runs.tsx) lies over whatever is open, as the partners page does.
  const [pipeline, setPipeline] = useState<PipelinePlace | null>(null);
  // The partners page (suppliers and subcontractors, Partners.tsx) lies over whatever is open: leaving it
  // shows that again as it was. `directoryAt` counts the directory's changes, so the inquiries are read again.
  const [partners, setPartners] = useState<PartnersPlace | null>(null);
  const [directoryAt, setDirectoryAt] = useState(0);
  const [startingRun, setStartingRun] = useState(false);
  const refreshRuns = useCallback(() => listRuns().then(setRuns, () => undefined), []);
  const running = runs.some((r) => r.active);
  // a run that waits for the questions goes on when a message is sent or answered: looked at more often
  const pace = running ? 1000 : runs.some((r) => r.status === "waiting") ? 3000 : 10000;
  useEffect(() => {
    void refreshRuns();
    const t = window.setInterval(() => void refreshRuns(), pace);
    return () => window.clearInterval(t);
  }, [pace, refreshRuns]);
  // `runs` holds the latest run of every project: where each one stands
  const runHere = useMemo(() => runs.find((r) => r.project_id === current?.project.id), [runs, current]);
  // a step of the pipeline picked on the strip: its findings are the ones the list shows
  const [find, setFind] = useState<{ text: string; n: number } | null>(null);

  const reviewingHere =
    !!runHere?.active && runHere.steps.some((s) => s.kind === "agentic" && s.doc === current?.file && (s.status === "queued" || s.status === "running"));

  async function moveRun(what: "go-on" | "retry" | "cancel") {
    if (!runHere) return;
    try {
      await changeRun(runHere.id, what);
      await refreshRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAgain(projectId: string) {
    setStartingRun(true);
    try {
      await startRun(projectId);
      await refreshRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStartingRun(false);
    }
  }

  // A run that ends while its project is on the page: what it found is put onto the page without moving
  // it (the selection, the view and the place in the list stay). Its AI findings come with the file.
  const wasRunning = useRef(new Set<string>());
  const pageNow = useRef({ current, analysis, busy, ai });
  pageNow.current = { current, analysis, busy, ai };
  useEffect(() => {
    const ended = runs.filter((r) => !r.active && wasRunning.current.has(r.id));
    wasRunning.current = new Set(runs.filter((r) => r.active).map((r) => r.id));
    if (ended.length > 0) {
      // the cards count what the run found, and the tender may have moved on along the board
      // (the old numbers stay on the card until the new ones are there)
      for (const r of ended)
        void catalogSummary(r.project_id).then((summary) => setSummaries((s) => ({ ...s, [r.project_id]: summary })), () => undefined);
      void refreshCatalog();
    }
    const page = pageNow.current;
    const here = page.current && ended.find((r) => r.project_id === page.current!.project.id);
    if (!here || !page.current || page.busy !== null || page.ai === "running") return;
    const { project: p, file } = page.current;
    if (page.analysis) {
      const shown = page.analysis.id;
      void openCatalogFile(p.id, file).then(
        (opened) => {
          if (pageNow.current.analysis?.id !== shown) return; // the user has moved on meanwhile
          setAnalysis(opened);
          if (opened.reviewed) setAi("done");
        },
        () => undefined,
      );
    }
  }, [runs]);

  // The opening: full yellow with barrier tape until the projects are there with their numbers (and for at
  // least a moment, so it does not flicker), then the yellow rolls up like a shutter and the page stands
  // complete: no card is still being read behind it. A link straight into a project skips it. "entering"
  // lasts while the rows of the page are still being uncovered.
  const [intro, setIntro] = useState<"loading" | "opening" | "entering" | "done">(() => (DEEP_LINK ? "done" : "loading"));
  const [listed, setListed] = useState(false); // the list of projects is there (or the server is not)
  const introShown = useRef(Date.now());
  const introOpened = useRef(false);
  const introTimers = useRef<number[]>([]);
  const openIntro = useCallback(() => {
    if (introOpened.current) return;
    introOpened.current = true;
    const wait = Math.max(0, 1100 - (Date.now() - introShown.current));
    introTimers.current = [
      window.setTimeout(() => setIntro((i) => (i === "loading" ? "opening" : i)), wait),
      window.setTimeout(() => setIntro((i) => (i === "opening" ? "entering" : i)), wait + 950),
      window.setTimeout(() => setIntro("done"), wait + 3200),
    ];
  }, []);
  useEffect(() => {
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
      .then(() => setListed(true));
  }, [refreshCatalog, openGate]);
  // The shutter waits for every card's numbers, but not for ever: a project whose files take long to read
  // (a building of many PDFs, read for the first time) comes up taped after eight seconds.
  const allIn = listed && catalog.every((p) => summaries[p.id] !== undefined);
  useEffect(() => {
    if (!listed) return;
    if (allIn) return openIntro();
    const late = window.setTimeout(openIntro, 8000);
    return () => window.clearTimeout(late);
  }, [listed, allIn, openIntro]);
  useEffect(() => () => introTimers.current.forEach((t) => window.clearTimeout(t)), []);

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
  const filesKey = (p: CatalogProject) => p.files.map((f) => `${f.name}:${f.role}`).join("|");
  /** Opens a project's tender page behind the sheet. `file`: land in the LV this file is a document of. */
  const openTenderPage = useCallback(
    async (p: CatalogProject, place: Partial<TenderPlace> = {}, file?: number) => {
      setBusy(p.name);
      setError(null);
      const covered = closeGate("in", gateInfo(p));
      try {
        const [data] = await Promise.all([openTender(p.id), covered]);
        const lv = file === undefined ? undefined : data.lvs.find((l) => l.documents.includes(file))?.id;
        setPending(null);
        setAnalysis(null);
        checked.current = "";
        setCurrent({ project: p, file: 0 });
        setTenderData({ key: filesKey(p), data });
        setSelection(place.item ? { oz: place.item, finding: null } : NONE);
        const at = { step: "tender" as const, view: "map" as const, lv: null, item: null, ...place };
        setTender({ id: p.id, ...at, lv: data.lvs.length > 1 ? lv ?? at.lv : null });
      } catch (e) {
        await covered;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        openGate();
      }
    },
    [closeGate, openGate, gateInfo],
  );
  // The Check step of the tender page: the findings are those of the document that carries the open LV.
  // It is opened as an analysis like a file of the workspace of before, so the findings list, the item
  // sheet, the AI review and Polier's chat work on it as they do there. `checked`: what is loaded.
  const checked = useRef("");
  const citing = useRef<{ oz: string; quote: string; at: number } | null>(null); // a passage to show once its document is read
  // A tender in the intake is not taken on yet (D-042): only its Tender step opens, without the pages (their
  // marks are findings), and nothing is checked until "Take it on".
  const intakeOpen = !!(tender && current && current.project.id === tender.id && stageOf(current.project) === "intake");
  useEffect(() => {
    if (!intakeOpen || !tender || (tender.step === "tender" && tender.view !== "pages")) return;
    const view = tender.view !== "pages" && viewsOf("tender").includes(tender.view) ? tender.view : "map";
    setTender({ ...tender, step: "tender", view });
  }, [intakeOpen, tender]);
  const checkLv = tender && !intakeOpen && (tender.step !== "tender" || tender.view === "pages") && tenderData ? (tenderData.data.lvs.length === 1 ? tenderData.data.lvs[0] : tenderData.data.lvs.find((l) => l.id === tender.lv)) ?? null : null;
  // what the estimator put among the questions is part of the findings: asked or taken back, they are read again
  const checkKey = tender && checkLv && tenderData ? `${tender.id}:${checkLv.carrier}:${tenderData.key}:${tenderData.data.asked.map((a) => `${a.lv}/${a.oz}`).join(",")}` : "";
  useEffect(() => {
    if (!checkKey || !tender || !checkLv || checked.current === checkKey) return;
    const [id, file] = [tender.id, checkLv.carrier];
    let stale = false;
    setBusy("Reading the findings");
    setError(null);
    openCatalogFile(id, file)
      .then((opened) => {
        if (stale) return;
        checked.current = checkKey;
        setCurrent((c) => (c && c.project.id === id ? { ...c, file } : c));
        setAnalysis(opened);
        setPassage(citing.current);
        citing.current = null;
        setAi(opened.reviewed ? "done" : "idle");
        setSeverities(ALL);
        setSection(null);
        setFpage(1);
        setSelection((sel) => (sel.oz && opened.boq.items.some((i) => i.oz === sel.oz) ? { oz: sel.oz, finding: null } : NONE));
      })
      .catch((e) => !stale && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !stale && setBusy(null));
    return () => {
      stale = true;
      setBusy(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);
  // The open tender's files or their steps changed (settings, files added): it is read again, in place.
  const tenderProject = tender ? catalog.find((x) => x.id === tender.id) : undefined;
  const tenderKey = tenderProject ? filesKey(tenderProject) : null;
  useEffect(() => {
    if (!tender || tenderKey === null || !tenderData || tenderData.key === tenderKey) return;
    let stale = false;
    void openTender(tender.id)
      .then((data) => !stale && setTenderData({ key: tenderKey, data }))
      .catch((e) => !stale && setError(e instanceof Error ? e.message : String(e)));
    return () => void (stale = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderKey]);

  /** Leaves the open page behind the sheet, drawn back the other way. */
  function leave(swap: () => void) {
    void closeGate("out", null).then(() => {
      swap();
      openGate();
    });
  }

  // Nothing of the partners page is fetched while the page the app opened on is still loading. Once that
  // stands and nothing is being read, its code and the directory are fetched in the background, once, so
  // the page is there when "Partners" is pressed; pressed earlier, it loads then.
  const warmed = useRef(false);
  // where the partners page puts its tabs in the band
  const [bandSlot, setBandSlot] = useState<HTMLDivElement | null>(null);
  // what the Partners slab in the band says under its name, once the overview has been read
  const [partnersGlance, setPartnersGlance] = useState<{ firms: number; waiting: number } | null>(null);
  useEffect(() => {
    if (warmed.current || intro !== "done" || busy !== null || gate !== null || partners) return;
    const t = window.setTimeout(() => {
      warmed.current = true;
      void loadPartners();
      void warmPartners().then((d) => d && setPartnersGlance({ firms: d.partners.length, waiting: d.waiting.length }));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [intro, busy, gate, partners]);

  /** Onto the partners page, or off it again. Its code and its data are mostly read in the background
   *  already, so there is nothing to wait for behind a shutter: the screen slides sideways (`swapPage`).
   *  Inside the page nothing moves. */
  function toPartners(place: PartnersPlace | null) {
    if ((place === null) === (partners === null)) return setPartners(place);
    if (pipeline) setPipeline(null);
    // the page's code is there before the slide starts, so the page coming in is never blank
    void loadPartners().then(
      () => swapPage(() => setPartners(place), place ? "forward" : "back"),
      () => setPartners(place),
    );
  }

  /** Onto the pipeline page, or off it again: the same sideways slide as the partners page. */
  function toPipeline(place: PipelinePlace | null) {
    if ((place === null) === (pipeline === null)) return setPipeline(place);
    swapPage(() => (setPartners(null), setPipeline(place)), place ? "forward" : "back");
  }

  function closeAll() {
    const swap = () => {
      setPending(null);
      setAnalysis(null);
      setCurrent(null);
      setTender(null);
      setTenderData(null);
    };
    if (tender) leave(swap);
    else swap();
  }

  // ---- The address bar (router.ts). The state above is what is shown; `here` is the address that says it.
  // It is written whenever the state changes; on load and on Back / Forward the address is read and the
  // state brought to it (`navigate`), through the same sheet as a click.
  // in the Check step the open item is the selection of the findings list and the item sheet
  const below: Route = tender ? { at: "tender", ...tender, item: tender.step === "check" || tender.step === "prices" || tender.step === "bid" ? selection.oz : tender.step === "questions" ? null : tender.item } : HOME;
  const here: Route = partners ? { at: "partners", ...partners } : pipeline ? { at: "pipeline", ...pipeline } : below;
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
    if (r.at === "partners") {
      setPipeline(null);
      setPartners({ tab: r.tab, partner: r.partner });
      return Promise.resolve();
    }
    setPartners(null);
    if (r.at === "pipeline") {
      setPipeline({ project: r.project });
      return Promise.resolve();
    }
    setPipeline(null);
    if (r.at === "tender") {
      const p = catalog.find((x) => x.id === r.id);
      if (!p) return null;
      const place: TenderPlace = { step: r.step, view: r.view, lv: r.lv, item: r.item };
      if (below.at === "tender" && below.id === r.id) {
        setTender({ id: r.id, ...place });
        if (r.step === "check" || r.step === "prices" || r.step === "bid") setSelection({ oz: r.item, finding: null });
        return Promise.resolve();
      }
      return openTenderPage(p, place, r.file).then(() => settle(r));
    }
    closeAll();
    return Promise.resolve();
  }
  const navigateNow = useRef(navigate);
  navigateNow.current = navigate;
  const hereNow = useRef(here);
  hereNow.current = here;

  // The address the page was loaded with, once the catalogue is there to find its project in.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !DEEP_LINK) return;
    if (START.at === "partners" || START.at === "pipeline") {
      linked.current = true;
      navigateNow.current(START);
      return;
    }
    if (!catalog.some((p) => "id" in START && p.id === START.id)) return; // not arrived yet
    linked.current = true;
    navigateNow.current(START);
  }, [catalog]);

  // Back and Forward. Inside the same LV only what is open changes; another page is loaded like a click.
  useEffect(() => {
    const onPop = () => {
      const r = parseRoute();
      if (docKey(r) === docKey(hereNow.current)) {
        if (r.at === "partners") setPartners({ tab: r.tab, partner: r.partner });
        if (r.at === "pipeline") setPipeline({ project: r.project });
        if (r.at === "tender") {
          setTender({ id: r.id, step: r.step, view: r.view, lv: r.lv, item: r.item });
          if (r.step === "check" || r.step === "prices" || r.step === "bid") setSelection((sel) => (sel.oz === r.item ? sel : { oz: r.item, finding: null }));
        }
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
  // Tenders found in the mail (src/boq/inbox.py): where the app has a mailbox it looks into it when the
  // projects page opens and every few minutes after; an e-mail dropped on the page as a file goes the same way.
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [mailBusy, setMailBusy] = useState(false);
  const sorted = useCallback(
    async (job: () => Promise<MailSorted>, quiet = false) => {
      setMailBusy(true);
      try {
        const got = await job();
        if (got.taken.length > 0) {
          await refreshCatalog();
          setMailNote(`Polier found ${got.taken.length === 1 ? "a tender" : `${got.taken.length} tenders`} in your mail: ${got.taken.map((t) => t.name).join(", ")}. ${got.taken.length === 1 ? "It stands" : "They stand"} in the intake.`);
        } else if (!quiet)
          setMailNote(got.looked === 0 ? "Nothing new in the mail." : `${got.looked} new message${got.looked === 1 ? "" : "s"} looked at, no invitation to bid among them${got.passed[0] ? ` (${got.passed[0].why})` : ""}.`);
      } catch (e) {
        if (!quiet) setError(e instanceof Error ? e.message : String(e));
      } finally {
        setMailBusy(false);
      }
    },
    [refreshCatalog],
  );
  useEffect(() => {
    getInbox().then((box) => setMailbox(box.user), () => undefined);
  }, []);
  useEffect(() => {
    if (!mailbox) return;
    void sorted(scanInbox, true);
    const t = window.setInterval(() => void sorted(scanInbox, true), 180_000);
    return () => window.clearInterval(t);
  }, [mailbox, sorted]);

  const upload = useCallback(
    (files: FileList | File[] | null | undefined, target: string | null = null) => {
      // e-mails saved as files are not LVs: Polier reads them as mail and puts a tender into the intake
      const mails = [...(files ?? [])].filter((f) => f.name.toLowerCase().endsWith(".eml"));
      if (mails.length > 0 && mails.length === (files?.length ?? 0)) return void sorted(() => sortMessages(mails));
      const had = pendingNow.current;
      const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
      const added = [...(files ?? [])].filter((f) => !had?.files.some((h) => same(h, f)));
      if (added.length === 0) return;
      setAnalysis(null);
      setTender(null);
      setTenderData(null);
      setCurrent(null);
      readPending([...(had?.files ?? []), ...added], had ? had.target : target);
    },
    [readPending, sorted],
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
      void refreshRuns(); // the server has started the pipeline on it
      setPending(null);
      setBusy(null);
      if (saved) void openTenderPage(saved);
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

  // A file taken out of the open project (its settings). What is on the page is read again where it
  // changed: the building without that LV, another version when the open one went.
  async function removeFile(index: number) {
    if (!current) return;
    const { project: p } = current;
    setError(null);
    try {
      const left = await removeProjectFile(p.id, index);
      asked.current.delete(p.id);
      setSummaries(({ [p.id]: _old, ...rest }) => rest);
      void refreshCatalog();
      setCurrent({ project: left, file: 0 }); // the tender page reads its files again
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
      if (change.stage) {
        // a tender taken on from the intake starts its checks, and its card gets the rule findings
        void refreshRuns();
        void catalogSummary(p.id).then((summary) => setSummaries((s) => ({ ...s, [p.id]: summary })), () => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void refreshCatalog();
    }
  }

  // The open project as the catalogue has it now: a step or a date changed in its settings shows at once.
  useEffect(() => {
    setCurrent((c) => {
      const fresh = c && catalog.find((x) => x.id === c.project.id);
      return c && fresh && fresh !== c.project ? { ...c, project: fresh } : c;
    });
  }, [catalog]);

  async function rename(name: string) {
    if (!current || !name.trim() || name.trim() === current.project.name) return;
    try {
      const renamed = await renameProject(current.project.id, name.trim());
      setCurrent({ ...current, project: renamed });
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
    let closed = 0; // settled by an answer of the client: no longer counted as open
    for (const f of analysis.findings) {
      if (settledFindings.has(`${f.check_id}|${f.item_oz}|${f.evidence}`)) closed++;
      else counts[f.severity]++;
    }
    const totals = analysis.boq.items.flatMap((i) => (i.total === null ? [] : [Number(i.total)]));
    const heaviest = [...sections].sort((a, b) => weight(b.counts) - weight(a.counts))[0];
    return {
      counts,
      closed,
      priced: totals.length > 0,
      net: totals.reduce((a, b) => a + b, 0),
      heaviest: heaviest && weight(heaviest.counts) > 0 ? heaviest : null,
    };
  }, [analysis, sections, settledFindings]);

  const open = selection.oz !== null || selection.finding !== null;

  const chatKey = current?.project.id ?? analysis?.id ?? "";

  // A passage of an answer: show its item, in this file or in the file of the project it stands in.
  // `from`: the project asked about from the list of projects, where none is open yet.
  // A passage of an answer: its item on the pages of the Check step, in the LV whose document the file is.
  // `from`: the project asked about from the list of projects, where none is open yet. The passage is
  // put on the page once the document is read (the loader of the Check step takes it from `citing`).
  function cite(c: ChatCitation, from: CatalogProject | null = null) {
    const passage = { oz: c.oz, quote: c.quote, at: Date.now() };
    const place = { step: "check" as const, view: "pages" as const, item: c.oz || null };
    if (tender && analysis && c.file === analysis.boq.file && checked.current === checkKey && checkKey) {
      setSelection({ oz: c.oz || null, finding: null });
      setTender({ ...tender, ...place });
      setPassage(passage);
      return;
    }
    const p = current?.project ?? from;
    if (!p || c.index === null) return;
    citing.current = passage;
    const lv = tender && tenderData && tender.id === p.id ? tenderData.data.lvs.find((l) => l.documents.includes(c.index!)) : undefined;
    if (lv && tender) {
      setSelection({ oz: c.oz || null, finding: null });
      setTender({ ...tender, ...place, lv: tenderData!.data.lvs.length > 1 ? lv.id : null });
    } else void openTenderPage(p, place, c.index);
  }
  const agentHere = analysis
    ? { key: chatKey, analysisId: analysis.id, openFile: analysis.boq.file, label: current?.project.name ?? (analysis.boq.name || analysis.boq.file) }
    : null;


  return (
    <div
      className={`app${dragging ? " dragging" : ""}${!tender ? " home" : ""}${gate ? " gated" : ""}${gate?.phase === "closing" ? " covering" : ""}${arriving && gate?.dir !== "out" ? " arriving" : ""}${intro === "entering" ? " entering" : ""}`}
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
        {/* the brand stands on the projects page only; an open LV or project has the way back in its place:
            one step up, to the project an LV was opened from, else to the projects */}
        {pipeline ? (
          <>
            <button className="band-back" onClick={() => toPipeline(null)} title="Back to where you were">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M10 2.5 4.5 8 10 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              </svg>
              {tender ? "Tender" : "Projects"}
            </button>
            <h1 className="band-here">Pipeline</h1>
            <div className="band-slabs actions">
              <RunsSwitch runs={runs} onOpen={() => undefined} still />
            </div>
          </>
        ) : partners ? (
          <>
            <button className="band-back" onClick={() => toPartners(null)} title="Back to where you were">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M10 2.5 4.5 8 10 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              </svg>
              {tender ? "Tender" : "Projects"}
            </button>
            {/* the partners page puts its tabs, its search and "Your firm" here (Partners.tsx); the open tab
                says where one is, so the band carries no title of its own */}
            <div className="band-place" ref={setBandSlot} />
          </>
        ) : !tender ? (
          <button className="brand" onClick={closeAll} title="All projects">
            <HardHatIcon size={32} />
            Polier
          </button>
        ) : (
          <button className="band-back" onClick={closeAll} title="Back to all projects">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M10 2.5 4.5 8 10 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
            Projects
          </button>
        )}
        {/* the projects page: the two other places, as slabs filling the right end of the band (a new
            project is on the head of the board, Projects.tsx) */}
        {!partners && !pipeline && !tender && (
          <nav className="actions band-slabs" aria-label="Places">
            {catalog.length > 0 && <RunsSwitch runs={runs} onOpen={() => toPipeline({ project: null })} />}
            <button className="band-slab" onClick={() => toPartners({ tab: "suppliers", partner: null })} title="Suppliers and subcontractors: their prices, the conversations with them, who is new">
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                <rect x="2" y="5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
                <rect x="9" y="9" width="11" height="11" fill="currentColor" />
              </svg>
              <b>Partners</b>
              <small>
                {partnersGlance ? (
                  <>
                    {partnersGlance.waiting > 0 && (
                      <>
                        <em className="num">{partnersGlance.waiting}</em> open ·{" "}
                      </>
                    )}
                    {partnersGlance.firms} firms
                  </>
                ) : (
                  "Suppliers and subcontractors"
                )}
              </small>
            </button>
          </nav>
        )}
        {!partners && !pipeline && tender && current && (
          <>
            <div className="doc">
              <input
                key={current.project.name}
                className="doc-name"
                defaultValue={current.project.name}
                aria-label="Project name"
                maxLength={80}
                onBlur={(e) => void rename(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </div>
            <div className="actions">
              {/* Server-rendered from the findings so far; includes the AI review once it has run. */}
              {analysis && checkKey && checked.current === checkKey && (
                <a className="btn" href={`/api/analyses/${analysis.id}/report.html`} target="_blank" rel="noreferrer">
                  Risk report
                </a>
              )}
              <button className="btn plain" onClick={() => setSettingsOpen(true)} title="Name, dates, files of this project">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M1 3.5h12M1 10.5h12M4 1.5v4M10 8.5v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
                Settings
              </button>
            </div>
          </>
        )}
      </header>

      {(intro === "loading" || intro === "opening") && <Opening phase={intro} />}
      {/* while the new-project dialog is open it says itself that it is working */}
      {settingsOpen && current && (
        <ProjectSettings
          project={current.project}
          summary={summaries[current.project.id]}
          openFile={analysis ? current.file : null}
          busy={busy !== null}
          error={error}
          onClose={() => (setSettingsOpen(false), setError(null))}
          onRename={(name) => void rename(name)}
          onChange={(change) => void changePlan(current.project, change)}
          onSetStep={(index, step) => void moveFile(current.project, index, step)}
          onRemoveFile={(index) => void removeFile(index)}
          onAddFiles={() => {
            setSettingsOpen(false);
            addTarget.current = current.project.id;
            fileInput.current?.click();
          }}
          onDelete={() => {
            const doomed = current.project;
            setSettingsOpen(false);
            closeAll();
            void removeProject(doomed);
          }}
        />
      )}
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
      {mailNote && !pending && (
        <div className="notice" role="status">
          <span>{mailNote}</span>
          <button className="text-link" onClick={() => setMailNote(null)}>
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

      {pipeline ? (
        <PipelinePage
          runs={runs}
          projects={catalog}
          project={pipeline.project}
          onPick={(id) => setPipeline({ project: id })}
          onOpenProject={(id) => {
            const p = catalog.find((c) => c.id === id);
            if (!p) return;
            setPipeline(null);
            void openTenderPage(p);
          }}
          starting={startingRun}
          onStart={(id) => void runAgain(id)}
        />
      ) : partners ? (
        <Suspense fallback={null}>
        <PartnersNow
          place={partners}
          bandSlot={bandSlot}
          onPlace={setPartners}
          onChanged={() => setDirectoryAt((n) => n + 1)}
          onOpenTender={(id, file) => {
            const p = catalog.find((c) => c.id === id);
            if (!p) return;
            setPartners(null);
            void openTenderPage(p, { step: "prices", view: "inquiries" }, file);
          }}
        />
        </Suspense>
      ) : tender && tenderData && current ? (
        <TenderPage
          tender={tenderData.data}
          plan={datesOf(current.project, summaries[current.project.id])}
          place={tender}
          onPlace={(place) => setTender({ id: tender.id, ...place })}
          onAsk={(lv, oz, ask) =>
            void askDifference(tender.id, lv, oz, ask).then(
              (data) => setTenderData((kept) => kept && { key: kept.key, data }),
              (e) => setError(e instanceof Error ? e.message : String(e)),
            )
          }
          pipeline={
            <PipelineStrip
              run={runHere}
              file={analysis && checkKey && checked.current === checkKey ? current.file : null}
              starting={startingRun}
              onStart={() => void runAgain(current.project.id)}
              onChange={(what) => void moveRun(what)}
              onQuestions={() => setTender({ ...tender, step: "questions", view: "map" })}
              onFind={(step) => {
                const prefix = step === "L-REVIEW" ? "l-" : step === "V-DIFF" ? "v-" : step.toLowerCase();
                setSelection(NONE);
                setFind((was) => ({ text: `check:${prefix}`, n: (was?.n ?? 0) + 1 }));
              }}
              onRecord={() => toPipeline({ project: current.project.id })}
            />
          }
          pages={
            analysis && checkKey && checked.current === checkKey ? (
              analysis.pdf ? (
                <PdfView key={analysis.id} analysis={analysis} visible={severities} selection={selection} onSelect={setSelection} passage={passage} />
              ) : (
                <p className="pdf-status">This PDF was uploaded on its own and not kept, so there are no pages to show.</p>
              )
            ) : null
          }
          whatif={analysis && checkKey && checked.current === checkKey ? <WhatIfView key={analysis.id} analysisId={analysis.id} sections={sections} onBid={() => setTender({ ...tender, view: "items" })} /> : null}
          intake={intakeOpen ? { onTake: () => void changePlan(current.project, { stage: "check" }), onPass: () => void changePlan(current.project, { outcome: "passed" }) } : null}
          outcome={outcomeOf(current.project)}
          onOutcome={(outcome) => void changePlan(current.project, { outcome })}
          bid={{
            analysisId: analysis && checkKey && checked.current === checkKey ? analysis.id : null,
            sheet:
              analysis && checkKey && checked.current === checkKey ? (
                <BidView
                  key={analysis.id}
                  analysisId={analysis.id}
                  amended={questions?.amendments.filter((x) => x.status === "accepted").length ?? 0}
                  onItem={(oz) => (setSelection({ oz, finding: null }), setTender({ ...tender, view: "map" }))}
                  onQuestions={() => setTender({ ...tender, step: "questions", view: "map" })}
                />
              ) : null,
          }}
          prices={{
            analysisId: analysis && checkKey && checked.current === checkKey ? analysis.id : null,
            byOz: analysis && checkKey && checked.current === checkKey && prices ? priceByOz : null,
            inquiries:
              analysis && checkKey && checked.current === checkKey ? (
                <InquiriesView
                  key={analysis.id}
                  analysisId={analysis.id}
                  at={`${directoryAt}|${questions?.questions.map((q) => q.status).join("") ?? ""}`}
                  onItem={(oz) => (setSelection({ oz, finding: null }), setTender({ ...tender, view: "items" }))}
                  onQuestions={() => setTender({ ...tender, step: "questions", view: "map" })}
                  onBid={() => setTender({ ...tender, step: "bid", view: "items" })}
                  onDirectory={(partner) => toPartners(partner === "firm" ? { tab: "firm", partner: null } : { tab: "suppliers", partner: partner ?? null })}
                />
              ) : null,
          }}
          questions={{
            state: analysis && checkKey && checked.current === checkKey ? questions : null,
            view:
              analysis && checkKey && checked.current === checkKey ? (
                <QuestionsView
                  key={analysis.id}
                  analysisId={analysis.id}
                  state={questions}
                  onState={setQuestions}
                  onReload={loadQuestions}
                  onItem={(oz) => (setSelection({ oz, finding: null }), setTender({ ...tender, step: "check" }))}
                />
              ) : null,
          }}
          check={{
            summary: (() => {
              const known = summaries[current.project.id];
              return known && known !== "failed" ? known : null;
            })(),
            // the findings of the open LV, once its carrying document is read
            findingsByOz: analysis && checked.current === checkKey && checkKey ? findingsByOz : null,
            selected: selection.oz,
            onPick: (oz) => setSelection({ oz, finding: null }),
            list:
              analysis && stats && checkKey && checked.current === checkKey ? (
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
                  ai={ai === "idle" && reviewingHere ? "running" : ai}
                  onReview={() => void review()}
                  find={find}
                />
              ) : null,
            sheet:
              analysis && open && checkKey && checked.current === checkKey ? (
                <ItemSheet
                  analysis={analysis}
                  itemByOz={itemByOz}
                  findingsByOz={findingsByOz}
                  price={selection.oz ? priceByOz.get(selection.oz) : undefined}
                  selection={selection}
                  asked={askedByFinding}
                  settled={settledFindings}
                  amended={selection.oz ? amendedByOz.get(selection.oz) ?? [] : []}
                  onAsked={() => setTender({ ...tender, step: "questions", view: "map" })}
                  onSelect={setSelection}
                  onBack={() => setSelection(NONE)}
                  onShowInTable={(oz) => (setSelection({ oz, finding: null }), setTender({ ...tender, view: "items" }))}
                />
              ) : null,
          }}
          onDocuments={() => setSettingsOpen(true)}
        />
      ) : (
        <ProjectsPage
          projects={catalog}
          summaries={summaries}
          runs={runs}
          busy={busy !== null}
          covered={intro === "loading"}
          pending={pending}
          error={error}
          onChange={(p, change) => void changePlan(p, change)}
          onOpen={(p, file) => {
            // the tender page, in the LV the clicked file is a document of
            void openTenderPage(p, {}, file);
          }}
          onChooseFiles={(target) => {
            addTarget.current = target;
            fileInput.current?.click();
          }}
          onDropFiles={upload}
          onConfirm={(name, target, roles, dates) => void confirmIntake(name, target, roles, dates)}
          onRemoveFile={dropPendingFile}
          onCancel={() => (setPending(null), setError(null))}
          onNew={busy !== null || pending !== null ? null : () => setPending({ files: [], info: null, target: null })}
          mail={
            mailbox
              ? { busy: mailBusy, onCheck: () => void sorted(scanInbox), title: `Polier looks into ${mailbox} for tenders: messages of the last two weeks with an LV attached` }
              : null
          }
        />
      )}
      {/* Polier, the agent, lives in the bottom-right corner; a click opens the conversation about the project */}
      <Agent
        open={agentOpen}
        onOpen={setAgentOpen}
        here={agentHere}
        projects={catalog}
        chats={chats}
        onTurns={(key, turns) => setChats((all) => ({ ...all, [key]: turns }))}
        onCite={cite}
        onOpenProject={(p) => void openTenderPage(p)}
      />
    </div>
  );
}
