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
  // "": the finding's own amount; else the amount is the value of its item, and this says where the price is from
  money_basis?: string;
  origin: "rule" | "llm";
}

export interface Analysis {
  id: string; // handle for the LLM review of this LV
  boq: BoQ;
  findings: Finding[];
  pdf: boolean; // pages can be shown (PdfView): the PDF itself, or pages the server drew from the LV
  pdf_generated: boolean; // the LV came without a PDF (GAEB, Excel): the pages are drawn by the app
  pdf_file: string | null; // the pages are another file's: the client's print-out of this LV in the project
  reviewed: boolean; // the AI review has run on it (by hand, or by the project's pipeline run)
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
  // What the price rests on (D-049): "partners" — the price book, a subcontractor's quote for the same work in
  // another tender, with the firm's surcharge on it; "past bids" — similar items of old bids. null: no price.
  basis?: "partners" | "past bids" | null;
  stale?: boolean; // the quote behind it is past its validity
  material?: BookPrice | null; // a supplier's earlier price: the material part, never the unit price
  past?: { unit_price: number; low: number; high: number; confidence: string; reason: string } | null; // what past bids say, beside a partner's price
}

/** A price of the price book for one item (supply.book). */
export interface BookPrice {
  unit_price: number;
  low: number;
  high: number;
  confidence: string;
  stale: boolean;
  part: string;
  supplier: string;
  date: string;
  valid_until: string | null;
  reason: string;
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
  priced: boolean; // false: no item has a price, in the file or in the bid; the other fields are absent
  basis: "bid" | "file"; // whose prices: the bid in progress, or the file's own
  priced_items: number;
  unpriced_items: number; // items with a quantity and no price: they count as nothing
  allowances: number; // of the total, what the accepted allowances add
  answered_quantities: boolean;
  // quantities the client corrected in an answer; the bid keeps the file's, `delta` is what they would move
  answered: { item_oz: string; label: string; unit: string; qty: number; qty_answered: number; total: number; delta: number }[];
  answered_unpriced: number; // corrected quantities on items without a price
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
/** Where a tender stands and its dates. Read from the files where these state them (FoundDate), else set
 *  by the user. Days are YYYY-MM-DD. */
export interface Plan {
  // intake: found for the estimator (in the mail), not taken on yet. Submitted follows from the files.
  stage?: "intake" | "check" | "pricing";
  // how the tender ended; an award among the files is "won" without being said. passed: no bid was made
  outcome?: "won" | "lost" | "passed" | "cancelled";
  // where the agent found it; from the mailbox also what the mail asks (summary), who asks, and how the
  // job fits what the firm's own people do (src/boq/inbox.py)
  found?: { via?: string; sender?: string; subject?: string; received?: string; summary?: string; client?: string; fit?: "yes" | "partly" | "no"; why?: string };
  due?: string; // submission deadline (Angebotsfrist)
  questions_due?: string; // last day for bidder questions
  sent?: string; // the day the bid went out
  binding_until?: string; // end of the binding period (Bindefrist)
  opening?: string; // the bids are opened (Eröffnungstermin)
  exec_start?: string; // the work starts
  exec_end?: string; // the work has to be finished
}

/** The dates of a tender that its files can state and the new-project dialog asks for. */
export type TenderDate = "questions_due" | "due" | "opening" | "binding_until" | "exec_start" | "exec_end";

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

/** A date of the tender as its files state it (src/boq/dates.py): what it is, and where it was read. */
export type DateKind = "sent_out" | "questions_due" | "due" | "opening" | "binding_until" | "exec_start" | "exec_end";

export interface FoundDate {
  kind: DateKind;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, where the files give one
  approx: boolean; // "Ende Juni 2026": taken as the last day of the month
  label: string; // the label beside the date, as it stands; "" when the line itself says what the date is
  text: string; // the line the date stands on
  sources: { file: string; where: string }[]; // every file that states it
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
  dates: FoundDate[]; // the tender's dates as the files state them, files that are no LV included
  plan: Pick<Plan, TenderDate>; // the ones the files give without doubt
}

export interface ProjectSummary {
  checked?: boolean; // false in the intake: the files are read, no check has run on them yet (absent on summaries kept before D-042: checked)
  lvs: number;
  items: number;
  counts: Record<Severity, number>;
  net: number | null;
  net_from: string | null;
  docs: ProjectDoc[]; // every document of the project with its own numbers
  dates: FoundDate[]; // the tender's dates as its files state them
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
  // an answer about all projects rests on lines of their overview instead: the project, and the line as `quote`
  project?: string;
  project_name?: string;
}

export interface ChatAnswer {
  answer: string;
  found: boolean; // false = the documents do not say
  grounded: boolean; // false = found, but no passage could be confirmed
  citations: ChatCitation[];
  dropped: number; // passages the model named that are not in the documents
  documents: string[]; // the files of the project the answer could draw on
  scope: "search" | "all" | "overview"; // read the passages a search found, every document, or the overview of all projects
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

/** Where a running AI review stands (GET …/llm/progress). Every request looks for all six kinds of
    finding at once, so what moves is the section being read and the findings so far. */
export interface ReviewProgress {
  running: boolean;
  total?: number; // sections of the LV, one request each
  read?: number; // sections whose answer is in
  reading?: string[]; // the sections being read now: title and item range
  found?: Record<string, number>; // findings so far per check, as they will be listed
}

/** A passage of the client's reply that answers a bidder question, and what it settles. */
export interface QuestionAnswer {
  status: "answered" | "partly" | "not_answered";
  quote: string; // word for word from the reply
  meaning: string; // English, for the estimator
  change?: { field: "quantity" | "unit" | "text"; value: string } | null; // where the reply changes the item itself
}

/** What an answer of the client changes on our side: proposed by the app, decided by the estimator. The
    client's file stays as it came; accepted amendments are laid over the LV as the app shows it. */
export interface Amendment {
  id: string;
  item_oz: string | null;
  kind: "settle" | "note" | "quantity" | "unit" | "text" | "allowance";
  // settle: note, findings (closed, as `check | item | evidence`) · note: note · quantity: to, number ·
  // unit, text: to · allowance: percent (null until the estimator sets it), note
  value: { note?: string; findings?: string[]; to?: string; number?: string | null; percent?: number | null };
  quote: string; // the passage of the reply it rests on
  mail_id: string;
  key: string; // the question it answers
  status: "proposed" | "accepted" | "rejected";
  created: string;
  decided: string | null;
}

/** A bidder question (Bieterfrage) and where it stands. */
export interface BidderQuestion {
  no: number;
  key: string; // the same question about the same item keeps its key across analyses of the file
  item_oz: string | null;
  related_oz: string[];
  item_label: string;
  page: number | null;
  question: string; // German, as it is sent
  evidence: string;
  severity: Severity;
  origin: "rule" | "llm";
  findings: string[]; // the findings it comes from, as `check | item | evidence`
  status: "new" | "drafted" | "sent" | "partly" | "answered";
  mail_id: string | null;
  sent_at: string | null;
  answer: QuestionAnswer | null;
}

/** A message with bidder questions: a draft opened in the mail program, or one sent by the app. */
export interface QuestionMail {
  id: string;
  to: string;
  subject: string;
  body: string;
  via: "draft" | "smtp";
  created: string;
  sent_at: string | null;
  items: { no: number; key: string; item_oz: string | null; question: string; evidence: string }[]; // as asked
  reply: string | null;
  reply_at: string | null;
  answers: Record<string, QuestionAnswer> | null;
  reply_via: "pasted" | "imap" | null; // imap: the app found the reply in the inbox
}

/** GET /api/analyses/{id}/questions */
export interface QuestionsState {
  lv: { name: string; file: string; number: string; client: string; email: string }; // email: the client's address as the file gives it, or a token ("[EMAIL_004]") where it was anonymised, or ""
  questions_due: string | null; // last day for bidder questions, if the project has it
  questions: BidderQuestion[];
  mails: QuestionMail[];
  account: string | null; // the address the app can send from; null: drafts only
  inbox: string | null; // the mailbox the app can look into for replies; null: replies are pasted in
  amendments: Amendment[];
}

/** The six stations of the pipeline (src/boq/pipeline.py, STAGES), in the estimator's order of work. */
export type StageId = "read" | "rules" | "ai" | "compare" | "questions" | "prices";

/** One step of a pipeline run on one document (or on the project): a row of the run's record. */
export interface RunStep {
  step: string; // the step's id in src/boq/pipeline.py; "READ" for reading the file
  title: string;
  kind: "deterministic" | "agentic" | "human"; // human: a gate the run waits at for the person
  scope: "document" | "versions" | "project";
  stage: StageId;
  report: boolean; // it states a fact (dates read, questions drafted) instead of looking for faults
  twin: boolean; // another file of an LV that is counted already: its findings are not added up again
  doc: number | null; // index of the file in the project; null for a step about the whole project
  file: string | null;
  // waiting: for the person (the questions); held: behind a step that waits
  status: "queued" | "running" | "done" | "skipped" | "failed" | "waiting" | "held" | "interrupted" | "cancelled";
  detail: string; // what it is doing, what it read, why it was skipped, what the person has to do, or the error
  counts: Record<Severity, number> | null; // what it found, once done
  ms: number | null;
  usd: number | null; // what an agentic step cost at list prices; 0 when every answer came from the cache
}

/** A station of a run: how far it is and what it found. */
export interface RunStage {
  id: StageId;
  title: string;
  status: "none" | "queued" | "running" | "done" | "skipped" | "failed" | "waiting" | "cancelled";
  counts: Record<Severity, number>;
  line: string; // one line on it: what it is doing, what it stated, what it waits for
  done: number;
  total: number;
  checks: number; // steps of it that look for faults
}

/** A run of the pipeline on a project, in the background (src/boq/runs.py). */
export interface Run {
  id: string;
  project_id: string;
  project: string; // its name when the run started
  trigger: string; // "project created", "files added", "started by hand"
  // waiting: everything else is done and the bidder questions are still open (to send, or with the client)
  status: "queued" | "running" | "waiting" | "done" | "failed" | "interrupted" | "cancelled";
  active: boolean; // queued or running
  stopping: boolean; // asked to stop: it does after the step it is on (an AI step can take a minute)
  created: string;
  started: string | null;
  finished: string | null;
  error: string | null;
  steps: RunStep[];
  stages: RunStage[];
  total: number;
  finished_steps: number;
  counts: Record<Severity, number>;
  usd: number | null;
  waiting_for: string | null; // how the bidder questions stand, while they are open
  // the bidder questions of the project: to_send is the estimator's move, out is the client's
  questions: { total: number; to_send: number; out: number; answered: number } | null;
  // the price inquiries of the project (null: none planned): to_send is the estimator's move, out the suppliers'
  // to_answer: a supplier asked something back (the estimator's move)
  inquiries: { packages: number; to_send: number; to_answer?: number; out: number; answered: number; held: number } | null;
  // changes proposed from the client's answers (null: none yet): proposed is the estimator's move; of the
  // accepted ones, the quantities the client corrected and the risk allowances
  decisions: { proposed: number; accepted: number; quantities: number; allowances: number } | null;
  // the bid (null: no price entered): items with a unit price on the LV file that has the most, over all
  // files (several trade LVs), and how many of them were taken from past bids
  bid: { priced: number; priced_all: number; from_suggestions: number } | null;
  since: { new: number; gone: number } | null; // against the run before it on this project
}

/** One request to Claude as the audit keeps it (src/boq/spend.py), or an answer taken from the app's cache. */
export interface SpendCall {
  id: number;
  created: string;
  purpose: string; // "AI review", "second look", "chat", "chat, all projects", "reply read"
  project_id: string | null;
  file: string | null;
  run_id: string | null;
  model: string;
  cached: boolean; // answered from the app's own cache: nothing was sent, nothing was paid
  ms: number | null;
  usd: number | null; // estimate at list prices; null for a model without one
  key: string | null; // last four characters of the API key
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** What Claude cost, of one project or in all. */
export interface Spend {
  usd: number;
  requests: number; // sent to the API
  cached: number; // answered from the app's cache
  unpriced: number; // requests whose model has no list price here: tokens only
  /** Asked of one project only: what was spent on no project at all (mail sorted, partners read, searches
   *  from the partners page), the most costly purpose first. */
  outside: { usd: number; requests: number; purposes: string[] } | null;
  keys: string[];
  by_purpose: { purpose: string; requests: number; cached: number; usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }[];
  calls: SpendCall[];
}

/** One item of the bid in progress (GET /api/analyses/{id}/bid). */
export interface BidRow {
  item_oz: string;
  label: string;
  section: string;
  qty: number | null; // the quantity of the file: what the bid is made on
  unit: string;
  kind: string;
  qty_answered: number | null; // the quantity the client gave in an answer; the file still has `qty`
  suggestion: { unit_price: number; low: number | null; high: number | null; confidence: string; sources: number; basis: "partners" | "past bids"; stale: boolean } | null;
  material: BookPrice | null; // a supplier's earlier price for the material, beside the unit price
  unit_price: number | null; // entered, before any allowance
  source: "own" | "suggestion" | "file" | null;
  allowance_percent: number | null; // accepted from an open point of the client's answers
  price: number | null; // what goes into the bid: unit price with the allowance
  total: number | null;
}

export interface Bid {
  rows: BidRow[];
  items: number;
  priced: number;
  missing: number;
  net: number;
  allowances: number; // the part of `net` that is risk allowance
  corrected_quantities: number;
  from_suggestions: number;
  file: string;
  format: string;
  x84: boolean; // the bid can be downloaded as GAEB XML phase 84
}

/* ------------------------------------------------------------------ price inquiries (src/boq/supply.py) */

/** An entry of the directory: a supplier of material, or a subcontractor for a whole trade. */
export interface Supplier {
  id: string;
  name: string;
  kind: "supplier" | "subcontractor";
  email: string;
  contact: string;
  phone: string;
  place: string;
  groups: string[]; // material groups or trades, as words
  products: { name: string; maker: string }[]; // what it offered in quotes, or is known to sell
  note: string;
  source: "user" | "quote" | "web" | "demo";
  created: string;
  more: SupplierMore;
}

/** What else is kept about a firm (supply.MORE). */
export interface SupplierMore {
  website: string;
  customer_no: string; // the number the firm has us under
  contacts: { name: string; role: string; email: string; phone: string }[];
  preferred: boolean;
  blocked: boolean;
  documents: { name: string; valid_until: string }[]; // a subcontractor's papers with their expiry
  found: { search: string; url: string; title: string; why: string; at: string; what: string } | null; // where a web search found it
  style: PartnerStyle | null;
  read: PartnerRead | null; // Polier's read of the firm: a few sentences, each on its sources
  example: boolean | "made";
}

/* ------------------------------------------------------------------ partners (src/boq/partners.py) */

/** How a partner writes, read from its own messages; every trait with its passage. */
export interface PartnerStyle {
  address: "Sie" | "Du" | "unknown";
  address_quote: string;
  salutation: string;
  closing: string;
  register: "formal" | "neutral" | "casual";
  length: "short" | "medium" | "long";
  answers_with: string;
  person: string;
  habits: { text: string; quote: string }[];
  dropped: number;
  summary: string;
  write_like: string;
  messages: number;
  at: string;
}

/** Where a message or a price belongs: the tender, its file in the project, the package. */
interface PartnerWhere {
  project_id: string | null;
  project: string;
  file: number | null;
  package: string;
}

/** One conversation with a partner (a package of one tender) that is not finished. */
export interface PartnerThread extends PartnerWhere {
  supplier_id: string;
  supplier?: string;
  status: "sent" | "question" | "later" | "drafted" | "answered" | "declined";
  subject: string;
  since: string | null;
  days: number | null;
  reminders: number;
  summary: string;
  asks: number;
  due: string | null;
  example: boolean;
  questions: string[]; // what the firm asked back, where it did
  first_sent: string | null; // when the first message of the conversation went out
  package_id: string | null; // with file_name: what a follow-up from the partners page is written by
  file_name: string | null;
}

export interface PartnerCard {
  asked: number;
  answered: number;
  answer_rate: number | null;
  reply_hours: number | null; // median, first reply
  quotes: number;
  prices: number;
  stale: number;
  latest_price: string | null;
  alternatives: number;
  declined: number;
  reminders: number;
  taken: number;
  messages: number;
  last_contact: string | null;
  open: PartnerThread[];
}

/** A price on record: one line of a quote, with what it rests on. */
export interface PartnerPrice extends PartnerWhere {
  supplier_id: string;
  supplier?: string;
  label: string;
  oz: string;
  unit: string;
  unit_price: number;
  net: number; // after the quote's discount
  product: string;
  alternative: boolean;
  note: string;
  date: string;
  valid_until: string | null;
  fresh: boolean; // still valid, or no older than 90 days where no validity is stated
  binding: "binding" | "non_binding" | "unknown";
  basis: "free_to_site" | "ex_works" | "unknown";
  via: string;
  quote: string; // the quote this line is of
  example: boolean;
  before: { net: number; date: string; change_pct: number | null } | null; // the same partner's price for it before
  package_id: string | null; // with file_name: the package it was quoted for, to ask for it again
  file_name: string | null;
}

export interface PartnerEvent extends PartnerWhere {
  id: string;
  mail_id: string | null;
  kind: "inquiry" | "reminder" | "answer" | "reply" | "mail";
  direction: "in" | "out";
  at: string;
  draft: boolean;
  via: string;
  subject: string;
  text: string;
  example: boolean;
  reply_kind?: string;
  summary?: string;
  priced?: boolean;
}

export interface PartnerRow extends Omit<Supplier, "more"> {
  more: Omit<SupplierMore, "style" | "read"> & { style: boolean; read: boolean };
  gist: string; // the first sentence of Polier's read, if there is one
  card: PartnerCard;
}

export interface PartnerProfile extends Supplier {
  card: PartnerCard;
  prices: PartnerPrice[];
  usual: { quotes: number; basis: string | null; discount_pct: number | null; freight: number | null; skonto: string | null; valid_days: number | null; binding: string | null } | null;
  timeline: PartnerEvent[];
}

/** What an estimator should know about a partner, each sentence resting on facts of the record or a passage. */
export interface PartnerRead {
  points: {
    topic?: "terms" | "questions" | "reliability" | "products" | "prices" | "other"; // reads of before 2026-11-22 have none
    text: string;
    quote: string; // the passage of their message, where the sentence rests on one
    sources: ({ id: string; kind: "fact"; text: string } | { id: string; kind: "message"; event: string; at: string; who: "them" | "us"; text: string })[];
  }[];
  dropped: number; // sentences left out: a source, passage or figure did not stand
  at: string;
  basis: { inquiries: number; quotes: number; messages: number };
}

/** One package of a tender's plan and who can be asked for it. */
export interface PartnerNeed {
  project_id: string | null;
  project: string;
  file: number | null;
  package: string;
  package_id: string;
  file_name: string;
  kind: Supplier["kind"];
  why: string;
  items: number;
  active: boolean; // an inquiry has gone out for this tender
  chosen: boolean;
  firms: { id: string; status: PartnerThread["status"] | "unasked" }[];
}

export interface PartnerGap {
  what: string;
  kind: Supplier["kind"];
  project_id: string | null;
  project: string;
  items: number;
}

export interface PartnersOverview {
  partners: PartnerRow[];
  waiting: PartnerThread[];
  book: { label: string; unit: string; low: number | null; latest: string; suppliers: number; offers: PartnerPrice[] }[];
  coverage: { group: string; kind: Supplier["kind"]; partners: { id: string; name: string }[] }[];
  gaps: PartnerGap[];
  needs: PartnerNeed[];
  inbox: string | null;
  discovery: { auto: boolean; every_days: number; region: string };
  company: Company;
}

export interface PartnerCandidate {
  name: string;
  kind: Supplier["kind"];
  place: string;
  website: string;
  email: string;
  phone: string;
  sells: string[];
  why: string;
  source_url: string;
  source_title: string;
  status: "new" | "added" | "dismissed";
  supplier_id: string | null;
}

/** One look into the web for partners, with what it found. */
export interface PartnerSearch {
  id: string;
  created: string;
  what: string;
  kind: Supplier["kind"];
  region: string;
  reason: string;
  by: "you" | "polier";
  project_id: string | null;
  queries: string[];
  candidates: PartnerCandidate[];
  note: string;
  usd: number | null;
}

/** The firm's own particulars, which every inquiry carries. */
export interface Company {
  name: string;
  contact: string;
  email: string;
  phone: string;
  place: string;
  own_trades: string; // what the firm does itself; everything else is a subcontractor's
  nu_surcharge: number; // per cent on a subcontractor's price
}

export interface QuoteLine {
  oz: string;
  unit_price: number; // as quoted
  net: number; // after the quote's discount
  unit: string;
  product: string;
  alternative: boolean; // another product than tendered
  unit_differs: boolean; // priced in another unit than asked: not comparable as it stands
  note: string;
  quote: string | null; // the passage of the reply, for a quote read from free text
}

export interface QuoteColumn {
  quote: string;
  supplier_id: string;
  supplier: string;
  date: string;
  terms: { basis: "free_to_site" | "ex_works" | "unknown"; freight: number | null; discount_pct: number | null; skonto: string; valid_until: string; binding: string; note: string };
  covered: number;
  goods: number;
  freight: number;
  total: number; // goods after discount, plus freight: what the package costs on site
  flags: string[];
  lines: Record<string, QuoteLine>;
}

export interface Comparison {
  columns: QuoteColumn[];
  single: string | null; // the cheapest quote that prices every item
  split: { lines: Record<string, { quote: string; net: number }>; total: number; suppliers: number; covered: number };
  proposal: { mode: "single" | "split"; quote: string | null; why: string } | null;
}

export interface SupplyPackage {
  id: string;
  name: string; // German, as on the inquiry
  kind: "material" | "subcontract";
  why: string;
  items: { oz: string; label: string; qty: number | null; unit: string; provisional: string | null }[];
  ask: {
    supplier_id: string;
    supplier: string;
    email: string;
    mail: { id: string; to: string; sent_at: string | null; created: string; via: string; subject: string; reminders: number } | null;
    quote: string | null;
    thread: InquiryTurn[]; // the conversation: our messages, oldest first, each with the reply read into it
    // question: the supplier asked something back (the estimator's move); later: a quote is promised
    status: "new" | "drafted" | "sent" | "answered" | "question" | "declined" | "later";
  }[];
  comparison: Comparison;
  chosen: { mode: "single" | "split" | "assume"; quote: string | null } | null;
}

/** One message of ours in a conversation with a supplier, and what came back on it. */
export interface InquiryTurn {
  id: string;
  kind: "inquiry" | "reminder" | "answer";
  subject: string;
  body: string;
  created: string;
  sent_at: string | null;
  via: string;
  reply: {
    text: string;
    at: string | null;
    via: string | null; // "pasted" or "imap"
    kind: "quote" | "question" | "decline" | "later" | "other";
    summary: string;
    asks: { pos: string; quote: string; question: string }[]; // what the supplier asks back
    unmatched: { pos: string; unit_price: number; note: string }[];
  } | null;
}

/** What an answer to a supplier rests on, per question: the LV's words, or nothing (the LV does not say). */
export interface AnswerPoint {
  question: string;
  answer: string;
  pos: string;
  lv_quote: string;
  settled: boolean;
}

/** Where the price of an item comes from, as it stands. */
export interface ItemPrice {
  // at_hand: no quote for this tender yet, the price book has one from an earlier tender (`stale`: out of date)
  status: "waits" | "at_hand" | "quoted" | "asked" | "assumed" | "own";
  stale?: boolean;
  unit_price?: number;
  source?: string;
  date?: string;
  valid_until?: string | null;
  part?: string; // "material", or the whole unit price
  taken?: boolean; // the estimator took this quote (else it is the proposal)
  alternative?: boolean;
  why?: string;
}

export interface SupplyState {
  lv: { name: string; file: string; number: string };
  due: string | null;
  binding_until: string | null;
  reply_by: string | null;
  account: string | null;
  inbox: string | null;
  company: Company;
  suppliers: Supplier[];
  priced_file: boolean;
  plan: { id: string; created: string } | null;
  packages: SupplyPackage[];
  waits: { oz: string; label?: string; question: string }[]; // cannot be priced as written: not asked for until answered
  released: string[]; // held when the plan was made, answered since
  prices: Record<string, ItemPrice>;
  counts: Record<string, number>;
  found?: number;
  read?: number;
  taken?: number;
}

/** How sure the prices of a bid are (src/boq/risk.py): the total as a range and the allowance that covers it. */
export interface BidRisk {
  priced: number;
  gaps: number; // items without a price: not in the range
  total: number;
  p50: number;
  p80: number; // the total is at or under this in four cases out of five
  allowance: number; // p80 − total
  allowance_percent: number;
  by_basis: { basis: string; label: string; items: number; value: number; exposure: number }[];
  top: { oz: string; label: string; value: number; basis: string; band: number; why: string; exposure: number }[];
  bands: Record<string, number>;
}

/** One item of a tender's LV, read from the document that carries it (src/boq/tender.py). */
export interface TenderItem {
  oz: string;
  path: string[];
  short: string;
  long: string;
  qty: string | null;
  unit: string;
  kind: ItemKind;
  sources: { doc: number; page: number | null }[]; // where it stands in each document of the LV
  // what another document of the LV says differently: its quantity or unit, or a text under 90 % alike
  // with the lines that stand only there
  diff: { doc: number; qty?: string | null; unit?: string; alike?: number; only?: string[] } | null;
  // what the latest issue of the LV changed in this item against the issue before it (D-058); `was`, `now`:
  // lines that stood only in the earlier wording, only in the new one
  change: { kind: "new" | "quantity" | "unit" | "text"; was_qty?: string | null; was_unit?: string; alike?: number; was?: string[]; now?: string[] } | null;
}

export interface TenderLv {
  id: number;
  no: string | null; // "12" of LV_12_Dachabdichtung.pdf
  label: string;
  carrier: number; // the document the items are read from
  documents: number[];
  items: TenderItem[];
  remarks: { text: string; doc: number }[]; // the carrier's, then the ones only another document has
  back: { form: "X84" | "D84" | null; file: string | null; written: boolean }; // what the bid goes back as
  issues: number[][]; // the documents of every issue the client sent, oldest first; the last is the tender
  before: number | null; // the document of the issue before, which the changes are counted against
  removed: { oz: string; path: string[]; short: string; long: string; qty: string | null; unit: string }[]; // items the latest issue dropped
}

export interface TenderDoc {
  index: number; // the file's place in the project
  name: string;
  format: string;
  role: string;
  step: "tender" | "bid" | "award";
  pages: number | null;
  lv: number | null; // the LV it is a document of; null for a later step
  carrier: boolean;
  items: number;
  remarks: number;
  priced: number;
  readable: boolean;
  extra_remarks: number;
  issue: number | null; // which issue of its LV it came with, from 1
  current: boolean; // of the latest issue (false: replaced by a later one)
  compare: {
    both: number;
    qty: number;
    unit: number;
    text: number;
    only_carrier: number;
    only_other: number;
    only_carrier_items: string[];
    only_other_items: string[];
  } | null;
}

/** The tender step of a project as one thing: its LVs, each from all the documents the client sent. */
export interface Tender {
  id: string;
  number: string;
  name: string;
  kind: "versions" | "trades";
  client: string;
  plan: Plan;
  lvs: TenderLv[];
  documents: TenderDoc[];
  items: number;
  asked: { lv: number; oz: string }[]; // text differences the estimator put among the bidder questions
  awards: TenderAward[];
}

/** An award file held against the tender it answers and the bid that went out (boq.tender._award). */
export interface TenderAward {
  doc: number;
  lv: number;
  items: number;
  priced: number;
  net: number;
  // items of the tender the award states differently or leaves out
  changes: Record<string, { kind: "quantity" | "unit" | "dropped"; qty?: string | null; unit?: string | null }>;
  // every item of the award: its figures, and the bid's unit price where a priced bid file is among the files
  rows: Record<string, { qty: string | null; unit: string; up: number | null; total: number | null; bid_up: number | null; differs: boolean }>;
  added: { oz: string; path: string[]; short: string; long: string }[]; // items the tender does not have
  bid: { doc: number; net: number; differs: number } | null;
}
