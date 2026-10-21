import { ImportExport } from "@/components/import-export";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getCustomers, type Customer } from "@/lib/odoo/leads";
import { CustomerList } from "@/components/customer-panels";

export default async function CustomersPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "customers");
  if (!item || !canSee(item, s.groups)) notFound();
  let rows: Customer[] | null = null;
  try { rows = (await getCustomers(s)).customers; } catch { /* shown below */ }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Customers</h1><p className="text-sm text-muted">Contact details, projects and follow-ups of customers you can access</p></div>
      <ImportExport entity="customers" canImport={false} />
      {rows ? <CustomerList rows={rows} /> : <p className="glass p-4 text-sm">Customers are not available. Check access and that the FT Pipeline module is upgraded.</p>}
    </div>
  );
}
