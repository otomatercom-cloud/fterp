import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { OdooError } from "@/lib/odoo/client";
import { getInvItem, getLeadsLite, type InvDetail } from "@/lib/odoo/leads";
import { ItemDetail } from "@/components/inventory-panels";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await requireSession();
  const nav = NAV.find((n) => n.slug === "inventory");
  if (!nav || !canSee(nav, s.groups)) notFound();
  let d: InvDetail;
  try { d = await getInvItem(s, id); } catch (e) {
    if (e instanceof OdooError && e.code === "access") return <p role="alert" className="text-sm text-danger">You do not have access to inventory.</p>;
    notFound();
  }
  const leads = await getLeadsLite(s).catch(() => []);
  return (
    <div className="space-y-4">
      <Link href="/m/inventory" className="text-sm text-muted hover:underline">← Inventory</Link>
      <ItemDetail d={d} leads={leads} />
    </div>
  );
}
