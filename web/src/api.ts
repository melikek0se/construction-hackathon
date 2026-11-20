export type Severity = "high" | "warn" | "info";

export interface Item {
  oz: string;
  path: string[];
  short_text: string;
  long_text: string;
  qty: string | null;
  unit_raw: string;
  unit: string;
  kind: "normal" | "lump_sum" | "contingency" | "alternative" | "hourly" | "surcharge";
  refs: string[];
  up: string | null;
  total: string | null;
  source: { file: string; line: number | null; page: number | null };
}

export interface Finding {
  item_oz: string | null;
  related_oz: string[];
  category: string;
  check_id: string;
  title: string;
  severity: Severity;
  evidence: string;
  explanation: string;
  action: "ask_client" | "add_surcharge" | "get_quote" | "note_for_claims" | "fix_typo";
  money_at_stake: string | null;
  origin: "rule" | "llm";
}

export interface Analysis {
  id: string;
  boq: { name: string; file: string; format: string; phase: string; items: Item[]; remarks: unknown[] };
  findings: Finding[];
}

export interface Sample {
  path: string;
  name: string;
  bytes: number;
}

async function read<T>(response: Response): Promise<T> {
  if (response.ok) return response.json();
  let detail = `The server answered ${response.status}.`;
  try {
    const body = await response.json();
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    /* keep the generic message */
  }
  throw new Error(detail);
}

export async function analyzeUpload(file: File): Promise<Analysis> {
  const form = new FormData();
  form.append("file", file);
  return read(await fetch("/api/analyze", { method: "POST", body: form }));
}

export async function analyzeSample(path: string): Promise<Analysis> {
  return read(await fetch(`/api/samples/analyze?path=${encodeURIComponent(path)}`));
}

export async function runLlmReview(id: string): Promise<{ findings: Finding[] }> {
  return read(await fetch(`/api/analyses/${id}/llm`, { method: "POST" }));
}

export async function listSamples(): Promise<Sample[]> {
  return read(await fetch("/api/samples"));
}
