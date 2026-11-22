// The address bar is the place in the app. No library: the History API, one parser, one formatter.
//
//   /                                       the projects page
//   /projects/:id[/:view]                   a tender: its LVs read from all its documents (map, read, items);
//   /projects/:id/check[/:view]             the same LVs with the findings of the checks on them;
//   /projects/:id/questions                 the bidder questions of an LV: asked, answered, decided;
//   /projects/:id/prices[/:view]            where each item's price comes from; view "inquiries": the price
//                                           inquiries to suppliers and subcontractors;
//   /projects/:id/bid[/items]               the bid: which items carry a price; "items": the bid sheet;
//   /projects/:id/award[/items]             the award held against the tender and the bid;
//                                           further views: /pages (Tender, Check), /check/between, /bid/whatif;
//                                           ?lv=2 one of several LVs, ?item=5.1.4 the item that is open
//   Addresses of the workspace of before (D-050 to D-057) are still read and lead to the step that took
//   its place: /projects/:id/files/:n[/:view], the same under /archive, and ?project=A&file=2&view=table.
//   /partners[/:tab][/:partner]             suppliers and subcontractors: a tab of the page, one firm open in it
//   /pipeline[/:project]                    the pipeline: every project against the six stations, what Polier
//                                           did, what Claude cost; one project's runs open beside it
//
// The app's state is what is shown; App.tsx writes it here whenever it changes, and reads the address on
// load and on Back / Forward.
//
// Item numbers and file names contain dots, so they stay out of the path of project URLs: the dev server
// answers a last path segment with a dot as a file.

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

// Beyond the three views every step has: the document's pages (Tender, Check), what the LVs of a building
// expect of each other (Check), the price inquiries (Prices), the what-if (Bid).
export type TenderView = "map" | "read" | "items" | "pages" | "between" | "inquiries" | "whatif";
/** The views a step has, in the order of its switch. */
export function viewsOf(step: TenderStep): TenderView[] {
  if (step === "check") return ["map", "read", "items", "pages", "between"];
  if (step === "prices") return ["map", "read", "items", "inquiries"];
  if (step === "bid") return ["map", "items", "whatif"];
  if (step === "award") return ["map", "items"];
  if (step === "questions") return ["map"];
  return ["map", "read", "items", "pages"];
}
export type TenderStep = "tender" | "check" | "questions" | "prices" | "bid" | "award";
/** The tender page: which step, which view, which LV of several (null: all of them), the item that is open. */
export interface TenderPlace {
  step: TenderStep;
  view: TenderView;
  lv: number | null;
  item: string | null;
}

export type Route =
  | { at: "home" }
  // `file`: an address of before named a file of the project; the page opens in the LV it is a document of
  | ({ at: "tender"; id: string; file?: number } & TenderPlace)
  | ({ at: "partners" } & PartnersPlace)
  | ({ at: "pipeline" } & PipelinePlace);

export const HOME: Route = { at: "home" };
// What a view of the workspace of before is now: the step and the view that took its place.
const BEFORE: Record<string, [TenderStep, TenderView]> = {
  plan: ["check", "map"],
  table: ["check", "items"],
  remarks: ["tender", "read"],
  pdf: ["check", "pages"],
  questions: ["questions", "map"],
  inquiries: ["prices", "inquiries"],
  bid: ["bid", "items"],
  whatif: ["bid", "whatif"],
};

export function parseRoute(loc: { pathname: string; search: string } = location): Route {
  const q = new URLSearchParams(loc.search);
  const all = loc.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const seg = all[0] === "archive" ? all.slice(1) : all;
  /** An address of the workspace of before: file `n` of a project in one of its views. */
  const before = (id: string, file: number | undefined, view: string | null | undefined): Route => {
    const [step, v] = BEFORE[view ?? ""] ?? ["tender", "map"];
    return { at: "tender", id, file, step, view: v, lv: null, item: q.get("item") };
  };

  // The links of before the routes: ?project=A&file=2&view=table&item=5.1.4
  const oldProject = q.get("project");
  if (seg.length === 0 && oldProject) return before(oldProject, q.has("file") ? Number(q.get("file")) || 0 : undefined, q.has("file") ? q.get("view") ?? "plan" : null);

  if (seg[0] === "partners") {
    const tab = PARTNER_TABS.includes(seg[1] ?? "") ? (seg[1] as PartnerTab) : "suppliers";
    return { at: "partners", tab, partner: seg[2] ?? null };
  }
  if (seg[0] === "pipeline") return { at: "pipeline", project: seg[1] ?? null };
  if (seg[0] === "projects" && seg[1]) {
    const id = seg[1];
    if (seg[2] === "files" && /^\d+$/.test(seg[3] ?? "")) return before(id, Number(seg[3]), seg[4] ?? "plan");
    if (seg[2] === "lv") return before(id, undefined, null); // one trade LV by an analysis that is gone: the tender
    const lv = q.get("lv");
    const step: TenderStep = seg[2] === "check" || seg[2] === "questions" || seg[2] === "prices" || seg[2] === "bid" || seg[2] === "award" ? seg[2] : "tender";
    const v = seg[step === "tender" ? 2 : 3] ?? "";
    return {
      at: "tender",
      id,
      step,
      view: (viewsOf(step) as string[]).includes(v) ? (v as TenderView) : "map",
      lv: lv !== null && /^\d+$/.test(lv) ? Number(lv) : null,
      item: q.get("item"),
    };
  }
  return HOME;
}

export function formatRoute(r: Route): string {
  if (r.at === "home") return "/";
  if (r.at === "partners") return `/partners${r.tab === "suppliers" && !r.partner ? "" : `/${r.tab}`}${r.partner ? `/${encodeURIComponent(r.partner)}` : ""}`;
  if (r.at === "pipeline") return `/pipeline${r.project ? `/${encodeURIComponent(r.project)}` : ""}`;
  const q = new URLSearchParams();
  if (r.at === "tender") {
    if (r.lv !== null) q.set("lv", String(r.lv));
    if (r.item) q.set("item", r.item);
    const search = q.toString();
    return `/projects/${encodeURIComponent(r.id)}${r.step === "tender" ? "" : `/${r.step}`}${r.view === "map" || r.step === "questions" ? "" : `/${r.view}`}${search ? `?${search}` : ""}`;
  }
  return "/";
}

/** The document a route shows, without what is open in it: two routes with the same key need no loading. */
export function docKey(r: Route): string {
  if (r.at === "home") return "home";
  if (r.at === "partners") return "partners";
  if (r.at === "pipeline") return "pipeline";
  return `tender:${r.id}`;
}

/** Puts a route into the address bar: as a new history entry (Back returns to the one before), or in
 *  place of the current one. Does nothing when the address says it already. */
export function writeRoute(to: Route, replace = false): void {
  const url = formatRoute(to);
  if (url === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}
