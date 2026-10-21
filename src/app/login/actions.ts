"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { odooLogin, OdooError } from "@/lib/odoo/client";
import { portalProfile } from "@/lib/odoo/leads";
import { loadProfile } from "@/lib/auth/odoo-profile";
import { createSession, destroySession, switchCompany } from "@/lib/auth/session";

const schema = z.object({ login: z.string().trim().min(1, "Login is required").max(128), password: z.string().min(1, "Password is required").max(256) });

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: fd.get("login"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const o = await odooLogin(parsed.data.login, parsed.data.password);
    // Customer portal users have no access to staff profile data; the addon tells us who they are.
    const portal = await portalProfile(o.sessionId).catch(() => null);
    const p = portal?.portal
      ? { companies: [{ id: portal.company_id, name: portal.company_name }], companyId: portal.company_id, groups: ["base.group_portal"] }
      : portal?.groups?.length
        ? { companies: portal.companies, companyId: portal.company_id, groups: portal.groups }
        : await loadProfile(o.sessionId, o.uid);
    await createSession({ sessionId: o.sessionId, uid: o.uid, name: o.name, ...p });
  } catch (e) {
    if (e instanceof OdooError) return { error: e.code === "auth" ? "Invalid login or password" : e.code === "network" || e.code === "timeout" ? "Odoo is unreachable. Check ODOO_BASE_URL and try again." : (console.error("[login] odoo error:", e.code, e.message), `Sign-in failed (${e.message.slice(0, 120)}). Contact your administrator.`) };
    console.error("[login] unexpected error:", e);
    return { error: `Sign-in failed (${e instanceof Error ? e.message : "unknown"}). Check server logs.` };
  }
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchCompanyAction(fd: FormData) {
  await switchCompany(Number(fd.get("companyId")));
  redirect("/");
}
