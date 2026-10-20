"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addPriceAction, archiveItemAction, saveItemAction, stockMoveAction } from "@/app/(dashboard)/m/inventory/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import { PriceChart } from "@/components/charts";
import type { InvDetail, InvItem } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";
const COLORS = ["#e8bf7e", "#d98fa0", "#7fd1e8", "#8fd4b0", "#c48a6a", "#b5a3a8"];

export function InventoryList({ items, canEdit }: { items: InvItem[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [low, setLow] = useState(false);
  const [f, setF] = useState({ code: "", name: "", category: "joinery", unit: "nos", min: "" });
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const rows = useMemo(() => items.filter((i) => (!cat || i.category === cat) && (!low || i.low) && (`${i.code} ${i.name}`.toLowerCase().includes(q.toLowerCase()))), [items, q, cat, low]);
  const lowCount = items.filter((i) => i.low).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {([["Items", String(items.length), "glow-gold"], ["Low stock", String(lowCount), "glow-rose"], ["With price history", String(items.filter((i) => i.vendors.length).length), "glow-bronze"]] as const).map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}
      </div>
      {canEdit && (
        <section className="glass space-y-2 p-5">
          <h2 className="text-sm font-semibold">Add item</h2>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Code" placeholder="Code" className={`${inp} w-28`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            <input aria-label="Name" placeholder="Item name" className={`${inp} min-w-0 flex-1`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select aria-label="Category" className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input aria-label="Unit" placeholder="Unit" className={`${inp} w-20`} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
            <input aria-label="Reorder level" type="number" min="0" step="any" placeholder="Reorder level" className={`${inp} w-32`} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
            <button disabled={pending || !f.code.trim() || !f.name.trim()} onClick={() => start(async () => { const r = await saveItemAction(0, f.code, f.name, f.category, f.unit, Number(f.min || 0), ""); setErr(r.error); if (!r.error) setF({ ...f, code: "", name: "", min: "" }); })} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Add</button>
          </div>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        </section>
      )}
      <section className="glass space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search" placeholder="Search code or name" className={`${inp} min-w-0 flex-1`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Category filter" className={inp} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only</label>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted">No items found.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Code</th><th>Item</th><th>Category</th><th className="text-right">On hand</th><th className="text-right">Last price</th><th>Best vendor</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((i) => (
              <tr key={i.id}>
                <td className="py-2 text-xs text-muted">{i.code}</td>
                <td><Link href={`/m/inventory/${i.id}`} className="font-medium hover:underline">{i.name}</Link></td>
                <td className="text-xs text-muted">{CATEGORIES[i.category] ?? i.category}</td>
                <td className={`text-right ${i.low ? "font-semibold text-danger" : ""}`}>{fmt(i.on_hand)} {i.unit}{i.low ? " ⚠" : ""}</td>
                <td className="text-right">{i.last_price ? fmt(i.last_price) : "—"}</td>
                <td className="text-xs">{i.best_vendor ? <>{i.best_vendor} <b className="text-success">{fmt(i.best_price)}</b></> : "—"}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

const SRC: Record<string, string> = { manual: "Manual", procurement: "Procurement", po: "Purchase order" };
const KIND: Record<string, string> = { in: "Received", out: "Issued", adjust: "Count adj." };

export function ItemDetail({ d, leads }: { d: InvDetail; leads: { id: number; name: string }[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [pf, setPf] = useState({ vendor: "", price: "", date: today, note: "" });
  const [sf, setSf] = useState({ kind: "out", qty: "", note: "", lead: 0 });
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: () => void) => start(async () => { const r = await fn(); setErr(r.error); if (!r.error) ok?.(); });
  const chart = useMemo(() => {
    const dates = [...new Set(d.history.map((h) => h.date))].sort();
    const vendors = [...new Set(d.history.map((h) => h.vendor.toLowerCase()))];
    const series = vendors.slice(0, 6).map((v, vi) => {
      let last = 0;
      const vals = dates.map((dt) => { const hit = d.history.filter((h) => h.vendor.toLowerCase() === v && h.date === dt).sort((a, b) => b.id - a.id)[0]; if (hit) last = hit.price; return last; });
      return { name: d.history.find((h) => h.vendor.toLowerCase() === v)?.vendor ?? v, color: COLORS[vi % COLORS.length], values: vals };
    });
    return { dates, series };
  }, [d.history]);
  const best = d.stats[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-semibold">{d.name}</h1><p className="text-xs text-muted">{d.code} · {CATEGORIES[d.category] ?? d.category} · unit {d.unit}</p></div>
        {d.can_edit && <button disabled={pending} onClick={() => confirm("Archive this item? Its history is kept.") && run(() => archiveItemAction(d.id))} className="rounded border border-line px-3 py-1 text-xs text-muted">Archive</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["On hand", `${fmt(d.on_hand)} ${d.unit}`, d.low ? "glow-rose" : "glow-gold"], ["Reorder level", d.min_qty ? fmt(d.min_qty) : "—", "glow-bronze"], ["Best price now", best ? fmt(best.latest) : "—", "glow-gold"], ["Best vendor", best?.vendor ?? "—", "glow-rose"]] as const).map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 truncate text-xl font-semibold">{v}</p></div>)}
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <section className="glass space-y-3 p-5">
        <h2 className="font-semibold">Vendor comparison <span className="text-xs font-normal text-muted">(latest quote per vendor)</span></h2>
        {d.stats.length === 0 ? <p className="text-sm text-muted">No prices yet. Add a quote below; prices saved in Procurement and confirmed purchase orders are added automatically.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Vendor</th><th className="text-right">Latest</th><th className="text-right">vs best</th><th className="text-right">Average</th><th className="text-right">Min</th><th className="text-right">Max</th><th className="text-right">Trend</th><th className="text-right">Quotes</th></tr></thead>
            <tbody className="divide-y divide-line">{d.stats.map((s, i) => (
              <tr key={s.vendor}><td className="py-2">{s.vendor}{i === 0 && <span className="ml-2 rounded-full border border-success/50 px-2 text-[10px] text-success">Best</span>}<span className="block text-[10px] text-muted">{s.latest_date}</span></td>
                <td className="text-right font-semibold">{fmt(s.latest)}</td><td className={`text-right ${s.vs_best > 0 ? "text-danger" : "text-success"}`}>{s.vs_best > 0 ? `+${s.vs_best}%` : "—"}</td>
                <td className="text-right">{fmt(s.avg)}</td><td className="text-right">{fmt(s.min)}</td><td className="text-right">{fmt(s.max)}</td>
                <td className={`text-right ${s.trend > 0 ? "text-danger" : s.trend < 0 ? "text-success" : "text-muted"}`}>{s.trend > 0 ? "▲" : s.trend < 0 ? "▼" : "•"} {Math.abs(s.trend)}%</td><td className="text-right">{s.count}</td></tr>
            ))}</tbody></table></div>
        )}
        <div><h3 className="mb-1 text-sm font-semibold">Price trend</h3><PriceChart dates={chart.dates} series={chart.series} />
          <div className="flex flex-wrap gap-3 text-xs text-muted">{chart.series.map((s) => <span key={s.name}><i className="mr-1 inline-block size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}</div></div>
        {d.can_edit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted">Add quote</span>
            <input aria-label="Vendor" list="vendors" placeholder="Vendor" className={`${inp} w-44`} value={pf.vendor} onChange={(e) => setPf({ ...pf, vendor: e.target.value })} /><datalist id="vendors">{d.stats.map((s) => <option key={s.vendor} value={s.vendor} />)}</datalist>
            <input aria-label="Price" type="number" min="0" step="any" placeholder="Unit price" className={`${inp} w-28`} value={pf.price} onChange={(e) => setPf({ ...pf, price: e.target.value })} />
            <input aria-label="Quote date" type="date" max={today} className={inp} value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} />
            <input aria-label="Note" placeholder="Note (optional)" className={`${inp} min-w-0 flex-1`} value={pf.note} onChange={(e) => setPf({ ...pf, note: e.target.value })} />
            <button disabled={pending || !pf.vendor.trim() || !Number(pf.price)} onClick={() => run(() => addPriceAction(d.id, pf.vendor, Number(pf.price), pf.date, pf.note), () => setPf({ ...pf, price: "", note: "" }))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Save quote</button>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass space-y-2 p-5">
          <h2 className="font-semibold">Quote history</h2>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">{d.history.length === 0 && <li className="py-2 text-muted">No quotes yet.</li>}
            {d.history.map((h) => <li key={h.id} className="py-1.5"><b>{fmt(h.price)}</b> · {h.vendor} <span className="text-xs text-muted">· {h.date} · {SRC[h.source] ?? h.source}{h.project ? ` · ${h.project}` : ""}{h.note ? ` · ${h.note}` : ""}</span></li>)}</ul>
        </section>
        <section className="glass space-y-2 p-5">
          <h2 className="font-semibold">Stock</h2>
          {d.can_issue && (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Movement" className={inp} value={sf.kind} onChange={(e) => setSf({ ...sf, kind: e.target.value })}><option value="out">Issue to project</option>{d.can_edit && <><option value="in">Add stock</option><option value="adjust">Set counted qty</option></>}</select>
              <input aria-label="Quantity" type="number" min="0" step="any" placeholder={sf.kind === "adjust" ? "Counted qty" : "Qty"} className={`${inp} w-28`} value={sf.qty} onChange={(e) => setSf({ ...sf, qty: e.target.value })} />
              {sf.kind === "out" && <select aria-label="Project" className={`${inp} max-w-44`} value={sf.lead} onChange={(e) => setSf({ ...sf, lead: Number(e.target.value) })}><option value={0}>Project (optional)</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
              <input aria-label="Note" placeholder={sf.kind === "adjust" ? "Reason (required)" : "Note"} className={`${inp} min-w-0 flex-1`} value={sf.note} onChange={(e) => setSf({ ...sf, note: e.target.value })} />
              <button disabled={pending || sf.qty === ""} onClick={() => run(() => stockMoveAction(d.id, sf.kind, Number(sf.qty), sf.note, sf.lead), () => setSf({ ...sf, qty: "", note: "" }))} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Save</button>
            </div>
          )}
          <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">{d.ledger.length === 0 && <li className="py-2 text-muted">No stock movements.</li>}
            {d.ledger.map((m) => <li key={m.id} className="py-1.5"><b className={m.qty < 0 ? "text-danger" : "text-success"}>{m.qty > 0 ? "+" : ""}{fmt(m.qty)}</b> {KIND[m.kind]} <span className="text-xs text-muted">· {m.date}{m.project ? ` · ${m.project}` : ""}{m.po ? ` · ${m.po}` : ""}{m.note ? ` · ${m.note}` : ""} · {m.user}</span></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
