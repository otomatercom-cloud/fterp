"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { createInvoice, createLead, postInvoice, registerPayment, runTransition, saveEstimate, setLeadField } from "@/lib/odoo/leads";
import { FIELD_STAGES, TRANSITIONS } from "@/lib/workflow/interior";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const valid = new Set(TRANSITIONS.map((t) => t.action));

export async function transitionAction(leadId: number, action: string): Promise<R> {
  if (!id.safeParse(leadId).success || !valid.has(action)) return { error: "Invalid request" };
  const s = await requireSession();
  try { await runTransition(s, leadId, action); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}

export async function setFieldAction(leadId: number, field: string, value: number): Promise<R> {
  if (!id.safeParse(leadId).success || !(field in FIELD_STAGES) || !Number.isFinite(value) || value < 0) return { error: "Invalid request" };
  const s = await requireSession();
  try { await setLeadField(s, leadId, field, value); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}

const lines = z.array(z.object({ name: z.string().trim().min(1).max(200), qty: z.number().positive().max(1e6), price: z.number().min(0).max(1e9) })).min(1).max(200);
export async function saveEstimateAction(leadId: number, input: unknown): Promise<R> {
  const p = lines.safeParse(input);
  if (!id.safeParse(leadId).success || !p.success) return { error: "Each line needs a description, quantity above 0 and a price of 0 or more." };
  const s = await requireSession();
  try { await saveEstimate(s, leadId, p.data); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}

const newLead = z.object({
  name: z.string().trim().min(1, "Lead name is required").max(120),
  partner_name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().max(30).optional(),
  email_from: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  expected_revenue: z.coerce.number().min(0).max(1e10).default(0),
  otm_origin: z.enum(["walkin", "other"]),
  description: z.string().trim().max(2000).optional(),
});
export async function createLeadAction(_: R, fd: FormData): Promise<R> {
  const p = newLead.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const s = await requireSession();
  let leadId: number;
  try {
    leadId = await createLead(s, { ...p.data, type: "opportunity" });
  } catch (e) { return fail(e); }
  redirect(`/m/crm/${leadId}`);
}

export async function createInvoiceAction(leadId: number, amount: number): Promise<R> {
  if (!id.safeParse(leadId).success || !Number.isFinite(amount) || amount <= 0 || amount > 1e10) return { error: "Enter an amount above 0." };
  const s = await requireSession();
  try { await createInvoice(s, leadId, amount); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}
export async function postInvoiceAction(leadId: number): Promise<R> {
  if (!id.safeParse(leadId).success) return { error: "Invalid request" };
  const s = await requireSession();
  try { await postInvoice(s, leadId); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}
export async function registerPaymentAction(leadId: number, journalId: number): Promise<R> {
  if (!id.safeParse(leadId).success || !id.safeParse(journalId).success) return { error: "Select a journal." };
  const s = await requireSession();
  try { await registerPayment(s, leadId, journalId); } catch (e) { return fail(e); }
  revalidatePath("/m/crm", "layout");
  return {};
}
