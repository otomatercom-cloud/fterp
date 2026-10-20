"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addContactLog, doneFollowup, saveCustomer } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const done = (): R => { revalidatePath("/m/customers", "layout"); revalidatePath("/", "page"); return {}; };

export async function saveCustomerAction(leadId: number, v: { name: string; phone: string; whatsapp: string; email: string; address: string; person: string }): Promise<R> {
  const p = z.object({ i: id, n: z.string().trim().min(1).max(120), p: z.string().trim().max(40), w: z.string().trim().max(40), e: z.string().trim().max(120), a: z.string().trim().max(200), c: z.string().trim().max(120) })
    .safeParse({ i: leadId, n: v.name, p: v.phone, w: v.whatsapp, e: v.email, a: v.address, c: v.person });
  if (!p.success) return { error: "Enter the customer name and a phone or email." };
  const s = await requireSession();
  try { await saveCustomer(s, p.data.i, p.data.n, p.data.p, p.data.w, p.data.e, p.data.a, p.data.c); } catch (e) { return fail(e); }
  return done();
}
export async function addLogAction(leadId: number, kind: string, text: string, followup: string): Promise<R> {
  const p = z.object({ i: id, k: z.enum(["call", "whatsapp", "meeting", "visit", "email", "note"]), t: z.string().trim().min(1).max(300), f: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).safeParse({ i: leadId, k: kind, t: text, f: followup });
  if (!p.success) return { error: "Choose the type and write what was discussed." };
  const s = await requireSession();
  try { await addContactLog(s, p.data.i, p.data.k, p.data.t, p.data.f || false); } catch (e) { return fail(e); }
  return done();
}
export async function followupDoneAction(logId: number): Promise<R> {
  if (!id.safeParse(logId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await doneFollowup(s, logId); } catch (e) { return fail(e); }
  return done();
}
