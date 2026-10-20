"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { archiveRate, restoreRevision, saveRate } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const CATS = ["joinery", "ceiling", "flooring", "wall", "kitchen", "lighting", "mep", "furniture", "other"] as const;
const rate = z.object({ id: z.number().int().positive().optional(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(200), category: z.enum(CATS), unit: z.string().trim().min(1).max(12), rate: z.number().min(0).max(1e9), cost: z.number().min(0).max(1e9) });

export async function saveRateAction(input: unknown): Promise<R> {
  const p = rate.safeParse(input);
  if (!p.success) return { error: "Enter code, name, unit, category and rates of 0 or more." };
  const s = await requireSession();
  try { await saveRate(s, p.data); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}
export async function archiveRateAction(rateId: number): Promise<R> {
  if (!Number.isInteger(rateId) || rateId <= 0) return { error: "Invalid request." };
  const s = await requireSession();
  try { await archiveRate(s, rateId); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}
export async function restoreRevisionAction(leadId: number, revId: number): Promise<R> {
  if (![leadId, revId].every((n) => Number.isInteger(n) && n > 0)) return { error: "Invalid request." };
  const s = await requireSession();
  try { await restoreRevision(s, leadId, revId); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}
