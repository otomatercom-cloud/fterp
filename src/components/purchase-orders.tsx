"use client";
import { useState, useTransition } from "react";
import { createPurchaseOrdersAction } from "@/app/(dashboard)/m/crm/actions";
import type { PoData } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function PurchaseOrders({ leadId, data, canCreate }: { leadId: number; data: PoData; canCreate: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  return (
    <div className="space-y-3 text-sm">
      {data.orders.length === 0 ? <p className="text-muted">No purchase orders yet.</p> : (
        <ul className="divide-y divide-line">
          {data.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{o.name}</b> · {o.vendor}</span>
              <span className="text-muted">{o.state === "draft" ? "RFQ (draft)" : o.state} · {fmt(o.total)} incl. tax</span>
            </li>
          ))}
        </ul>
      )}
      {canCreate && data.pending > 0 && (
        <>
          <button disabled={pending} onClick={() => start(async () => { const r = await createPurchaseOrdersAction(leadId); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: `${r.count} purchase order(s) created` }); })}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Creating…" : `Create purchase orders (${data.pending} lines)`}</button>
          <p className="text-xs text-muted">One draft PO per vendor, using the saved price lines. Save the prices first. Prices are locked once POs exist.</p>
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
    </div>
  );
}
