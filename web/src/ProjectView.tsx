import { useMemo, useState } from "react";
import { Chat } from "./Chat";
import { Sign } from "./components";
import { LvText } from "./format";
import { TradeGraph } from "./TradeGraph";
import { countLabel, SEVERITIES, type ChatCitation, type ChatTurn, type Project, type ProjectFinding } from "./types";

const KIND: Record<string, string> = {
  prior: "needs before it",
  following: "is followed by",
  by_others: "expects from others",
  item: "item",
};

/**
 * Several trade LVs of one building: the dependency graph on the left; on the right the findings that
 * only show up between LVs, or the trade that was clicked in the graph.
 */
export function ProjectView({
  project,
  onOpenLv,
  chat,
}: {
  project: Project;
  onOpenLv: (analysisId: string) => void;
  chat: { turns: ChatTurn[]; onTurns: (turns: ChatTurn[]) => void; onCite: (c: ChatCitation) => void };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<"findings" | "ask">("findings");
  const lv = project.lvs.find((l) => l.name === selected) ?? null;
  const node = project.nodes.find((n) => n.id === selected) ?? null;

  const counts = useMemo(() => {
    const c = { high: 0, warn: 0, info: 0 };
    for (const f of project.findings) c[f.severity]++;
    return c;
  }, [project]);
  const items = project.lvs.reduce((n, l) => n + l.items, 0);
  const before = project.edges.filter((e) => e.target === selected);
  const after = project.edges.filter((e) => e.source === selected);
  const own = project.findings.filter((f) => selected !== null && f.lvs.includes(selected));

  return (
    <div className="work project">
      <main className="left">
        <div className="left-head">
          <div className="verdict">
            <h1>
              {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                <span key={s} className="count">
                  <Sign severity={s} size={36} />
                  {countLabel(counts[s], s)}
                </span>
              ))}
            </h1>
            <p>
              between {project.lvs.length} LVs with {items} items. {project.statements.total} items say what they need
              from another trade; {project.edges.length} dependencies follow from that.
            </p>
          </div>
        </div>
        <TradeGraph nodes={project.nodes} edges={project.edges} selected={selected} onSelect={setSelected} />
        <p className="readout">
          <span className="hint">
            Bottom is built first. Red expects work no LV contains. Point at a trade to see what it builds on.
          </span>
        </p>
      </main>

      <aside className="right">
        <div className="side-tabs" role="tablist" aria-label="Right pane">
          <button role="tab" aria-selected={side === "findings"} onClick={() => setSide("findings")}>
            Between the LVs
          </button>
          <button role="tab" aria-selected={side === "ask"} onClick={() => setSide("ask")}>
            Ask the project
          </button>
        </div>
        {side === "ask" && project.lvs.length > 0 && (
          // any LV of the project stands for it: the server reads all of them for an answer
          <Chat analysisId={project.lvs[0].analysis_id} openFile="" turns={chat.turns} onTurns={chat.onTurns} onCite={chat.onCite} />
        )}
        <div className="panel sheet" hidden={side === "ask"}>
          {lv && node ? (
            <>
              <header className="panel-head">
                <button className="back" onClick={() => setSelected(null)}>
                  All project findings
                </button>
                <button className="btn" onClick={() => onOpenLv(lv.analysis_id)}>
                  Open this LV
                </button>
              </header>
              <div className="scroll">
                <h2 className="lv-title">{lv.name}</h2>
                <p className="facts">
                  <span>
                    <b className="num">{lv.items}</b> items
                  </span>
                  {SEVERITIES.filter((s) => lv.counts[s] > 0).map((s) => (
                    <span key={s}>
                      <Sign severity={s} size={22} /> {countLabel(lv.counts[s], s)} inside this LV
                    </span>
                  ))}
                  {node.part_of && <span className="tag">repeats part of {node.part_of}</span>}
                </p>
                {own.map((f, i) => (
                  <FindingCard key={i} finding={f} onLv={setSelected} />
                ))}
                <EdgeList title="Builds on" edges={before} pick="source" onLv={setSelected} />
                <EdgeList title="Comes before" edges={after} pick="target" onLv={setSelected} />
                {before.length + after.length + own.length === 0 && (
                  <p className="quiet none">This LV states no interface to another trade, and none points at it.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <header className="panel-head">
                <h2>Between the LVs</h2>
                <span className="panel-count">{project.findings.length} findings</span>
              </header>
              <div className="scroll">
                {project.findings.length === 0 && (
                  <p className="quiet none">No interface gap and no repeated scope between these LVs.</p>
                )}
                {project.findings.map((f, i) => (
                  <FindingCard key={i} finding={f} onLv={setSelected} />
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function FindingCard({ finding, onLv }: { finding: ProjectFinding; onLv: (name: string) => void }) {
  return (
    <article className={`plate-card sev-${finding.severity}`}>
      <header>
        <Sign severity={finding.severity} size={28} />
        <h3>{finding.title}</h3>
      </header>
      <ul className="quotes">
        {finding.statements.map((s, i) => (
          <li key={i}>
            <button className="oz-link" onClick={() => onLv(s.lv)}>
              {s.lv}
            </button>{" "}
            <b className="num">{s.item_oz}</b>
            <span className="evidence" lang="de">
              <LvText text={s.quote} />
            </span>
          </li>
        ))}
      </ul>
      <dl>
        <dt>Why it matters</dt>
        <dd>{finding.explanation}</dd>
      </dl>
    </article>
  );
}

function EdgeList(props: {
  title: string;
  edges: Project["edges"];
  pick: "source" | "target";
  onLv: (name: string) => void;
}) {
  if (props.edges.length === 0) return null;
  return (
    <section className="edge-list">
      <h3 className="lv-head">{props.title}</h3>
      {props.edges.map((e) => (
        <div key={e.source + e.target} className="edge">
          <button className="oz-link" onClick={() => props.onLv(e[props.pick])}>
            {e[props.pick]}
          </button>
          <ul className="quotes">
            {e.examples.slice(0, 3).map((x, i) => (
              <li key={i}>
                <span className="quiet">
                  {x.lv} {x.item_oz} {KIND[x.kind]}
                </span>
                <span className="evidence" lang="de">
                  <LvText text={x.quote} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
