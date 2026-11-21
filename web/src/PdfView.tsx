// The original PDF pages with every finding marked where its evidence stands and a note in the margin.
// pdf.js draws the page (canvas) and a transparent text layer over it, so the text can be selected;
// the server says where the marks go (GET /api/analyses/{id}/marks, PDF points from the top left).
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadMarks, locatePassage, sourcePdfUrl } from "./api";
import { Sign, type Selection } from "./components";
import { SEVERITY_LABEL, type Analysis, type Finding, type PdfMark, type PdfMarks, type Severity } from "./types";
import "./pdf.css";

GlobalWorkerOptions.workerSrc = workerUrl;

// Selecting text in a pdf.js text layer: the spans are placed absolutely, so while the pointer is over the
// white between two lines the browser extends the selection to whatever comes next in the document order
// and unrelated text far away lights up. pdf.js's own viewer avoids that with an "end of content" element
// that is moved next to the end of the selection and covers the layer while selecting; this is that logic
// (TextLayerBuilder in pdfjs-dist/web/pdf_viewer.mjs), for the layers this view draws.
const textLayers = new Map<HTMLElement, HTMLElement>(); // text layer -> its end-of-content element
let previousRange: Range | null = null;
let listening = false;

function restEnd(layer: HTMLElement, end: HTMLElement) {
  layer.append(end);
  end.style.width = "";
  end.style.height = "";
  end.style.userSelect = "";
  layer.classList.remove("selecting");
}

function onSelectionChange() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    textLayers.forEach((end, layer) => restEnd(layer, end));
    previousRange = null;
    return;
  }
  const active = new Set<HTMLElement>();
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    for (const layer of textLayers.keys()) if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
  }
  textLayers.forEach((end, layer) => (active.has(layer) ? layer.classList.add("selecting") : restEnd(layer, end)));
  const range = selection.getRangeAt(0);
  const movesStart =
    previousRange !== null &&
    (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);
  let anchor: Node | null = movesStart ? range.startContainer : range.endContainer;
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
  if (!movesStart && range.endOffset === 0) {
    do {
      while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
      anchor = anchor?.previousSibling ?? null;
    } while (anchor && !anchor.childNodes.length);
  }
  const layer = (anchor as Element | null)?.parentElement?.closest<HTMLElement>(".textLayer");
  const end = layer ? textLayers.get(layer) : undefined;
  if (anchor && layer && end) {
    end.style.width = layer.style.width;
    end.style.height = layer.style.height;
    end.style.userSelect = "text";
    anchor.parentElement?.insertBefore(end, movesStart ? anchor : anchor.nextSibling);
  }
  previousRange = range.cloneRange();
}

function watchTextLayer(layer: HTMLElement): () => void {
  const end = document.createElement("div");
  end.className = "endOfContent";
  layer.append(end);
  textLayers.set(layer, end);
  const down = () => layer.classList.add("selecting");
  layer.addEventListener("mousedown", down);
  if (!listening) {
    listening = true;
    document.addEventListener("selectionchange", onSelectionChange);
    const settle = () => textLayers.forEach((e, l) => restEnd(l, e));
    document.addEventListener("pointerup", settle);
    window.addEventListener("blur", settle);
  }
  return () => {
    layer.removeEventListener("mousedown", down);
    textLayers.delete(layer);
  };
}

const NOTES_WIDE = 250; // width of the margin column …
const NOTES_NARROW = 180; // … and in a narrow window, where the page needs the room
const NOTE_H = 50; // a note is two lines; a fixed height lets notes be stacked without measuring them
const ZOOMS = [1, 1.25, 1.5, 2];
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

interface Placed {
  mark: PdfMark;
  finding: Finding;
}

const NO_MARKS: Placed[] = []; // one array for every page without marks, so their listeners are not re-attached

function noteTitle(f: Finding): string {
  return f.title || f.explanation.split(/(?<=[.!?])\s/)[0];
}

export function PdfView({
  analysis,
  visible,
  selection,
  onSelect,
  passage,
}: {
  analysis: Analysis;
  visible: Set<Severity>;
  selection: Selection;
  onSelect: (s: Selection) => void;
  // a passage to show on the page, e.g. one an answer of the chat rests on; `at` tells two clicks apart
  passage?: { oz: string; quote: string; at: number } | null;
}) {
  const [raw, setRaw] = useState<PdfMarks | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState(0); // width the page column can take
  const [notesWidth, setNotes] = useState(NOTES_WIDE);
  const [zoom, setZoom] = useState(1);
  const [hot, setHot] = useState<number | null>(null); // finding under the pointer, in the page or the margin
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const pickedHere = useRef(false); // a selection made in this view needs no scrolling

  // Marks follow the findings: the AI review adds findings to the same analysis.
  useEffect(() => {
    let live = true;
    loadMarks(analysis.id).then(
      (m) => live && setRaw(m),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [analysis.id, analysis.findings.length]);

  useEffect(() => {
    const task = getDocument({ url: sourcePdfUrl(analysis.id) });
    let live = true;
    task.promise.then(
      (d) => live && setDoc(d),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
      setDoc(null);
      void task.destroy();
    };
  }, [analysis.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const notes = el.clientWidth < 760 ? NOTES_NARROW : NOTES_WIDE;
      setNotes(notes);
      setFit(Math.max(320, Math.min(980, el.clientWidth - notes - 56)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The server's findings and the list held here are the same findings, but not always in the same
  // order (after an AI review the new ones are appended here and sorted in there): match them by key.
  const marks = useMemo(() => {
    if (!raw) return null;
    const free = new Map<string, number[]>();
    analysis.findings.forEach((f, i) => {
      const key = `${f.check_id}|${f.item_oz ?? ""}|${f.evidence}`;
      free.set(key, [...(free.get(key) ?? []), i]);
    });
    const out: PdfMark[] = [];
    for (const m of raw.marks) {
      const index = free.get(m.key)?.shift();
      if (index !== undefined) out.push({ ...m, finding: index });
    }
    return { pages: raw.pages, marks: out, items: raw.items };
  }, [raw, analysis.findings]);
  const markOf = (finding: number) => marks?.marks.find((m) => m.finding === finding);

  const { byPage, unplaced } = useMemo(() => {
    const byPage = new Map<number, Placed[]>();
    const unplaced: Placed[] = [];
    for (const mark of marks?.marks ?? []) {
      const finding = analysis.findings[mark.finding];
      if (!visible.has(finding.severity)) continue;
      if (mark.page === null) unplaced.push({ mark, finding });
      else byPage.set(mark.page, [...(byPage.get(mark.page) ?? []), { mark, finding }]);
    }
    for (const list of byPage.values()) list.sort((a, b) => a.mark.rects[0][1] - b.mark.rects[0][1]);
    return { byPage, unplaced };
  }, [marks, analysis.findings, visible]);

  const width = fit * zoom;

  // Zooming keeps the place: the point under the pointer (or the top left of the view, for the buttons)
  // stays where it is.
  const anchor = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  function zoomTo(z: number, px = 0, py = 0) {
    const box = scroller.current;
    if (box && box.scrollHeight > 0) {
      anchor.current = { x: (box.scrollLeft + px) / box.scrollWidth, y: (box.scrollTop + py) / box.scrollHeight, px, py };
    }
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)));
  }
  useLayoutEffect(() => {
    const box = scroller.current;
    const a = anchor.current;
    if (!box || !a) return;
    box.scrollTo({ left: a.x * box.scrollWidth - a.px, top: a.y * box.scrollHeight - a.py });
    anchor.current = null;
  }, [zoom]);

  // Ctrl or Cmd with the wheel, and a pinch on a trackpad (which browsers report as ctrl + wheel), zoom the
  // pages instead of the whole browser window. The plain wheel scrolls.
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let pending = 0; // wheel steps arrive faster than pages can be redrawn: one zoom per frame
    let frame = 0;
    let at = { x: 0, y: 0 };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const perCss = rect.width / box.offsetWidth || 1; // the app itself is zoomed on wide screens
      at = { x: (e.clientX - rect.left) / perCss, y: (e.clientY - rect.top) / perCss };
      pending += e.deltaY;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const factor = Math.exp(-pending * 0.004);
          pending = 0;
          zoomTo(Math.round(zoomNow.current * factor * 100) / 100, at.x, at.y);
        });
      }
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => {
      box.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An item picked elsewhere (map, list, table, item sheet): bring its place on the page into view.
  // Only when the selection changes or the pages first appear: marks that are loaded again after an AI
  // review, or a resized window, must not pull the reader back from where they scrolled to.
  const ready = marks !== null && fit > 0;
  useEffect(() => {
    if (!marks || !fit) return;
    if (pickedHere.current) {
      pickedHere.current = false;
      return;
    }
    let page: number | null = null;
    let y = 0;
    const mark =
      selection.finding !== null
        ? markOf(selection.finding)
        : marks.marks.find((m) => m.oz !== null && m.oz === selection.oz && m.page !== null);
    if (mark && mark.page !== null) {
      page = mark.page;
      y = mark.rects[0][1];
    } else if (selection.oz) {
      const place = marks.items[selection.oz]; // an item without findings
      if (place) [page, y] = place;
    }
    const el = page !== null ? pageEls.current.get(page) : undefined;
    const box = scroller.current;
    if (!el || !box || page === null) return;
    const scale = width / marks.pages[page - 1].width;
    // A glide is only for short ways: over many pages the browser gives it up when the pages it passes
    // are drawn, and the view stops somewhere in between.
    const top = el.offsetTop + y * scale - box.clientHeight * 0.3;
    box.scrollTo({ top, behavior: Math.abs(top - box.scrollTop) < box.clientHeight * 2 ? "smooth" : "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.oz, selection.finding, ready]);

  // The passage of an answer: found on the page by the server, outlined there and brought into view.
  const [cited, setCited] = useState<{ page: number; rects: [number, number, number, number][] } | null>(null);
  useEffect(() => {
    setCited(null);
    if (!passage) return;
    let live = true;
    locatePassage(analysis.id, passage.oz, passage.quote).then(
      (m) => live && m.located === "quote" && m.page !== null && setCited({ page: m.page, rects: m.rects }),
      () => undefined, // the item is still scrolled to; only the outline is missing
    );
    return () => {
      live = false;
    };
  }, [analysis.id, passage?.oz, passage?.quote, passage?.at]);
  useEffect(() => {
    const box = scroller.current;
    const el = cited ? pageEls.current.get(cited.page) : undefined;
    if (!cited || !box || !el || !marks) return;
    const scale = width / marks.pages[cited.page - 1].width;
    box.scrollTo({ top: el.offsetTop + cited.rects[0][1] * scale - box.clientHeight * 0.3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cited, ready]);

  function pick(p: Placed) {
    // a note clicked a second time changes nothing, so there is no scroll to skip afterwards
    pickedHere.current = selection.oz !== p.mark.oz || selection.finding !== p.mark.finding;
    onSelect({ oz: p.mark.oz, finding: p.mark.finding });
  }

  if (error) return <p className="pdf-status">The PDF could not be shown: {error}</p>;

  return (
    <div className="pdfview" ref={scroller}>
      <div className="pdf-tools">
        <span className="hint">
          {analysis.pdf_generated
            ? "This LV came without a PDF: these pages are drawn from the file by LV Check, not the client's print-out. "
            : analysis.pdf_file
              ? `The client's print-out of this LV, ${analysis.pdf_file}; the findings are those of ${analysis.boq.file}. `
              : "The client's pages. "}
          Marked text is the evidence of a finding; a bar beside a line marks the item where the quote could not be
          placed.
        </span>
        <div className="pdf-zoom" role="group" aria-label="Zoom" title="Ctrl or Cmd + wheel, or pinch, zooms too">
          {!ZOOMS.includes(zoom) && <output>{Math.round(zoom * 100)} %</output>}
          {ZOOMS.map((z) => (
            <button key={z} aria-pressed={zoom === z} onClick={() => zoomTo(z)}>
              {Math.round(z * 100)} %
            </button>
          ))}
        </div>
      </div>

      {unplaced.length > 0 && (
        <section className="pdf-unplaced" style={{ width: width + notesWidth + 16 }}>
          <h3>Not tied to a place in the PDF</h3>
          {unplaced.map((p) => (
            <Note key={p.mark.finding} placed={p} hot={false} selected={selection.finding === p.mark.finding} onPick={pick} />
          ))}
        </section>
      )}

      {!marks && <p className="pdf-status">Reading the PDF…</p>}

      {marks?.pages.map((size, i) => {
        const n = i + 1;
        const scale = width / size.width;
        const placed = byPage.get(n) ?? NO_MARKS;
        let floor = 0;
        const tops = placed.map((p) => {
          const top = Math.max(p.mark.rects[0][1] * scale - 6, floor);
          floor = top + NOTE_H + 6;
          return top;
        });
        const height = size.height * scale;
        return (
          <div className="pdf-row" key={n} style={{ minHeight: Math.max(height, floor) }}>
            <div
              className="pdf-page"
              ref={(el) => {
                if (el) pageEls.current.set(n, el);
                else pageEls.current.delete(n);
              }}
              style={{ width, height }}
            >
              <PageCanvas doc={doc} n={n} scale={scale} width={width} height={height} root={scroller} />
              <div className="pdf-marks">
                {cited?.page === n &&
                  cited.rects.map((r, k) => (
                    <i
                      key={`cited-${k}`}
                      className="pdf-mark cited"
                      style={{ left: r[0] * scale - 2, top: r[1] * scale - 2, width: (r[2] - r[0]) * scale + 4, height: (r[3] - r[1]) * scale + 4 }}
                    />
                  ))}
                {placed.flatMap((p) =>
                  p.mark.rects.map((r, k) => {
                    const bar = p.mark.located === "item";
                    return (
                      <i
                        key={`${p.mark.finding}-${k}`}
                        className={`pdf-mark ${p.finding.severity}${bar ? " bar" : ""}${
                          hot === p.mark.finding || selection.finding === p.mark.finding ? " hot" : ""
                        }${selection.finding === null && selection.oz !== null && selection.oz === p.mark.oz ? " hot" : ""}`}
                        style={
                          bar
                            ? { left: Math.max(2, r[0] * scale - 12), top: r[1] * scale - 2, width: 5, height: (r[3] - r[1]) * scale + 4 }
                            : { left: r[0] * scale - 1, top: r[1] * scale - 1, width: (r[2] - r[0]) * scale + 2, height: (r[3] - r[1]) * scale + 2 }
                        }
                      />
                    );
                  }),
                )}
              </div>
              {/* Over the text layer nothing may catch the pointer, or text could not be selected: a click
                  that is not the end of a selection is matched against the marks by position instead. */}
              <PointerLayer placed={placed} pageWidth={size.width} onHot={setHot} onPick={pick} />
              <span className="pdf-pageno">
                {n} / {marks.pages.length}
              </span>
            </div>
            <div className="pdf-notes" style={{ width: notesWidth }}>
              {placed.map((p, k) => (
                <Note
                  key={p.mark.finding}
                  placed={p}
                  top={tops[k]}
                  hot={hot === p.mark.finding}
                  selected={selection.finding === p.mark.finding || (selection.finding === null && selection.oz !== null && selection.oz === p.mark.oz)}
                  onHot={setHot}
                  onPick={pick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Note({
  placed,
  top,
  hot,
  selected,
  onHot,
  onPick,
}: {
  placed: Placed;
  top?: number;
  hot: boolean;
  selected: boolean;
  onHot?: (finding: number | null) => void;
  onPick: (p: Placed) => void;
}) {
  const { finding, mark } = placed;
  return (
    <button
      className={`pdf-note ${finding.severity}${hot ? " hot" : ""}${selected ? " selected" : ""}`}
      style={top === undefined ? undefined : { top }}
      onMouseEnter={() => onHot?.(mark.finding)}
      onMouseLeave={() => onHot?.(null)}
      onClick={() => onPick(placed)}
    >
      <Sign severity={finding.severity} size={16} />
      <span className="pdf-note-head">
        {SEVERITY_LABEL[finding.severity]}
        {mark.oz && <b> {mark.oz}</b>}
        {finding.origin === "llm" && <em> AI</em>}
      </span>
      <span className="pdf-note-text">{noteTitle(finding)}</span>
    </button>
  );
}

/** Sits under nothing and over everything but takes no pointer events itself: it listens on the page. */
function PointerLayer({
  placed,
  pageWidth,
  onHot,
  onPick,
}: {
  placed: Placed[];
  pageWidth: number; // in PDF points
  onHot: (finding: number | null) => void;
  onPick: (p: Placed) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = ref.current?.parentElement;
    if (!page) return;
    const at = (e: MouseEvent): Placed | undefined => {
      // from the box as it is on screen, not from the layout scale: the app is zoomed on wide screens
      const box = page.getBoundingClientRect();
      const perPoint = box.width / pageWidth;
      const x = (e.clientX - box.left) / perPoint;
      const y = (e.clientY - box.top) / perPoint;
      const pad = 2;
      return placed.find((p) =>
        p.mark.rects.some((r) =>
          p.mark.located === "item"
            ? x >= r[0] - 16 && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad
            : x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad,
        ),
      );
    };
    const move = (e: MouseEvent) => {
      const p = at(e);
      onHot(p ? p.mark.finding : null);
      page.classList.toggle("over-mark", !!p);
    };
    const leave = () => {
      onHot(null);
      page.classList.remove("over-mark");
    };
    const click = (e: MouseEvent) => {
      if (!document.getSelection()?.isCollapsed) return; // the end of a text selection, not a click
      const p = at(e);
      if (p) onPick(p);
    };
    page.addEventListener("mousemove", move);
    page.addEventListener("mouseleave", leave);
    page.addEventListener("click", click);
    return () => {
      page.removeEventListener("mousemove", move);
      page.removeEventListener("mouseleave", leave);
      page.removeEventListener("click", click);
    };
  }, [placed, pageWidth, onHot, onPick]);
  return <div ref={ref} hidden />;
}

/** One page: drawn when it comes near the viewport, released again when it is far away. */
function PageCanvas({
  doc,
  n,
  scale,
  width,
  height,
  root,
}: {
  doc: PDFDocumentProxy | null;
  n: number;
  scale: number;
  width: number;
  height: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current,
      rootMargin: "150% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const cv = canvas.current;
    const layer = text.current;
    if (!doc || !near || !cv || !layer) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
    let textLayer: TextLayer | null = null;
    let unwatch: (() => void) | null = null;
    void doc.getPage(n).then((page) => {
      if (cancelled) return;
      // device pixels per CSS pixel of this page, a CSS zoom on the app included
      const onScreen = holder.current ? holder.current.getBoundingClientRect().width / width : 1;
      const dpr = Math.min((window.devicePixelRatio || 1) * (onScreen || 1), 3);
      const sharp = page.getViewport({ scale: scale * dpr });
      cv.width = Math.floor(sharp.width);
      cv.height = Math.floor(sharp.height);
      renderTask = page.render({ canvas: cv, viewport: sharp });
      renderTask.promise.catch(() => undefined); // cancelled when the page scrolls away
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport: page.getViewport({ scale }),
      });
      textLayer.render().then(
        () => {
          if (!cancelled) unwatch = watchTextLayer(layer);
        },
        () => undefined,
      );
    });
    return () => {
      cancelled = true;
      unwatch?.();
      renderTask?.cancel();
      textLayer?.cancel();
      layer.replaceChildren();
      cv.width = 0; // gives the bitmap back
      cv.height = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, n, scale, near]);

  return (
    <div
      ref={holder}
      className="pdf-sheet"
      // the text layer sizes itself from these (pdf.js viewer convention)
      style={{ width, height, ["--total-scale-factor" as string]: scale, ["--scale-factor" as string]: scale }}
    >
      <canvas ref={canvas} />
      <div ref={text} className="textLayer" />
    </div>
  );
}
