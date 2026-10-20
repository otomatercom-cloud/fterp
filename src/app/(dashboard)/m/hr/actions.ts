"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { archiveEmployee, editPayslip, generatePayroll, markAttendance, payslipAction, requestLeave, reviewLeave, saveEmployee } from "@/lib/odoo/leads";

type R = { error?: string };
const fail = (e: unknown): R => {
  if (e instanceof OdooError) return { error: e.code === "access" ? "You are not allowed to do this." : e.message };
  throw e;
};
const id = z.number().int().positive();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const done = (): R => { revalidatePath("/m/hr", "layout"); revalidatePath("/m", "layout"); return {}; };

export async function saveEmployeeAction(input: unknown): Promise<R> {
  const p = z.object({ id: id.optional(), name: z.string().trim().min(1).max(120), code: z.string().trim().max(20), kind: z.enum(["office", "site"]), pay_type: z.enum(["monthly", "daily"]), rate: z.number().min(0).max(1e8), designation: z.string().trim().max(80), phone: z.string().trim().max(30), join_date: day.or(z.literal("")), user_id: z.number().int().min(0) }).safeParse(input);
  if (!p.success) return { error: "Enter a name, type, pay type and a rate of 0 or more." };
  const s = await requireSession();
  try { await saveEmployee(s, { ...p.data, join_date: p.data.join_date || false, user_id: p.data.user_id || false }); } catch (e) { return fail(e); }
  return done();
}
export async function archiveEmployeeAction(empId: number): Promise<R> {
  if (!id.safeParse(empId).success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await archiveEmployee(s, empId); } catch (e) { return fail(e); }
  return done();
}
export async function markAttendanceAction(date: string, rows: { id: number; status: string; lead_id: number }[]): Promise<R> {
  const p = z.object({ d: day, r: z.array(z.object({ id, status: z.enum(["present", "half", "absent", "leave"]), lead_id: z.number().int().min(0) })).min(1).max(500) }).safeParse({ d: date, r: rows });
  if (!p.success) return { error: "Choose a status for at least one employee." };
  const s = await requireSession();
  try { await markAttendance(s, p.data.d, p.data.r); } catch (e) { return fail(e); }
  return done();
}
export async function requestLeaveAction(from: string, to: string, reason: string): Promise<R> {
  const p = z.object({ a: day, b: day, r: z.string().trim().min(1).max(200) }).safeParse({ a: from, b: to, r: reason });
  if (!p.success) return { error: "Choose the dates and write the reason." };
  const s = await requireSession();
  try { await requestLeave(s, p.data.a, p.data.b, p.data.r); } catch (e) { return fail(e); }
  return done();
}
export async function reviewLeaveAction(leaveId: number, decision: string, note: string): Promise<R> {
  const p = z.object({ l: id, d: z.enum(["approve", "reject"]), n: z.string().trim().max(200) }).safeParse({ l: leaveId, d: decision, n: note });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await reviewLeave(s, p.data.l, p.data.d, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function generatePayrollAction(month: string): Promise<R> {
  if (!day.safeParse(month).success) return { error: "Invalid month." };
  const s = await requireSession();
  try { await generatePayroll(s, month); } catch (e) { return fail(e); }
  return done();
}
export async function editPayslipAction(slip: number, allowances: number, deductions: number, note: string): Promise<R> {
  const p = z.object({ s: id, a: z.number().min(0).max(1e8), d: z.number().min(0).max(1e8), n: z.string().trim().max(200) }).safeParse({ s: slip, a: allowances, d: deductions, n: note });
  if (!p.success) return { error: "Amounts must be 0 or more." };
  const s = await requireSession();
  try { await editPayslip(s, p.data.s, p.data.a, p.data.d, p.data.n); } catch (e) { return fail(e); }
  return done();
}
export async function payslipActionAction(slip: number, action: string): Promise<R> {
  const p = z.object({ s: id, a: z.enum(["approve", "pay"]) }).safeParse({ s: slip, a: action });
  if (!p.success) return { error: "Invalid request." };
  const s = await requireSession();
  try { await payslipAction(s, p.data.s, p.data.a); } catch (e) { return fail(e); }
  return done();
}
