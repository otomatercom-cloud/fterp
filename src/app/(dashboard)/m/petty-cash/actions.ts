"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addPetty, cancelPetty, reviewPetty, topupPetty } from "@/lib/odoo/leads";

type R = { error?: string; id?: number };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const done = (extra: Partial<R> = {}): R => { revalidatePath("/m", "layout"); return extra; };

export async function addPettyAction(leadId: number, category: string, amount: number, date: string, description: string): Promise<R> {
  const p = z.object({ l: id.or(z.literal(0)), c: z.enum(["material", "transport", "labour", "food", "tools", "fuel", "other"]), a: z.number().positive().max(1e7), d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), n: z.string().trim().min(1).max(200) }).safeParse({ l: leadId, c: category, a: amount, d: date, n: description });
  if (!p.success) return { error: "Enter a category, date, description and an amount above 0." };
  const s = await requireSession();
  try { const newId = await addPetty(s, p.data.l || false, p.data.c, p.data.a, p.data.d, p.data.n); return done({ id: newId }); } catch (e) { return fail(e); }
}
export async function cancelPettyAction(txn: number): Promise<R> {
  if (!id.safeParse(txn).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await cancelPetty(s, txn); } catch (e) { return fail(e); }
  return done();
}
export async function topupAction(userId: number, amount: number, note: string): Promise<R> {
  const p = z.object({ u: id, a: z.number().positive().max(1e7), n: z.string().trim().max(200) }).safeParse({ u: userId, a: amount, n: note });
  if (!p.success) return { error: "Choose a user and an amount above 0." };
  const s = await requireSession();
  try { await topupPetty(s, p.data.u, p.data.a, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function reviewAction(txn: number, decision: string, note: string): Promise<R> {
  const p = z.object({ t: id, d: z.enum(["approve", "reject"]), n: z.string().trim().max(200) }).safeParse({ t: txn, d: decision, n: note });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await reviewPetty(s, p.data.t, p.data.d, p.data.n); } catch (e) { return fail(e); }
  return done();
}
