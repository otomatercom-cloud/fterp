import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getIcOrders, type IcData } from "@/lib/odoo/leads";
import { IcOrders } from "@/components/ic-orders";
import { IC_STAGES } from "@/lib/workflow/ic";

export default async function ManufacturingPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "manufacturing");
  if (!item || !canSee(item, s.groups)) notFound();
  let d: IcData | null = null;
  try { d = await getIcOrders(s); } catch { /* shown below */ }
  if (!d) return <div className="space-y-3"><h1 className="text-xl font-semibold">Manufacturing</h1><p className="glass p-4 text-sm">Factory data is not available. Check access and that the FT Pipeline module is upgraded.</p></div>;
  const live = d.orders.filter((o) => ["accepted", "in_production", "ready"].includes(o.status));
  const items = live.flatMap((o) => o.lines.map((l) => ({ ...l, order: o.name, project: o.lead, overdue: o.overdue })));
  const kpi: [string, number, string][] = [
    ["To accept", d.orders.filter((o) => o.status === "sent").length, "glow-gold"], ["In production", d.orders.filter((o) => o.status === "in_production").length, "glow-rose"],
    ["Ready to dispatch", d.orders.filter((o) => o.status === "ready").length, "glow-bronze"], ["Overdue", d.orders.filter((o) => o.overdue).length, "glow-gold"],
  ];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Manufacturing</h1><p className="text-sm text-muted">Orders from the interior company: accept, move items through production, dispatch</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{kpi.map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}</div>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Production board</h2>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {IC_STAGES.map(([k, label]) => {
            const col = items.filter((i) => i.stage === k);
            return (
              <div key={k} className="rounded-lg border border-line p-2"><p className="mb-2 text-xs font-semibold text-gold">{label} <span className="text-muted">({col.length})</span></p>
                <ul className="space-y-1">{col.map((i) => <li key={i.id} className={`rounded border px-2 py-1 text-xs ${i.overdue ? "border-danger/60" : "border-line"}`}><b>{i.name}</b> × {i.qty}<span className="block text-[10px] text-muted">{i.order} · {i.project}</span></li>)}</ul></div>
            );
          })}
        </div>
      </section>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Orders</h2><IcOrders orders={d.orders} linkProject={false} /></section>
    </div>
  );
}
