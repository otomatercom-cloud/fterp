import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { WorkQueue } from "@/components/work-queue";
import { getJoineryAll, getQueue, type Joinery } from "@/lib/odoo/leads";
import { JoineryBoard } from "@/components/joinery-board";

export default async function JoineryPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "joinery");
  if (!item || !canSee(item, s.groups)) notFound();
  let jobs: Joinery[] | null = null;
  try { jobs = await getJoineryAll(s); } catch { /* shown below */ }
  const queue = await getQueue(s, "site");
  const canEdit = ["base.group_system", "otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_project_manager"].some((g) => s.groups.includes(g));
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Joinery Workshop</h1><p className="text-sm text-muted">Joinery jobs of running projects, from shop drawing to installed</p></div>
      <WorkQueue title="Running projects" hint="Open a project to add joinery jobs (assigned Project Manager only)." items={queue} />
      {!jobs ? <p className="glass p-4 text-sm">Joinery data is not available. Check access and that the FT Pipeline module is upgraded.</p> : jobs.length === 0 ? (
        <p className="glass p-4 text-sm text-muted">No joinery jobs yet.</p>
      ) : <div className="glass p-4"><JoineryBoard jobs={jobs} canEdit={canEdit} showProject /></div>}
    </div>
  );
}
