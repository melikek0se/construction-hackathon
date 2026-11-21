// Mirrors src/boq/model.py. Decimals arrive as strings.

export type Severity = "high" | "warn" | "info";
export type Category = "error" | "unclear_scope" | "quantity" | "change_order" | "contract_risk" | "price";
export type Action = "ask_client" | "add_surcharge" | "get_quote" | "note_for_claims" | "fix_typo";
export type ItemKind = "normal" | "lump_sum" | "contingency" | "alternative" | "hourly" | "surcharge";

export interface Item {
  oz: string;
  path: string[];
  short_text: string;
  long_text: string;
  qty: string | null;
  unit_raw: string;
  unit: string;
  kind: ItemKind;
  refs: string[];
  up: string | null;
  total: string | null;
  source: { file: string; line: number | null; page: number | null; y: number | null; xml_id: string | null };
}

export interface Remark {
  path: string[];
  text: string;
}

export interface BoQ {
  name: string;
  file: string;
  format: "gaeb_xml" | "gaeb_90" | "pdf" | "excel";
  phase: string;
  items: Item[];
  remarks: Remark[];
}

export interface Finding {
  item_oz: string | null;
  related_oz: string[];
  category: Category;
  check_id: string;
  title: string; // one-line headline; empty on older rule findings
  severity: Severity;
  evidence: string;
  explanation: string;
  action: Action;
  money_at_stake: string | null;
  origin: "rule" | "llm";
}

export interface Analysis {
  id: string; // handle for the LLM review of this LV
  boq: BoQ;
  findings: Finding[];
  pdf: boolean; // pages can be shown (PdfView): the PDF itself, or pages the server drew from the LV
  pdf_generated: boolean; // the LV came without a PDF (GAEB, Excel): the pages are drawn by the app
  pdf_file: string | null; // the pages are another file's: the client's print-out of this LV in the project
}

/** Where one finding stands on a PDF page; rectangles in PDF points from the top left of the page. */
export interface PdfMark {
  finding: number; // index into the server's findings list; PdfView re-points it at Analysis.findings by `key`
  key: string; // check | item | evidence
  oz: string | null;
  page: number | null; // counted from 1
  rects: [number, number, number, number][]; // x0, y0, x1, y1
  located: "quote" | "item" | "none"; // the quoted evidence, the item's number line, or no place
}

export interface PdfMarks {
  pages: { width: number; height: number }[];
  marks: PdfMark[];
  items: Record<string, [number, number]>; // where each item's number line stands: page, y
}

/** One similar item of a past bid that a price suggestion rests on. */
export interface PriceMatch {
  project: string;
  source: string; // "award 15.03.2023"
  date: string;
  file: string;
  item_oz: string;
  label: string;
  qty: number | null;
  unit: string;
  unit_price: number;
  similarity: number;
  same_size: boolean | null;
}

export interface PriceSuggestion {
  item_oz: string;
  unit_price: number | null; // null = no reliable price
  low: number | null;
  high: number | null;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
  value: number | null;
  matches: PriceMatch[];
}

export interface Prices {
  history: { items: number; projects: [string, string, string][]; excluded_project: string | null };
  items: number;
  with_price: number;
  estimate: { mid: number; low: number; high: number } | null;
  suggestions: PriceSuggestion[];
}

/** One change of a what-if scenario: unit prices or quantities of the items in a section and/or with a word. */
export interface Adjustment {
  kind: "price" | "quantity";
  percent: number;
  section: string | null;
  keyword: string;
}

export interface WhatIfResult {
  priced: boolean; // false: the LV has no prices, the other fields are absent
  before: number;
  after: number;
  delta: number;
  delta_percent: number;
  changed_items: number;
  adjustments: (Adjustment & { items: number; value: number })[];
  quantity_beyond_10_percent: boolean;
  sections: { key: string; title: string; before: number; after: number; delta: number }[];
  top_items: { item_oz: string; label: string; before: number; after: number; delta: number; excluded: boolean }[];
  optional_items: { item_oz: string; label: string; kind: string; total: number; excluded: boolean }[];
}

/** A project: several trade LVs of one building and what they expect from each other. */
export interface ProjectLv {
  name: string;
  file: string;
  analysis_id: string;
  items: number;
  counts: Record<Severity, number>;
}

export interface ProjectNode {
  id: string;
  name: string;
  items: number;
  provides: string[];
  part_of: string | null; // the LV this one repeats a part of
  statements: number;
  gaps: number;
}

export interface InterfaceQuote {
  lv: string;
  item_oz: string;
  kind: string; // prior | following | by_others | item
  quote: string;
}

export interface ProjectEdge {
  source: string; // the trade that comes first
  target: string;
  count: number;
  examples: InterfaceQuote[];
}

export interface ProjectFinding {
  check_id: string;
  severity: Severity;
  title: string;
  lvs: string[];
  statements: InterfaceQuote[];
  explanation: string;
  action: Action;
}

export interface Project {
  name: string;
  lvs: ProjectLv[];
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  findings: ProjectFinding[];
  statements: { total: number; resolved: number; internal: number; by_kind: Record<string, number> };
}

/** A project of the projects page: one LV in several versions, or the trade LVs of one building. */
/** Where a tender stands and its dates. No LV file carries them: the user sets them. Days are YYYY-MM-DD. */
export interface Plan {
  stage?: "check" | "questions" | "pricing"; // submitted and award follow from the files
  due?: string; // submission deadline (Angebotsfrist)
  questions_due?: string; // last day for bidder questions
  sent?: string; // the day the bid went out
  binding_until?: string; // end of the binding period (Bindefrist)
}

export interface CatalogProject {
  id: string;
  number: string;
  name: string;
  trade: string;
  note: string;
  kind: "versions" | "trades";
  source: "demo" | "upload"; // demo: seeded from the challenge dataset; both can be changed
  created: string | null;
  plan: Plan;
  files: { name: string; role: string; format: string }[];
}

/** What a set of dropped files is, before anything is kept. */
export type Step = "tender" | "bid" | "award";

/** One dropped file as the server read it (src/boq/intake.py). */
export interface IntakeFile {
  index: number; // its place among the dropped files
  name: string;
  format: BoQ["format"];
  title: string;
  items: number;
  lv: number; // files with the same number are versions of one LV
  role: string; // tender, tender package, excerpt, bid, submitted bid, award
  step: Step;
  certain: boolean; // false: the step is inferred, the user should look
  evidence: string[]; // what the step was read from
}

export interface Intake {
  number: string; // the tender's number as the files state it, or ""
  name: string; // number and name read from the files, or ""
  client: string;
  source: { file: string; where: string } | null; // where the name was read
  lvs: number; // how many different LVs the files are
  suggested: { id: string; reason: string } | null; // the project these files probably belong to
  files: IntakeFile[];
  left_out: { name: string; reason: string }[]; // dropped files that are not LVs
}

export interface ProjectSummary {
  lvs: number;
  items: number;
  counts: Record<Severity, number>;
  net: number | null;
  net_from: string | null;
  docs: ProjectDoc[]; // every document of the project with its own numbers
}

/** One document of a project: a version of the LV, or one trade LV. */
export interface ProjectDoc {
  index: number; // position among the project's files, for opening it
  name: string; // file name
  role: string; // tender, bid, award, trade LV ...
  format: string;
  title: string; // the LV's own name
  items: number;
  counts: Record<Severity, number> | null; // null: the document could not be read
  marks: string; // one digit per item in LV order: 0 none, 1 note, 2 caution, 3 stop
  error: string | null;
  questions: number; // items with a point to raise with the client
  priced: number; // items that carry a total
}

export interface Sample {
  path: string; // relative to dataset/, e.g. "01_gaeb_xml/…X83"
  name: string;
  bytes: number;
}

export const FORMAT_LABEL: Record<BoQ["format"], string> = { gaeb_xml: "GAEB XML", gaeb_90: "GAEB 90", pdf: "PDF", excel: "Excel" };

/** What a dataset file is, read off its extension: "GAEB XML · tender", "PDF". */
export function sampleKind(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  const phase = { "83": "tender", "84": "bid", "86": "award" }[ext.slice(1)] ?? "";
  return `${ext.startsWith("x") ? "GAEB XML" : "GAEB 90"}${phase ? ` · ${phase}` : ""}`;
}

export const SEVERITIES: Severity[] = ["high", "warn", "info"];

// Severity speaks the language of site signage: stop (red), caution (yellow), note (blue).
export const SEVERITY_LABEL: Record<Severity, string> = { high: "Stop", warn: "Caution", info: "Note" };

export function countLabel(n: number, sev: Severity): string {
  return `${n} ${SEVERITY_LABEL[sev].toLowerCase()}${n === 1 ? "" : "s"}`;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  error: "Error in the LV",
  unclear_scope: "Unclear scope",
  quantity: "Quantity",
  change_order: "Change-order potential",
  contract_risk: "Contract risk",
  price: "Price",
};

export const ACTION_LABEL: Record<Action, string> = {
  ask_client: "Ask the client (bidder question)",
  add_surcharge: "Price in a risk surcharge",
  get_quote: "Get a supplier quote",
  note_for_claims: "Note for later claims",
  fix_typo: "Correct before submitting",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  normal: "",
  lump_sum: "Lump sum",
  contingency: "Contingency",
  alternative: "Alternative",
  hourly: "Hourly",
  surcharge: "Surcharge",
};

export const PHASE_LABEL: Record<string, string> = { "83": "Tender", "84": "Bid", "86": "Award" };

/** A passage an answer rests on: confirmed by the server to stand word for word in that item. */
export interface ChatCitation {
  file: string;
  oz: string; // "" = from the preliminary remarks
  quote: string;
  index: number | null; // which file of the project (catalog order); null outside a project
  here: boolean; // the file that is open
}

export interface ChatAnswer {
  answer: string;
  found: boolean; // false = the documents do not say
  grounded: boolean; // false = found, but no passage could be confirmed
  citations: ChatCitation[];
  dropped: number; // passages the model named that are not in the documents
  documents: string[]; // the files of the project the answer could draw on
  scope: "search" | "all"; // read the passages a search found, or every document
  passages: number; // how many passages (items, pieces of remarks) the model read
  files: number; // from how many files
  cost_usd: number | null; // what this answer cost at list prices; null for a model without a known price
  // what reading every document would cost: the first time, and per question while it is cached (an hour)
  whole: { tokens: number; first_usd: number | null; then_usd: number | null };
  usage: { input_tokens: number; cache_write_tokens: number; cache_read_tokens: number; output_tokens: number } | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  answer?: ChatAnswer;
}
