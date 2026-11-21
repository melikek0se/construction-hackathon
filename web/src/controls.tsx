import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import "./controls.css";

/* Our own form controls, drawn to DESIGN.md instead of by the browser: a select and a date field.
   Both open a panel in the top layer (the Popover API), so it is never clipped by a card, a scrolling
   board or the new-project dialog, and it still works inside that modal dialog because it stays a
   descendant of it. */

/** Put the panel under its field (above when there is no room below), in the field's own zoom. */
function place(anchor: HTMLElement, pop: HTMLElement, fit: boolean) {
  const r = anchor.getBoundingClientRect();
  // `body { zoom }` on large displays: the rectangle is in screen pixels, the panel's lengths are zoomed
  const k = anchor.offsetWidth ? r.width / anchor.offsetWidth : 1;
  const vw = window.innerWidth / k;
  const vh = window.innerHeight / k;
  const top = r.top / k;
  const bottom = r.bottom / k;
  if (fit) pop.style.minWidth = `${r.width / k}px`;
  pop.style.maxHeight = "";
  const h = pop.offsetHeight;
  const below = vh - bottom - 8;
  const above = top - 8;
  const up = h > below && above > below;
  const room = Math.max(80, up ? above : below);
  pop.style.maxHeight = `${room}px`;
  pop.style.top = `${up ? Math.max(4, top - Math.min(h, room) - 2) : bottom + 2}px`;
  pop.style.left = `${Math.max(4, Math.min(r.left / k, vw - pop.offsetWidth - 4))}px`;
}

function usePop(open: boolean, anchor: RefObject<HTMLElement | null>, pop: RefObject<HTMLElement | null>, close: () => void, fit: boolean) {
  const closeNow = useRef(close);
  closeNow.current = close;
  useLayoutEffect(() => {
    const a = anchor.current;
    const p = pop.current;
    if (!open || !a || !p) return;
    try {
      p.showPopover?.();
    } catch {
      /* without the Popover API the panel is a fixed box with a z-index */
    }
    const put = () => place(a, p, fit);
    put();
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!a.contains(t) && !p.contains(t)) closeNow.current();
    };
    const scroll = (e: Event) => {
      if (!(e.target instanceof Node && p.contains(e.target))) put();
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", put);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", put);
    };
  }, [open, fit, anchor, pop]);
}

const Chevron = ({ turn = 0 }: { turn?: number }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={turn ? { transform: `rotate(${turn}deg)` } : undefined}>
    <path d="M1.5 3.2 5 6.8l3.5-3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/* ------------------------------------------------------------------ select */

export type Option<T extends string> = { value: T; label: string };

export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  "aria-label": label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const at = options.findIndex((o) => o.value === value);

  usePop(open, btn, list, () => setOpen(false), true);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    setActive(Math.max(at, 0));
    setOpen(true);
  };
  const choose = (i: number) => {
    setOpen(false);
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const last = options.length - 1;
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (open) choose(active);
      else show();
    } else if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
      else setActive(Math.max(0, Math.min(last, active + (k === "ArrowDown" ? 1 : -1))));
    } else if (!open && k.length !== 1) {
      return;
    } else if (k === "Escape") {
      e.preventDefault(); // or the dialog around it would close too
      e.stopPropagation();
      setOpen(false);
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      setActive(k === "Home" ? 0 : last);
    } else if (k === "Tab") {
      setOpen(false);
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // typing the first letters goes to that entry, as in a native select
      const t = typed.current;
      const now = Date.now();
      t.text = now - t.at > 700 ? k : t.text + k;
      t.at = now;
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text.toLowerCase()));
      if (i >= 0) {
        if (open) setActive(i);
        else choose(i);
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={label}
        className={`sel${className ? ` ${className}` : ""}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.key === " " && e.preventDefault()} // Space is handled on the way down
        onBlur={() => setOpen(false)}
      >
        <span>{options[at]?.label ?? ""}</span>
        <Chevron />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          popover="manual"
          className="pop pop-list"
          onMouseDown={(e) => e.preventDefault()} // the field keeps the focus
          onClick={(e) => {
            e.preventDefault(); // inside a <label> a click would press the field again
            e.stopPropagation();
          }}
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === at}
              data-active={i === active || undefined}
              className="opt"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ date field */

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // the week starts on Monday, as on a German site

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = day(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const addMonths = (s: string, n: number) => {
  const d = day(s);
  const to = new Date(d.getFullYear(), d.getMonth() + n, 1);
  to.setDate(Math.min(d.getDate(), new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate()));
  return iso(to);
};
const monday = (s: string) => addDays(s, -((day(s).getDay() + 6) % 7));

function isoWeek(s: string): number {
  const d = day(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

/** "Fri 27.11.2026": the weekday in the UI's English, the date as it stands on a German tender. */
export const dayText = (s: string) => {
  const d = day(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
};

/** A date as `YYYY-MM-DD`, or "" for none. */
export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  label,
  placeholder = "Set a date",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const today = iso(new Date());
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(today); // the day the keyboard is on; its month is the one shown
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  usePop(open, btn, pop, () => setOpen(false), false);
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>("[data-cursor]")?.focus({ preventScroll: true });
  }, [open, cursor]);

  const allowed = (s: string) => (!min || s >= min) && (!max || s <= max);
  const show = () => {
    setCursor(value || (allowed(today) ? today : (max && today > max ? max : min) || today));
    setOpen(true);
  };
  const shut = () => {
    btn.current?.focus();
    setOpen(false);
  };
  const pick = (s: string) => {
    if (s && !allowed(s)) return;
    shut();
    if (s !== value) onChange(s);
  };
  const leave = (e: { relatedTarget: EventTarget | null }) => {
    const to = e.relatedTarget as Node | null;
    if (!to || (to !== btn.current && !pop.current?.contains(to))) setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const step = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : k === "ArrowUp" ? -7 : k === "ArrowDown" ? 7 : 0;
    let to: string | null = null;
    if (step) to = addDays(cursor, step);
    else if (k === "PageUp" || k === "PageDown") to = addMonths(cursor, k === "PageUp" ? -1 : 1);
    else if (k === "Home") to = monday(cursor);
    else if (k === "End") to = addDays(monday(cursor), 6);
    else if (k === "Escape") {
      e.preventDefault(); // or the dialog around it would close too
      e.stopPropagation();
      shut();
    }
    if (to) {
      e.preventDefault();
      setCursor(to);
    }
  };

  const month = cursor.slice(0, 7);
  const first = monday(`${month}-01`);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value ? dayText(value) : "not set"}`}
        className={`sel date${value ? "" : " unset"}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            show();
          }
        }}
        onBlur={leave}
      >
        <span>{value ? dayText(value) : placeholder}</span>
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <path d="M1 2.5h11v9.5H1zM1 5.5h11M4 .5v3M9 .5v3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div
          ref={pop}
          role="dialog"
          aria-label={`${label}: choose a day`}
          popover="manual"
          className="pop pop-cal"
          onMouseDown={(e) => e.preventDefault()} // the focus stays on the day the keyboard is on
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={onKeyDown}
          onBlur={leave}
        >
          <div className="cal-head">
            <button type="button" tabIndex={-1} aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
              <Chevron turn={90} />
            </button>
            <b aria-live="polite">{day(cursor).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
            <button type="button" tabIndex={-1} aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
              <Chevron turn={-90} />
            </button>
          </div>
          <div className="cal-grid">
            <span className="cal-wk" title="Calendar week">
              KW
            </span>
            {DOW.map((d) => (
              <span key={d} className="cal-dow">
                {d}
              </span>
            ))}
            {weeks.map((week) => (
              <Fragment key={week[0]}>
                <span className="cal-wk">{isoWeek(week[0])}</span>
                {week.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    tabIndex={s === cursor ? 0 : -1}
                    data-cursor={s === cursor || undefined}
                    aria-label={day(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    aria-pressed={s === value}
                    aria-current={s === today ? "date" : undefined}
                    aria-disabled={!allowed(s) || undefined}
                    className={`cal-day${s.startsWith(month) ? "" : " out"}${i > 4 ? " we" : ""}`}
                    onClick={() => pick(s)}
                  >
                    {Number(s.slice(8))}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
          <div className="cal-foot">
            <button type="button" disabled={!allowed(today)} onClick={() => pick(today)}>
              Today
            </button>
            {max && <small>until {dayText(max).slice(4)}</small>}
            <button type="button" disabled={!value} onClick={() => pick("")}>
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  );
}
