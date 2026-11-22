import { useEffect, useRef, useState } from "react";
import { DateField, Select } from "./controls";
import { PLANNED, STAGE_LABEL, STEPS, STEP_LABEL, datesOf, dmy, planOf, readFrom, stageOf, stepOf, type Step } from "./Projects";
import type { CatalogProject, Plan, ProjectSummary } from "./types";

/* The settings of the open project, from the band of an LV or a project: its name, the stage and the dates
   of its tender, its files (step, take one out, add more) and the project itself (delete). The same sign on
   two posts as the new-project dialog. Nothing waits for a confirmation here: a change is kept at once. */

type Change = { [K in keyof Plan]?: Plan[K] | null };

// The dates of a tender in the order it runs; "Bid sent" is the estimator's own and no file states it.
const DATES: { kind: keyof Plan & string; label: string; hint: string }[] = [
  ...PLANNED.slice(0, 3),
  { kind: "sent", label: "Bid sent", hint: "The day your bid went out." },
  ...PLANNED.slice(3),
];

export function ProjectSettings({
  project: p,
  summary,
  openFile,
  busy,
  error,
  onClose,
  onRename,
  onChange,
  onSetStep,
  onRemoveFile,
  onAddFiles,
  onDelete,
}: {
  project: CatalogProject;
  summary: ProjectSummary | "failed" | undefined;
  openFile: number | null; // the file on the page behind the dialog, if it is one of the project's
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRename: (name: string) => void;
  onChange: (change: Change) => void;
  onSetStep: (index: number, step: Step) => void;
  onRemoveFile: (index: number) => void;
  onAddFiles: () => void;
  onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  // two clicks to take something away: the first arms the button, the second does it
  const [armed, setArmed] = useState<number | "project" | null>(null);

  const known = summary && summary !== "failed" ? summary : null;
  const found = known?.dates ?? [];
  const stated = planOf(found); // what the files give without doubt
  const days = datesOf(p, summary);
  const stage = stageOf(p);
  const own = stage === "intake" || stage === "check" || stage === "pricing";

  /** What stands under a date: whether it was set here or read, and what the files say if that differs. */
  const under = (kind: keyof Plan & string, hint: string): { text: string; de?: boolean } => {
    const set = p.plan[kind as keyof Plan] as string | undefined;
    const read = (stated as Record<string, string | undefined>)[kind];
    const source = found.find((f) => (f.kind === kind || (kind === "due" && f.kind === "opening")) && f.date === read && !f.approx);
    if (set && read && set !== read) return { text: `Set here. The files say ${dmy(read)}; clear the field to go back to it.` };
    if (set && !read) return { text: "Set here; the files do not state it." };
    if (read && source) return { text: `read from ${readFrom(source)}`, de: true };
    if (read) return { text: "read from the files" };
    return { text: known ? `Not stated in the files. ${hint}` : hint };
  };

  return (
    <dialog
      ref={dialog}
      className="new-project settings"
      aria-label={`Settings of ${p.name}`}
      onCancel={(e) => (e.preventDefault(), onClose())}
      onClick={(e) => e.target === e.currentTarget && onClose()} // a click on the veil
    >
      <header>
        <b>Project settings</b>
        <span lang="de">{p.name}</span>
        <button className="btn-ghost small" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="np-body">
        <section>
          <h3>
            The files and the step each belongs to
            <button className="btn-ghost small" disabled={busy} title="A later version of the LV, or another LV of this tender" onClick={onAddFiles}>
              Add files
            </button>
          </h3>
          <ul className="np-files">
            {p.files.map((f, index) => {
              const doc = known?.docs.find((d) => d.index === index);
              const only = p.files.length === 1;
              return (
                <li key={`${index}:${f.name}`}>
                  <span className="np-name" title={f.name}>
                    {f.name}
                  </span>
                  <span className="np-controls">
                    <span className="np-step" role="group" aria-label={`Step of ${f.name}`}>
                      {STEPS.map((s) => (
                        <button key={s} aria-pressed={stepOf(f.role) === s} disabled={busy} onClick={() => stepOf(f.role) !== s && onSetStep(index, s)}>
                          {STEP_LABEL[s]}
                        </button>
                      ))}
                    </span>
                    <button
                      className={`np-remove${armed === index ? " armed" : ""}`}
                      disabled={busy || only}
                      aria-label={`Remove ${f.name}`}
                      title={only ? "The project's only file: delete the project instead" : "Take this file out of the project"}
                      onClick={() => {
                        if (armed === index) onRemoveFile(index);
                        setArmed(armed === index ? null : index);
                      }}
                      onBlur={() => setArmed(null)}
                    >
                      {armed === index ? "Remove for good?" : "Remove"}
                    </button>
                  </span>
                  <span className="np-why">
                    {openFile === index && <i>open</i>}
                    {f.format} · {f.role}
                    {doc ? (doc.error ? ` · could not be read: ${doc.error}` : ` · ${doc.items.toLocaleString("de-DE")} items`) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="np-fields">
          <h3>The project</h3>
          <label className="wide">
            <span>Project name</span>
            <input
              key={p.name}
              defaultValue={p.name}
              maxLength={80}
              disabled={busy}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== p.name) onRename(name);
                else e.target.value = p.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <small> </small>
          </label>
          {own ? (
            <label className="wide">
              <span>Stage</span>
              <Select
                value={stage}
                options={(stage === "intake" ? (["intake", "pricing"] as const) : (["pricing"] as const)).map((st) => ({ value: st, label: STAGE_LABEL[st] }))}
                disabled={busy}
                aria-label="Stage of the tender"
                onChange={(st) => onChange({ stage: st })}
              />
              <small>Where the tender stands on your side; it moves the card on the projects page.</small>
            </label>
          ) : (
            <p className="np-fact wide">
              <span>Stage</span>
              <b>{STAGE_LABEL[stage]}</b>
              <small>{stage === "submitted" ? "follows from the files: a bid is among them" : p.plan.outcome ? "as said on its card" : "follows from the files: an award is among them"}</small>
            </p>
          )}

          <h3>The tender's dates</h3>
          {DATES.map(({ kind, label, hint }) => {
            const note = under(kind, hint);
            const value = (days[kind as keyof Plan] as string | undefined) ?? "";
            return (
              <label key={kind} className={value && note.de ? "np-read" : undefined}>
                <span>{label}</span>
                <DateField
                  label={label}
                  value={value}
                  max={kind === "questions_due" ? days.due || undefined : undefined}
                  disabled={busy}
                  onChange={(v) => onChange({ [kind]: v || null } as Change)}
                />
                <small lang={note.de ? "de" : undefined} title={note.text}>
                  {note.text}
                </small>
              </label>
            );
          })}
        </section>
      </div>

      <footer className={busy ? "busy" : undefined}>
        {error && !busy ? (
          <span className="np-error" role="alert">
            {error}
          </span>
        ) : (
          <span>{busy ? "Reading the project again" : "Every change is kept at once."}</span>
        )}
        {/* the project with all its files and findings; the page behind closes */}
        <button
          className={`btn-ghost${armed === "project" ? " armed" : ""}`}
          disabled={busy}
          onClick={() => {
            if (armed === "project") onDelete();
            setArmed(armed === "project" ? null : "project");
          }}
          onBlur={() => setArmed(null)}
        >
          {armed === "project" ? "Delete for good?" : "Delete project"}
        </button>
        <button className="btn-new" onClick={onClose}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
