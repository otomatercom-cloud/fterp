"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { createPortalUser, portalAction } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};

export async function portalActionAction(leadId: number, action: string): Promise<R> {
  const p = z.object({ id: z.number().int().positive(), a: z.enum(["client_approve", "client_requests_changes", "confirm_handover"]) }).safeParse({ id: leadId, a: action });
  if (!p.success) return { error: "Invalid request" };
  const s = await requireSession();
  try { await portalAction(s, p.data.id, p.data.a); } catch (e) { return fail(e); }
  revalidatePath("/m/portal", "layout");
  return {};
}

export async function createPortalUserAction(leadId: number, login: string, password: string): Promise<R> {
  const p = z.object({ id: z.number().int().positive(), login: z.string().trim().email().max(128), password: z.string().min(8).max(128) }).safeParse({ id: leadId, login, password });
  if (!p.success) return { error: "Enter a valid email and a password of at least 8 characters." };
  const s = await requireSession();
  try { await createPortalUser(s, p.data.id, p.data.login, p.data.password); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}

import { raiseSnag } from "@/lib/odoo/leads";
export async function raiseSnagAction(leadId: number, name: string): Promise<R> {
  const p = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(200) }).safeParse({ id: leadId, name });
  if (!p.success) return { error: "Describe the issue (up to 200 characters)." };
  const s = await requireSession();
  try { await raiseSnag(s, p.data.id, p.data.name); } catch (e) { return fail(e); }
  revalidatePath("/m/portal", "layout");
  return {};
}
