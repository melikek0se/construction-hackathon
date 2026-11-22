// Polier in the corner, and the conversation a click on it opens: questions about a project (Chat.tsx),
// the only place they are asked. It opens small, a box beside Polier to type a question into; the first
// question grows it into a side panel along the right edge of the window (the page makes room for it).
// A conversation already under way opens as the panel. Inside a project or an LV it is that project's conversation; on the list of projects it is
// about all projects at once (answered from their overview), or about one that is picked there.
import { useEffect, useRef, useState } from "react";
import { openCatalogFile } from "./api";
import { Chat, Icon } from "./Chat";
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

  // small until there is a conversation to show; the list of projects to pick from is always the panel
  const full = !target || (chats[target.key]?.length ?? 0) > 0;

  return (
    <>
      {open && (
        <section
          className={`agent-chat ${full ? "full" : "compact"}`}
          aria-label="Ask Polier"
          onKeyDown={(e) => e.key === "Escape" && onOpen(false)}
        >
          <header className="agent-head">
            <span className="agent-mark" aria-hidden="true">
              <Helmet />
            </span>
            <div className="agent-who">
              <strong>Polier</strong>
              {!here && projects.length > 0 && picked !== null ? (
                <button className="agent-scope" onClick={() => setPicked(null)} title="Ask about another project">
                  <span lang="de">{target?.label ?? project?.name}</span>
                  <Icon d="M4 6l4 4 4-4" />
                </button>
              ) : (
                <span className="agent-scope" lang="de">
                  {target?.label ?? (picked === null ? "Pick what to ask about" : project?.name)}
                </span>
              )}
            </div>
            <button className="agent-close" aria-label="Close" title="Close" onClick={() => onOpen(false)}>
              <Icon d="M4 4l8 8M12 4l-8 8" />
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
                  <p>What do you want to ask about? I answer from the documents and show the passage.</p>
                  <ul>
                    <li>
                      <button className="agent-proj all" onClick={() => setPicked(ALL)}>
                        <b>All projects</b>
                        <span>Stages, dates, files, findings and net totals</span>
                      </button>
                    </li>
                    {projects.map((p) => (
                      <li key={p.id}>
                        <button className="agent-proj" onClick={() => setPicked(p.id)}>
                          <b lang="de">{p.name}</b>
                          <span>
                            {[p.number, `${p.files.length} ${p.files.length === 1 ? "file" : "files"}`, (chats[p.id]?.length ?? 0) > 0 && "conversation kept"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <div className="agent-dock">
        <button
          className="agent-button"
          aria-expanded={open}
          aria-label={open ? "Close the conversation with Polier" : "Ask Polier"}
          onClick={() => onOpen(!open)}
        >
          <Mascot size={134} free title={open ? "Close" : "Ask Polier"} />
        </button>
      </div>
    </>
  );
}

/** Polier's helmet, the mark of the conversation (the favicon's drawing). */
function Helmet() {
  return (
    <svg width="18" height="18" viewBox="4 12 58 38" aria-hidden="true">
      <path d="M9 41 C9 25 18.5 14 31.5 14 C44 14 52 23.5 53 38 L53.5 41 Z" fill="currentColor" />
      <path d="M5 40.5 H52 C56.5 40.5 60 41.8 61.5 44 C62.2 45.3 61.4 46.8 59.8 46.8 H7 C5 46.8 4 44.5 5 40.5 Z" fill="currentColor" />
    </svg>
  );
}
