import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { listLeads, PAGE_SIZE } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import { StageActions } from "@/components/stage-actions";

type SP = { stage?: string; origin?: string; q?: string; page?: string };

export default async function CrmPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const stage = sp.stage && sp.stage in STAGE_LABELS ? sp.stage : undefined;
  const origin = ["meta", "walkin", "other"].includes(sp.origin ?? "") ? sp.origin : undefined;
  let data: Awaited<ReturnType<typeof listLeads>> | null = null;
  let error: string | null = null;
  try {
    data = await listLeads(s, { stage, origin, q: sp.q?.slice(0, 80), page });
  } catch (e) {
    error = e instanceof OdooError ? (e.code === "access" ? "You do not have access to leads." : e.message) : "Could not load leads.";
  }
  const qs = (o: SP) => new URLSearchParams(Object.entries({ stage, origin, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><h1 className="text-xl font-semibold">CRM & Sales — Pipeline</h1><Link href="/m/crm/new" className="grid h-10 place-items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark">New lead</Link></div>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name or customer" aria-label="Search" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
        <select name="stage" defaultValue={stage ?? ""} aria-label="Stage" className="h-10 rounded-md border border-line px-2 text-sm">
          <option value="">All stages</option>
          {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="origin" defaultValue={origin ?? ""} aria-label="Source" className="h-10 rounded-md border border-line px-2 text-sm">
          <option value="">All sources</option><option value="meta">Meta</option><option value="walkin">Walk-in</option><option value="other">Other</option>
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
      </form>
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/15 p-3 text-sm text-danger">{error}</p>}
      {data && data.rows.length === 0 && <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">No leads match these filters.</p>}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-tint text-left text-xs text-muted">
              <tr>{["Lead", "Customer", "Source", "Stage", "Sales Mgr", "Project Mgr", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-medium"><Link href={`/m/crm/${l.id}`} className="text-gold hover:underline">{l.name}</Link></td>
                  <td className="px-3 py-2">{l.partner_name || "—"}</td>
                  <td className="px-3 py-2 capitalize">{l.otm_origin}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-tint px-2 py-0.5 text-xs">{STAGE_LABELS[l.otm_stage as Stage] ?? l.otm_stage}</span></td>
                  <td className="px-3 py-2">{l.user_id ? l.user_id[1] : "—"}</td>
                  <td className="px-3 py-2">{l.otm_project_manager_id ? l.otm_project_manager_id[1] : "—"}</td>
                  <td className="px-3 py-2"><StageActions id={l.id} stage={l.otm_stage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Page {page} of {pages} · {data.total} leads</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-md border border-line px-3 py-1.5 hover:bg-tint" href={`/m/crm?${qs({ page: String(page - 1) })}`}>Previous</Link>}
            {page < pages && <Link className="rounded-md border border-line px-3 py-1.5 hover:bg-tint" href={`/m/crm?${qs({ page: String(page + 1) })}`}>Next</Link>}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">Buttons show every step from the current stage; Odoo checks your role and rejects steps you cannot perform.</p>
    </div>
  );
}
