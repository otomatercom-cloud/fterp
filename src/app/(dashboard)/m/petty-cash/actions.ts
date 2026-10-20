"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addPetty, cancelPetty, countPetty, postPettyPending, requestPettyTopup, reviewPetty, savePettySetup, topupPetty } from "@/lib/odoo/leads";

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

export async function requestTopupAction(amount: number, note: string): Promise<R> {
  const p = z.object({ a: z.number().positive().max(1e7), n: z.string().trim().max(200) }).safeParse({ a: amount, n: note });
  if (!p.success) return { error: "Enter an amount above 0." };
  const s = await requireSession();
  try { await requestPettyTopup(s, p.data.a, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function countAction(userId: number, counted: number, note: string): Promise<R> {
  const p = z.object({ u: id, c: z.number().min(0).max(1e8), n: z.string().trim().max(200) }).safeParse({ u: userId, c: counted, n: note });
  if (!p.success) return { error: "Choose a holder and enter the counted cash." };
  const s = await requireSession();
  try { await countPetty(s, p.data.u, p.data.c, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function saveSetupAction(journal: number, source: number, diff: number, mapping: Record<string, number>, limit: number, low: number): Promise<R> {
  const p = z.object({ j: z.number().int().min(0), s: z.number().int().min(0), d: z.number().int().min(0), m: z.record(z.string(), z.number().int().min(0)), l: z.number().positive().max(1e8), w: z.number().min(0).max(1e8) }).safeParse({ j: journal, s: source, d: diff, m: mapping, l: limit, w: low });
  if (!p.success) return { error: "Check the values." };
  const s = await requireSession();
  try { await savePettySetup(s, p.data.j, p.data.s, p.data.d, p.data.m, p.data.l, p.data.w); } catch (e) { return fail(e); }
  return done();
}
export async function postPendingAction(): Promise<R & { msg?: string }> {
  const s = await requireSession();
  try { const r = await postPettyPending(s); return done({ msg: `${r.posted} posted${r.failed ? `, ${r.failed} could not be posted (check the setup)` : ""}.` } as never); } catch (e) { return fail(e); }
}
