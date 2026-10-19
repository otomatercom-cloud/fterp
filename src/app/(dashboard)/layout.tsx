import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { Shell } from "@/components/layout/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const items = NAV.filter((n) => canSee(n, s.groups)).map(({ slug, label, icon }) => ({ slug, label, icon }));
  return <Shell items={items} userName={s.name} companies={s.companies} companyId={s.companyId} >{children}</Shell>;
}
