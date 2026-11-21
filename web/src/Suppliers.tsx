/* The directory: who sells what (suppliers of material) and who does which trade (subcontractors), and the
   firm's own particulars that every inquiry carries. The estimator keeps it; a quote that comes in adds what
   the supplier offered. An LV does not say who sells a product, so nothing here is read from LVs. */
import { useEffect, useRef, useState } from "react";
import { getCompany, listSuppliers, removeSupplier, saveCompany, saveSupplier } from "./api";
import type { Company, Supplier } from "./types";
import "./supply.css";

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SOURCE: Record<Supplier["source"], string> = { user: "entered", quote: "from a quote", web: "found on the web", demo: "example" };
const words = (text: string) => text.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);

export function SuppliersDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<Supplier[] | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState({ name: "", kind: "supplier" as Supplier["kind"], email: "", groups: "" });

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    listSuppliers().then(setList, (e) => setError(say(e)));
    getCompany().then(setCompany, (e) => setError(say(e)));
  }, []);

  async function run(job: () => Promise<void>) {
    setError(null);
    try {
      await job();
      onChanged();
    } catch (e) {
      setError(say(e));
    }
  }

  /** A field saved when it is left, only if it changed. */
  const change = (s: Supplier, values: Partial<Supplier>) =>
    void run(async () => {
      const saved = await saveSupplier(values, s.id);
      setList((l) => (l ?? []).map((x) => (x.id === s.id ? saved : x)));
    });
  const firm = (values: Partial<Company>) => void run(async () => setCompany(await saveCompany(values)));

  return (
    <dialog ref={dialog} className="new-project settings runs sup-dir" aria-label="Suppliers and subcontractors" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <header>
        <b>Suppliers</b>
        <span>who is asked for prices, and who is asking</span>
        <button className="btn-ghost small" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="runs-body sup-dir-body">
        {error && <p className="q-error">{error}</p>}

        <h3>Your firm</h3>
        <p className="quiet">Every inquiry says who is asking and for which job: a supplier gives an unknown caller the list price, or nothing.</p>
        {company && (
          <div className="sup-firm">
            {(
              [
                ["name", "Firm"],
                ["contact", "Contact person"],
                ["email", "E-mail"],
                ["phone", "Phone"],
                ["place", "Place"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input type="text" defaultValue={company[key]} onBlur={(e) => e.target.value.trim() !== company[key] && firm({ [key]: e.target.value.trim() })} />
              </label>
            ))}
            <label className="wide">
              <span>What your own people do</span>
              <input type="text" lang="de" defaultValue={company.own_trades} onBlur={(e) => e.target.value.trim() !== company.own_trades && firm({ own_trades: e.target.value.trim() })} />
              <small>Everything else in an LV is a trade for a subcontractor. Polier reads this when it groups the items.</small>
            </label>
            <label>
              <span>On a subcontractor's price</span>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={String(company.nu_surcharge).replace(".", ",")}
                onBlur={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(n) && n !== company.nu_surcharge) firm({ nu_surcharge: n });
                }}
              />
              <small>per cent; usual are 8 to 15</small>
            </label>
          </div>
        )}

        <h3>
          Directory <small>{list ? `${list.length} entr${list.length === 1 ? "y" : "ies"}` : ""}</small>
        </h3>
        <p className="quiet">
          What a supplier sells, in your words (material groups, trades). Polier asks at most five per package, picked by these words and by what each one has quoted before.
        </p>
        <table className="sup-dir-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>E-mail</th>
              <th>Sells / does</th>
              <th>Offered before</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <input type="text" defaultValue={s.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && change(s, { name: e.target.value.trim() })} />
                  <small>{SOURCE[s.source]}</small>
                </td>
                <td>
                  <select value={s.kind} aria-label={`Kind of ${s.name}`} onChange={(e) => change(s, { kind: e.target.value as Supplier["kind"] })}>
                    <option value="supplier">Supplier</option>
                    <option value="subcontractor">Subcontractor</option>
                  </select>
                </td>
                <td>
                  <input type="text" defaultValue={s.email} aria-label={`E-mail of ${s.name}`} onBlur={(e) => e.target.value.trim() !== s.email && change(s, { email: e.target.value.trim() })} />
                </td>
                <td>
                  <input type="text" lang="de" defaultValue={s.groups.join(", ")} aria-label={`What ${s.name} sells`} onBlur={(e) => e.target.value.trim() !== s.groups.join(", ") && change(s, { groups: words(e.target.value) })} />
                </td>
                <td className="sup-products" lang="de" title={s.products.map((p) => p.name).join("\n")}>
                  {s.products.length ? `${s.products.slice(0, 2).map((p) => p.name).join(", ")}${s.products.length > 2 ? ` +${s.products.length - 2}` : ""}` : "–"}
                </td>
                <td>
                  <button className="sup-x" aria-label={`Remove ${s.name}`} title="Remove from the directory (its quotes stay)" onClick={() => void run(async () => (await removeSupplier(s.id), setList((l) => (l ?? []).filter((x) => x.id !== s.id))))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr className="sup-new">
              <td>
                <input type="text" placeholder="New: name" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
              </td>
              <td>
                <select value={fresh.kind} aria-label="Kind of the new entry" onChange={(e) => setFresh({ ...fresh, kind: e.target.value as Supplier["kind"] })}>
                  <option value="supplier">Supplier</option>
                  <option value="subcontractor">Subcontractor</option>
                </select>
              </td>
              <td>
                <input type="text" placeholder="e-mail" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} />
              </td>
              <td>
                <input type="text" lang="de" placeholder="Rohre, Armaturen …" value={fresh.groups} onChange={(e) => setFresh({ ...fresh, groups: e.target.value })} />
              </td>
              <td colSpan={2}>
                <button
                  className="btn-new"
                  disabled={!fresh.name.trim()}
                  onClick={() =>
                    void run(async () => {
                      const saved = await saveSupplier({ name: fresh.name.trim(), kind: fresh.kind, email: fresh.email.trim(), groups: words(fresh.groups) });
                      setList((l) => [...(l ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)));
                      setFresh({ name: "", kind: fresh.kind, email: "", groups: "" });
                    })
                  }
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
