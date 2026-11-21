// Polier in the corner, and the conversation a click on it opens: the same questions about a project as
// the "Ask the project" tab (Chat.tsx), in a panel above the head. Inside a project or an LV it is that
// project's conversation; on the list of projects it is about all projects at once (answered from their
// overview), or about one that is picked there.
import { useEffect, useRef, useState } from "react";
import { openCatalogFile } from "./api";
import { Chat } from "./Chat";
import { Mascot } from "./Mascot";
import type { CatalogProject, ChatCitation, ChatTurn } from "./types";

/** What is open on the page behind the panel, if a project or an LV is. */
export type AgentHere = { key: string; analysisId: string | null; openFile: string; label: string };

const ALL = "all-projects"; // the conversation about all projects, in `chats` and as the pick on the list

const react = (how: "hop" | "excited") => window.dispatchEvent(new CustomEvent("polier", { detail: how }));

export function Agent({
  open,
  onOpen,
  here,
  projects,
  chats,
  onTurns,
  onCite,
  onOpenProject,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  here: AgentHere | null;
  projects: CatalogProject[];
  chats: Record<string, ChatTurn[]>;
  onTurns: (key: string, turns: ChatTurn[]) => void;
  onCite: (c: ChatCitation, from: CatalogProject | null) => void; // `from`: the project picked on the list
  onOpenProject: (p: CatalogProject) => void; // a line of the overview an answer rests on: open its project
}) {
  // On the list of projects: the project asked about, and an analysis of it to ask through (its first
  // file; the server answers from all of the project's documents whichever file that is).
  // `ALL`: every project at once; null: the list to pick from.
  const [picked, setPicked] = useState<string | null>(ALL);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const asking = useRef(new Set<string>());
  const project = here ? null : (projects.find((p) => p.id === picked) ?? null);

  useEffect(() => {
    if (!open || !project || ids[project.id] || asking.current.has(project.id)) return;
    const id = project.id;
    asking.current.add(id);
    setError(null);
    openCatalogFile(id, 0)
      .then(
        (a) => setIds((all) => ({ ...all, [id]: a.id })),
        (e) => setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => asking.current.delete(id));
  }, [open, project, ids]);

  const target: AgentHere | null =
    here ??
    (picked === ALL
      ? { key: ALL, analysisId: null, openFile: "", label: "All projects" }
      : project && ids[project.id]
        ? { key: project.id, analysisId: ids[project.id], openFile: "", label: project.name }
        : null);

  return (
    <div className="agent-dock">
      {open && (
        <section
          className="agent-chat"
          aria-label="Ask Polier"
          onKeyDown={(e) => e.key === "Escape" && onOpen(false)}
        >
          <header className="agent-head">
            <div>
              <strong>Ask Polier</strong>
              <span lang="de">{target?.label ?? project?.name ?? "Pick a project"}</span>
            </div>
            {!here && picked !== null && projects.length > 0 && (
              <button className="agent-link" onClick={() => setPicked(null)}>
                {picked === ALL ? "One project" : "Other project"}
              </button>
            )}
            <button className="agent-close" aria-label="Close" title="Close" onClick={() => onOpen(false)}>
              ×
            </button>
          </header>
          {target ? (
            <Chat
              key={target.key}
              autoFocus
              analysisId={target.analysisId}
              openFile={target.openFile}
              turns={chats[target.key] ?? []}
              onTurns={(turns) => {
                const last = turns[turns.length - 1];
                if (last && turns.length > (chats[target.key] ?? []).length) react(last.role === "user" ? "excited" : "hop");
                onTurns(target.key, turns);
              }}
              onCite={(c) => {
                const p = c.project ? projects.find((x) => x.id === c.project) : null;
                if (p) onOpenProject(p);
                else if (!c.project) onCite(c, project);
              }}
            />
          ) : project ? (
            <div className="agent-pick">
              {error ? (
                <p className="chat-error" role="alert">
                  {error}
                </p>
              ) : (
                <p>Opening the project's documents…</p>
              )}
            </div>
          ) : (
            <div className="agent-pick">
              {projects.length === 0 ? (
                <p>There is no project yet. Add one, then ask me about its documents.</p>
              ) : (
                <>
                  <p>Which project do you want to ask about? I answer from its documents and show the passage.</p>
                  <button className="chat-example agent-all" onClick={() => setPicked(ALL)}>
                    <b>All projects</b>
                    <span>stages, dates, files, findings and net totals, from the overview</span>
                  </button>
                  {projects.map((p) => (
                    <button key={p.id} className="chat-example" onClick={() => setPicked(p.id)}>
                      <b lang="de">{p.name}</b>
                      <span>
                        {[p.number, `${p.files.length} ${p.files.length === 1 ? "file" : "files"}`, (chats[p.id]?.length ?? 0) > 0 && "conversation kept"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}
      <button
        className="agent-button"
        aria-expanded={open}
        aria-label={open ? "Close the conversation with Polier" : "Ask Polier"}
        onClick={() => onOpen(!open)}
      >
        <Mascot size={112} free title={open ? "Close" : "Ask Polier"} />
      </button>
    </div>
  );
}
