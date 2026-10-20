import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { demoStatus, usersRoles, type UserRoles } from "@/lib/odoo/leads";
import { RolesPanel } from "@/components/roles-panel";
import { DemoPanel } from "@/components/demo-panel";

export default async function AdminPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "admin");
  if (!item || !canSee(item, s.groups)) notFound();
  let count = 0, unavailable = false, users: UserRoles[] = [];
  try { [count, users] = await Promise.all([demoStatus(s).then((d) => d.count), usersRoles(s)]); } catch { unavailable = true; }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {unavailable ? <p className="glass p-4 text-sm">Demo tools need an administrator account and the FT Pipeline module installed.</p> : <><RolesPanel users={users} /><DemoPanel count={count} /></>}
    </div>
  );
}
