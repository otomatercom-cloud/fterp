"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { loadDemo, removeDemo } from "@/lib/odoo/leads";

type R = { ok?: string; error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "Only an administrator can do this." : e.message };
  throw e;
};

export async function loadDemoAction(): Promise<R> {
  const s = await requireSession();
  try {
    const r = await loadDemo(s);
    revalidatePath("/", "layout");
    return { ok: `${r.created} demo leads created. Logins: demo.<role>@ftdemo.com, password ${r.password}.${r.invoices_skipped ? ` Invoices skipped for ${r.invoices_skipped} leads (accounting not fully configured).` : ""}` };
  } catch (e) { return fail(e); }
}

export async function removeDemoAction(): Promise<R> {
  const s = await requireSession();
  try {
    const r = await removeDemo(s);
    revalidatePath("/", "layout");
    return { ok: `${r.removed} demo leads removed.${r.invoices_kept ? ` ${r.invoices_kept} paid invoices were kept in Accounting.` : ""}` };
  } catch (e) { return fail(e); }
}

import { setUserRole } from "@/lib/odoo/leads";
const ROLES = new Set(["sales_manager", "manager", "project_manager", "procurement", "accounts", "manufacturing"]);
export async function setUserRoleAction(userId: number, role: string, enabled: boolean): Promise<{ error?: string }> {
  if (!Number.isInteger(userId) || userId <= 0 || !ROLES.has(role)) return { error: "Invalid request" };
  const s = await requireSession();
  try { await setUserRole(s, userId, role, enabled); } catch (e) { return fail(e); }
  revalidatePath("/m/admin");
  return {};
}

import { saveNotifySettings, testNotify } from "@/lib/odoo/leads";
export async function saveNotifyAction(fd: FormData): Promise<R> {
  const url = String(fd.get("wa_url") ?? "").trim().slice(0, 300);
  const token = String(fd.get("wa_token") ?? "").slice(0, 300);
  const meta = String(fd.get("meta") ?? "").slice(0, 200);
  const s = await requireSession();
  try { await saveNotifySettings(s, fd.get("email") === "on", url, token, meta); revalidatePath("/m/admin"); return { ok: "Saved." }; } catch (e) { return fail(e); }
}
export async function testNotifyAction(phone: string): Promise<R> {
  if (!/^[+\d][\d\s-]{7,20}$/.test(phone.trim())) return { error: "Enter a valid phone number." };
  const s = await requireSession();
  try { await testNotify(s, phone.trim()); return { ok: "Test message sent." }; } catch (e) { return fail(e); }
}
