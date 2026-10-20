"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { readNotif } from "@/lib/odoo/leads";

export async function markReadAction(noteId: number): Promise<{ error?: string }> {
  if (!z.number().int().min(0).safeParse(noteId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await readNotif(s, noteId); } catch { return { error: "Could not update." }; }
  revalidatePath("/m", "layout");
  return {};
}
