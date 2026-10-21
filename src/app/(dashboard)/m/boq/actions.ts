"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { archivePackage, archiveRate, archiveTrade, restoreRevision, saveCostSettings, savePackage, saveRate, saveTrade } from "@/lib/odoo/leads";

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

const pct = z.number().finite().min(0);
export async function saveCostSettingsAction(m: number, b: number, st: number, v: number): Promise<R> {
  if (![m, b, st, v].every((x) => pct.safeParse(x).success)) return { error: "Enter valid numbers" };
  const s = await requireSession();
  try { await saveCostSettings(s, m, b, st, v); } catch (e) { return fail(e); }
  revalidatePath("/m/boq");
  return {};
}
export async function saveTradeAction(input: unknown): Promise<R> {
  const p = z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(60), rate: pct.max(1e6) }).safeParse(input);
  if (!p.success) return { error: "Enter a trade name and a daily rate of 0 or more." };
  const s = await requireSession();
  try { await saveTrade(s, p.data); } catch (e) { return fail(e); }
  revalidatePath("/m/boq");
  return {};
}
export async function archiveTradeAction(id: number): Promise<R> {
  if (!Number.isInteger(id) || id <= 0) return { error: "Invalid request" };
  const s = await requireSession();
  try { await archiveTrade(s, id); } catch (e) { return fail(e); }
  revalidatePath("/m/boq");
  return {};
}
const pkg = z.object({ id: z.number().int().positive().optional(), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(120), category: z.enum(CATS), unit: z.string().trim().min(1).max(12),
  trade_id: z.number().int().positive().optional(), workers: pct.max(1000), days_per_unit: pct.max(1000), install_unit: pct.max(1e9), items: z.array(z.object({ item_id: z.number().int().positive(), qty: z.number().positive().max(1e6) })).max(50) });
export async function savePackageAction(input: unknown): Promise<R> {
  const p = pkg.safeParse(input);
  if (!p.success) return { error: "Enter code, name, category, unit and valid numbers." };
  const s = await requireSession();
  try { await savePackage(s, p.data); } catch (e) { return fail(e); }
  revalidatePath("/m/boq");
  return {};
}
export async function archivePackageAction(id: number): Promise<R> {
  if (!Number.isInteger(id) || id <= 0) return { error: "Invalid request" };
  const s = await requireSession();
  try { await archivePackage(s, id); } catch (e) { return fail(e); }
  revalidatePath("/m/boq");
  return {};
}
