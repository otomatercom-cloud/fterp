"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelPoAction, confirmPoAction, receivePoAction, setExpectedAction } from "@/app/(dashboard)/m/procurement/actions";
import type { PoRow } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const STATE: Record<string, string> = { draft: "Draft", sent: "RFQ sent", "to approve": "To approve", purchase: "Confirmed", done: "Locked", cancel: "Cancelled" };
const RECV: Record<string, string> = { none: "Not received", partial: "Partially received", received: "Received" };
const FILTERS = [["all", "All"], ["draft", "To confirm"], ["open", "Awaiting goods"], ["overdue", "Overdue"], ["received", "Received"]] as const;
const inp = "h-8 rounded border border-line px-2 text-xs";

export function PoBoard({ orders, canManage }: { orders: PoRow[]; canManage: boolean }) {
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [date, setDate] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: () => void) => start(async () => { const r = await fn(); setErr(r.error); if (!r.error) ok?.(); });
  const rows = orders.filter((o) => f === "all" || (f === "draft" && (o.state === "draft" || o.state === "sent")) || (f === "open" && (o.state === "purchase" || o.state === "done") && o.receipt !== "received") || (f === "overdue" && o.overdue) || (f === "received" && o.receipt === "received"));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`rounded-full border px-3 py-1 text-xs ${f === k ? "border-gold text-gold" : "border-line text-muted"}`}>{l}</button>)}</div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted">No purchase orders here.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((o) => {
            const confirmed = o.state === "purchase" || o.state === "done";
            return (
              <li key={o.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button onClick={() => setOpen(open === o.id ? null : o.id)} className="text-left"><b>{o.name}</b> <span className="text-xs text-muted">· {o.vendor} · {fmt(o.total)} incl. tax</span>
                    {o.lead_id && <> · <Link href={`/m/crm/${o.lead_id}`} className="text-xs text-gold hover:underline" onClick={(e) => e.stopPropagation()}>{o.lead}</Link></>}</button>
                  <span className="flex flex-wrap items-center gap-1 text-[11px]"><a href={`/print/po/${o.id}`} target="_blank" rel="noreferrer" className="mr-1 text-gold hover:underline">Print PO</a>
                    <span className="rounded-full border border-line px-2 py-0.5 text-muted">{STATE[o.state] ?? o.state}</span>
                    {confirmed && <span className={`rounded-full border border-line px-2 py-0.5 ${o.receipt === "received" ? "text-success" : o.overdue ? "text-danger" : "text-gold"}`}>{o.overdue ? "Overdue · " : ""}{RECV[o.receipt]}</span>}
                    {o.expected && <span className="text-muted">due {o.expected}</span>}
                  </span>
                </div>
                {open === o.id && (
                  <div className="mt-2 space-y-2">
                    <table className="w-full text-left text-xs"><thead className="text-muted"><tr><th>Item</th><th className="text-right">Ordered</th><th className="text-right">Received</th>{confirmed && o.receipt !== "received" && <th className="text-right">Receive now</th>}</tr></thead>
                      <tbody className="divide-y divide-line">{o.lines.map((l) => (
                        <tr key={l.id}><td className="py-1">{l.name}</td><td className="text-right">{fmt(l.qty)}</td><td className="text-right">{fmt(l.received)}</td>
                          {confirmed && o.receipt !== "received" && <td className="text-right">{l.received < l.qty ? <input aria-label={`Receive ${l.name}`} type="number" min="0" max={l.qty - l.received} step="any" className={`${inp} w-20 text-right`} value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} /> : <span className="text-success">done</span>}</td>}</tr>
                      ))}</tbody></table>
                    <div className="flex flex-wrap items-center gap-2">
                      {confirmed && o.receipt !== "received" && (
                        <>
                          <input aria-label="Receipt note" placeholder="Delivery note / remarks" className={`${inp} min-w-0 flex-1`} value={note} onChange={(e) => setNote(e.target.value)} />
                          <button disabled={pending} onClick={() => run(() => receivePoAction(o.id, o.lines.map((l) => ({ line_id: l.id, qty: Number(qty[l.id] || 0) })).filter((l) => l.qty > 0), note), () => { setQty({}); setNote(""); })} className="h-8 rounded bg-success/80 px-3 text-xs text-white disabled:opacity-50">Record goods received</button>
                        </>
                      )}
                      {canManage && (o.state === "draft" || o.state === "sent") && (
                        <>
                          <input aria-label="Expected delivery" type="date" className={inp} value={date[o.id] ?? (o.expected || "")} onChange={(e) => setDate({ ...date, [o.id]: e.target.value })} />
                          <button disabled={pending} onClick={() => run(() => confirmPoAction(o.id, date[o.id] ?? (o.expected || "")))} className="h-8 rounded bg-primary px-3 text-xs text-white disabled:opacity-50">Confirm order</button>
                          <button disabled={pending} onClick={() => confirm(`Cancel ${o.name}?`) && run(() => cancelPoAction(o.id))} className="h-8 rounded border border-danger/60 px-3 text-xs text-danger disabled:opacity-50">Cancel</button>
                        </>
                      )}
                      {canManage && confirmed && o.receipt !== "received" && (
                        <>
                          <input aria-label="New expected date" type="date" className={inp} value={date[o.id] ?? (o.expected || "")} onChange={(e) => setDate({ ...date, [o.id]: e.target.value })} />
                          <button disabled={pending} onClick={() => run(() => setExpectedAction(o.id, date[o.id] ?? (o.expected || "")))} className="h-8 rounded border border-line px-3 text-xs disabled:opacity-50">Reschedule</button>
                        </>
                      )}
                    </div>
                    {o.receipts.length > 0 && <p className="text-xs text-muted">Receipts: {o.receipts.map((r) => `${r.date} · ${r.line} × ${fmt(r.qty)} (${r.user})${r.note ? ` — ${r.note}` : ""}`).join(" | ")}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
