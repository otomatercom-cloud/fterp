import "server-only";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { WorkQueue } from "@/components/work-queue";
import { getDesignsAll, getQueue, type Design } from "@/lib/odoo/leads";
import { DesignList, STATUS_LABEL } from "@/components/design-panel";

export async function DesignOverview({ slug, title, sub, kinds }: { slug: string; title: string; sub: string; kinds?: string[] }) {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === slug);
  if (!item || !canSee(item, s.groups)) notFound();
  let all: Design[] | null = null;
  try { all = await getDesignsAll(s); } catch { /* shown below */ }
  const queue = await getQueue(s, "design");
  const items = all?.filter((d) => !kinds || kinds.includes(d.kind)) ?? [];
  const count = (st: string) => items.filter((d) => d.status === st).length;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted">{sub}</p></div>
      {!all ? <p className="glass p-4 text-sm">Design data is not available. Check access and that the FT Pipeline module is upgraded.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["draft", "in_review", "changes_requested", "approved"] as const).map((st) => (
              <div key={st} className="glass p-4"><p className="text-xs text-muted">{STATUS_LABEL[st]}</p><p className="mt-1 text-2xl font-semibold text-gold">{count(st)}</p></div>
            ))}
          </div>
          <WorkQueue title="Projects" hint="Open a project and use Design & drawings to add or send items for review." items={queue} />
          <div className="glass p-4"><DesignList items={items} showProject /></div>
          <p className="text-xs text-muted">Add items from a project: CRM &amp; Sales → open a lead → Design &amp; drawings.</p>
        </>
      )}
    </div>
  );
}
