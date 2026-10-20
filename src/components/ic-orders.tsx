"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createIcAction, icActionAction, importJoineryAction, moveIcLineAction, setIcLinesAction } from "@/app/(dashboard)/m/intercompany/actions";
import { IC_STAGES, IC_STATUS } from "@/lib/workflow/ic";
import type { IcData, IcOrder } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-8 rounded border border-line px-2 text-xs";
const TONE: Record<string, string> = { draft: "text-muted", sent: "text-gold", accepted: "text-gold", in_production: "text-gold", ready: "text-success", delivered: "text-success", received: "text-success", rejected: "text-danger", cancelled: "text-muted" };

function Order({ o, linkProject }: { o: IcOrder; linkProject: boolean }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(o.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ error?: string }>) => start(async () => setErr((await f()).error));
  const upd = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const btn = "h-8 rounded px-3 text-xs disabled:opacity-50";
  return (
    <li className="py-3 text-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span><b>{o.name}</b> <span className="text-xs text-muted">· {o.lead} · {o.factory} · {fmt(o.total)} excl. tax{o.required ? ` · needed by ${o.required}` : ""}</span></span>
        <span className="flex gap-1 text-[11px]">{o.overdue && <span className="rounded-full border border-danger/60 px-2 py-0.5 text-danger">Overdue</span>}<span className={`rounded-full border border-line px-2 py-0.5 ${TONE[o.status]}`}>{IC_STATUS[o.status]}</span></span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {linkProject && <Link href={`/m/crm/${o.lead_id}`} className="text-xs text-gold hover:underline">Open project</Link>}
          {o.note && <p className="text-xs text-muted">{o.note}</p>}
          {o.reject_reason && <p className="text-xs text-danger">Rejected: {o.reject_reason}</p>}
          {o.can_edit ? (
            <div className="space-y-1">
              {lines.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input aria-label="Item" className={`${inp} min-w-0 flex-1`} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item / unit to manufacture" />
                  <input aria-label="Quantity" type="number" min="0" step="any" className={`${inp} w-16`} value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
                  <input aria-label="Transfer price" type="number" min="0" step="any" className={`${inp} w-24`} value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} />
                  <button aria-label="Remove line" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-xs text-danger">✕</button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLines([...lines, { name: "", qty: 1, price: 0 }])} className="h-8 rounded border border-line px-3 text-xs">+ Line</button>
                <button disabled={pending} onClick={() => run(async () => { const r = await importJoineryAction(o.id); return r; })} className="h-8 rounded border border-gold/50 px-3 text-xs text-gold disabled:opacity-50">Import joinery jobs</button>
                <button disabled={pending || !lines.length} onClick={() => run(() => setIcLinesAction(o.id, lines))} className={`${btn} bg-primary text-white`}>Save lines</button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-xs"><thead className="text-muted"><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th>Production stage</th></tr></thead>
              <tbody className="divide-y divide-line">{o.lines.map((l) => (
                <tr key={l.id}><td className="py-1">{l.name}</td><td className="text-right">{fmt(l.qty)}</td><td className="text-right">{fmt(l.price)}</td>
                  <td>{o.can_move ? <select aria-label={`Stage of ${l.name}`} disabled={pending} value={l.stage} onChange={(e) => run(() => moveIcLineAction(l.id, e.target.value))} className={inp}>{IC_STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : IC_STAGES.find(([k]) => k === l.stage)?.[1]}</td></tr>
              ))}</tbody></table>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {o.can_send && <button disabled={pending} onClick={() => run(() => icActionAction(o.id, "send", ""))} className={`${btn} bg-primary text-white`}>Send to factory</button>}
            {o.can_decide && (
              <>
                <input aria-label="Reason" className={`${inp} min-w-0 flex-1`} placeholder="Reason (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button disabled={pending} onClick={() => run(() => icActionAction(o.id, "accept", ""))} className={`${btn} bg-success/80 text-white`}>Accept order</button>
                <button disabled={pending} onClick={() => run(() => icActionAction(o.id, "reject", note))} className={`${btn} border border-danger/60 text-danger`}>Reject</button>
              </>
            )}
            {o.can_dispatch && <button disabled={pending} onClick={() => run(() => icActionAction(o.id, "dispatch", ""))} className={`${btn} bg-primary text-white`}>Dispatch to site</button>}
            {o.can_receive && <button disabled={pending} onClick={() => run(() => icActionAction(o.id, "receive", ""))} className={`${btn} bg-success/80 text-white`}>Confirm received at site</button>}
            {o.can_cancel && <button disabled={pending} onClick={() => confirm(`Cancel ${o.name}?`) && run(() => icActionAction(o.id, "cancel", ""))} className={`${btn} border border-line text-muted`}>Cancel order</button>}
          </div>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        </div>
      )}
    </li>
  );
}

export function IcOrders({ orders, linkProject }: { orders: IcOrder[]; linkProject: boolean }) {
  if (!orders.length) return <p className="text-sm text-muted">No orders here.</p>;
  return <ul className="divide-y divide-line">{orders.map((o) => <Order key={o.id + ":" + o.status + ":" + o.lines.map((l) => l.stage).join()} o={o} linkProject={linkProject} />)}</ul>;
}

export function IcCreate({ data }: { data: Pick<IcData, "leads" | "companies"> }) {
  const [lead, setLead] = useState(data.leads[0]?.id ?? 0);
  const [company, setCompany] = useState(data.companies[0]?.id ?? 0);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Project" className="h-9 rounded-md border border-line px-2 text-sm" value={lead} onChange={(e) => setLead(Number(e.target.value))}>{data.leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select aria-label="Factory company" className="h-9 rounded-md border border-line px-2 text-sm" value={company} onChange={(e) => setCompany(Number(e.target.value))}>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input aria-label="Needed by" type="date" className="h-9 rounded-md border border-line px-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        <input aria-label="Note" placeholder="Note for the factory" className="h-9 min-w-0 flex-1 rounded-md border border-line px-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={pending || !lead || !company} onClick={() => start(async () => { const r = await createIcAction(lead, company, date, note); setErr(r.error); if (!r.error) { setDate(""); setNote(""); } })} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Create draft order</button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
