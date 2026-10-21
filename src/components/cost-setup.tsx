"use client";
import { useState, useTransition } from "react";
import { archivePackageAction, archiveTradeAction, saveCostSettingsAction, savePackageAction, saveTradeAction } from "@/app/(dashboard)/m/boq/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { CostConfig, CostPkg } from "@/lib/odoo/leads";

const inp = "h-9 rounded-md border border-line px-2 text-sm";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
type PkgForm = { id?: number; code: string; name: string; category: string; unit: string; trade_id?: number; workers: number; days_per_unit: number; install_unit: number; items: { item_id: number; qty: number }[] };
const EMPTY: PkgForm = { code: "", name: "", category: "joinery", unit: "sqm", workers: 2, days_per_unit: 0, install_unit: 0, items: [] };

export function CostSetup({ cfg }: { cfg: CostConfig }) {
  const [err, setErr] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [pending, start] = useTransition();
  const [set, setSet] = useState({ m: cfg.margin, b: cfg.buffer, s: cfg.stale_days, v: cfg.valid_days });
  const [trade, setTrade] = useState<{ id?: number; name: string; rate: number }>({ name: "", rate: 0 });
  const [pkg, setPkg] = useState<PkgForm>(EMPTY);
  const run = (f: () => Promise<{ error?: string }>, done?: () => void, msg = "Saved") => start(async () => { const r = await f(); setErr(r.error); setOk(r.error ? undefined : msg); if (!r.error) done?.(); });
  const edit = (p: CostPkg) => setPkg({ id: p.id, code: p.code, name: p.name, category: p.category, unit: p.unit, trade_id: p.trade_id || undefined, workers: p.workers, days_per_unit: p.days_per_unit, install_unit: p.install_unit, items: p.items.map((i) => ({ item_id: i.item_id, qty: i.qty })) });
  const setItem = (i: number, p: Partial<{ item_id: number; qty: number }>) => setPkg((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">Pricing rules</h3>
        <div className="flex flex-wrap items-end gap-2">
          {([["m", "Default margin %"], ["b", "Material safety buffer %"], ["s", "Old-price warning (days)"], ["v", "Quote validity (days)"]] as const).map(([k, l]) => (
            <label key={k} className="flex flex-col gap-0.5 text-xs">{l}<input type="number" min="0" step="any" value={set[k]} onChange={(e) => setSet({ ...set, [k]: Number(e.target.value) })} className={`${inp} w-28`} /></label>
          ))}
          <button disabled={pending} onClick={() => run(() => saveCostSettingsAction(set.m, set.b, set.s, set.v))} className="h-9 rounded-md bg-primary px-4 text-white disabled:opacity-50">Save rules</button>
        </div>
        <p className="text-xs text-muted">Material price = latest inventory price + buffer. Selling price = (material + labour + installation) + margin.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">Labour trades (daily wage per labourer)</h3>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Trade name" placeholder="Trade" className={`${inp} w-48`} value={trade.name} onChange={(e) => setTrade({ ...trade, name: e.target.value })} />
          <input aria-label="Daily rate" type="number" min="0" step="any" placeholder="Daily rate" className={`${inp} w-28`} value={trade.rate} onChange={(e) => setTrade({ ...trade, rate: Number(e.target.value) })} />
          <button disabled={pending} onClick={() => run(() => saveTradeAction(trade), () => setTrade({ name: "", rate: 0 }))} className="h-9 rounded-md bg-primary px-4 text-white disabled:opacity-50">{trade.id ? "Update" : "Add trade"}</button>
        </div>
        <ul className="divide-y divide-line">{cfg.trades.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-1.5"><span>{t.name} · {fmt(t.rate)}/day</span>
            <span className="space-x-3 text-xs"><button onClick={() => setTrade({ id: t.id, name: t.name, rate: t.rate })} className="text-gold">Edit</button><button disabled={pending} onClick={() => confirm(`Archive ${t.name}?`) && run(() => archiveTradeAction(t.id))} className="text-danger">Archive</button></span></li>
        ))}</ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">Work packages (reusable material + labour + installation per 1 unit)</h3>
        <div className="space-y-2 rounded-md border border-line p-3">
          <div className="flex flex-wrap gap-2">
            <input aria-label="Code" placeholder="Code" className={`${inp} w-28`} value={pkg.code} onChange={(e) => setPkg({ ...pkg, code: e.target.value })} />
            <input aria-label="Name" placeholder="Package name (e.g. Wardrobe, laminate)" className={`${inp} min-w-0 flex-1`} value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} />
            <select aria-label="Category" className={inp} value={pkg.category} onChange={(e) => setPkg({ ...pkg, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input aria-label="Unit" placeholder="Unit" className={`${inp} w-16`} value={pkg.unit} onChange={(e) => setPkg({ ...pkg, unit: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs">Trade<select className={inp} value={pkg.trade_id ?? ""} onChange={(e) => setPkg({ ...pkg, trade_id: Number(e.target.value) || undefined })}><option value="">— none —</option>{cfg.trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="flex flex-col gap-0.5 text-xs">Labourers<input type="number" min="0" step="any" className={`${inp} w-24`} value={pkg.workers} onChange={(e) => setPkg({ ...pkg, workers: Number(e.target.value) })} /></label>
            <label className="flex flex-col gap-0.5 text-xs">Crew days per unit<input type="number" min="0" step="any" className={`${inp} w-28`} value={pkg.days_per_unit} onChange={(e) => setPkg({ ...pkg, days_per_unit: Number(e.target.value) })} /></label>
            <label className="flex flex-col gap-0.5 text-xs">Installation per unit<input type="number" min="0" step="any" className={`${inp} w-28`} value={pkg.install_unit} onChange={(e) => setPkg({ ...pkg, install_unit: Number(e.target.value) })} /></label>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted">Materials per 1 unit (priced from Inventory)</p>
            {pkg.items.map((x, i) => (
              <div key={i} className="flex gap-2">
                <select aria-label="Item" className={`${inp} min-w-0 flex-1`} value={x.item_id || ""} onChange={(e) => setItem(i, { item_id: Number(e.target.value) })}><option value="">Select item…</option>{cfg.items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name} ({it.unit})</option>)}</select>
                <input aria-label="Qty per unit" type="number" min="0" step="any" className={`${inp} w-24`} value={x.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
                <button onClick={() => setPkg({ ...pkg, items: pkg.items.filter((_, j) => j !== i) })} className="text-xs text-danger">Remove</button>
              </div>
            ))}
            <button onClick={() => setPkg({ ...pkg, items: [...pkg.items, { item_id: 0, qty: 1 }] })} className="text-xs text-gold">+ Add material</button>
          </div>
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => run(() => savePackageAction({ ...pkg, items: pkg.items.filter((x) => x.item_id) }), () => setPkg(EMPTY))} className="h-9 rounded-md bg-primary px-4 text-white disabled:opacity-50">{pkg.id ? "Update package" : "Save package"}</button>
            {pkg.id && <button onClick={() => setPkg(EMPTY)} className="text-xs text-muted">Cancel</button>}
          </div>
        </div>
        <ul className="divide-y divide-line">{cfg.packages.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span><b className="font-mono text-xs">{p.code}</b> {p.name} <span className="text-xs text-muted">· per {p.unit} · {p.items.length} materials · {p.workers} labourers × {p.days_per_unit} d · install {fmt(p.install_unit)}</span></span>
            <span className="space-x-3 text-xs"><button onClick={() => edit(p)} className="text-gold">Edit</button><button disabled={pending} onClick={() => confirm(`Archive ${p.name}?`) && run(() => archivePackageAction(p.id))} className="text-danger">Archive</button></span>
          </li>
        ))}</ul>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {ok && !err && <p role="status" className="text-xs text-success">{ok}</p>}
    </div>
  );
}
