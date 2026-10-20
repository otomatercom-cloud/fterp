"use client";
import { useState, useTransition } from "react";
import { addVendorAction } from "@/app/(dashboard)/m/procurement/actions";
import type { Vendor } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";

export function VendorPanel({ vendors }: { vendors: Vendor[] }) {
  const [v, setV] = useState({ name: "", phone: "", email: "" });
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Vendor name" placeholder="Vendor name" className={`${inp} min-w-0 flex-1`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input aria-label="Phone" placeholder="Phone" className={`${inp} w-36`} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <input aria-label="Email" placeholder="Email" className={`${inp} w-48`} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <button disabled={pending || !v.name.trim()} onClick={() => start(async () => { const r = await addVendorAction(v.name, v.phone, v.email); setErr(r.error); if (!r.error) setV({ name: "", phone: "", email: "" }); })} className="h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50">Add vendor</button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Vendor</th><th>Contact</th><th className="text-right">Orders</th><th className="text-right">Open</th><th className="text-right">Value</th></tr></thead>
        <tbody className="divide-y divide-line">{vendors.map((x) => <tr key={x.id}><td className="py-2">{x.name}</td><td className="text-xs text-muted">{[x.phone, x.email].filter(Boolean).join(" · ") || "—"}</td><td className="text-right">{x.orders}</td><td className="text-right">{x.open}</td><td className="text-right">{fmt(x.total)}</td></tr>)}
          {vendors.length === 0 && <tr><td colSpan={5} className="py-3 text-muted">No vendors yet.</td></tr>}</tbody></table></div>
    </div>
  );
}
