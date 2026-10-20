import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { OdooError } from "@/lib/odoo/client";
import { getProject, getSiteUpdates, getTasks, getJoinery, getInstalls, type SiteUpdate, type Task, type Joinery, type Install } from "@/lib/odoo/leads";
import { InstallPanel } from "@/components/install-panel";
import { JoineryBoard } from "@/components/joinery-board";
import { TaskBoard } from "@/components/task-board";
import { SiteUpdateForm } from "@/components/site-update-form";
import { StageActions } from "@/components/stage-actions";
import { STAGE_LABELS, type Stage } from "@/lib/workflow/interior";

const when = (iso: string) => new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "projects");
  if (!item || !canSee(item, s.groups)) notFound();
  let p, updates: SiteUpdate[] = [], tasks: Task[] = [], joinery: Joinery[] = [], installs: Install[] = [];
  try {
    p = await getProject(s, id);
    if (!p || !["work_started", "handover", "completed"].includes(p.otm_stage)) notFound();
    [updates, tasks, joinery, installs] = await Promise.all([getSiteUpdates(s, id), getTasks(s, id), getJoinery(s, id), getInstalls(s, id)]);
  } catch (e) {
    if (e instanceof OdooError) return <p role="alert" className="text-sm text-danger">{e.code === "access" ? "You do not have access to this project." : e.message}</p>;
    throw e;
  }
  const canUpdate = s.groups.includes("base.group_system") || s.groups.includes("otm_ft_pipeline.group_ft_manager") || s.groups.includes("otm_ft_pipeline.group_ft_project_manager");
  return (
    <div className="space-y-4">
      <Link href="/m/projects" className="text-sm text-muted hover:underline">← Projects</Link>
      <div><h1 className="text-xl font-semibold">{p.name} <span className="ml-2 rounded-full border border-gold/60 px-2.5 py-0.5 align-middle text-xs text-gold">{STAGE_LABELS[p.otm_stage as Stage]}</span></h1><p className="text-sm text-muted">{p.partner_name || "—"} · PM: {p.otm_project_manager_id ? p.otm_project_manager_id[1] : "—"} · Lead <Link className="text-gold hover:underline" href={`/m/crm/${p.id}`}>#{p.id}</Link></p></div>
      <div className="glass p-5">
        <div className="flex justify-between text-sm"><span className="text-muted">Overall progress</span><b className="text-gold">{p.otm_progress}%</b></div>
        <div className="mt-2 h-3 rounded-full bg-white/10"><div className="h-3 rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: `${p.otm_progress}%` }} /></div>
      </div>
      {p.otm_stage !== "completed" && <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Next step</h2><StageActions id={p.id} stage={p.otm_stage} />{p.otm_stage === "work_started" && <p className="mt-2 text-xs text-muted">Handover is possible once site progress reaches 100%.</p>}</section>}
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Site visits &amp; installation</h2><InstallPanel leadId={p.id} items={installs} canEdit={canUpdate && p.otm_stage !== "completed"} /></section>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Joinery jobs</h2><JoineryBoard jobs={joinery} leadId={p.id} canEdit={canUpdate && p.otm_stage !== "completed"} /></section>
      <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">Tasks &amp; snag list</h2><TaskBoard leadId={p.id} tasks={tasks} canEdit={canUpdate && p.otm_stage !== "completed"} /></section>
      <div className="grid gap-4 lg:grid-cols-2">
        {canUpdate && p.otm_stage === "work_started" && p.otm_progress < 100 && <section className="glass p-5"><h2 className="mb-3 text-sm font-semibold">New site update</h2><SiteUpdateForm leadId={p.id} current={p.otm_progress} /></section>}
        <section className="glass p-5">
          <h2 className="mb-3 text-sm font-semibold">Site updates</h2>
          {updates.length === 0 ? <p className="text-sm text-muted">No updates yet.</p> : (
            <ol className="space-y-3 border-l border-line pl-4">
              {updates.map((u) => (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-gold" />
                  <p className="text-sm"><b className="text-gold">{u.percent}%</b> · {u.note}</p>
                  <p className="text-xs text-muted">{u.user} · {when(u.date)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
