import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getIcOrders, type IcData } from "@/lib/odoo/leads";
import { IcCreate, IcOrders } from "@/components/ic-orders";

export default async function IntercompanyPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "intercompany");
  if (!item || !canSee(item, s.groups)) notFound();
  let d: IcData | null = null;
  try { d = await getIcOrders(s); } catch { /* shown below */ }
  if (!d) return <div className="space-y-3"><h1 className="text-xl font-semibold">Intercompany Orders</h1><p className="glass p-4 text-sm">Order data is not available. Check access and that the FT Pipeline module is upgraded.</p></div>;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Intercompany Orders</h1><p className="text-sm text-muted">Furniture and joinery ordered from the factory company for a project, with production and delivery tracking</p></div>
      {d.can_create && <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">New order</h2><IcCreate data={d} /></section>}
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Orders</h2><IcOrders orders={d.orders} linkProject={!d.factory || d.can_create} /></section>
    </div>
  );
}
