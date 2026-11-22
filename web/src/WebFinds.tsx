/* A package of a tender that none of your firms can be asked for: look for firms on the web, right where the
   gap shows (the price inquiries of the tender). Claude searches and reports firms, each with the page it was
   found on; one that is taken becomes one of your firms and is put on the package. Nothing is written to a
   firm from here: the first inquiry goes out from the estimator like any other. Server: boq.partners.discover. */
import { useEffect, useState } from "react";
import { decideCandidate, discoverPartners, listPartnerSearches } from "./api";
import type { PartnerSearch, Supplier } from "./types";
import "./webfinds.css";

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function WebFinds({
  what,
  kind,
  region,
  onTaken,
}: {
  /** What is looked for: the package's name. */
  what: string;
  kind: Supplier["kind"];
  region: string;
  /** A firm was taken among your firms: its id, to put it on the package. */
  onTaken: (supplierId: string) => void;
}) {
  const [searches, setSearches] = useState<PartnerSearch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listPartnerSearches().then((all) => setSearches(all.filter((s) => same(s.what, what))), (e) => setError(say(e)));
  }, [what]);

  const look = () => {
    setBusy(true);
    setError(null);
    discoverPartners(what, kind, region.trim())
      .then((s) => setSearches((before) => [s, ...(before ?? [])]), (e) => setError(say(e)))
      .finally(() => setBusy(false));
  };
  const decide = (s: PartnerSearch, n: number, take: boolean) =>
    decideCandidate(s.id, n, take).then(
      (next) => {
        setSearches((before) => (before ?? []).map((x) => (x.id === next.id ? next : x)));
        const id = next.candidates[n]?.supplier_id;
        if (take && id) onTaken(id);
      },
      (e) => setError(say(e)),
    );
  const found = (searches ?? []).flatMap((s) => s.candidates.map((c, n) => ({ s, c, n }))).filter(({ c }) => c.status === "new");

  return (
    <div className="wf">
      <div className="wf-head">
        <b>Nobody to ask.</b>
        <span>None of your partners {kind === "supplier" ? "sells" : "does"} this.</span>
        {searches !== null && (
          <button className="btn-ghost small" disabled={busy} onClick={look} title="Claude searches the web and reports firms with the page each was found on: about half a minute and a few cents">
            {busy ? "Searching the web: about half a minute…" : found.length ? "Search again" : "Search the web for new partners"}
          </button>
        )}
      </div>
      {error && <p className="wf-error">{error}</p>}
      {found.length > 0 && (
        <ul className="wf-list">
          {found.map(({ s, c, n }) => (
            <li key={`${s.id}/${n}`}>
              <div>
                <b>{c.name}</b> <span lang="de">{c.place}</span>
                <p>{c.why}</p>
                <p className="wf-src">
                  Found on{" "}
                  <a href={c.source_url} target="_blank" rel="noreferrer">
                    {c.source_title || c.source_url}
                  </a>
                  {(c.email || c.phone) && <> · contact as the search reported it, to be checked on the page: {[c.email, c.phone].filter(Boolean).join(", ")}</>}
                </p>
              </div>
              <div className="wf-act">
                <button className="btn-ghost small" onClick={() => void decide(s, n, true)} title="Becomes one of your partners and is put on this package; you write the inquiry">
                  Add and ask
                </button>
                <button className="text-link" onClick={() => void decide(s, n, false)}>
                  Pass
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
