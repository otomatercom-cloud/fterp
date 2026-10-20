"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addInvPrice, archiveInvItem, moveInvStock, saveInvItem } from "@/lib/odoo/leads";
import { CATEGORIES } from "@/lib/workflow/boq";

type R = { error?: string; id?: number };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const done = (x: R = {}): R => { revalidatePath("/m/inventory", "layout"); revalidatePath("/m/crm", "layout"); return x; };

export async function saveItemAction(itemId: number, code: string, name: string, category: string, unit: string, min: number, desc: string): Promise<R> {
  const p = z.object({ i: z.number().int().min(0), c: z.string().trim().min(1).max(30), n: z.string().trim().min(1).max(200), k: z.enum(Object.keys(CATEGORIES) as [string, ...string[]]), u: z.string().trim().min(1).max(12), m: z.number().min(0).max(1e9), d: z.string().trim().max(200) })
    .safeParse({ i: itemId, c: code, n: name, k: category, u: unit, m: min, d: desc });
  if (!p.success) return { error: "Enter a code, name, category and unit." };
  const s = await requireSession();
  try { return done({ id: await saveInvItem(s, p.data.i, p.data.c, p.data.n, p.data.k, p.data.u, p.data.m, p.data.d) }); } catch (e) { return fail(e); }
}
export async function archiveItemAction(itemId: number): Promise<R> {
  if (!id.safeParse(itemId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await archiveInvItem(s, itemId); } catch (e) { return fail(e); }
  return done();
}
export async function addPriceAction(itemId: number, vendor: string, price: number, date: string, note: string): Promise<R> {
  const p = z.object({ i: id, v: z.string().trim().min(1).max(120), p: z.number().positive().max(1e9), d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), n: z.string().trim().max(120) }).safeParse({ i: itemId, v: vendor, p: price, d: date, n: note });
  if (!p.success) return { error: "Enter a vendor, a date and a price above 0." };
  const s = await requireSession();
  try { await addInvPrice(s, p.data.i, p.data.v, p.data.p, p.data.d, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function stockMoveAction(itemId: number, kind: string, qty: number, note: string, lead: number): Promise<R> {
  const p = z.object({ i: id, k: z.enum(["in", "out", "adjust"]), q: z.number().min(0).max(1e9), n: z.string().trim().max(200), l: z.number().int().min(0) }).safeParse({ i: itemId, k: kind, q: qty, n: note, l: lead });
  if (!p.success) return { error: "Enter a valid quantity." };
  const s = await requireSession();
  try { await moveInvStock(s, p.data.i, p.data.k, p.data.q, p.data.n, p.data.l); } catch (e) { return fail(e); }
  return done();
}
