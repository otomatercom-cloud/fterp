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
  let count = 0, unavailable = false, users: UserRoles[] = [], cfg: NotifySettings = { email: false, wa_url: "", has_token: false, has_meta_secret: false };
  let docCfg: DocSettings | null = null;
  try { docCfg = await getDocSettings(s); } catch { /* module not upgraded */ }
  try { [count, users, cfg] = await Promise.all([demoStatus(s).then((d) => d.count), usersRoles(s), getNotifySettings(s)]); } catch { unavailable = true; }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {unavailable ? <p className="glass p-4 text-sm">Demo tools need an administrator account and the FT Pipeline module installed.</p> : <><RolesPanel users={users} /><NotifySettingsPanel cfg={cfg} />{docCfg && <DocSettingsPanel cfg={docCfg} />}<DemoPanel count={count} /></>}
    </div>
  );
}
