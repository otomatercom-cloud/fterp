import { requireSession } from "@/lib/auth/session";
import { callKw } from "@/lib/odoo/client";


export default async function Home() {
  const s = await requireSession();
  // Real backend figure only (no mock data): number of partners visible to this user in the selected company.
  let count: number | null = null;
  try {
    count = await callKw<number>(s.sessionId, "res.partner", "search_count", [[]], {}, { companyIds: [s.companyId] });
  } catch { /* shown as unavailable below */ }
  const company = s.companies.find((c) => c.id === s.companyId)?.name;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
          <p className="text-sm text-muted">Company</p>
          <p className="text-lg font-semibold">{company}</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
          <p className="text-sm text-muted">Contacts visible to you (live from Odoo)</p>
          <p className="text-lg font-semibold">{count ?? "Unavailable"}</p>
        </div>
      </div>
      <p className="text-sm text-muted">Role dashboards arrive in Phase 6; they will only show live Odoo data.</p>
    </div>
  );
}
