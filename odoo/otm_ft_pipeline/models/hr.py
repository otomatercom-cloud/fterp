import calendar
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, PM

HR_ROLES = ("sales_manager", MGR, PM, "procurement", ACC)
ATT = [("present", "Present"), ("half", "Half day"), ("absent", "Absent"), ("leave", "Leave")]
ANNUAL_LEAVE = 24
MONTH_DAYS = 26  # monthly salary is divided by working days (Sundays excluded) when costing a single day


class OtmFtEmployee(models.Model):
    _name = "otm.ft.employee"
    _description = "FT Employee"
    _order = "name"

    name = fields.Char(required=True)
    code = fields.Char()
    user_id = fields.Many2one("res.users", string="Login user")
    kind = fields.Selection([("office", "Office staff"), ("site", "Site worker")], default="office", required=True)
    designation = fields.Char()
    pay_type = fields.Selection([("monthly", "Monthly salary"), ("daily", "Daily wage")], default="monthly", required=True)
    rate = fields.Float(help="Monthly salary or daily wage")
    join_date = fields.Date()
    phone = fields.Char()
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company)


class OtmFtAttendance(models.Model):
    _name = "otm.ft.attendance"
    _description = "FT Attendance"
    _order = "date desc, id desc"

    employee_id = fields.Many2one("otm.ft.employee", required=True, ondelete="cascade", index=True)
    date = fields.Date(required=True, index=True)
    status = fields.Selection(ATT, required=True, default="present")
    lead_id = fields.Many2one("crm.lead", ondelete="set null", index=True)
    marked_by = fields.Many2one("res.users", default=lambda self: self.env.user)

    _emp_day_uniq = models.Constraint("unique(employee_id, date)", "Attendance is already marked for this employee and day.")


class OtmFtLeave(models.Model):
    _name = "otm.ft.leave"
    _description = "FT Leave Request"
    _order = "id desc"

    employee_id = fields.Many2one("otm.ft.employee", required=True, ondelete="cascade", index=True)
    date_from = fields.Date(required=True)
    date_to = fields.Date(required=True)
    days = fields.Float()
    reason = fields.Char()
    status = fields.Selection([("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="pending", required=True)
    reviewed_by = fields.Many2one("res.users")
    reject_reason = fields.Char()


class OtmFtPayslip(models.Model):
    _name = "otm.ft.payslip"
    _description = "FT Payslip"
    _order = "month desc, employee_id"

    employee_id = fields.Many2one("otm.ft.employee", required=True, ondelete="cascade", index=True)
    month = fields.Date(required=True, index=True, help="First day of the month")
    paid_days = fields.Float()
    working_days = fields.Float()
    base_pay = fields.Float()
    allowances = fields.Float()
    deductions = fields.Float()
    net = fields.Float()
    note = fields.Char()
    status = fields.Selection([("draft", "Draft"), ("approved", "Approved"), ("paid", "Paid")], default="draft", required=True)
    paid_on = fields.Date()

    _emp_month_uniq = models.Constraint("unique(employee_id, month)", "A payslip already exists for this employee and month.")


class CrmLeadHr(models.Model):
    _inherit = "crm.lead"

    # ---- helpers ----
    @api.model
    def _otm_hr_roles(self):
        roles = self._otm_user_roles()
        if not any(r in roles for r in HR_ROLES):
            raise UserError(self.env._("HR is available to pipeline staff."))
        return roles

    @api.model
    def _otm_my_employee(self):
        return self.env["otm.ft.employee"].sudo().search([("user_id", "=", self.env.user.id)], limit=1)

    @api.model
    def _otm_emp_dict(self, e, show_rate):
        return {"id": e.id, "name": e.name, "code": e.code or "", "user_id": e.user_id.id or False, "user": e.user_id.name or "", "kind": e.kind, "designation": e.designation or "",
                "pay_type": e.pay_type, "rate": e.rate if show_rate else 0.0, "join_date": fields.Date.to_string(e.join_date) if e.join_date else False, "phone": e.phone or ""}

    @api.model
    def _otm_month_start(self, month):
        try:
            d = fields.Date.from_string(month)
        except Exception:
            raise UserError(self.env._("Invalid month."))
        return d.replace(day=1)

    @api.model
    def _otm_working_days(self, first):
        last = calendar.monthrange(first.year, first.month)[1]
        return float(sum(1 for k in range(last) if (first + timedelta(days=k)).weekday() != 6))

    @api.model
    def _otm_day_cost(self, e):
        return e.rate if e.pay_type == "daily" else e.rate / MONTH_DAYS

    # ---- employees ----
    @api.model
    def otm_hr_employees(self):
        roles = self._otm_hr_roles()
        Emp = self.env["otm.ft.employee"].sudo()
        full = MGR in roles or ACC in roles
        if full:
            emps = Emp.search([])
        elif PM in roles:
            emps = Emp.search([("kind", "=", "site")])
        else:
            emps = self._otm_my_employee()
        users = []
        if MGR in roles:
            users = [{"id": u.id, "name": u.name} for u in self.env["res.users"].sudo().search([("share", "=", False), ("active", "=", True)], order="name")]
        return {"can_manage": MGR in roles, "employees": [self._otm_emp_dict(e, full or e.user_id == self.env.user) for e in emps], "users": users}

    @api.model
    def otm_hr_save_employee(self, vals):
        if MGR not in self._otm_hr_roles():
            raise UserError(self.env._("Only a Manager can edit employees."))
        name = str(vals.get("name") or "").strip()[:120]
        kind, pay = vals.get("kind"), vals.get("pay_type")
        rate = float(vals.get("rate") or 0)
        if not name or kind not in ("office", "site") or pay not in ("monthly", "daily") or rate < 0:
            raise UserError(self.env._("Enter a name, type, pay type and a rate of 0 or more."))
        data = {"name": name, "code": str(vals.get("code") or "").strip()[:20], "kind": kind, "pay_type": pay, "rate": rate, "designation": str(vals.get("designation") or "").strip()[:80],
                "phone": str(vals.get("phone") or "").strip()[:30], "join_date": vals.get("join_date") or False, "user_id": int(vals["user_id"]) if vals.get("user_id") else False}
        Emp = self.env["otm.ft.employee"].sudo()
        if data["user_id"] and Emp.search_count([("user_id", "=", data["user_id"]), ("id", "!=", int(vals.get("id") or 0))]):
            raise UserError(self.env._("This login user is already linked to another employee."))
        if vals.get("id"):
            Emp.browse(int(vals["id"])).write(data)
        else:
            Emp.create(data)
        return True

    @api.model
    def otm_hr_archive_employee(self, emp_id):
        if MGR not in self._otm_hr_roles():
            raise UserError(self.env._("Only a Manager can edit employees."))
        self.env["otm.ft.employee"].sudo().browse(int(emp_id)).write({"active": False})
        return True

    # ---- attendance ----
    @api.model
    def _otm_att_scope(self, roles):
        """(employees the user may mark, leads they may assign)."""
        Emp = self.env["otm.ft.employee"].sudo()
        if MGR in roles:
            emps = Emp.search([])
            leads = self.search([("otm_stage", "in", ("work_started", "handover"))])
        elif PM in roles:
            emps = Emp.search([("kind", "=", "site")])
            leads = self.search([("otm_stage", "in", ("work_started", "handover")), ("otm_project_manager_id", "=", self.env.user.id)])
        else:
            raise UserError(self.env._("Attendance is marked by Managers and Project Managers."))
        return emps, leads

    @api.model
    def otm_hr_attendance(self, day):
        roles = self._otm_hr_roles()
        emps, leads = self._otm_att_scope(roles)
        d = fields.Date.from_string(day)
        rows = {a.employee_id.id: a for a in self.env["otm.ft.attendance"].sudo().search([("date", "=", d), ("employee_id", "in", emps.ids)])}
        first = d.replace(day=1)
        last = first.replace(day=calendar.monthrange(d.year, d.month)[1])
        month = {}
        for a in self.env["otm.ft.attendance"].sudo().search([("date", ">=", first), ("date", "<=", last), ("employee_id", "in", emps.ids)]):
            m = month.setdefault(a.employee_id.id, {"present": 0, "half": 0, "absent": 0, "leave": 0})
            m[a.status] += 1
        return {
            "leads": [{"id": l.id, "name": l.name} for l in leads],
            "rows": [{"id": e.id, "name": e.name, "kind": e.kind, "status": rows[e.id].status if e.id in rows else "", "lead_id": rows[e.id].lead_id.id if e.id in rows and rows[e.id].lead_id else 0,
                      "month": month.get(e.id, {"present": 0, "half": 0, "absent": 0, "leave": 0})} for e in emps],
        }

    @api.model
    def otm_hr_mark(self, day, rows):
        roles = self._otm_hr_roles()
        emps, leads = self._otm_att_scope(roles)
        d = fields.Date.from_string(day)
        if d > fields.Date.context_today(self):
            raise UserError(self.env._("Attendance cannot be marked for a future date."))
        Att = self.env["otm.ft.attendance"].sudo()
        n = 0
        for r in rows if isinstance(rows, list) else []:
            emp = emps.filtered(lambda e: e.id == int(r.get("id") or 0))
            if not emp or r.get("status") not in dict(ATT):
                continue
            lead_id = int(r.get("lead_id") or 0)
            if lead_id and lead_id not in leads.ids:
                raise UserError(self.env._("You can only assign your own running projects."))
            vals = {"status": r["status"], "lead_id": lead_id or False, "marked_by": self.env.user.id}
            cur = Att.search([("employee_id", "=", emp.id), ("date", "=", d)], limit=1)
            cur.write(vals) if cur else Att.create({**vals, "employee_id": emp.id, "date": d})
            n += 1
        return n

    # ---- leave ----
    @api.model
    def _otm_leave_dict(self, l):
        return {"id": l.id, "employee": l.employee_id.name, "from": fields.Date.to_string(l.date_from), "to": fields.Date.to_string(l.date_to), "days": l.days, "reason": l.reason or "",
                "status": l.status, "reviewed_by": l.reviewed_by.name or "", "reject_reason": l.reject_reason or "", "employee_id": l.employee_id.id, "own": l.employee_id.user_id == self.env.user}

    @api.model
    def otm_hr_leaves(self):
        roles = self._otm_hr_roles()
        Leave = self.env["otm.ft.leave"].sudo()
        me = self._otm_my_employee()
        mine = Leave.search([("employee_id", "=", me.id)], limit=50) if me else Leave
        taken = sum(Leave.search([("employee_id", "=", me.id), ("status", "=", "approved"), ("date_from", ">=", fields.Date.context_today(self).replace(month=1, day=1))]).mapped("days")) if me else 0
        review = Leave.search([("status", "=", "pending")], order="id") if MGR in roles else Leave
        return {"has_employee": bool(me), "entitlement": ANNUAL_LEAVE, "taken": taken, "can_review": MGR in roles, "mine": [self._otm_leave_dict(l) for l in mine], "pending": [self._otm_leave_dict(l) for l in review]}

    @api.model
    def otm_hr_leave_request(self, d_from, d_to, reason):
        self._otm_hr_roles()
        me = self._otm_my_employee()
        if not me:
            raise UserError(self.env._("Your login is not linked to an employee record. Ask a Manager."))
        a, b = fields.Date.from_string(d_from), fields.Date.from_string(d_to)
        if b < a or (b - a).days > 60:
            raise UserError(self.env._("Choose a valid date range (up to 60 days)."))
        if not str(reason or "").strip():
            raise UserError(self.env._("Write the reason."))
        days = float(sum(1 for k in range((b - a).days + 1) if (a + timedelta(days=k)).weekday() != 6))
        Leave = self.env["otm.ft.leave"].sudo()
        if Leave.search_count([("employee_id", "=", me.id), ("status", "!=", "rejected"), ("date_from", "<=", b), ("date_to", ">=", a)]):
            raise UserError(self.env._("You already have a leave request in this period."))
        Leave.create({"employee_id": me.id, "date_from": a, "date_to": b, "days": days, "reason": str(reason).strip()[:200]})
        return True

    @api.model
    def otm_hr_leave_review(self, leave_id, decision, note=""):
        if MGR not in self._otm_hr_roles():
            raise UserError(self.env._("Only a Manager can review leave."))
        l = self.env["otm.ft.leave"].sudo().browse(int(leave_id))
        if not l.exists() or l.status != "pending":
            raise UserError(self.env._("This request is no longer pending."))
        if l.employee_id.user_id == self.env.user and not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("You cannot review your own leave."))
        if decision == "approve":
            Att = self.env["otm.ft.attendance"].sudo()
            for k in range((l.date_to - l.date_from).days + 1):
                day = l.date_from + timedelta(days=k)
                if day.weekday() == 6:
                    continue
                cur = Att.search([("employee_id", "=", l.employee_id.id), ("date", "=", day)], limit=1)
                cur.write({"status": "leave"}) if cur else Att.create({"employee_id": l.employee_id.id, "date": day, "status": "leave"})
            l.write({"status": "approved", "reviewed_by": self.env.user.id})
        elif decision == "reject":
            if not str(note or "").strip():
                raise UserError(self.env._("Write the reason for rejecting."))
            l.write({"status": "rejected", "reviewed_by": self.env.user.id, "reject_reason": str(note).strip()[:200]})
        else:
            raise UserError(self.env._("Unknown decision."))
        return True

    # ---- payroll ----
    @api.model
    def _otm_slip_dict(self, s):
        return {"id": s.id, "employee": s.employee_id.name, "employee_id": s.employee_id.id, "pay_type": s.employee_id.pay_type, "rate": s.employee_id.rate, "month": fields.Date.to_string(s.month), "paid_days": s.paid_days,
                "working_days": s.working_days, "base": s.base_pay, "allowances": s.allowances, "deductions": s.deductions, "net": s.net, "status": s.status, "note": s.note or ""}

    def _otm_compute_slip(self, emp, first, allowances=0.0, deductions=0.0):
        last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
        atts = self.env["otm.ft.attendance"].sudo().search([("employee_id", "=", emp.id), ("date", ">=", first), ("date", "<=", last)])
        present, half, leave = (len(atts.filtered(lambda a: a.status == s)) for s in ("present", "half", "leave"))
        working = self._otm_working_days(first)
        if emp.pay_type == "monthly":
            paid = min(working, present + 0.5 * half + leave)
            base = round(emp.rate * paid / working, 2) if working else 0.0
        else:
            paid = present + 0.5 * half
            base = round(emp.rate * paid, 2)
        return {"paid_days": paid, "working_days": working, "base_pay": base, "allowances": allowances, "deductions": deductions, "net": round(base + allowances - deductions, 2)}

    @api.model
    def otm_hr_payroll(self, month):
        roles = self._otm_hr_roles()
        first = self._otm_month_start(month)
        Slip = self.env["otm.ft.payslip"].sudo()
        if MGR in roles or ACC in roles:
            slips = Slip.search([("month", "=", first)])
        else:
            me = self._otm_my_employee()
            slips = Slip.search([("employee_id", "=", me.id), ("status", "!=", "draft")]) if me else Slip
        return {"can_generate": MGR in roles or ACC in roles, "can_approve": MGR in roles, "can_pay": ACC in roles, "full": MGR in roles or ACC in roles, "slips": [self._otm_slip_dict(s) for s in slips]}

    @api.model
    def otm_hr_payroll_generate(self, month):
        roles = self._otm_hr_roles()
        if MGR not in roles and ACC not in roles:
            raise UserError(self.env._("Only Manager or Accounts can run payroll."))
        first = self._otm_month_start(month)
        if first > fields.Date.context_today(self).replace(day=1):
            raise UserError(self.env._("Payroll cannot be run for a future month."))
        Slip = self.env["otm.ft.payslip"].sudo()
        made = 0
        for emp in self.env["otm.ft.employee"].sudo().search([]):
            cur = Slip.search([("employee_id", "=", emp.id), ("month", "=", first)], limit=1)
            if cur and cur.status != "draft":
                continue
            vals = self._otm_compute_slip(emp, first, cur.allowances if cur else 0.0, cur.deductions if cur else 0.0)
            cur.write(vals) if cur else Slip.create({**vals, "employee_id": emp.id, "month": first})
            made += 1
        return made

    @api.model
    def otm_hr_payslip_edit(self, slip_id, allowances, deductions, note=""):
        roles = self._otm_hr_roles()
        if MGR not in roles and ACC not in roles:
            raise UserError(self.env._("Only Manager or Accounts can edit payslips."))
        s = self.env["otm.ft.payslip"].sudo().browse(int(slip_id))
        allowances, deductions = float(allowances or 0), float(deductions or 0)
        if not s.exists() or s.status != "draft" or allowances < 0 or deductions < 0:
            raise UserError(self.env._("Only a draft payslip can be edited, with amounts of 0 or more."))
        s.write({**self._otm_compute_slip(s.employee_id, s.month, allowances, deductions), "note": str(note or "").strip()[:200]})
        return True

    @api.model
    def otm_hr_payslip_action(self, slip_id, action):
        roles = self._otm_hr_roles()
        s = self.env["otm.ft.payslip"].sudo().browse(int(slip_id))
        if not s.exists():
            raise UserError(self.env._("Payslip not found."))
        if action == "approve":
            if MGR not in roles or s.status != "draft":
                raise UserError(self.env._("Only a Manager can approve a draft payslip."))
            if s.employee_id.user_id == self.env.user and not self.env.user.has_group("base.group_system"):
                raise UserError(self.env._("You cannot approve your own payslip."))
            s.write({"status": "approved"})
        elif action == "pay":
            if ACC not in roles or s.status != "approved":
                raise UserError(self.env._("Accounts can pay an approved payslip."))
            s.write({"status": "paid", "paid_on": fields.Date.context_today(self)})
        else:
            raise UserError(self.env._("Unknown action."))
        return True

    # ---- labour cost per project (used by Finance profitability) ----
    def _otm_labour_cost(self):
        self.ensure_one()
        atts = self.env["otm.ft.attendance"].sudo().search([("lead_id", "=", self.id), ("status", "in", ("present", "half"))])
        return round(sum(self._otm_day_cost(a.employee_id) * (1.0 if a.status == "present" else 0.5) for a in atts), 2)
