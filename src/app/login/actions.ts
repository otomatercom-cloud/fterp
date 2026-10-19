"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { odooLogin, OdooError } from "@/lib/odoo/client";
import { loadProfile } from "@/lib/auth/odoo-profile";
import { createSession, destroySession, switchCompany } from "@/lib/auth/session";

const schema = z.object({ login: z.string().trim().min(1, "Login is required").max(128), password: z.string().min(1, "Password is required").max(256) });

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: fd.get("login"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const o = await odooLogin(parsed.data.login, parsed.data.password);
    const p = await loadProfile(o.sessionId, o.uid);
    await createSession({ sessionId: o.sessionId, uid: o.uid, name: o.name, ...p });
  } catch (e) {
    if (e instanceof OdooError) return { error: e.code === "auth" ? "Invalid login or password" : e.code === "network" || e.code === "timeout" ? "Odoo is unreachable. Check ODOO_BASE_URL and try again." : "Sign-in failed. Contact your administrator." };
    throw e;
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
