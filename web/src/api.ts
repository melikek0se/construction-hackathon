import type { Adjustment, Analysis, Finding, Prices, Project, Sample, WhatIfResult } from "./types";

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

/** Dataset folders that hold the trade LVs of one building. */
export async function listSampleProjects(): Promise<{ folder: string; files: number }[]> {
  return read(await fetch("/api/projects/samples"));
}

export async function openSampleProject(folder: string): Promise<Project> {
  return read(await fetch(`/api/projects/sample?folder=${encodeURIComponent(folder)}`));
}

export async function createProject(files: File[]): Promise<Project> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return read(await fetch("/api/projects", { method: "POST", body: form }));
}

/** An LV the server analysed earlier, e.g. one LV of a project. */
export async function loadAnalysis(id: string): Promise<Analysis> {
  return read(await fetch(`/api/analyses/${id}`));
}

/** Unit-price suggestions from past bids; null when the LV has prices already. */
export async function loadPrices(id: string): Promise<Prices | null> {
  return read(await fetch(`/api/analyses/${id}/prices`));
}

/** Total of a priced LV under changed prices or quantities, or with optional items left out. */
export async function runWhatIf(id: string, scenario: { adjustments: Adjustment[]; exclude: string[] }): Promise<WhatIfResult> {
  return read(
    await fetch(`/api/analyses/${id}/whatif`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    }),
  );
}

/** The LLM checks of an analysed LV. Seconds when cached, a few minutes otherwise. */
export async function runLlmReview(id: string): Promise<{ findings: Finding[] }> {
  return read(await fetch(`/api/analyses/${id}/llm`, { method: "POST" }));
}
