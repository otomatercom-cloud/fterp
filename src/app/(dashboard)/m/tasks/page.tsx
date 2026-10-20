import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listTasks, type Lead } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";
import { StageActions } from "@/components/stage-actions";

export default async function TasksPage() {
  const s = await requireSession();
  let rows: Lead[] | null = null;
  try { rows = await listTasks(s); } catch { /* shown below */ }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">My Tasks</h1><p className="text-sm text-muted">Leads that are waiting for you to act, oldest first</p></div>
      {!rows ? <p className="glass p-4 text-sm">Tasks are not available. Check that the FT Pipeline module is installed and you have access.</p> : rows.length === 0 ? (
        <p className="glass p-4 text-sm text-muted">Nothing is waiting for you right now.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((l) => (
            <li key={l.id} className="glass space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/m/crm/${l.id}`} className="font-medium text-gold hover:underline">{l.name}</Link>
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{STAGE_LABELS[l.otm_stage as Stage] ?? l.otm_stage}</span>
              </div>
              <p className="text-xs text-muted">{l.partner_name || "—"} · Sales: {l.user_id ? l.user_id[1] : "—"} · PM: {l.otm_project_manager_id ? l.otm_project_manager_id[1] : "—"}</p>
              <StageActions id={l.id} stage={l.otm_stage} />
              <p className="text-[11px] text-muted">Some steps need details first (estimate, prices, invoice) — open the lead to complete them.</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
