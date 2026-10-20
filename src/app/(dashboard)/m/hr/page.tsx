import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getAttendance, getEmployees, getLeaves, getPayroll } from "@/lib/odoo/leads";
import { AttendancePanel, EmployeesPanel, LeavePanel, PayrollPanel } from "@/components/hr-panels";

export default async function HrPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; month?: string }> }) {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "hr");
  if (!item || !canSee(item, s.groups)) notFound();
  const sp = await searchParams;
  const g = (r: string) => s.groups.includes("base.group_system") || s.groups.includes(`otm_ft_pipeline.group_ft_${r}`);
  const canMark = g("manager") || g("project_manager");
  const full = g("manager") || g("accounts");
  const tabs = [["employees", full || g("project_manager") ? "Employees" : "My record"], ...(canMark ? [["attendance", "Attendance"]] : []), ["leave", "Leave"], ["payroll", full ? "Payroll" : "My payslips"]];
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "employees";
  const today = new Date().toISOString().slice(0, 10);
  const day = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : `${today.slice(0, 7)}-01`;
  let body: React.ReactNode;
  try {
    if (tab === "employees") { const d = await getEmployees(s); body = <EmployeesPanel employees={d.employees} users={d.users} canManage={d.can_manage} showRate={full || d.employees.some((e) => e.rate > 0)} />; }
    else if (tab === "attendance") { const d = await getAttendance(s, day); body = <AttendancePanel key={day} day={day} rows={d.rows} leads={d.leads} />; }
    else if (tab === "leave") { const d = await getLeaves(s); body = <LeavePanel mine={d.mine} pendingList={d.pending} hasEmployee={d.has_employee} entitlement={d.entitlement} taken={d.taken} canReview={d.can_review} />; }
    else { const d = await getPayroll(s, month); body = <PayrollPanel month={month} slips={d.slips} can={{ generate: d.can_generate, approve: d.can_approve, pay: d.can_pay, full: d.full }} />; }
  } catch {
    body = <p className="text-sm">HR data is not available. Check access and that the FT Pipeline module is upgraded.</p>;
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">HR &amp; Payroll</h1><p className="text-sm text-muted">Employees, daily attendance with project, leave and monthly payroll</p></div>
      <div className="flex flex-wrap gap-1">{tabs.map(([k, l]) => <Link key={k} href={`/m/hr?tab=${k}`} className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-gold text-gold" : "border-line text-muted"}`}>{l}</Link>)}</div>
      <section className="glass p-5">{body}</section>
    </div>
  );
}
