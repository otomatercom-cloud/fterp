"use client";
import { useState, useTransition } from "react";
import { saveCostingAction } from "@/app/(dashboard)/m/crm/actions";
import type { CostLine, Costing } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const cell = "h-9 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint";
const AV = [["", "Availability…"], ["in_stock", "In stock"], ["order", "Needs ordering"], ["unavailable", "Not available"]] as const;

export function CostingEditor({ leadId, data, editable }: { leadId: number; data: Costing; editable: boolean }) {
  const [lines, setLines] = useState<CostLine[]>(data.lines);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const upd = (i: number, p: Partial<CostLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const est = lines.reduce((a, l) => a + l.qty * l.est_price, 0);
  const cost = lines.reduce((a, l) => a + l.qty * l.unit_cost, 0);
  const margin = est - cost;
  const longest = Math.max(0, ...lines.map((l) => (l.availability === "in_stock" ? 0 : l.lead_days)));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Qty</th><th className="py-1 pr-2">Est. price</th><th className="py-1 pr-2">Availability</th><th className="py-1 pr-2">Lead days</th><th className="py-1 pr-2">Unit cost</th><th className="py-1 pr-2">Vendor</th><th className="py-1">Note</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="align-top">
                <td className="py-1 pr-2">{l.name}</td><td className="py-1 pr-2">{fmt(l.qty)}</td><td className="py-1 pr-2">{fmt(l.est_price)}</td>
                <td className="py-1 pr-2"><select aria-label="Availability" disabled={!editable} value={l.availability} onChange={(e) => upd(i, { availability: e.target.value as CostLine["availability"] })} className={cell}>{AV.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td>
                <td className="py-1 pr-2"><input aria-label="Lead days" type="number" min="0" disabled={!editable} value={l.lead_days} onChange={(e) => upd(i, { lead_days: Number(e.target.value) })} className={`${cell} w-16`} /></td>
                <td className="py-1 pr-2"><input aria-label="Unit cost" type="number" min="0" step="any" disabled={!editable} value={l.unit_cost} onChange={(e) => upd(i, { unit_cost: Number(e.target.value) })} className={`${cell} w-24`} /></td>
                <td className="py-1 pr-2"><input aria-label="Vendor" disabled={!editable} value={l.vendor} onChange={(e) => upd(i, { vendor: e.target.value })} className={`${cell} w-32`} /></td>
                <td className="py-1"><input aria-label="Note" disabled={!editable} value={l.note} onChange={(e) => upd(i, { note: e.target.value })} className={`${cell} w-36`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-md bg-tint p-3 text-sm">
        <p>Estimate (excl. tax): <strong>{fmt(est)}</strong> · Procurement cost: <strong>{fmt(cost)}</strong> · Longest lead time: <strong>{longest} days</strong></p>
        <p className={margin < 0 ? "font-medium text-danger" : "text-success"}>{margin < 0 ? `Cost is above the estimate by ${fmt(-margin)}` : `Margin ${fmt(margin)} (${est ? Math.round((margin / est) * 100) : 0}%)`}</p>
      </div>
      {editable && <>
        <button disabled={pending} onClick={() => start(async () => { const r = await saveCostingAction(leadId, lines); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Costing saved. Now confirm it from Next step." }); })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save costing"}</button>
        <p className="text-xs text-muted">Save first, then use <b>Confirm availability &amp; costing</b>. If an item is not available, use <b>Return to sales</b> so the estimate can be changed.</p>
      </>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
    </div>
  );
}
