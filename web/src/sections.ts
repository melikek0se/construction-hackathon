import type { Finding, Item, Severity } from "./types";

export interface Section {
  key: string; // first part of the item number, e.g. "5"
  title: string; // German title from the LV, or empty when the file carries none
  items: Item[];
  counts: Record<Severity, number>;
}

const RANK: Record<Severity, number> = { high: 0, warn: 1, info: 2 };

export function worst(findings: Finding[] | undefined): Severity | null {
  let out: Severity | null = null;
  for (const f of findings ?? []) if (out === null || RANK[f.severity] < RANK[out]) out = f.severity;
  return out;
}

export function sectionOf(oz: string): string {
  return oz.split(".")[0];
}

/** Top-level sections in file order. Bids without titles (D84) still split by item number. */
export function buildSections(items: Item[], findings: Finding[]): Section[] {
  const byKey = new Map<string, Section>();
  for (const item of items) {
    const key = sectionOf(item.oz);
    let sec = byKey.get(key);
    if (!sec) {
      sec = { key, title: item.path[0] ?? "", items: [], counts: { high: 0, warn: 0, info: 0 } };
      byKey.set(key, sec);
    }
    sec.items.push(item);
  }
  for (const f of findings) {
    if (f.item_oz === null) continue;
    const sec = byKey.get(sectionOf(f.item_oz));
    if (sec) sec.counts[f.severity]++;
  }
  return [...byKey.values()];
}

export function weight(c: Record<Severity, number>): number {
  return c.high * 100 + c.warn * 3 + c.info; // one stop outweighs any number of cautions
}
