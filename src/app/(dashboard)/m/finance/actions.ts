"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { followupMilestone, invoiceMilestone, payMilestone, setMilestones } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const done = () => { revalidatePath("/m", "layout"); return {} as R; };

export async function setMilestonesAction(leadId: number, lines: { name: string; kind: string; percent: number; trigger: number }[]): Promise<R> {
  const p = z.object({ id, lines: z.array(z.object({ name: z.string().trim().min(1).max(120), kind: z.enum(["advance", "progress", "final", "retention", "other"]), percent: z.number().gt(0).max(100), trigger: z.number().int().min(0).max(100) })).min(1).max(12) }).safeParse({ id: leadId, lines });
  if (!p.success) return { error: "Each milestone needs a name, type and percentage." };
  const s = await requireSession();
  try { await setMilestones(s, p.data.id, p.data.lines); } catch (e) { return fail(e); }
  return done();
}
export async function invoiceMilestoneAction(leadId: number, msId: number): Promise<R> {
  const p = z.object({ a: id, b: id }).safeParse({ a: leadId, b: msId });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await invoiceMilestone(s, p.data.a, p.data.b); } catch (e) { return fail(e); }
  return done();
}
export async function payMilestoneAction(leadId: number, msId: number, journalId: number): Promise<R> {
  const p = z.object({ a: id, b: id, c: id }).safeParse({ a: leadId, b: msId, c: journalId });
  if (!p.success) return { error: "Choose a payment journal." };
  const s = await requireSession();
  try { await payMilestone(s, p.data.a, p.data.b, p.data.c); } catch (e) { return fail(e); }
  return done();
}
export async function followupAction(leadId: number, msId: number, note: string): Promise<R> {
  const p = z.object({ a: id, b: id, n: z.string().trim().min(1).max(500) }).safeParse({ a: leadId, b: msId, n: note });
  if (!p.success) return { error: "Write the follow-up note." };
  const s = await requireSession();
  try { await followupMilestone(s, p.data.a, p.data.b, p.data.n); } catch (e) { return fail(e); }
  return done();
}
