import "./pager.css";

/** The rows of `page` (from 1) out of `rows`, and how many pages there are. A page past the end is the last one. */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number; from: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((at - 1) * size, at * size), page: at, pages, from: (at - 1) * size };
}

/** Page numbers to offer: the first, the last, and those around the current one; 0 stands for a gap. */
function steps(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const near = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const out = [1];
  if (near[0] > 2) out.push(0);
  out.push(...near);
  if (near[near.length - 1] < pages - 1) out.push(0);
  out.push(pages);
  return out;
}

/** Previous / page numbers / next under a list. Draws nothing when everything fits on one page. */
export function Pager({
  page,
  pages,
  total,
  size,
  what,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  what: string; // "items", "findings": what the range counts
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav className="pager" aria-label={`Pages of ${what}`}>
      <span className="pager-range">
        {from}–{to} of {total} {what}
      </span>
      <div className="pager-steps">
        <button disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        {steps(page, pages).map((n, i) =>
          n === 0 ? (
            <span key={`gap${i}`} aria-hidden>
              …
            </span>
          ) : (
            <button key={n} aria-current={n === page ? "page" : undefined} onClick={() => n !== page && onPage(n)}>
              {n}
            </button>
          ),
        )}
        <button disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
    </nav>
  );
}
