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
  source: { file: string; line: number | null; page: number | null; xml_id: string | null };
}

export interface Remark {
  path: string[];
  text: string;
}

export interface BoQ {
  name: string;
  file: string;
  format: "gaeb_xml" | "gaeb_90" | "pdf";
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
}

export interface Sample {
  path: string; // relative to dataset/, e.g. "01_gaeb_xml/…X83"
  name: string;
  bytes: number;
}

export const FORMAT_LABEL: Record<BoQ["format"], string> = { gaeb_xml: "GAEB XML", gaeb_90: "GAEB 90", pdf: "PDF" };

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
