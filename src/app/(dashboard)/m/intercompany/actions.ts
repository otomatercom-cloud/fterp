"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { createIcOrder, icAction, importIcJoinery, moveIcLine, setIcLines } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const done = (): R => { revalidatePath("/m", "layout"); return {}; };

export async function createIcAction(leadId: number, companyId: number, required: string, note: string): Promise<R> {
  const p = z.object({ l: id, c: id, d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), n: z.string().trim().max(1000) }).safeParse({ l: leadId, c: companyId, d: required, n: note });
  if (!p.success) return { error: "Choose the project and the factory company." };
  const s = await requireSession();
  try { await createIcOrder(s, p.data.l, p.data.c, p.data.d || false, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function setIcLinesAction(orderId: number, lines: { name: string; qty: number; price: number }[]): Promise<R> {
  const p = z.object({ o: id, l: z.array(z.object({ name: z.string().trim().min(1).max(200), qty: z.number().positive().max(1e6), price: z.number().min(0).max(1e9) })).min(1).max(100) }).safeParse({ o: orderId, l: lines });
  if (!p.success) return { error: "Each line needs a description, quantity above 0 and a price of 0 or more." };
  const s = await requireSession();
  try { await setIcLines(s, p.data.o, p.data.l); } catch (e) { return fail(e); }
  return done();
}
export async function importJoineryAction(orderId: number): Promise<R> {
  if (!id.safeParse(orderId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await importIcJoinery(s, orderId); } catch (e) { return fail(e); }
  return done();
}
export async function icActionAction(orderId: number, action: string, note: string): Promise<R> {
  const p = z.object({ o: id, a: z.enum(["send", "cancel", "accept", "reject", "dispatch", "receive"]), n: z.string().trim().max(300) }).safeParse({ o: orderId, a: action, n: note });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await icAction(s, p.data.o, p.data.a, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function moveIcLineAction(lineId: number, stage: string): Promise<R> {
  const p = z.object({ l: id, s: z.enum(["queued", "cutting", "assembly", "finishing", "qc", "ready"]) }).safeParse({ l: lineId, s: stage });
  if (!p.success) return { error: "Invalid stage." };
  const s = await requireSession();
  try { await moveIcLine(s, p.data.l, p.data.s); } catch (e) { return fail(e); }
  return done();
}
