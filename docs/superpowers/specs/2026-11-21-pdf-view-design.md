# PDF view with findings on the page — design

Date: 2026-11-21 · Status: waiting for approval

## Intent

The estimator knows the LV as the PDF the client sent. Today the app shows findings next to its own rendering
of the items (map, list, item sheet). The PDF view shows the original pages with each finding marked where its
quoted evidence stands and a note in the margin — the way a supervisor's comments sit on a PDF in Overleaf. For
the pitch it shows the evidence rule ("no evidence, no finding") in one glance.

This is step 1 of 3 agreed with Utku:

1. **This doc:** read-only view — our findings on the PDF.
2. Later: the estimator's own notes on a line or a selected passage, marking a finding valid / not valid,
   tagging a colleague who is notified to review.
3. Later: GraphRAG retrieval for fact-checking findings.

## Goals

- A "PDF" tab in the LV workspace for files that were opened as PDF.
- Original pages, text selectable, sharp at any zoom.
- Each finding that belongs to an item is marked on its page: the quoted evidence highlighted in the severity
  colour (Stop / Caution / Note); where the quote cannot be located, the item's number line is marked instead.
- A margin column with one note per finding (severity, item number, title), level with its mark.
- Two-way link with the rest of the workspace: click a note or mark → the item is selected and its item sheet
  opens; select an item in the map / list / table → the PDF tab scrolls to it.
- Findings without a place on a page (whole-LV findings, quotes from remarks that are not found) are listed at
  the top of the margin, not dropped.

## Non-goals (this step)

- Writing notes, valid / not valid, tagging, notifications (step 2).
- Showing the findings of a GAEB or Excel file on the PDF twin of the same LV.
- Scanned PDFs without a text layer (the parser does not read them either).
- Exporting an annotated PDF.

## Anti-goals

- A mark in the wrong place. A highlight on text that is not the evidence is worse than no highlight: if the
  quote is not found inside the item's own stretch of the document, fall back to the item line.
- Translating or re-typesetting LV text. The page is the client's page, untouched.

## Approaches

- **A. Pages rendered to images on the server (PyMuPDF), overlays in the browser.** Fastest, no new dependency,
  but no text selection and blurry when zoomed.
- **B. pdf.js in the browser, mark positions from the server.** Real viewer: text layer, selection, sharp zoom.
  Costs a new dependency and worker setup in Vite. **Chosen by Utku:** text selection matters now and is the
  basis for step 2 (comment on a selected passage).
- **C. Server writes an annotated PDF, shown in the browser's own viewer.** Dropped: notes cannot be clicked or
  linked to the item sheet, and it is no basis for step 2.

## Design

### Server (`src/boq/api.py`, new `src/boq/pdfmarks.py`)

- The server remembers the file path behind an analysis when the file stays on disk (dataset files and files of
  created projects in `data/projects/<id>/`). Analyses of a temporary upload have no source and no PDF tab.
- `GET /api/analyses/{id}/source.pdf` — the original file; 404 if the analysis is not a PDF or has no kept
  source.
- `GET /api/analyses/{id}/marks` — for every finding (rule findings plus AI findings run so far):
  `{finding: <index in the findings list>, oz, page, rects: [[x0, y0, x1, y1], …], located: "quote" | "item" |
  "none"}`, plus the size of each page in PDF points. Coordinates are PDF points with the origin top-left, as
  PyMuPDF gives them.
- Locating: an item's stretch runs from its number line to the next item's number line (may cross a page
  break). The evidence quote is searched in that stretch with PyMuPDF text search, with whitespace and
  line-end hyphens normalised the way the parser already does. A quote from the preliminary remarks is searched
  in the pages before the first item. Not found → the item's number line; no item → `none`.
- The PDF parser keeps the vertical position of each item's number line (`SourceRef.y`), which it reads today
  and throws away. `scripts/eval_pdf_parser.py` must give the same scores after the change.

### Browser (`web/src/PdfView.tsx`, `pdfjs-dist`)

- New view `pdf` next to plan / table / remarks / what-if, offered only when the analysis has a PDF source;
  deep link `&view=pdf&item=…`.
- Pages are drawn by pdf.js with its text layer, lazily as they scroll into view (the largest dataset PDFs
  have well over 50 pages). A mark layer over each page draws the rectangles scaled to the page.
- Margin column right of the page: notes placed at the height of their mark, pushed down where they would
  overlap. Styling follows the yellow-and-white language of the workspace and the Stop / Caution / Note colours
  already in `styles.css`.
- Selection state is the workspace's existing selected item; no second source of truth.

```
┌───────────────── PDF page ────────────────────┬──── Notes ──────────────┐
│ 3.2.110  Zugsichere Verbindung DN 300          │                         │
│          ░░░░░ 12 St ░░░░░  ───────────────────┼─● STOP 3.2.110          │
│                                                │   12 joints for 524 m   │
│ 3.2.260  Schrauben ▒▒ Güte 8.8 ▒▒ ─────────────┼─● CAUTION 3.2.260       │
│                                   page 14 / 61 │                         │
└────────────────────────────────────────────────┴─────────────────────────┘
```

## Checks

- A test on project C's `Leistungsverzeichnis.pdf`: every finding with an item gets a page and at least the
  item-line mark; the share located by quote is printed and recorded in `docs/STATE.md`.
- `uv run python scripts/eval_pdf_parser.py -v` unchanged; `uv run pytest -q` green; `npm run build` green.
- Seen in Chrome on project C and on one building-trade LV of project F: marks sit on the quoted text, a note
  click opens the item sheet, selecting an item scrolls the PDF.

## Left to the builder

- How the path behind an analysis is stored (a dict next to `_ANALYSES`, evicted with it).
- pdf.js worker wiring in Vite, render scale, how many pages stay rendered.
- The exact normalisation used when a quote is not found on first try.
- Mark and note styling within `DESIGN.md`'s colours.

## For step 2 (not built now, kept possible)

Marks are addressed by page and rectangle in PDF points, and the text layer gives selections in the same
space, so a user's note can later be stored as `{page, rects, text, author, state}` beside the findings.
