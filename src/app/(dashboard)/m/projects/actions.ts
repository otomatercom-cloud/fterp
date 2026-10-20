"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addSiteUpdate } from "@/lib/odoo/leads";

export async function addSiteUpdateAction(leadId: number, percent: number, note: string): Promise<{ error?: string }> {
  const p = z.object({ id: z.number().int().positive(), percent: z.number().int().min(0).max(100), note: z.string().trim().min(1).max(500) }).safeParse({ id: leadId, percent, note });
  if (!p.success) return { error: "Enter progress between 0 and 100 and a short note." };
  const s = await requireSession();
  try { await addSiteUpdate(s, p.data.id, p.data.percent, p.data.note); } catch (e) {
    if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
    throw e;
  }
  revalidatePath("/m/projects", "layout");
  revalidatePath("/", "layout");
  return {};
}
