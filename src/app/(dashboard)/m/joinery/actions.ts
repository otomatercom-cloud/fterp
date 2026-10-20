"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addJoinery, moveJoinery } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const STAGES = ["drawing", "approved", "cutting", "assembly", "finishing", "ready", "installed"] as const;

export async function addJoineryAction(leadId: number, name: string, qty: number, due: string): Promise<R> {
  const p = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(200), qty: z.number().positive().max(1e6), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).safeParse({ id: leadId, name, qty, due });
  if (!p.success) return { error: "Enter an item name, a quantity above 0 and a valid date if set." };
  const s = await requireSession();
  try { await addJoinery(s, p.data.id, p.data.name, p.data.qty, p.data.due || false); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}

export async function moveJoineryAction(jobId: number, stage: string): Promise<R> {
  const p = z.object({ id: z.number().int().positive(), st: z.enum(STAGES) }).safeParse({ id: jobId, st: stage });
  if (!p.success) return { error: "Invalid request" };
  const s = await requireSession();
  try { await moveJoinery(s, p.data.id, p.data.st); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}
