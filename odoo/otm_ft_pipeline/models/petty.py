import base64

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, ROLE_GROUPS

CATS = [("material", "Site material"), ("transport", "Transport"), ("labour", "Labour / daily wage"), ("food", "Food & refreshments"), ("tools", "Tools & consumables"), ("fuel", "Fuel"), ("other", "Other")]
LIMIT_PARAM = "otm_ft_pipeline.petty_limit"
PETTY_ROLES = ("sales_manager", "manager", "project_manager", "procurement", "accounts")


ACC_R, MGR_R = "accounts", "manager"


class OtmFtPetty(models.Model):
    _name = "otm.ft.petty"
    _description = "FT Petty Cash Entry"
    _order = "date desc, id desc"

    holder_id = fields.Many2one("res.users", required=True, index=True)
    lead_id = fields.Many2one("crm.lead", ondelete="set null", index=True)
    kind = fields.Selection([("topup", "Top-up"), ("expense", "Expense")], required=True)
    category = fields.Selection(CATS, default="other")
    amount = fields.Float(required=True)
    date = fields.Date(default=fields.Date.context_today)
    description = fields.Char()
    status = fields.Selection([("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="pending", required=True, index=True)
    reviewed_by = fields.Many2one("res.users")
    reviewed_on = fields.Datetime()
    reject_reason = fields.Char()


class CrmLeadPetty(models.Model):
    _inherit = "crm.lead"

    # ---- helpers ----
    @api.model
    def _otm_petty_limit(self):
        try:
            return float(self.env["ir.config_parameter"].sudo().get_param(LIMIT_PARAM, "500"))
        except ValueError:
            return 500.0

    @api.model
    def _otm_petty_balance(self, uid):
        rows = self.env["otm.ft.petty"].sudo().search([("holder_id", "=", uid), ("status", "=", "approved")])
        pend = self.env["otm.ft.petty"].sudo().search([("holder_id", "=", uid), ("status", "=", "pending"), ("kind", "=", "expense")])
        bal = sum(r.amount if r.kind == "topup" else -r.amount for r in rows)
        return bal, sum(pend.mapped("amount"))

    @api.model
    def _otm_petty_role(self):
        roles = self._otm_user_roles()
        if not any(r in roles for r in PETTY_ROLES):
            raise UserError(self.env._("Petty cash is available to pipeline staff."))
        return roles

    def _otm_petty_dict(self, t):
        atts = self.env["ir.attachment"].sudo().search([("res_model", "=", "otm.ft.petty"), ("res_id", "=", t.id)], order="id")
        return {
            "id": t.id, "kind": t.kind, "category": t.category or "other", "amount": t.amount, "date": fields.Date.to_string(t.date) if t.date else False,
            "description": t.description or "", "status": t.status, "holder": t.holder_id.name or "", "holder_id": t.holder_id.id,
            "lead_id": t.lead_id.id or False, "lead": t.lead_id.name or "", "reviewed_by": t.reviewed_by.name or "", "reject_reason": t.reject_reason or "",
            "files": [{"id": a.id, "name": a.name} for a in atts],
        }

    # ---- overview ----
    @api.model
    def otm_petty_overview(self):
        roles = self._otm_petty_role()
        uid = self.env.user.id
        Petty = self.env["otm.ft.petty"].sudo()
        reviewer = ACC in roles or MGR in roles
        limit = self._otm_petty_limit()
        bal, pend = self._otm_petty_balance(uid)
        mine = Petty.search([("holder_id", "=", uid)], limit=100)
        out = {
            "me": {"id": uid, "name": self.env.user.name}, "limit": limit, "balance": bal, "pending": pend, "can_review": reviewer, "can_topup": reviewer, "is_manager": MGR in roles,
            "mine": [self._otm_petty_dict(t) for t in mine], "approvals": [], "floats": [], "users": [], "leads": [], "month": {},
        }
        try:
            leads = self.search([("otm_stage", "not in", ("lost", "new", False))], limit=200)
            out["leads"] = [{"id": l.id, "name": l.name} for l in leads]
        except Exception:
            out["leads"] = []
        scope = Petty.search([("kind", "=", "expense"), ("status", "=", "approved")]) if reviewer else mine.filtered(lambda t: t.kind == "expense" and t.status == "approved")
        month = fields.Date.context_today(self).replace(day=1)
        for t in scope.filtered(lambda t: t.date and t.date >= month):
            out["month"][t.category or "other"] = out["month"].get(t.category or "other", 0.0) + t.amount
        if reviewer:
            out["approvals"] = [dict(self._otm_petty_dict(t), needs_manager=t.amount > limit, own=t.holder_id.id == uid) for t in Petty.search([("kind", "=", "expense"), ("status", "=", "pending")], order="id")]
            groups = [self.env.ref(x).id for r, x in ROLE_GROUPS.items() if r in PETTY_ROLES]
            for u in self.env["res.users"].sudo().search([("group_ids", "in", groups), ("share", "=", False), ("active", "=", True)], order="name"):
                b, p = self._otm_petty_balance(u.id)
                out["floats"].append({"id": u.id, "name": u.name, "balance": b, "pending": p})
        return out

    # ---- submit / attach / cancel ----
    @api.model
    def otm_petty_add(self, lead_id, category, amount, date, description):
        self._otm_petty_role()
        amount = round(float(amount or 0), 2)
        if amount <= 0 or category not in dict(CATS) or not str(description or "").strip():
            raise UserError(self.env._("Enter a category, a description and an amount above 0."))
        bal, pend = self._otm_petty_balance(self.env.user.id)
        if amount > bal - pend + 1e-6:
            raise UserError(self.env._("Amount exceeds your available petty cash (%s).", round(bal - pend, 2)))
        lead = self.browse(int(lead_id)) if lead_id else self.browse()
        if lead:
            lead.check_access("read")
        t = self.env["otm.ft.petty"].sudo().create({
            "holder_id": self.env.user.id, "lead_id": lead.id or False, "kind": "expense", "category": category, "amount": amount,
            "date": date or fields.Date.context_today(self), "description": str(description).strip()[:200],
        })
        self._otm_notify(self._otm_hook_users(ACC_R, MGR_R) - self.env.user, f"Petty expense to review: {self.env.user.name}", f"{amount:g} · {str(description).strip()[:80]}", "/m/petty-cash", "task", lead or None)
        return t.id

    @api.model
    def _otm_petty_own(self, txn_id):
        t = self.env["otm.ft.petty"].sudo().browse(int(txn_id))
        if not t.exists() or t.holder_id != self.env.user or t.kind != "expense" or t.status != "pending":
            raise UserError(self.env._("Only your own pending expense can be changed."))
        return t

    @api.model
    def otm_petty_file_add(self, txn_id, filename, data_b64):
        t = self._otm_petty_own(txn_id)
        raw = base64.b64decode(data_b64 or "", validate=True)
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise UserError(self.env._("Receipt must be up to 5 MB."))
        if raw[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif raw[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            mime = "image/webp"
        elif raw[:5] == b"%PDF-":
            mime = "application/pdf"
        else:
            raise UserError(self.env._("Only JPEG, PNG, WebP or PDF receipts are allowed."))
        if self.env["ir.attachment"].sudo().search_count([("res_model", "=", "otm.ft.petty"), ("res_id", "=", t.id)]) >= 5:
            raise UserError(self.env._("Maximum 5 receipts per expense."))
        self.env["ir.attachment"].sudo().create({"name": (str(filename or "receipt").replace("/", "_").replace("\\", "_"))[:100], "datas": data_b64, "mimetype": mime, "res_model": "otm.ft.petty", "res_id": t.id})
        return True

    @api.model
    def otm_petty_cancel(self, txn_id):
        self._otm_petty_own(txn_id).unlink()
        return True

    @api.model
    def otm_petty_file(self, att_id):
        roles = self._otm_petty_role()
        att = self.env["ir.attachment"].sudo().browse(int(att_id))
        if not att.exists() or att.res_model != "otm.ft.petty" or att.mimetype not in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
            raise UserError(self.env._("Receipt not found."))
        t = self.env["otm.ft.petty"].sudo().browse(att.res_id)
        if t.holder_id != self.env.user and ACC not in roles and MGR not in roles:
            raise UserError(self.env._("Receipt not found."))
        return {"mimetype": att.mimetype, "data": att.datas.decode() if isinstance(att.datas, bytes) else att.datas}

    # ---- accounts / manager ----
    @api.model
    def otm_petty_topup(self, user_id, amount, note=""):
        roles = self._otm_petty_role()
        if ACC not in roles and MGR not in roles:
            raise UserError(self.env._("Only Accounts or a Manager can top up petty cash."))
        amount = round(float(amount or 0), 2)
        user = self.env["res.users"].sudo().browse(int(user_id))
        if amount <= 0 or amount > 1e7 or not user.exists() or user.share:
            raise UserError(self.env._("Choose a user and an amount above 0."))
        self.env["otm.ft.petty"].sudo().create({
            "holder_id": user.id, "kind": "topup", "amount": amount, "description": str(note or "Top-up").strip()[:200] or "Top-up", "status": "approved",
            "reviewed_by": self.env.user.id, "reviewed_on": fields.Datetime.now(),
        })
        return True

    @api.model
    def otm_petty_review(self, txn_id, decision, note=""):
        roles = self._otm_petty_role()
        if ACC not in roles and MGR not in roles:
            raise UserError(self.env._("Only Accounts or a Manager can review expenses."))
        t = self.env["otm.ft.petty"].sudo().browse(int(txn_id))
        if not t.exists() or t.kind != "expense" or t.status != "pending":
            raise UserError(self.env._("This expense is no longer pending."))
        if t.holder_id == self.env.user and not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("You cannot review your own expense."))
        note = str(note or "").strip()[:200]
        if decision == "approve":
            if t.amount > self._otm_petty_limit() and MGR not in roles:
                raise UserError(self.env._("Expenses above %s need Manager approval.", self._otm_petty_limit()))
            bal, _p = self._otm_petty_balance(t.holder_id.id)
            if t.amount > bal + 1e-6:
                raise UserError(self.env._("The holder's balance (%s) is lower than this expense. Top up first.", round(bal, 2)))
            t.write({"status": "approved", "reviewed_by": self.env.user.id, "reviewed_on": fields.Datetime.now()})
        elif decision == "reject":
            if not note:
                raise UserError(self.env._("Write the reason for rejecting."))
            t.write({"status": "rejected", "reviewed_by": self.env.user.id, "reviewed_on": fields.Datetime.now(), "reject_reason": note})
        else:
            raise UserError(self.env._("Unknown decision."))
        return True
