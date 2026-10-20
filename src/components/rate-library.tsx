"use client";
import { useMemo, useState, useTransition } from "react";
import { archiveRateAction, saveRateAction } from "@/app/(dashboard)/m/boq/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { Rate } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";
const EMPTY = { code: "", name: "", category: "joinery", unit: "nos", rate: 0, cost: 0 };

export function RateLibrary({ rates, canManage }: { rates: Rate[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [form, setForm] = useState<Partial<Rate>>(EMPTY);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const rows = useMemo(() => rates.filter((r) => (!cat || r.category === cat) && (!q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))), [rates, q, cat]);
  const run = (f: () => Promise<{ error?: string }>, after?: () => void) => start(async () => { const r = await f(); setErr(r.error); if (!r.error) after?.(); });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Search rates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or name" className={`${inp} min-w-0 flex-1`} />
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className={inp}><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {canManage && (
        <div className="space-y-1 rounded-md border border-line p-3">
          <p className="text-xs font-medium">{form.id ? "Edit item" : "New item"}</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Code" placeholder="Code" className={`${inp} w-28`} value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input aria-label="Name" placeholder="Item / work description" className={`${inp} min-w-0 flex-1`} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select aria-label="Category" className={inp} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input aria-label="Unit" placeholder="Unit" className={`${inp} w-16`} value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input aria-label="Selling rate" type="number" min="0" step="any" placeholder="Rate" className={`${inp} w-24`} value={form.rate ?? 0} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
            <input aria-label="Cost" type="number" min="0" step="any" placeholder="Cost" className={`${inp} w-24`} value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            <button disabled={pending} onClick={() => run(() => saveRateAction(form), () => setForm(EMPTY))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">{form.id ? "Update" : "Add"}</button>
            {form.id && <button onClick={() => setForm(EMPTY)} className="text-xs text-muted">Cancel</button>}
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1">Code</th><th>Item</th><th>Category</th><th>Unit</th><th className="text-right">Rate</th>{canManage && <><th className="text-right">Cost</th><th className="text-right">Margin</th><th /></>}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-mono text-xs">{r.code}</td><td>{r.name}</td><td className="text-xs text-muted">{CATEGORIES[r.category]}</td><td>{r.unit}</td><td className="text-right">{fmt(r.rate)}</td>
                {canManage && <><td className="text-right">{fmt(r.cost)}</td><td className={`text-right ${r.cost > r.rate ? "text-danger" : "text-gold"}`}>{r.rate ? Math.round(((r.rate - r.cost) / r.rate) * 100) : 0}%</td>
                  <td className="whitespace-nowrap text-right"><button onClick={() => setForm(r)} className="text-xs text-gold">Edit</button> <button disabled={pending} onClick={() => confirm(`Archive ${r.code}?`) && run(() => archiveRateAction(r.id))} className="text-xs text-danger">Archive</button></td></>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="py-3 text-muted">No items. {canManage ? "Add one above." : ""}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
