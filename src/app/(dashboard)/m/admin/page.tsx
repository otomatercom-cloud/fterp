import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { demoStatus, usersRoles, getNotifySettings, getDocSettings, type DocSettings, type UserRoles, type NotifySettings } from "@/lib/odoo/leads";
import { RolesPanel } from "@/components/roles-panel";
import { DocSettingsPanel } from "@/components/doc-settings";
import { NotifySettingsPanel } from "@/components/notify-settings";
import { DemoPanel } from "@/components/demo-panel";

export default async function AdminPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "admin");
  if (!item || !canSee(item, s.groups)) notFound();
  const isAdmin = s.groups.includes("base.group_system");
  let users: UserRoles[] = [], cfg: NotifySettings | null = null, docCfg: DocSettings | null = null, demo: number | null = null;
  [users, cfg, docCfg, demo] = await Promise.all([
    usersRoles(s).catch(() => [] as UserRoles[]), getNotifySettings(s).catch(() => null), getDocSettings(s).catch(() => null),
    isAdmin ? demoStatus(s).then((d) => d.count).catch(() => null) : Promise.resolve(null),
  ]);
  const unavailable = users.length === 0 && !cfg && !docCfg;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {unavailable ? <p className="glass p-4 text-sm">Settings need the FT Pipeline module upgraded in Odoo, and an administrator or Manager login.</p> : <><RolesPanel users={users} />{cfg && <NotifySettingsPanel cfg={cfg} />}{docCfg && <DocSettingsPanel cfg={docCfg} />}{demo !== null && <DemoPanel count={demo} />}</>}
    </div>
  );
}
