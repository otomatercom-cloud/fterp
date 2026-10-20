import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { listProjects, type Project } from "@/lib/odoo/leads";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

export default async function ProjectsPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "projects");
  if (!item || !canSee(item, s.groups)) notFound();
  let rows: Project[] | null = null;
  try { rows = await listProjects(s); } catch { /* shown below */ }
  const live = rows?.filter((r) => r.otm_stage !== "completed") ?? [];
  const avg = live.length ? Math.round(live.reduce((a, r) => a + r.otm_progress, 0) / live.length) : 0;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Projects</h1><p className="text-sm text-muted">Work started · site progress updated by the Project Manager</p></div>
      {!rows ? <p className="glass p-4 text-sm">Projects are not available. Check access and that the FT Pipeline module is installed.</p> : rows.length === 0 ? (
        <p className="glass p-4 text-sm text-muted">No project has started work yet. A lead appears here once Accounts verifies the advance payment.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass glow-gold p-5 text-center"><p className="text-sm text-muted">Active projects</p><p className="mt-1 text-3xl font-semibold text-gold">{live.length}</p></div>
            <div className="glass glow-rose p-5 text-center"><p className="text-sm text-muted">Average progress (active)</p><p className="mt-1 text-3xl font-semibold">{avg}%</p></div>
            <div className="glass glow-bronze p-5 text-center"><p className="text-sm text-muted">Completed (handed over)</p><p className="mt-1 text-3xl font-semibold">{rows.filter((r) => r.otm_stage === "completed").length}</p></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <Link key={p.id} href={`/m/projects/${p.id}`} className="glass block p-4 transition hover:border-gold/60">
                <div className="flex items-start justify-between gap-2"><p className="font-medium">{p.name}</p><span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{STAGE_LABELS[p.otm_stage as Stage] ?? p.otm_stage}</span></div>
                <p className="text-xs text-muted">{p.partner_name || "—"} · PM: {p.otm_project_manager_id ? p.otm_project_manager_id[1] : "—"}</p>
                <div className="mt-4 flex justify-between text-xs"><span className="text-muted">Progress</span><b>{p.otm_progress}%</b></div>
                <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: `${p.otm_progress}%` }} /></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
