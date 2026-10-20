"use client";
import { useState, useTransition } from "react";
import { archiveEmployeeAction, editPayslipAction, generatePayrollAction, markAttendanceAction, payslipActionAction, requestLeaveAction, reviewLeaveAction, saveEmployeeAction } from "@/app/(dashboard)/m/hr/actions";
import type { AttRow, Employee, LeaveRow, Payslip } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inp = "h-9 rounded-md border border-line px-2 text-sm";
const primary = "h-9 rounded-md bg-primary px-4 text-sm text-white disabled:opacity-50";
const TONE: Record<string, string> = { pending: "text-gold", approved: "text-success", rejected: "text-danger", draft: "text-muted", paid: "text-success" };

function useRun() {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: () => void) => start(async () => { const r = await fn(); setErr(r.error); if (!r.error) ok?.(); });
  return { err, pending, run, Err: () => (err ? <p role="alert" className="text-xs text-danger">{err}</p> : null) };
}

const EMPTY = { name: "", code: "", kind: "site", pay_type: "daily", rate: 0, designation: "", phone: "", join_date: "", user_id: 0 };
export function EmployeesPanel({ employees, users, canManage, showRate }: { employees: Employee[]; users: { id: number; name: string }[]; canManage: boolean; showRate: boolean }) {
  const [f, setF] = useState<Record<string, unknown>>(EMPTY);
  const { pending, run, Err } = useRun();
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  return (
    <div className="space-y-3">
      {canManage && (
        <div className="space-y-1 rounded-md border border-line p-3">
          <p className="text-xs font-medium">{f.id ? "Edit employee" : "New employee"}</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Name" placeholder="Name" className={`${inp} min-w-0 flex-1`} value={String(f.name)} onChange={(e) => set("name", e.target.value)} />
            <input aria-label="Code" placeholder="Code" className={`${inp} w-24`} value={String(f.code)} onChange={(e) => set("code", e.target.value)} />
            <select aria-label="Type" className={inp} value={String(f.kind)} onChange={(e) => set("kind", e.target.value)}><option value="office">Office staff</option><option value="site">Site worker</option></select>
            <select aria-label="Pay type" className={inp} value={String(f.pay_type)} onChange={(e) => set("pay_type", e.target.value)}><option value="monthly">Monthly salary</option><option value="daily">Daily wage</option></select>
            <input aria-label="Rate" type="number" min="0" step="any" placeholder="Rate" className={`${inp} w-28`} value={Number(f.rate)} onChange={(e) => set("rate", Number(e.target.value))} />
            <input aria-label="Designation" placeholder="Designation" className={`${inp} w-36`} value={String(f.designation)} onChange={(e) => set("designation", e.target.value)} />
            <input aria-label="Phone" placeholder="Phone" className={`${inp} w-32`} value={String(f.phone)} onChange={(e) => set("phone", e.target.value)} />
            <input aria-label="Join date" type="date" className={inp} value={String(f.join_date)} onChange={(e) => set("join_date", e.target.value)} />
            <select aria-label="Login user" className={inp} value={Number(f.user_id)} onChange={(e) => set("user_id", Number(e.target.value))}><option value={0}>No login</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <button disabled={pending || !String(f.name).trim()} onClick={() => run(() => saveEmployeeAction(f), () => setF(EMPTY))} className={primary}>{f.id ? "Update" : "Add"}</button>
            {Boolean(f.id) && <button onClick={() => setF(EMPTY)} className="text-xs text-muted">Cancel</button>}
          </div>
        </div>
      )}
      <Err />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Name</th><th>Type</th><th>Designation</th><th>Pay</th>{showRate && <th className="text-right">Rate</th>}<th>Login</th>{canManage && <th />}</tr></thead>
        <tbody className="divide-y divide-line">{employees.map((e) => (
          <tr key={e.id}><td className="py-2">{e.name}<span className="block text-xs text-muted">{e.code} {e.phone}</span></td><td className="text-xs">{e.kind === "site" ? "Site worker" : "Office"}</td><td className="text-xs text-muted">{e.designation}</td><td className="text-xs">{e.pay_type === "daily" ? "Daily" : "Monthly"}</td>
            {showRate && <td className="text-right">{fmt(e.rate)}</td>}<td className="text-xs text-muted">{e.user || "—"}</td>
            {canManage && <td className="whitespace-nowrap text-right"><button onClick={() => setF({ ...e, join_date: e.join_date || "", user_id: e.user_id || 0 })} className="text-xs text-gold">Edit</button> <button disabled={pending} onClick={() => confirm(`Archive ${e.name}?`) && run(() => archiveEmployeeAction(e.id))} className="text-xs text-danger">Archive</button></td>}</tr>
        ))}{employees.length === 0 && <tr><td colSpan={7} className="py-3 text-muted">No employees.</td></tr>}</tbody></table></div>
    </div>
  );
}

export function AttendancePanel({ day, rows, leads }: { day: string; rows: AttRow[]; leads: { id: number; name: string }[] }) {
  const [state, setState] = useState(() => Object.fromEntries(rows.map((r) => [r.id, { status: r.status, lead_id: r.lead_id }])));
  const { pending, run, Err } = useRun();
  const [saved, setSaved] = useState(false);
  const upd = (id: number, p: Partial<{ status: string; lead_id: number }>) => { setSaved(false); setState({ ...state, [id]: { ...state[id], ...p } as (typeof state)[number] }); };
  const all = (status: AttRow["status"]) => { setSaved(false); setState(Object.fromEntries(rows.map((r) => [r.id, { ...state[r.id], status }]))); };
  const payload = rows.filter((r) => state[r.id]?.status).map((r) => ({ id: r.id, status: state[r.id].status as string, lead_id: state[r.id].lead_id || 0 }));
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2"><input name="date" type="date" defaultValue={day} max={new Date().toISOString().slice(0, 10)} className={inp} aria-label="Date" /><input type="hidden" name="tab" value="attendance" /><button className="h-9 rounded-md border border-line px-3 text-sm">Go</button>
        <span className="ml-auto flex gap-1 text-xs"><button type="button" onClick={() => all("present")} className="rounded border border-line px-2 py-1">All present</button></span></form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Employee</th><th>Status</th><th>Project</th><th className="text-right">This month (P / H / A / L)</th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.id}><td className="py-2">{r.name}<span className="block text-xs text-muted">{r.kind === "site" ? "Site worker" : "Office"}</span></td>
            <td><select aria-label={`Status of ${r.name}`} className={inp} value={state[r.id]?.status ?? ""} onChange={(e) => upd(r.id, { status: e.target.value })}><option value="">—</option><option value="present">Present</option><option value="half">Half day</option><option value="absent">Absent</option><option value="leave">Leave</option></select></td>
            <td><select aria-label={`Project of ${r.name}`} className={inp} value={state[r.id]?.lead_id ?? 0} onChange={(e) => upd(r.id, { lead_id: Number(e.target.value) })}><option value={0}>No project</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
            <td className="text-right text-xs text-muted">{r.month.present} / {r.month.half} / {r.month.absent} / {r.month.leave}</td></tr>
        ))}</tbody></table></div>
      <Err />
      <div className="flex items-center gap-3"><button disabled={pending || !payload.length} onClick={() => run(() => markAttendanceAction(day, payload), () => setSaved(true))} className={primary}>Save attendance</button>{saved && <span role="status" className="text-xs text-success">Saved</span>}</div>
    </div>
  );
}

export function LeavePanel({ mine, pendingList, hasEmployee, entitlement, taken, canReview }: { mine: LeaveRow[]; pendingList: LeaveRow[]; hasEmployee: boolean; entitlement: number; taken: number; canReview: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ from: today, to: today, reason: "" });
  const [note, setNote] = useState<Record<number, string>>({});
  const { pending, run, Err } = useRun();
  return (
    <div className="space-y-4">
      {hasEmployee ? (
        <section className="space-y-2"><p className="text-sm">Annual leave: <b>{fmt(taken)}</b> of {entitlement} days taken</p>
          <div className="flex flex-wrap gap-2"><input aria-label="From" type="date" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><input aria-label="To" type="date" className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            <input aria-label="Reason" placeholder="Reason" className={`${inp} min-w-0 flex-1`} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            <button disabled={pending || !f.reason.trim()} onClick={() => run(() => requestLeaveAction(f.from, f.to, f.reason), () => setF({ ...f, reason: "" }))} className={primary}>Request leave</button></div>
          <ul className="divide-y divide-line text-sm">{mine.map((l) => <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{l.from} → {l.to} <span className="text-xs text-muted">· {l.days} days · {l.reason}</span>{l.reject_reason && <span className="block text-xs text-danger">Rejected: {l.reject_reason}</span>}</span><span className={`text-[11px] ${TONE[l.status]}`}>{l.status}</span></li>)}{mine.length === 0 && <li className="py-2 text-muted">No leave requests yet.</li>}</ul></section>
      ) : <p className="text-sm text-muted">Your login is not linked to an employee record, so leave cannot be requested. Ask a Manager to link it.</p>}
      {canReview && (
        <section><h3 className="mb-2 text-sm font-semibold">Waiting for approval</h3>
          {pendingList.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : <ul className="divide-y divide-line text-sm">{pendingList.map((l) => (
            <li key={l.id} className="py-2"><span><b>{l.employee}</b> <span className="text-xs text-muted">· {l.from} → {l.to} · {l.days} days · {l.reason}</span></span>
              {l.own ? <span className="ml-2 text-[11px] text-muted">Your own request</span> : <div className="mt-1 flex flex-wrap gap-2"><input aria-label="Reason" placeholder="Reason (required to reject)" className={`${inp} h-8 min-w-0 flex-1`} value={note[l.id] ?? ""} onChange={(e) => setNote({ ...note, [l.id]: e.target.value })} />
                <button disabled={pending} onClick={() => run(() => reviewLeaveAction(l.id, "approve", ""))} className="h-8 rounded bg-success/80 px-3 text-xs text-white disabled:opacity-50">Approve</button>
                <button disabled={pending} onClick={() => run(() => reviewLeaveAction(l.id, "reject", note[l.id] ?? ""))} className="h-8 rounded border border-danger/60 px-3 text-xs text-danger disabled:opacity-50">Reject</button></div>}</li>))}</ul>}
        </section>
      )}
      <Err />
    </div>
  );
}

export function PayrollPanel({ month, slips, can }: { month: string; slips: Payslip[]; can: { generate: boolean; approve: boolean; pay: boolean; full: boolean } }) {
  const [edit, setEdit] = useState<Record<number, { a: string; d: string }>>({});
  const { pending, run, Err } = useRun();
  const total = slips.reduce((a, s) => a + s.net, 0);
  return (
    <div className="space-y-3">
      {can.full && <form className="flex flex-wrap items-center gap-2"><input type="hidden" name="tab" value="payroll" /><input name="month" type="month" defaultValue={month.slice(0, 7)} className={inp} aria-label="Month" /><button className="h-9 rounded-md border border-line px-3 text-sm">Go</button>
        {can.generate && <button type="button" disabled={pending} onClick={() => run(() => generatePayrollAction(month))} className={`${primary} ml-auto`}>Generate / refresh drafts</button>}</form>}
      <Err />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-1">Employee</th><th>Month</th><th className="text-right">Paid days</th><th className="text-right">Base</th><th className="text-right">Allowances</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th>Status</th><th /></tr></thead>
        <tbody className="divide-y divide-line">{slips.map((s) => {
          const e = edit[s.id];
          return (
            <tr key={s.id}><td className="py-2">{s.employee}<span className="block text-xs text-muted">{s.pay_type === "daily" ? `${fmt(s.rate)}/day` : `${fmt(s.rate)}/month`}</span></td><td className="text-xs">{s.month.slice(0, 7)}</td><td className="text-right">{fmt(s.paid_days)} / {fmt(s.working_days)}</td><td className="text-right">{fmt(s.base)}</td>
              <td className="text-right">{e ? <input aria-label="Allowances" type="number" min="0" className={`${inp} h-8 w-24`} value={e.a} onChange={(x) => setEdit({ ...edit, [s.id]: { ...e, a: x.target.value } })} /> : fmt(s.allowances)}</td>
              <td className="text-right">{e ? <input aria-label="Deductions" type="number" min="0" className={`${inp} h-8 w-24`} value={e.d} onChange={(x) => setEdit({ ...edit, [s.id]: { ...e, d: x.target.value } })} /> : fmt(s.deductions)}</td>
              <td className="text-right font-semibold">{fmt(s.net)}</td><td className={`text-xs ${TONE[s.status]}`}>{s.status}</td>
              <td className="whitespace-nowrap text-right text-xs">
                {s.status === "draft" && can.generate && (e ? <button disabled={pending} onClick={() => run(() => editPayslipAction(s.id, Number(e.a || 0), Number(e.d || 0), s.note), () => setEdit({ ...edit, [s.id]: undefined as never }))} className="text-gold">Save</button> : <button onClick={() => setEdit({ ...edit, [s.id]: { a: String(s.allowances), d: String(s.deductions) } })} className="text-gold">Adjust</button>)}
                {s.status === "draft" && can.approve && <> <button disabled={pending} onClick={() => run(() => payslipActionAction(s.id, "approve"))} className="text-success">Approve</button></>}
                {s.status === "approved" && can.pay && <button disabled={pending} onClick={() => run(() => payslipActionAction(s.id, "pay"))} className="text-success">Mark paid</button>}</td></tr>
          );
        })}{slips.length === 0 && <tr><td colSpan={9} className="py-3 text-muted">No payslips. {can.generate ? "Generate drafts from attendance." : ""}</td></tr>}</tbody>
        {slips.length > 0 && <tfoot><tr><td colSpan={6} className="py-2 text-right text-xs text-muted">Total net</td><td className="text-right font-semibold">{fmt(total)}</td><td colSpan={2} /></tr></tfoot>}</table></div>
    </div>
  );
}
