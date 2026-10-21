"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { costCalcAction, priceCheckAction, priceRefreshAction, saveEstimateAction, validUntilAction } from "@/app/(dashboard)/m/crm/actions";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { BoqCost, CostConfig, CostSummary, EstLine, PriceChange, Rate } from "@/lib/odoo/leads";

type L = { ref?: number; name: string; qty: number; price: number; category: string; unit: string; cost?: BoqCost };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const blank = (): L => ({ name: "", qty: 1, price: 0, category: "other", unit: "" });
const inp = "h-9 rounded-md border border-line px-2 text-sm disabled:bg-tint";

type Props = { leadId: number; rates?: Rate[]; initial: EstLine[]; untaxed: number; tax: number; taxName: string | false; taxRate: number; editable: boolean; cfg?: CostConfig | null; summary?: CostSummary; validUntil?: string | false; expired?: boolean; canValidity?: boolean };

export function EstimateEditor({ leadId, initial, untaxed, tax, taxName, taxRate, editable, rates = [], cfg = null, summary, validUntil = false, expired = false, canValidity = false }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<L[]>(initial.length ? initial.map((l) => ({ ref: l.ref, name: l.name, qty: l.qty, price: l.price, category: l.category, unit: l.unit, cost: l.cost })) : [blank()]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [stale, setStale] = useState<Record<number, boolean>>({});
  const [imp, setImp] = useState<L[]>();
  const [busy, setBusy] = useState(false);
  const [chk, setChk] = useState<PriceChange[]>();
  const full = !!cfg?.can_cost;
  const upd = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const updCost = (i: number, p: Partial<BoqCost>) => setLines((ls) => ls.map((l, j) => (j === i && l.cost ? { ...l, cost: { ...l.cost, ...p } } : l)));
  const add = (l: L) => setLines((ls) => [...ls.filter((x) => x.name.trim() || x.price || x.cost), l]);
  const pkgOf = (l: L) => cfg?.packages.find((p) => p.id === l.cost?.pkg_id);

  const payload = () => lines.filter((l) => l.name.trim()).map((l) => ({
    ref: l.ref, name: l.name, qty: l.qty, price: l.cost ? 0 : l.price, category: l.category, unit: l.unit,
    cost: l.cost ? { item_id: l.cost.item_id || false, pkg_id: l.cost.pkg_id || false, trade_id: l.cost.trade_id || false, workers: l.cost.workers, days: l.cost.days, inst: l.cost.inst,
      ...(full && !l.cost.item_id && !l.cost.pkg_id && l.cost.mat !== undefined ? { mat: l.cost.mat } : {}), ...(full && l.cost.margin !== undefined ? { margin: l.cost.margin } : {}) } : undefined,
  }));

  // live price calculation (server is authoritative; Save recalculates again)
  const sig = JSON.stringify(lines.filter((l) => l.cost).map((l) => [l.name, l.qty, l.cost?.item_id, l.cost?.pkg_id, l.cost?.trade_id, l.cost?.workers, l.cost?.days, l.cost?.inst, l.cost?.mat, l.cost?.margin]));
  const seq = useRef(0);
  useEffect(() => {
    if (!editable || !cfg || !lines.some((l) => l.cost && l.name.trim())) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const send = payload();
      const r = await costCalcAction(leadId, send);
      if (my !== seq.current) return;
      if (r.error) { setMsg({ ok: false, t: r.error }); return; }
      setMsg(undefined);
      let k = 0; const st: Record<number, boolean> = {};
      setLines((ls) => ls.map((l, idx) => {
        if (!l.name.trim()) return l;
        const info = r.info?.[k++];
        if (!l.cost || !info) return l;
        st[idx] = info.stale;
        return { ...l, price: info.price, cost: { ...l.cost, ...(info.mat !== undefined ? { mat: info.mat, margin: info.margin, wage: info.wage } : {}), price_date: info.price_date } };
      }));
      setStale(st);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const byCat = lines.reduce<Record<string, number>>((a, l) => ({ ...a, [l.category]: (a[l.category] ?? 0) + l.qty * l.price }), {});
  const preview = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const save = () => start(async () => {
    const r = await saveEstimateAction(leadId, payload());
    if (r.error) setMsg({ ok: false, t: r.error }); else { setMsg({ ok: true, t: "Estimate saved" }); router.refresh(); }
  });
  const check = () => start(async () => { const r = await priceCheckAction(leadId); if (r.error) setMsg({ ok: false, t: r.error }); else { setChk(r.rows); setMsg(undefined); } });
  const refresh = () => start(async () => { const r = await priceRefreshAction(leadId); setChk(undefined); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Prices refreshed from inventory" }); if (!r.error) router.refresh(); });

  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true); setMsg(undefined);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/boq-import", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Upload failed" }));
    setBusy(false);
    if (r.error) setMsg({ ok: false, t: r.error }); else setImp(r.lines);
  };
  const applyImp = (replace: boolean) => { if (imp) setLines((ls) => [...(replace ? [] : ls.filter((l) => l.name.trim() || l.price)), ...imp]); setImp(undefined); setMsg({ ok: true, t: "Lines added — review, then Save estimate." }); };
  const exportCsv = () => {
    const q = (v: unknown) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
    const body = ["Description,Qty,Unit,Rate,Category,Amount", ...lines.filter((l) => l.name.trim()).map((l) => [l.name, l.qty, l.unit, l.price, l.category, l.qty * l.price].map(q).join(","))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv" })); a.download = `estimate-${leadId}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const [pick, setPick] = useState("");
  const addPick = (kind: "rate" | "item" | "pkg", id: number) => {
    if (kind === "rate") { const r = rates.find((x) => x.id === id); if (r) add({ name: r.name, qty: 1, price: r.rate, category: r.category, unit: r.unit }); }
    if (kind === "item") { const it = cfg?.items.find((x) => x.id === id); if (it) add({ name: it.name, qty: 1, price: 0, category: it.category, unit: it.unit, cost: { item_id: it.id, workers: 0, days: 0, inst: 0 } }); }
    if (kind === "pkg") { const p = cfg?.packages.find((x) => x.id === id); if (p) add({ name: p.name, qty: 1, price: 0, category: p.category, unit: p.unit, cost: { pkg_id: p.id, trade_id: p.trade_id || false, workers: p.workers, days: p.days_per_unit, inst: p.install_unit } }); }
    setPick("");
  };
  const setQty = (i: number, qty: number) => {
    const l = lines[i], p = pkgOf(l);
    if (p && l.cost && p.days_per_unit > 0) upd(i, { qty, cost: { ...l.cost, days: Math.round(p.days_per_unit * qty * 10) / 10 } });
    else upd(i, { qty });
  };

  return (
    <div className="space-y-3">
      {(validUntil || canValidity) && (
        <div className={`flex flex-wrap items-center gap-2 text-xs ${expired ? "text-danger" : "text-muted"}`}>
          {expired && <AlertTriangle className="size-4" />}
          <span>{expired ? "Quote expired — prices may have changed. Refresh prices and update the date." : "Quote valid until"}</span>
          {canValidity ? <input aria-label="Valid until" type="date" defaultValue={validUntil || ""} onBlur={(e) => e.target.value && e.target.value !== validUntil && validUntilAction(leadId, e.target.value).then((r) => r.error && setMsg({ ok: false, t: r.error }))} className={`${inp} h-8`} /> : <b>{validUntil}</b>}
        </div>
      )}
      <div className="space-y-2">
        {lines.map((l, i) => {
          const c = l.cost, isOpen = open[i], t = c ? cfg?.trades.find((x) => x.id === c.trade_id) : undefined;
          const manual = !!c && !c.item_id && !c.pkg_id;
          return (
            <div key={i} className={`rounded-md ${c ? "border border-line/60 bg-tint/30 p-2" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                {c && <button aria-label="Toggle cost details" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} className="text-muted">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>}
                <input aria-label="Description" disabled={!editable} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item / work description" className={`${inp} h-10 min-w-0 flex-1 basis-48`} />
                <select aria-label="Category" disabled={!editable} value={l.category} onChange={(e) => upd(i, { category: e.target.value })} className={`${inp} h-10 px-1 text-xs`}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input aria-label="Quantity" type="number" min="0" step="any" disabled={!editable} value={l.qty} onChange={(e) => setQty(i, Number(e.target.value))} className={`${inp} h-10 w-16`} />
                <input aria-label="Unit" disabled={!editable} value={l.unit} onChange={(e) => upd(i, { unit: e.target.value })} placeholder="unit" className={`${inp} h-10 w-14`} />
                <input aria-label="Unit price" type="number" min="0" step="any" disabled={!editable || !!c} title={c ? "Calculated from material + labour + installation" : undefined} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} className={`${inp} h-10 w-28`} />
                {stale[i] || c?.stale ? <span title="Material price is old — check with vendor" className="text-gold"><AlertTriangle className="size-4" /></span> : null}
                {editable && <button aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="grid size-9 place-items-center text-muted hover:text-danger disabled:opacity-40"><Trash2 className="size-4" /></button>}
              </div>
              {c && isOpen && (
                <div className="mt-2 grid gap-2 pl-6 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-0.5">Material source
                    <span className="flex h-9 items-center text-sm text-muted">{c.item_id ? cfg?.items.find((x) => x.id === c.item_id)?.name : c.pkg_id ? `Package: ${pkgOf(l)?.name ?? ""}` : "Manual"}{c.price_date ? ` · price of ${c.price_date}` : ""}</span></label>
                  {full && <label className="flex flex-col gap-0.5">Material cost / unit{manual ? "" : " (locked)"}<input type="number" min="0" step="any" disabled={!editable || !manual} value={c.mat ?? 0} onChange={(e) => updCost(i, { mat: Number(e.target.value) })} className={inp} /></label>}
                  <label className="flex flex-col gap-0.5">Labour trade<select disabled={!editable} value={c.trade_id || ""} onChange={(e) => updCost(i, { trade_id: Number(e.target.value) || false })} className={inp}><option value="">— none —</option>{cfg?.trades.map((x) => <option key={x.id} value={x.id}>{x.name}{full ? ` (${fmt(x.rate)}/day)` : ""}</option>)}</select></label>
                  <label className="flex flex-col gap-0.5">Labourers<input type="number" min="0" step="any" disabled={!editable} value={c.workers} onChange={(e) => updCost(i, { workers: Number(e.target.value) })} className={inp} /></label>
                  <label className="flex flex-col gap-0.5">Days<input type="number" min="0" step="any" disabled={!editable} value={c.days} onChange={(e) => updCost(i, { days: Number(e.target.value) })} className={inp} /></label>
                  <label className="flex flex-col gap-0.5">Installation / unit<input type="number" min="0" step="any" disabled={!editable} value={c.inst} onChange={(e) => updCost(i, { inst: Number(e.target.value) })} className={inp} /></label>
                  {full && <label className="flex flex-col gap-0.5">Margin %<input type="number" min="0" max="500" step="any" disabled={!editable} value={c.margin ?? cfg?.margin ?? 0} onChange={(e) => updCost(i, { margin: Number(e.target.value) })} className={inp} /></label>}
                  <p className="flex items-end pb-2 text-muted">Man-days: <b className="ml-1 text-fg">{fmt(c.workers * c.days)}</b>{t ? ` ${t.name}` : ""}{full && t ? ` · labour ${fmt(c.workers * c.days * (c.wage ?? t.rate))}` : ""}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setLines((ls) => [...ls, blank()])} className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm hover:bg-tint"><Plus className="size-4" /> Line</button>
          {rates.length > 0 && <select aria-label="Add from rate library" value={pick} onChange={(e) => addPick("rate", Number(e.target.value))} className={`${inp} max-w-48 border-gold/50 text-gold`}><option value="">+ Rate library…</option>{rates.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name} ({fmt(r.rate)}/{r.unit})</option>)}</select>}
          {cfg && cfg.items.length > 0 && <select aria-label="Add inventory item" value={pick} onChange={(e) => addPick("item", Number(e.target.value))} className={`${inp} max-w-48 border-gold/50 text-gold`}><option value="">+ Inventory item…</option>{cfg.items.map((x) => <option key={x.id} value={x.id} disabled={!x.has_price}>{x.code} · {x.name}{x.has_price ? "" : " (no price)"}</option>)}</select>}
          {cfg && cfg.packages.length > 0 && <select aria-label="Add work package" value={pick} onChange={(e) => addPick("pkg", Number(e.target.value))} className={`${inp} max-w-48 border-gold/50 text-gold`}><option value="">+ Work package…</option>{cfg.packages.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name} ({x.unit})</option>)}</select>}
        </div>
      )}
      <dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-right text-sm">
        <dt className="text-muted">Subtotal</dt><dd>{fmt(editable ? preview : untaxed)}</dd>
        <dt className="text-muted">{taxName || "Tax"}</dt><dd>{fmt(editable ? (preview * taxRate) / 100 : tax)}</dd>
        <dt className="font-semibold">Total</dt><dd className="font-semibold">{fmt(editable ? preview * (1 + taxRate / 100) : untaxed + tax)}</dd>
      </dl>

      {summary?.has_cost && (
        <div className="rounded-md border border-line p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Project cost summary</p>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <p>Total man-days: <b>{fmt(summary.mandays)}</b> · largest crew <b>{fmt(summary.max_crew)}</b></p>
            <p className="text-xs text-muted">{summary.trades.map((x) => `${x.trade} ${fmt(x.mandays)}d`).join(" · ")}</p>
            {summary.cost !== undefined && (
              <>
                <p>Material <b>{fmt(summary.material ?? 0)}</b> · Labour <b>{fmt(summary.labour ?? 0)}</b> · Installation <b>{fmt(summary.installation ?? 0)}</b></p>
                <p>Cost <b>{fmt(summary.cost)}</b> → Selling (excl. tax) <b>{fmt(summary.revenue ?? 0)}</b> · Profit <b className={(summary.profit ?? 0) < 0 ? "text-danger" : "text-success"}>{fmt(summary.profit ?? 0)} ({summary.profit_pct}%)</b></p>
                {(summary.actual_material ?? 0) > 0 && <p className={`sm:col-span-2 ${(summary.actual_material ?? 0) > (summary.material ?? 0) ? "text-danger" : "text-success"}`}>Material quoted {fmt(summary.material ?? 0)} vs actual procurement {fmt(summary.actual_material ?? 0)}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {editable && cfg && lines.some((l) => l.cost) && (
        <div className="space-y-2">
          <button onClick={check} disabled={pending} className="flex h-8 items-center gap-1.5 text-xs text-gold"><RefreshCw className="size-3.5" /> Check inventory prices</button>
          {chk && (
            <div className="rounded-md border border-line p-3 text-xs">
              {chk.length === 0 ? <p>No cost-built lines.</p> : (
                <table className="w-full"><thead className="text-muted"><tr><th className="text-left">Line</th>{full && <th className="text-right">Material</th>}<th className="text-right">Price now</th><th className="text-right">After refresh</th><th className="text-right">Change</th></tr></thead>
                  <tbody>{chk.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1">{r.name}{r.stale ? " ⚠ old price" : ""}{r.error ? <span className="text-danger"> {r.error}</span> : null}</td>
                    {full && <td className="text-right">{r.old_mat !== undefined ? `${fmt(r.old_mat)} → ${fmt(r.new_mat ?? 0)}` : ""}</td>}
                    <td className="text-right">{r.old_price !== undefined ? fmt(r.old_price) : ""}</td><td className="text-right">{r.new_price !== undefined ? fmt(r.new_price) : ""}</td><td className={`text-right ${(r.pct ?? 0) > 0 ? "text-danger" : "text-success"}`}>{r.pct !== undefined ? `${r.pct > 0 ? "+" : ""}${r.pct}%` : ""}</td></tr>)}</tbody></table>
              )}
              <div className="mt-2 flex gap-2"><button onClick={refresh} disabled={pending} className="h-8 rounded-md bg-primary px-3 text-white">Apply refresh (saves a revision)</button><button onClick={() => setChk(undefined)} className="px-2 text-muted">Close</button></div>
            </div>
          )}
        </div>
      )}

      {editable && (
        <div className="rounded-md border border-dashed border-line p-3 text-sm">
          <label className="flex cursor-pointer flex-wrap items-center gap-2 text-gold"><Upload className="size-4" /> {busy ? "Reading file…" : "Import BOQ from Excel / CSV / PDF"}
            <input type="file" accept=".xlsx,.csv,.pdf" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <p className="mt-1 text-xs text-muted">Columns: Description, Qty, Unit, Rate (Category optional). <a className="text-gold underline" href="/samples/boq-sample.csv" download>Sample file</a> · Check the lines before they are added.</p>
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
      <button onClick={exportCsv} className="flex h-8 items-center gap-1 text-xs text-muted hover:text-gold"><Download className="size-3.5" /> Export estimate (Excel/CSV)</button>
      {Object.keys(byCat).length > 1 && <p className="text-xs text-muted">By category: {Object.entries(byCat).map(([k, v]) => `${CATEGORIES[k] ?? k} ${fmt(v)}`).join(" · ")}</p>}
      {editable && <button onClick={save} disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save estimate"}</button>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
      {!editable && <p className="text-xs text-muted">Estimate is editable only at the Estimate draft stage. Tax is the company sales tax set in Odoo.</p>}
    </div>
  );
}
