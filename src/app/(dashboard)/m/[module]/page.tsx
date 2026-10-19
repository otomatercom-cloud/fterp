import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === module);
  if (!item || !canSee(item, s.groups)) notFound();
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">{item.label}</h1>
      <p className="rounded-lg border border-dashed border-line bg-card p-6 text-sm text-muted">Not yet implemented — scheduled for a later phase.</p>
    </div>
  );
}
