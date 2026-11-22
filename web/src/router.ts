// The address bar is the place in the app. No library: the History API, one parser, one formatter.
//
//   /                                       the projects page
//   /projects/:id                           a project: its overview (several trade LVs) or its first file
//   /projects/:id/files/:n[/:view]          file n of a project as an LV
//   /projects/:id/lv/:analysis[/:view]      one trade LV, opened from the project's overview
//   /samples/<folder>/<file>[?view=]        a single dataset file (no project around it)
//   /partners[/:tab][/:partner]             suppliers and subcontractors: a tab of the page, one firm open in it
//   /pipeline[/:project]                    the pipeline: every project against the six stations, what Polier
//                                           did, what Claude cost; one project's runs open beside it
//
// The app's state is what is shown; App.tsx writes it here whenever it changes, and reads the address on
// load and on Back / Forward.
//
// An LV takes ?item=5.1.4 (the item that is open), ?page=2 (item table) and ?fpage=2 (findings list).
// Item numbers and file names contain dots, so they stay out of the path of project URLs: the dev server
// answers a last path segment with a dot as a file.
export type LvView = "plan" | "table" | "remarks" | "whatif" | "pdf" | "questions" | "inquiries" | "bid";
const LV_VIEWS: readonly string[] = ["plan", "table", "remarks", "whatif", "pdf", "questions", "inquiries", "bid"];

/** What an LV page shows beyond the file itself. */
export interface LvPlace {
  view: LvView;
  item: string | null;
  page: number; // of the item table, from 1
  fpage: number; // of the findings list, from 1
}

export type PartnerTab = "suppliers" | "subcontractors" | "coverage" | "waiting" | "prices" | "discovered" | "firm";
const PARTNER_TABS: readonly string[] = ["suppliers", "subcontractors", "coverage", "waiting", "prices", "discovered", "firm"];
/** The partners page: which tab, and the firm that is open (directory tabs only). */
export interface PartnersPlace {
  tab: PartnerTab;
  partner: string | null;
}

/** The pipeline page: the project whose runs are open (null: none). */
export interface PipelinePlace {
  project: string | null;
}

export type Route =
  | { at: "home" }
  | ({ at: "partners" } & PartnersPlace)
  | ({ at: "pipeline" } & PipelinePlace)
  | { at: "project"; id: string } // the overview of a building, or file 0 of an LV in versions
  | ({ at: "file"; id: string; file: number } & LvPlace)
  | ({ at: "lv"; id: string; analysis: string } & LvPlace)
  | ({ at: "sample"; path: string } & LvPlace);

export type LvRoute = Extract<Route, LvPlace>;

export const HOME: Route = { at: "home" };
export const FIRST: LvPlace = { view: "plan", item: null, page: 1, fpage: 1 };

const count = (s: string | null) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

export function parseRoute(loc: { pathname: string; search: string } = location): Route {
  const q = new URLSearchParams(loc.search);
  const seg = loc.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const place = (view: string | null | undefined): LvPlace => ({
    view: view && LV_VIEWS.includes(view) ? (view as LvView) : "plan",
    item: q.get("item"),
    page: count(q.get("page")),
    fpage: count(q.get("fpage")),
  });

  // The links of before the routes: ?project=A&file=2&view=table&item=5.1.4 and ?sample=<folder>/<file>.
  const oldProject = q.get("project");
  if (seg.length === 0 && oldProject) {
    return q.has("file")
      ? { at: "file", id: oldProject, file: Number(q.get("file")) || 0, ...place(q.get("view")) }
      : { at: "project", id: oldProject };
  }
  const oldSample = q.get("sample");
  if (seg.length === 0 && oldSample) return { at: "sample", path: oldSample, ...place(q.get("view")) };

  if (seg[0] === "partners") {
    const tab = PARTNER_TABS.includes(seg[1] ?? "") ? (seg[1] as PartnerTab) : "suppliers";
    return { at: "partners", tab, partner: seg[2] ?? null };
  }
  if (seg[0] === "pipeline") return { at: "pipeline", project: seg[1] ?? null };
  if (seg[0] === "projects" && seg[1]) {
    const id = seg[1];
    if (seg[2] === "files" && /^\d+$/.test(seg[3] ?? "")) return { at: "file", id, file: Number(seg[3]), ...place(seg[4]) };
    if (seg[2] === "lv" && seg[3]) return { at: "lv", id, analysis: seg[3], ...place(seg[4]) };
    return { at: "project", id };
  }
  if (seg[0] === "samples" && seg.length > 1) return { at: "sample", path: seg.slice(1).join("/"), ...place(q.get("view")) };
  return HOME;
}

export function formatRoute(r: Route): string {
  if (r.at === "home") return "/";
  if (r.at === "partners") return `/partners${r.tab === "suppliers" && !r.partner ? "" : `/${r.tab}`}${r.partner ? `/${encodeURIComponent(r.partner)}` : ""}`;
  if (r.at === "pipeline") return `/pipeline${r.project ? `/${encodeURIComponent(r.project)}` : ""}`;
  if (r.at === "project") return `/projects/${encodeURIComponent(r.id)}`;
  const q = new URLSearchParams();
  let path: string;
  if (r.at === "sample") {
    path = `/samples/${r.path.split("/").map(encodeURIComponent).join("/")}`;
    if (r.view !== "plan") q.set("view", r.view);
  } else {
    path =
      r.at === "file"
        ? `/projects/${encodeURIComponent(r.id)}/files/${r.file}`
        : `/projects/${encodeURIComponent(r.id)}/lv/${encodeURIComponent(r.analysis)}`;
    if (r.view !== "plan") path += `/${r.view}`;
  }
  if (r.item) q.set("item", r.item);
  if (r.page > 1) q.set("page", String(r.page));
  if (r.fpage > 1) q.set("fpage", String(r.fpage));
  const search = q.toString();
  return search ? `${path}?${search}` : path;
}

export const isLv = (r: Route): r is LvRoute => r.at === "file" || r.at === "lv" || r.at === "sample";

/** The document a route shows, without what is open in it: two routes with the same key need no loading. */
export function docKey(r: Route): string {
  if (r.at === "home") return "home";
  if (r.at === "partners") return "partners";
  if (r.at === "pipeline") return "pipeline";
  if (r.at === "project") return `project:${r.id}`;
  if (r.at === "file") return `file:${r.id}:${r.file}`;
  if (r.at === "lv") return `lv:${r.id}:${r.analysis}`;
  return `sample:${r.path}`;
}

/** Puts a route into the address bar: as a new history entry (Back returns to the one before), or in
 *  place of the current one. Does nothing when the address says it already. */
export function writeRoute(to: Route, replace = false): void {
  const url = formatRoute(to);
  if (url === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}
