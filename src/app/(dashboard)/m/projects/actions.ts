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

import { addTask, setTaskStatus } from "@/lib/odoo/leads";
const fail = (e: unknown): { error?: string } => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
export async function addTaskAction(leadId: number, name: string, kind: string, due: string): Promise<{ error?: string }> {
  const p = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(200), kind: z.enum(["task", "snag"]), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) }).safeParse({ id: leadId, name, kind, due });
  if (!p.success) return { error: "Enter a task name (and a valid date if set)." };
  const s = await requireSession();
  try { await addTask(s, p.data.id, p.data.name, p.data.kind, p.data.due || false); } catch (e) { return fail(e); }
  revalidatePath("/m/projects", "layout");
  return {};
}
export async function setTaskStatusAction(leadId: number, taskId: number, status: string): Promise<{ error?: string }> {
  const p = z.object({ id: z.number().int().positive(), t: z.number().int().positive(), st: z.enum(["todo", "doing", "done"]) }).safeParse({ id: leadId, t: taskId, st: status });
  if (!p.success) return { error: "Invalid request" };
  const s = await requireSession();
  try { await setTaskStatus(s, p.data.id, p.data.t, p.data.st); } catch (e) { return fail(e); }
  revalidatePath("/m/projects", "layout");
  return {};
}
