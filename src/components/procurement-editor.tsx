"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveProcurementAction } from "@/app/(dashboard)/m/crm/actions";
import type { ProcLine } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const cell = "h-10 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint";

export function ProcurementEditor({ leadId, initial, total, estimate, editable }: { leadId: number; initial: ProcLine[]; total: number; estimate: number; editable: boolean }) {
  const [lines, setLines] = useState<ProcLine[]>(initial.length ? initial : [{ name: "", vendor: "", qty: 1, price: 0 }]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const upd = (i: number, p: Partial<ProcLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const preview = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const shown = editable ? preview : total;
  const diff = shown - estimate;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_4.5rem_6.5rem_2.25rem] items-center gap-2 max-sm:grid-cols-[1fr_5.5rem_3.5rem_5rem_2rem]">
            <input aria-label="Item" disabled={!editable} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item" className={cell} />
            <input aria-label="Vendor" disabled={!editable} value={l.vendor} onChange={(e) => upd(i, { vendor: e.target.value })} placeholder="Vendor" className={cell} />
            <input aria-label="Quantity" type="number" min="0" step="any" disabled={!editable} value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} className={cell} />
            <input aria-label="Unit price" type="number" min="0" step="any" disabled={!editable} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} className={cell} />
            {editable && <button aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid size-9 place-items-center text-muted hover:text-danger disabled:opacity-40"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      {editable && <button onClick={() => setLines((ls) => [...ls, { name: "", vendor: "", qty: 1, price: 0 }])} className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm hover:bg-tint"><Plus className="size-4" />Add line</button>}
      <div className="rounded-md bg-tint p-3 text-sm">
        <p>Approved estimate: <strong>{fmt(estimate)}</strong> · Procurement {editable ? "(preview)" : ""}: <strong>{fmt(shown)}</strong></p>
        <p className={diff > 0 ? "font-medium text-danger" : "text-success"}>{diff > 0 ? `Over estimate by ${fmt(diff)} — Manager approval required` : `Within estimate (${fmt(-diff)} under)`}</p>
      </div>
      {editable && <button disabled={pending} onClick={() => start(async () => { const r = await saveProcurementAction(leadId, lines); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Prices saved" }); })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save prices"}</button>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
    </div>
  );
}
