import type { ReactNode } from "react";

const qtyFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function qty(v: string | null): string {
  return v === null ? "—" : qtyFmt.format(Number(v));
}

export function eur(v: string | number | null): string {
  return v === null ? "—" : eurFmt.format(Number(v));
}

// Anonymisation tokens of the dataset: [FIRMA_044], [ORT_016], TELEFON_084 …
const TOKEN = /\[[A-ZÄÖÜ]+_\d+\]|\b[A-ZÄÖÜ]{4,}_\d{3,}\b/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quoted fragments („…“) of a finding's evidence, to mark them in the item text. */
export function quotedFragments(evidence: string): string[] {
  return [...evidence.matchAll(/[„"]([^“”"]{3,})[“”"]/g)].map((m) => m[1].trim());
}

/** German LV text, untranslated: anonymisation tokens dimmed, evidence fragments marked. */
export function LvText({ text, marks = [] }: { text: string; marks?: string[] }): ReactNode {
  const alternatives = [TOKEN.source, ...marks.filter(Boolean).map(escapeRe)];
  const re = new RegExp(alternatives.join("|"), "g");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const hit = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      marks.includes(hit) ? (
        <mark key={at}>{hit}</mark>
      ) : (
        <span key={at} className="anon" title="Anonymised in the dataset">
          {hit}
        </span>
      ),
    );
    last = at + hit.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
