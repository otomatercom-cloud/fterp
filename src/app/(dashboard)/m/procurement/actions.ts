"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addVendor, cancelPo, confirmPo, receivePo, setPoExpected } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(""));
const done = (): R => { revalidatePath("/m", "layout"); return {}; };

export async function confirmPoAction(poId: number, expected: string): Promise<R> {
  const p = z.object({ a: id, d: date }).safeParse({ a: poId, d: expected });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await confirmPo(s, p.data.a, p.data.d || false); } catch (e) { return fail(e); }
  return done();
}
export async function setExpectedAction(poId: number, expected: string): Promise<R> {
  const p = z.object({ a: id, d: date }).safeParse({ a: poId, d: expected });
  if (!p.success) return { error: "Invalid date." };
  const s = await requireSession();
  try { await setPoExpected(s, p.data.a, p.data.d || false); } catch (e) { return fail(e); }
  return done();
}
export async function cancelPoAction(poId: number): Promise<R> {
  if (!id.safeParse(poId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await cancelPo(s, poId); } catch (e) { return fail(e); }
  return done();
}
export async function receivePoAction(poId: number, lines: { line_id: number; qty: number }[], note: string): Promise<R> {
  const p = z.object({ a: id, l: z.array(z.object({ line_id: id, qty: z.number().positive().max(1e7) })).min(1).max(200), n: z.string().trim().max(200) }).safeParse({ a: poId, l: lines, n: note });
  if (!p.success) return { error: "Enter a quantity above 0." };
  const s = await requireSession();
  try { await receivePo(s, p.data.a, p.data.l, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function addVendorAction(name: string, phone: string, email: string): Promise<R> {
  const p = z.object({ n: z.string().trim().min(1).max(120), p: z.string().trim().max(40), e: z.string().trim().max(120).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Invalid email") }).safeParse({ n: name, p: phone, e: email });
  if (!p.success) return { error: "Enter the vendor name (and a valid email if given)." };
  const s = await requireSession();
  try { await addVendor(s, p.data.n, p.data.p, p.data.e); } catch (e) { return fail(e); }
  return done();
}
