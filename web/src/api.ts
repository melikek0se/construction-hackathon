import type { PartnerProfile, PartnerSearch, PartnerStyle, PartnersOverview, AnswerPoint, BidRisk, Company, Supplier, SupplyState, Adjustment, Amendment, Analysis, Bid, CatalogProject, ChatAnswer, Finding, Intake, PdfMarks, Plan, Prices, Project, ProjectSummary, QuestionMail, QuestionsState, ReviewProgress, Run, Sample, Spend, TenderDate, WhatIfResult } from "./types";

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
export async function runWhatIf(id: string, scenario: { adjustments: Adjustment[]; exclude: string[]; answered_quantities: boolean }): Promise<WhatIfResult> {
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

/** Look into the inbox for replies to the messages of this LV; each one found is read. */
export async function checkReplies(id: string): Promise<QuestionsState & { found: number }> {
  return read(await fetch(`/api/analyses/${id}/questions/replies`, { method: "POST" }));
}

/** Accept, reject or take back what an answer changes on our side; `value` is the amendment as changed. */
export async function decideAmendment(
  id: string,
  status: Amendment["status"],
  value?: Amendment["value"],
): Promise<Amendment> {
  return read(await fetch(`/api/amendments/${id}`, json("PATCH", { status, value })));
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

/** The bid in progress: per item the suggested price, the price entered, allowance and total. */
export async function getBid(id: string): Promise<Bid> {
  return read(await fetch(`/api/analyses/${id}/bid`));
}

/** Set unit prices as typed (an empty text clears one), or take the suggested price wherever none is set. */
export async function setBidPrices(id: string, prices: Record<string, string>, takeSuggestions = false): Promise<Bid> {
  return read(await fetch(`/api/analyses/${id}/bid`, json("PUT", { prices, take_suggestions: takeSuggestions })));
}

/* ------------------------------------------------------------------ price inquiries */

const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function listSuppliers(): Promise<Supplier[]> {
  return read(await fetch("/api/suppliers"));
}

export async function saveSupplier(values: Partial<Supplier>, id?: string): Promise<Supplier> {
  return read(await fetch(id ? `/api/suppliers/${id}` : "/api/suppliers", json(id ? "PATCH" : "POST", values)));
}

export async function removeSupplier(id: string): Promise<void> {
  const response = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
  if (!response.ok) await read(response);
}

export async function getCompany(): Promise<Company> {
  return read(await fetch("/api/company"));
}

export async function saveCompany(values: Partial<Company>): Promise<Company> {
  return read(await fetch("/api/company", send("PUT", values)));
}

export async function getSupply(id: string): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply`));
}

/** Work out the packages (again). Asks Claude: seconds, and a little money. */
export async function planSupply(id: string): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/plan`, { method: "POST" }));
}

export async function setPackageSuppliers(id: string, pkg: string, ask: string[]): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/packages/${pkg}`, send("PUT", { ask })));
}

/** The message to read and change: the inquiry, a reminder, or the answer to what the supplier asked back
 *  (written by Claude from the LV: seconds; `points` says what each part of it rests on). */
export async function composeInquiry(id: string, pkg: string, supplierId: string, kind: "inquiry" | "reminder" | "answer" = "inquiry"): Promise<{ subject: string; body: string; to: string; points: AnswerPoint[]; styled: { changed: string[]; summary: string; plain: string } | null }> {
  return read(await fetch(`/api/analyses/${id}/supply/compose`, send("POST", { package: pkg, supplier_id: supplierId, remind: kind === "reminder", answer: kind === "answer" })));
}

export async function mailInquiry(
  id: string,
  message: { package: string; supplier_id: string; to: string; subject: string; body: string; via: "draft" | "smtp"; kind?: "inquiry" | "reminder" | "answer" },
): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/mails`, send("POST", message)));
}

/** A supplier's reply: pasted text, or the filled-in sheet / the quote as a file. */
export async function readQuote(mailId: string, text: string, file: File | null): Promise<{ lines: number; unmatched: { pos: string; unit_price: number; note: string }[]; dropped: number; kind: string; summary: string; asks: { question: string }[] }> {
  const form = new FormData();
  form.append("text", text);
  if (file) form.append("file", file);
  return read(await fetch(`/api/mails/${mailId}/quote`, { method: "POST", body: form }));
}

export async function checkQuoteReplies(id: string): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/replies`, { method: "POST" }));
}

export async function chooseQuote(id: string, pkg: string, mode: "single" | "split" | "assume" | null, quote: string | null = null): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/choose`, send("POST", { package: pkg, mode, quote })));
}

export async function quotesToBid(id: string): Promise<SupplyState> {
  return read(await fetch(`/api/analyses/${id}/supply/to-bid`, { method: "POST" }));
}

/* ------------------------------------------------------------------ tenders found in the mailbox */

export interface MailSorted {
  looked: number;
  taken: { id: string; name: string }[]; // invitations to bid, now projects in the intake
  passed: { subject: string; sender: string; why: string }[];
}

/** The mailbox the app may look into; `user` null: none is set. */
export async function getInbox(): Promise<{ user: string | null }> {
  return read(await fetch("/api/inbox"));
}

/** Look into the mailbox for tenders (asks Claude once per new message with an LV attached). */
export async function scanInbox(): Promise<MailSorted> {
  return read(await fetch("/api/inbox/scan", { method: "POST" }));
}

/** The same for e-mails handed over as .eml files. */
export async function sortMessages(files: File[]): Promise<MailSorted> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return read(await fetch("/api/inbox/messages", { method: "POST", body: form }));
}

/** The bid's price risk: the total as a range, the allowance that covers it, the items behind it. */
export async function getBidRisk(id: string): Promise<BidRisk> {
  return read(await fetch(`/api/analyses/${id}/bid/risk`));
}

/* ------------------------------------------------------------------ partners */

export async function getPartners(): Promise<PartnersOverview> {
  return read(await fetch("/api/partners"));
}

// The partners page is not needed to show the projects, so nothing of it is asked for while they load. Once
// they stand, the directory is read in the background (App.tsx), and the page opens on that copy and reads
// it again behind it; if the button is pressed first, the page reads it itself.
let warm: PartnersOverview | null = null;

export function warmPartners(): void {
  getPartners().then((d) => (warm = d), () => undefined);
}

/** The copy read in the background, once: a later visit reads afresh. */
export function takeWarmPartners(): PartnersOverview | null {
  const d = warm;
  warm = null;
  return d;
}

export async function getPartner(id: string): Promise<PartnerProfile> {
  return read(await fetch(`/api/partners/${id}`));
}

/** Read how a partner writes from its messages. Asks Claude: seconds, a few cents. */
export async function readPartnerStyle(id: string): Promise<PartnerStyle> {
  return read(await fetch(`/api/partners/${id}/style`, { method: "POST" }));
}

export async function listPartnerSearches(): Promise<PartnerSearch[]> {
  return read(await fetch("/api/partners/searches"));
}

/** Look into the web for firms to ask. Claude with web search: about half a minute, a few cents. */
export async function discoverPartners(what: string, kind: string, region: string, projectId?: string | null): Promise<PartnerSearch> {
  return read(await fetch("/api/partners/discover", send("POST", { what, kind, region, project_id: projectId ?? null })));
}

export async function decideCandidate(search: string, n: number, take: boolean): Promise<PartnerSearch> {
  return read(await fetch(`/api/partners/searches/${search}/${n}`, send("POST", { take })));
}

export async function saveDiscovery(values: Partial<PartnersOverview["discovery"]>): Promise<PartnersOverview["discovery"]> {
  return read(await fetch("/api/partners/discovery", send("PUT", values)));
}

export type HistoryRead = { kept: number; known: number; looked?: number; unknown: { email: string; name: string; messages: number }[] };

export async function readMailboxHistory(): Promise<HistoryRead> {
  return read(await fetch("/api/partners/history", { method: "POST" }));
}

export async function handOverMessages(files: File[]): Promise<HistoryRead> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return read(await fetch("/api/partners/messages", { method: "POST", body: form }));
}

export async function putExamples(on: boolean): Promise<void> {
  const response = await fetch("/api/partners/examples", { method: on ? "POST" : "DELETE" });
  if (!response.ok) await read(response);
}

export async function fetchCallRecord(mailId: string): Promise<{ status: string; transcript: string; seconds: number | null }> {
  return read(await fetch(`/api/mails/${mailId}/call-record`, { method: "POST" }));
}
