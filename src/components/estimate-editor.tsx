"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveEstimateAction } from "@/app/(dashboard)/m/crm/actions";

type L = { name: string; qty: number; price: number };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function EstimateEditor({ leadId, initial, untaxed, tax, taxName, taxRate, editable }: { leadId: number; initial: L[]; untaxed: number; tax: number; taxName: string | false; taxRate: number; editable: boolean }) {
  const [lines, setLines] = useState<L[]>(initial.length ? initial : [{ name: "", qty: 1, price: 0 }]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const upd = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const preview = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const save = () => start(async () => {
    const r = await saveEstimateAction(leadId, lines);
    setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Estimate saved" });
  });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_7rem_2.25rem] items-center gap-2 max-sm:grid-cols-[1fr_4rem_5.5rem_2.25rem]">
            <input aria-label="Description" disabled={!editable} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item / work description" className="h-10 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            <input aria-label="Quantity" type="number" min="0" step="any" disabled={!editable} value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} className="h-10 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            <input aria-label="Unit price" type="number" min="0" step="any" disabled={!editable} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} className="h-10 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            {editable && <button aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="grid size-9 place-items-center text-muted hover:text-danger disabled:opacity-40"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editable ? <button onClick={() => setLines((ls) => [...ls, { name: "", qty: 1, price: 0 }])} className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm hover:bg-tint"><Plus className="size-4" />Add line</button> : <span />}
        <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-right text-sm">
          <dt className="text-muted">Subtotal</dt><dd>{fmt(editable ? preview : untaxed)}</dd>
          <dt className="text-muted">{taxName || "Tax"}</dt><dd>{fmt(editable ? (preview * taxRate) / 100 : tax)}</dd>
          <dt className="font-semibold">Total</dt><dd className="font-semibold">{fmt(editable ? preview * (1 + taxRate / 100) : untaxed + tax)}</dd>
        </dl>
      </div>
      {editable && <button onClick={save} disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save estimate"}</button>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
      {!editable && <p className="text-xs text-muted">Estimate is editable only at the Estimate draft stage. Tax is the company sales tax set in Odoo.</p>}
    </div>
  );
}
