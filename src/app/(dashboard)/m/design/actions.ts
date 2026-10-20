"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { addDesign, designAction } from "@/lib/odoo/leads";

const fail = (e: unknown): { error?: string } => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const KINDS = ["concept", "moodboard", "material_board", "layout", "render_3d", "shop_drawing"] as const;

export async function addDesignAction(leadId: number, name: string, kind: string, due: string, note: string): Promise<{ error?: string }> {
  const p = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(200), kind: z.enum(KINDS), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), note: z.string().trim().max(1000) }).safeParse({ id: leadId, name, kind, due, note });
  if (!p.success) return { error: "Enter a name and choose a type." };
  const s = await requireSession();
  try { await addDesign(s, p.data.id, p.data.name, p.data.kind, p.data.due || false, p.data.note); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}

export async function designAction_(designId: number, action: string, note: string): Promise<{ error?: string }> {
  const p = z.object({ id: z.number().int().positive(), action: z.enum(["submit", "approve", "request_changes"]), note: z.string().trim().max(1000) }).safeParse({ id: designId, action, note });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await designAction(s, p.data.id, p.data.action, p.data.note); } catch (e) { return fail(e); }
  revalidatePath("/m", "layout");
  return {};
}
