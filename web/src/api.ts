import type { Adjustment, Analysis, ChatAnswer, CatalogProject, Finding, Intake, PdfMarks, Plan, Prices, Project, ProjectSummary, QuestionMail, QuestionsState, ReviewProgress, Run, Sample, Spend, WhatIfResult, TenderDate } from "./types";

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

/** Every project the app knows: created ones first, then the dataset's. */
export async function listCatalog(): Promise<CatalogProject[]> {
  return read(await fetch("/api/catalog"));
}

/** Items and findings of one project. The server parses its files for this, so it can take seconds. */
export async function catalogSummary(id: string): Promise<ProjectSummary> {
  return read(await fetch(`/api/catalog/${id}/summary`));
}

/** One file of a project, analysed as an LV. */
export async function openCatalogFile(id: string, index: number): Promise<Analysis> {
  return read(await fetch(`/api/catalog/${id}/files/${index}`));
}

/** A project of several trade LVs. */
export async function openCatalogProject(id: string): Promise<Project> {
  return read(await fetch(`/api/catalog/${id}/project`));
}

/** What these files are: the tender they belong to, which of them are the same LV, the step of each
 *  with its evidence. `onto`: the project they were dropped on. Keeps nothing. */
export async function intakeFiles(files: File[], onto?: string | null): Promise<Intake> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (onto) form.append("project", onto);
  return read(await fetch("/api/intake", { method: "POST", body: form }));
}

/** Keep files as a new project, or add them to a project created earlier. `roles`: one entry per file,
 *  set where the user corrected the step the server read. */
export async function createProject(
  files: File[],
  name?: string,
  addTo?: string | null,
  roles?: (string | null)[],
  dates?: Partial<Record<TenderDate, string>>, // the tender's dates, for a new project; "" takes one out
): Promise<{ id: string }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (name) form.append("name", name);
  if (addTo) form.append("project", addTo);
  if (roles?.some((r) => r !== null)) form.append("roles", JSON.stringify(roles));
  if (dates && Object.keys(dates).length > 0) form.append("dates", JSON.stringify(dates));
  return read(await fetch("/api/projects", { method: "POST", body: form }));
}

/** Change a project's name, the stage of its tender or one of its dates; null takes a date out. */
export async function changeProject(
  id: string,
  change: { name?: string } & { [K in keyof Plan]?: Plan[K] | null },
): Promise<CatalogProject> {
  return read(
    await fetch(`/api/catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    }),
  );
}

export const renameProject = (id: string, name: string) => changeProject(id, { name });

/** Say that a file of a project belongs to another step of the tender than was read from it. */
export async function setFileStep(id: string, index: number, step: string): Promise<CatalogProject> {
  return read(
    await fetch(`/api/catalog/${id}/files/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
    }),
  );
}

/** Take one file out of a project. The project's only file cannot go; the answer is the project as it is then. */
export async function removeProjectFile(id: string, index: number): Promise<CatalogProject> {
  return read(await fetch(`/api/catalog/${id}/files/${index}`, { method: "DELETE" }));
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/catalog/${id}`, { method: "DELETE" });
  if (!res.ok) await read(res); // read() turns the error body into a message
}

/** An LV the server analysed earlier, e.g. one LV of a project. */
export async function loadAnalysis(id: string): Promise<Analysis> {
  return read(await fetch(`/api/analyses/${id}`));
}

/** The PDF an LV was read from; only for analyses with `pdf: true`. */
export function sourcePdfUrl(id: string): string {
  return `/api/analyses/${id}/source.pdf`;
}

/** Where each finding stands on the PDF pages, in the order of the analysis's findings. */
export async function loadMarks(id: string): Promise<PdfMarks> {
  return read(await fetch(`/api/analyses/${id}/marks`));
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

/** Where the AI review of this analysis stands while it runs; asked every second or so by the page that waits. */
export async function reviewProgress(id: string): Promise<ReviewProgress> {
  return read(await fetch(`/api/analyses/${id}/llm/progress`));
}

/** A question about the project of this analysis, answered from its documents only. */
export async function askProject(
  id: string,
  question: string,
  history: { role: string; content: string }[],
  reading = true, // asked beside this LV; false on a project's overview, where no file is open
  scope: "search" | "all" = "search", // "all" reads every document of the project: thorough and costly
): Promise<ChatAnswer> {
  return read(
    await fetch(`/api/analyses/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, reading, scope }),
    }),
  );
}

/** A question about all projects at once, answered from the overview of the projects page. */
export async function askAllProjects(question: string, history: { role: string; content: string }[]): Promise<ChatAnswer> {
  const answer: ChatAnswer = await read(
    await fetch("/api/catalog/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    }),
  );
  return { ...answer, citations: answer.citations.map((c) => ({ ...c, file: "", oz: "", index: null, here: false })) };
}

/** Where a passage (e.g. one an answer rests on) stands on the pages of this LV. */
export async function locatePassage(id: string, oz: string, quote: string): Promise<{ page: number | null; rects: [number, number, number, number][]; located: "quote" | "item" | "none" }> {
  return read(
    await fetch(`/api/analyses/${id}/locate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oz, quote }),
    }),
  );
}

/** The bidder questions of an LV with where each stands, and the messages about them. */
export async function getQuestions(id: string): Promise<QuestionsState> {
  return read(await fetch(`/api/analyses/${id}/questions`));
}

const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The German message with these questions, to read and change before it goes out. */
export async function composeQuestions(id: string, keys: string[], sender: string): Promise<{ subject: string; body: string }> {
  return read(await fetch(`/api/analyses/${id}/questions/compose`, json("POST", { keys, sender })));
}

/** Keep a message with these questions; via "smtp" the app sends it, via "draft" the user does. */
export async function mailQuestions(
  id: string,
  message: { keys: string[]; to: string; subject: string; body: string; via: "draft" | "smtp" },
): Promise<QuestionsState> {
  return read(await fetch(`/api/analyses/${id}/questions/mails`, json("POST", message)));
}

/** A draft was sent from the mail program (or was not, after all). */
export async function markMailSent(mailId: string, sent: boolean): Promise<QuestionMail> {
  return read(await fetch(`/api/mails/${mailId}`, json("PATCH", { sent })));
}

export async function discardMail(mailId: string): Promise<void> {
  const response = await fetch(`/api/mails/${mailId}`, { method: "DELETE" });
  if (!response.ok) await read(response);
}

/** The client's reply, pasted in: read against the questions of the message. */
export async function readReply(mailId: string, text: string): Promise<QuestionMail & { dropped: number }> {
  return read(await fetch(`/api/mails/${mailId}/reply`, json("POST", { text })));
}

/** The latest pipeline run of every project that has one: where each project stands. */
export async function listRuns(): Promise<Run[]> {
  return read(await fetch("/api/runs"));
}

/** The audit of the requests to Claude, of one project or of all: sum, per purpose, the latest requests. */
export async function getSpend(projectId?: string): Promise<Spend> {
  return read(await fetch(projectId ? `/api/spend?project=${encodeURIComponent(projectId)}` : "/api/spend"));
}

/** The latest runs of one project, newest first, each with the record of its steps. */
export async function listProjectRuns(projectId: string): Promise<Run[]> {
  return read(await fetch(`/api/runs?project=${encodeURIComponent(projectId)}`));
}

/** A run that waits ("go-on": on to the prices without the client's answers), has failed steps ("retry")
 *  or is going ("cancel"). */
export async function changeRun(runId: string, what: "go-on" | "retry" | "cancel"): Promise<Run> {
  return read(await fetch(`/api/runs/${runId}/${what}`, { method: "POST" }));
}

/** Runs the pipeline on a project again, in the background. */
export async function startRun(projectId: string): Promise<Run> {
  return read(await fetch(`/api/catalog/${projectId}/runs`, { method: "POST" }));
}
