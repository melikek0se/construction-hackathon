import type { Analysis, Finding, Sample } from "./types";

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

export async function listSamples(): Promise<Sample[]> {
  return read(await fetch("/api/samples"));
}

export async function loadSample(path: string): Promise<Analysis> {
  return read(await fetch(`/api/samples/analyze?path=${encodeURIComponent(path)}`));
}

export async function analyzeFile(file: File): Promise<Analysis> {
  const form = new FormData();
  form.append("file", file);
  return read(await fetch("/api/analyze", { method: "POST", body: form }));
}

/** The LLM checks of an analysed LV. Seconds when cached, a few minutes otherwise. */
export async function runLlmReview(id: string): Promise<{ findings: Finding[] }> {
  return read(await fetch(`/api/analyses/${id}/llm`, { method: "POST" }));
}
