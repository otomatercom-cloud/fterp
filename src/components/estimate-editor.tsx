"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { saveEstimateAction } from "@/app/(dashboard)/m/crm/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { Rate } from "@/lib/odoo/leads";

type L = { name: string; qty: number; price: number; category: string; unit: string };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function EstimateEditor({ leadId, initial, untaxed, tax, taxName, taxRate, editable, rates = [] }: { leadId: number; rates?: Rate[]; initial: L[]; untaxed: number; tax: number; taxName: string | false; taxRate: number; editable: boolean }) {
  const [lines, setLines] = useState<L[]>(initial.length ? initial : [{ name: "", qty: 1, price: 0, category: "other", unit: "" }]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const upd = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const [pick, setPick] = useState("");
  const [imp, setImp] = useState<L[]>();
  const [busy, setBusy] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true); setMsg(undefined);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/boq-import", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Upload failed" }));
    setBusy(false);
    if (r.error) setMsg({ ok: false, t: r.error }); else setImp(r.lines);
  };
  const applyImp = (replace: boolean) => { if (imp) setLines((ls) => [...(replace ? [] : ls.filter((l) => l.name.trim() || l.price)), ...imp]); setImp(undefined); setMsg({ ok: true, t: "Lines added — review, then Save estimate." }); };
  const addRate = (id: number) => { const r = rates.find((x) => x.id === id); if (r) setLines((ls) => [...ls.filter((l) => l.name.trim() || l.price), { name: r.name, qty: 1, price: r.rate, category: r.category, unit: r.unit }]); setPick(""); };
  const byCat = lines.reduce<Record<string, number>>((a, l) => ({ ...a, [l.category]: (a[l.category] ?? 0) + l.qty * l.price }), {});
  const preview = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const save = () => start(async () => {
    const r = await saveEstimateAction(leadId, lines);
    setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Estimate saved" });
  });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input aria-label="Description" disabled={!editable} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item / work description" className="h-10 min-w-0 flex-1 basis-48 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            <select aria-label="Category" disabled={!editable} value={l.category} onChange={(e) => upd(i, { category: e.target.value })} className="h-10 rounded-md border border-line px-1 text-xs disabled:bg-tint">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input aria-label="Quantity" type="number" min="0" step="any" disabled={!editable} value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} className="h-10 w-16 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            <input aria-label="Unit" disabled={!editable} value={l.unit} onChange={(e) => upd(i, { unit: e.target.value })} placeholder="unit" className="h-10 w-14 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            <input aria-label="Unit price" type="number" min="0" step="any" disabled={!editable} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} className="h-10 w-28 rounded-md border border-line px-2 text-sm disabled:bg-tint" />
            {editable && <button aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="grid size-9 place-items-center text-muted hover:text-danger disabled:opacity-40"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editable && rates.length > 0 && <select aria-label="Add from rate library" value={pick} onChange={(e) => addRate(Number(e.target.value))} className="h-9 max-w-56 rounded-md border border-gold/50 px-2 text-sm text-gold"><option value="">+ From rate library…</option>{Object.entries(CATEGORIES).map(([k, v]) => <optgroup key={k} label={v}>{rates.filter((r) => r.category === k).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name} ({r.unit} {fmt(r.rate)})</option>)}</optgroup>)}</select>}
        {editable ? <button onClick={() => setLines((ls) => [...ls, { name: "", qty: 1, price: 0, category: "other", unit: "" }])} className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm hover:bg-tint"><Plus className="size-4" />Add line</button> : <span />}
        <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-right text-sm">
          <dt className="text-muted">Subtotal</dt><dd>{fmt(editable ? preview : untaxed)}</dd>
          <dt className="text-muted">{taxName || "Tax"}</dt><dd>{fmt(editable ? (preview * taxRate) / 100 : tax)}</dd>
          <dt className="font-semibold">Total</dt><dd className="font-semibold">{fmt(editable ? preview * (1 + taxRate / 100) : untaxed + tax)}</dd>
        </dl>
      </div>
      {editable && (
        <div className="rounded-md border border-dashed border-line p-3 text-sm">
          <label className="flex cursor-pointer flex-wrap items-center gap-2 text-gold"><Upload className="size-4" /> {busy ? "Reading file…" : "Import BOQ from Excel / CSV / PDF"}
            <input type="file" accept=".xlsx,.csv,.pdf" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <p className="mt-1 text-xs text-muted">Columns: Description, Qty, Unit, Rate (Category optional). You can check the lines before they are added.</p>
          {imp && (
            <div className="mt-2 space-y-2">
              <p className="text-xs">{imp.length} lines found — total {fmt(imp.reduce((a, l) => a + l.qty * l.price, 0))}</p>
              <ul className="max-h-48 overflow-auto text-xs">{imp.map((l, i) => <li key={i} className="flex justify-between gap-2 border-b border-line py-0.5"><span className="truncate">{l.name}</span><span className="shrink-0 text-muted">{l.qty} {l.unit} × {fmt(l.price)}</span></li>)}</ul>
              <div className="flex gap-2">
                <button onClick={() => applyImp(false)} className="h-8 rounded-md bg-primary px-3 text-white">Add to estimate</button>
                <button onClick={() => applyImp(true)} className="h-8 rounded-md border border-line px-3">Replace all</button>
                <button onClick={() => setImp(undefined)} className="h-8 px-3 text-muted">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {Object.keys(byCat).length > 1 && <p className="text-xs text-muted">By category: {Object.entries(byCat).map(([k, v]) => `${CATEGORIES[k] ?? k} ${fmt(v)}`).join(" · ")}</p>}
      {editable && <button onClick={save} disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save estimate"}</button>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
      {!editable && <p className="text-xs text-muted">Estimate is editable only at the Estimate draft stage. Tax is the company sales tax set in Odoo.</p>}
    </div>
  );
}
