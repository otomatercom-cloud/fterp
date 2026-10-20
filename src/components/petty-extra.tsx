"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postPendingAction, saveSetupAction } from "@/app/(dashboard)/m/petty-cash/actions";
import type { PettySetup, PettyStatement } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";

export function PettySetupPanel({ setup }: { setup: PettySetup }) {
  const [v, setV] = useState({ journal: setup.journal, source: setup.source, diff: setup.diff_account, limit: String(setup.limit), low: String(setup.low) });
  const [map, setMap] = useState<Record<string, number>>(setup.map);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const acct = (val: number, on: (n: number) => void, label: string) => (
    <select aria-label={label} className={`${inp} w-full`} disabled={!setup.can_edit} value={val} onChange={(e) => on(Number(e.target.value))}><option value={0}>— not set —</option>{setup.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
  );
  return (
    <section className="glass space-y-3 p-5">
      <h2 className="font-semibold">Accounting setup</h2>
      <p className="text-xs text-muted">Every approved top-up, expense and cash-count difference is posted as a journal entry in the Odoo books. Without this setup, entries stay &quot;unposted&quot;.</p>
      {!setup.can_edit && <p className="text-xs text-gold">Only a Manager can change these settings.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Petty cash journal (Cash type)
          <select className={`${inp} mt-1 w-full`} disabled={!setup.can_edit} value={v.journal} onChange={(e) => setV({ ...v, journal: Number(e.target.value) })}><option value={0}>— not set —</option>{setup.journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
        <label className="text-sm">Funding source for top-ups (Bank/Cash journal)
          <select className={`${inp} mt-1 w-full`} disabled={!setup.can_edit} value={v.source} onChange={(e) => setV({ ...v, source: Number(e.target.value) })}><option value={0}>— not set —</option>{setup.sources.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
        <label className="text-sm">Cash short / excess account<div className="mt-1">{acct(v.diff, (n) => setV({ ...v, diff: n }), "Cash difference account")}</div></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Manager approval above<input type="number" min="1" className={`${inp} mt-1 w-full`} disabled={!setup.can_edit} value={v.limit} onChange={(e) => setV({ ...v, limit: e.target.value })} /></label>
          <label className="text-sm">Low-balance alert below<input type="number" min="0" className={`${inp} mt-1 w-full`} disabled={!setup.can_edit} value={v.low} onChange={(e) => setV({ ...v, low: e.target.value })} /></label>
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Expense account per category</h3>
        <div className="grid gap-2 md:grid-cols-2">{setup.cats.map((c) => <label key={c.key} className="text-sm">{c.label}<div className="mt-1">{acct(map[c.key] ?? 0, (n) => setMap({ ...map, [c.key]: n }), c.label)}</div></label>)}</div>
        <p className="mt-1 text-xs text-muted">&quot;Other&quot; is used for any category without its own account.</p>
      </div>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-success">{msg.ok}</p>}
      {setup.can_edit && (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => start(async () => { const r = await saveSetupAction(v.journal, v.source, v.diff, map, Number(v.limit), Number(v.low)); setMsg(r.error ? { error: r.error } : { ok: "Saved." }); if (!r.error) router.refresh(); })} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Save setup</button>
          <button disabled={pending || !setup.configured} onClick={() => start(async () => { const r = (await postPendingAction()) as { error?: string; msg?: string }; setMsg(r.error ? { error: r.error } : { ok: r.msg }); })} className="h-9 rounded-md border border-line px-4 text-sm disabled:opacity-50">Post pending entries</button>
        </div>
      )}
    </section>
  );
}

export function PettyStatementPanel({ month, data }: { month: string; data: PettyStatement }) {
  const router = useRouter();
  return (
    <section className="glass space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Monthly statement</h2>
        <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && router.push(`/m/petty-cash?tab=statement&month=${e.target.value}`)} className={inp} />
        <a href={`/api/petty-statement?month=${month}`} className="ml-auto rounded-md border border-line px-3 py-1.5 text-xs text-gold">Download CSV</a>
      </div>
      {data.length === 0 ? <p className="text-sm text-muted">No approved entries.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Holder</th><th className="text-right">Opening</th><th className="text-right">Top-ups</th><th className="text-right">Expenses</th><th className="text-right">Count adj.</th><th className="text-right">Closing</th></tr></thead>
          <tbody className="divide-y divide-line">{data.map((h) => <tr key={h.holder}><td className="py-2">{h.holder}</td><td className="text-right">{fmt(h.opening)}</td><td className="text-right">{fmt(h.topups)}</td><td className="text-right">{fmt(h.expenses)}</td><td className="text-right">{fmt(h.adjust)}</td><td className="text-right font-semibold">{fmt(h.closing)}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
