import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getInstallAll, getQueue, type InstallRow } from "@/lib/odoo/leads";
import { WorkQueue } from "@/components/work-queue";
import { Photos } from "@/components/install-panel";

const STATUS = { planned: "Planned", in_progress: "In progress", done: "Done" } as const;

export default async function InstallationPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "installation");
  if (!item || !canSee(item, s.groups)) notFound();
  let rows: InstallRow[] | null = null;
  try { rows = await getInstallAll(s); } catch { /* shown below */ }
  const queue = await getQueue(s, "site");
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Installation</h1><p className="text-sm text-muted">Site visits and installations across running projects</p></div>
      <WorkQueue title="Running projects" hint="Open a project to plan a site visit or installation and upload photos (assigned Project Manager only)." items={queue} />
      {!rows ? <p className="glass p-4 text-sm">Installation data is not available. Check access and that the FT Pipeline module is upgraded.</p> : rows.length === 0 ? <p className="glass p-4 text-sm text-muted">No site visits or installations yet.</p> : (
        <div className="glass p-4"><ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="rounded border border-line p-2">
              <div className="flex flex-wrap items-center justify-between gap-1"><span><b>{r.name}</b> <span className="text-xs text-muted">· {r.kind}{r.team ? ` · ${r.team}` : ""}{r.date ? ` · ${r.date}` : ""}</span></span><span className="text-xs text-gold">{STATUS[r.status as keyof typeof STATUS] ?? r.status}</span></div>
              <Link href={`/m/projects/${r.lead_id}`} className="text-xs text-muted hover:underline">{r.project}</Link>
              <Photos photos={r.photos} />
            </li>
          ))}
        </ul></div>
      )}
    </div>
  );
}
