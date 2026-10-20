"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveProcurementAction } from "@/app/(dashboard)/m/crm/actions";
import type { InvItem, ProcLine } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const cell = "h-10 min-w-0 rounded-md border border-line px-2 text-sm disabled:bg-tint";

export function ProcurementEditor({ leadId, initial, total, estimate, editable, items = [] }: { leadId: number; initial: ProcLine[]; total: number; estimate: number; editable: boolean; items?: InvItem[] }) {
  const byLabel = (v: string) => items.find((i) => `${i.code} · ${i.name}` === v);
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
            <input aria-label="Item" list="inv-items" disabled={!editable} value={l.name} onChange={(e) => { const it = byLabel(e.target.value); upd(i, it ? { name: it.name, item_id: it.id, vendor: l.vendor || it.best_vendor, price: l.price || it.best_price } : { name: e.target.value, item_id: items.find((x) => x.id === l.item_id)?.name === e.target.value ? l.item_id : 0 }); }} placeholder="Item (type or pick from inventory)" className={cell} />
            <input aria-label="Vendor" disabled={!editable} value={l.vendor} onChange={(e) => upd(i, { vendor: e.target.value })} placeholder="Vendor" className={cell} />
            <input aria-label="Quantity" type="number" min="0" step="any" disabled={!editable} value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} className={cell} />
            <input aria-label="Unit price" type="number" min="0" step="any" disabled={!editable} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} className={cell} />
            {editable && <button aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid size-9 place-items-center text-muted hover:text-danger disabled:opacity-40"><Trash2 className="size-4" /></button>}
          </div>
        ))}
        {editable && items.length > 0 && <datalist id="inv-items">{items.map((x) => <option key={x.id} value={`${x.code} · ${x.name}`} />)}</datalist>}
        {lines.map((l, i) => { const it = items.find((x) => x.id === l.item_id); if (!it) return null; return (
          <p key={`h${i}`} className="rounded bg-tint px-2 py-1 text-xs text-muted">
            <b className="text-ink">{it.name}</b>: last {it.last_price ? fmt(it.last_price) : "—"}{it.last_vendor ? ` (${it.last_vendor})` : ""} · best {it.best_price ? fmt(it.best_price) : "—"}{it.best_vendor ? ` (${it.best_vendor})` : ""} · in stock {fmt(it.on_hand)} {it.unit}
            {l.price > 0 && it.best_price > 0 && l.price > it.best_price * 1.0001 && <span className="ml-1 text-danger">· {fmt(((l.price - it.best_price) / it.best_price) * 100)}% above best</span>}
            {editable && it.best_price > 0 && <button type="button" onClick={() => upd(i, { vendor: it.best_vendor, price: it.best_price })} className="ml-2 text-gold underline">Use best</button>}
            {editable && it.vendors.length > 1 && it.vendors.map((v) => <button key={v.vendor} type="button" onClick={() => upd(i, { vendor: v.vendor, price: v.latest })} className="ml-2 underline">{v.vendor} {fmt(v.latest)}</button>)}
          </p>); })}
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
