import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getPos, getVendors, type PoRow, type Vendor } from "@/lib/odoo/leads";
import { PoBoard } from "@/components/po-board";
import { VendorPanel } from "@/components/vendor-panel";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "procurement");
  if (!item || !canSee(item, s.groups)) notFound();
  const tab = (await searchParams).tab === "vendors" ? "vendors" : "orders";
  let d: Awaited<ReturnType<typeof getPos>> | null = null, vendors: Vendor[] = [];
  try {
    d = await getPos(s);
    if (d.can_manage) vendors = await getVendors(s);
  } catch { /* shown below */ }
  if (!d) return <div className="space-y-3"><h1 className="text-xl font-semibold">Procurement</h1><p className="glass p-4 text-sm">Procurement data is not available. Check access and that the FT Pipeline module is upgraded.</p></div>;
  const live = d.orders.filter((o) => o.state !== "cancel");
  const confirmed = live.filter((o) => o.state === "purchase" || o.state === "done");
  const awaiting = confirmed.filter((o) => o.receipt !== "received");
  const kpi: [string, string, string][] = [
    ["To confirm", String(live.filter((o) => o.state === "draft" || o.state === "sent").length), "glow-gold"],
    ["Awaiting goods", String(awaiting.length), "glow-rose"],
    ["Overdue deliveries", String(live.filter((o) => o.overdue).length), "glow-bronze"],
    ["Open order value", fmt(awaiting.reduce((a, o) => a + o.total, 0)), "glow-gold"],
  ];
  const tabs = [["orders", "Purchase orders"], ...(d.can_manage ? [["vendors", "Vendors"]] : [])];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Procurement</h1><p className="text-sm text-muted">Purchase orders of FT projects: confirm, track delivery and record goods received</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{kpi.map(([l, v, g]) => <div key={l} className={`glass p-4 ${g}`}><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}</div>
      {d.queue?.length > 0 && (
        <section className="glass p-5">
          <h2 className="mb-2 font-semibold">Projects waiting for Procurement</h2>
          <p className="mb-2 text-xs text-muted">Open the project, enter vendor and price for each line, then click <b>Create purchase orders</b>. They will then appear here.</p>
          <ul className="space-y-1 text-sm">
            {d.queue.map((q) => (
              <li key={q.id} className="flex items-center justify-between rounded border border-line p-2">
                <Link href={`/m/crm/${q.id}`} className="font-medium hover:underline">{q.name}</Link>
                <span className="text-xs text-muted">{q.stage === "pm_assigned" ? "Waiting for PM to send" : `${q.pending} of ${q.lines} lines need a PO`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex gap-1">{tabs.map(([k, l]) => <Link key={k} href={`/m/procurement?tab=${k}`} className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-gold text-gold" : "border-line text-muted"}`}>{l}</Link>)}</div>
      <section className="glass p-5">{tab === "vendors" && d.can_manage ? <VendorPanel vendors={vendors} /> : <PoBoard orders={d.orders} canManage={d.can_manage} />}</section>
    </div>
  );
}
