import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { OdooError } from "@/lib/odoo/client";
import { getCustomer, type CustomerDetail } from "@/lib/odoo/leads";
import { CustomerDetailView } from "@/components/customer-panels";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await requireSession();
  const nav = NAV.find((n) => n.slug === "customers");
  if (!nav || !canSee(nav, s.groups)) notFound();
  let d: CustomerDetail;
  try { d = await getCustomer(s, id); } catch (e) {
    if (e instanceof OdooError && e.code === "access") return <p role="alert" className="text-sm text-danger">You do not have access to this customer.</p>;
    notFound();
  }
  return (
    <div className="space-y-4">
      <Link href="/m/customers" className="text-sm text-muted hover:underline">← Customers</Link>
      <CustomerDetailView d={d} />
    </div>
  );
}
