from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR

LIVE = ("work_started", "handover", "completed")
BILLED_FROM = ("invoice_draft", "invoice_with_sales", "awaiting_advance", "payment_verification", "work_started", "handover", "completed")
KINDS = ("advance", "progress", "final", "retention", "other")


class CrmLeadFinance(models.Model):
    _inherit = "crm.lead"

    otm_milestone_ids = fields.One2many("otm.ft.milestone", "lead_id", string="Payment Milestones", copy=False)

    # ---- helpers ----
    def _otm_contract(self):
        self.ensure_one()
        order = self.sudo().order_ids.sorted("id")[-1:]
        return (order.amount_untaxed, order.amount_tax) if order else (0.0, 0.0)

    def _otm_ms_sync_advance(self):
        """The advance milestone is billed by the existing advance-invoice step: link that invoice."""
        self.ensure_one()
        adv = self.sudo().otm_milestone_ids.filtered(lambda m: m.kind == "advance" and not m.invoice_id)[:1]
        if adv and self.sudo().otm_invoice_id:
            adv.write({"invoice_id": self.sudo().otm_invoice_id.id})

    def _otm_ms_state(self, m):
        inv = m.invoice_id
        if not inv or inv.state == "cancel":
            return "planned"
        if inv.state == "draft":
            return "draft"
        if inv.payment_state in ("paid", "in_payment"):
            return "paid"
        due = inv.invoice_date_due or m.due_date
        return "overdue" if due and due < fields.Date.context_today(self) else "invoiced"

    def _otm_ms_blocker(self, m):
        if m.invoice_id and m.invoice_id.state != "cancel":
            return self.env._("Already invoiced.")
        if m.kind == "advance":
            return self.env._("The advance is invoiced in the advance-invoice step.")
        if self.otm_stage not in LIVE:
            return self.env._("Available once work has started.")
        if m.kind == "progress" and self.otm_progress < (m.trigger_progress or 0):
            return self.env._("Site progress must reach %s%%.", m.trigger_progress)
        if m.kind == "final" and self.otm_stage not in ("handover", "completed"):
            return self.env._("Available at handover.")
        if m.kind == "retention" and self.otm_stage != "completed":
            return self.env._("Available after the project is completed.")
        return ""

    def _otm_ms_dict(self, m, untaxed, total):
        inv = m.invoice_id if m.invoice_id.state != "cancel" else self.env["account.move"]
        state = self._otm_ms_state(m)
        due = (inv.invoice_date_due if inv else False) or m.due_date
        return {
            "id": m.id, "name": m.name, "kind": m.kind, "percent": m.percent, "trigger": m.trigger_progress,
            "amount": round(untaxed * m.percent / 100.0, 2), "amount_total": inv.amount_total if inv else round(total * m.percent / 100.0, 2),
            "status": state, "invoice": inv.name or "Draft" if inv else "", "invoice_id": inv.id if inv else False,
            "residual": inv.amount_residual if inv and inv.state == "posted" else 0.0,
            "due": fields.Date.to_string(due) if due else False, "blocker": self._otm_ms_blocker(m),
            "followup_note": m.followup_note or "", "followup_date": fields.Date.to_string(m.followup_date) if m.followup_date else False,
        }

    def _otm_fin_role(self, *roles):
        if not any(r in self._otm_user_roles() for r in roles):
            raise UserError(self.env._("You are not allowed to do this."))

    # ---- per-project payment schedule ----
    def otm_milestones(self):
        self.ensure_one()
        self._otm_ms_sync_advance()
        untaxed, tax = self._otm_contract()
        total = untaxed + tax
        rows = [self._otm_ms_dict(m, untaxed, total) for m in self.sudo().otm_milestone_ids]
        roles = self._otm_user_roles()
        return {
            "untaxed": untaxed, "tax": tax, "total": total, "cost": self.sudo().otm_procurement_amount,
            "invoiced": sum(r["amount_total"] for r in rows if r["status"] != "planned"),
            "outstanding": sum(r["residual"] for r in rows),
            "can_plan": ACC in roles or MGR in roles, "can_bill": ACC in roles, "rows": rows,
        }

    def otm_set_milestones(self, lines):
        self.ensure_one()
        self.check_access("read")
        self._otm_fin_role(ACC, MGR)
        if self.otm_stage not in BILLED_FROM:
            raise UserError(self.env._("The payment plan can be set once the invoicing step is reached."))
        if not isinstance(lines, list) or not 1 <= len(lines) <= 12:
            raise UserError(self.env._("Add between 1 and 12 milestones."))
        clean = []
        for k, l in enumerate(lines):
            name = str(l.get("name") or "").strip()[:120]
            kind = l.get("kind")
            pct = round(float(l.get("percent") or 0), 2)
            if not name or kind not in KINDS or not 0 < pct <= 100:
                raise UserError(self.env._("Each milestone needs a name, a type and a percentage above 0."))
            clean.append({"name": name, "kind": kind, "percent": pct, "trigger_progress": max(0, min(100, int(l.get("trigger") or 0))), "sequence": (k + 1) * 10})
        if abs(sum(c["percent"] for c in clean) - 100) > 0.01:
            raise UserError(self.env._("Milestone percentages must add up to 100%."))
        if sum(1 for c in clean if c["kind"] == "advance") > 1:
            raise UserError(self.env._("Only one advance milestone is allowed."))
        Ms = self.env["otm.ft.milestone"].sudo()
        # invoiced milestones are locked: keep them, replace the rest
        locked = self.sudo().otm_milestone_ids.filtered(lambda m: m.invoice_id and m.invoice_id.state != "cancel")
        free = list(clean)
        for m in locked:  # a locked milestone must still appear unchanged in the new plan
            match = next((c for c in free if c["name"] == m.name and c["kind"] == m.kind and abs(c["percent"] - m.percent) < 0.01), None)
            if not match:
                raise UserError(self.env._("'%s' is already invoiced and cannot be changed or removed.", m.name))
            free.remove(match)
        (self.sudo().otm_milestone_ids - locked).unlink()
        for c in free:
            Ms.create({**c, "lead_id": self.id})
        return True

    def otm_ms_invoice(self, ms_id):
        self.ensure_one()
        self._otm_fin_role(ACC)
        m = self.sudo().otm_milestone_ids.filtered(lambda x: x.id == int(ms_id))
        if not m:
            raise UserError(self.env._("Milestone not found."))
        reason = self._otm_ms_blocker(m)
        if reason:
            raise UserError(reason)
        untaxed, _tax = self._otm_contract()
        if untaxed <= 0:
            raise UserError(self.env._("There is no approved estimate to bill against."))
        move = self.env["account.move"].create({  # as the real user: Odoo accounting ACLs apply
            "move_type": "out_invoice", "partner_id": self.sudo().partner_id.id, "invoice_origin": self.name,
            "invoice_line_ids": [(0, 0, {
                "name": "%s - %s" % (m.name, self.name), "quantity": 1, "price_unit": round(untaxed * m.percent / 100.0, 2),
                "tax_ids": [(6, 0, self._otm_sale_tax().ids)],
            })],
        })
        move.action_post()
        m.write({"invoice_id": move.id, "due_date": move.invoice_date_due or fields.Date.context_today(self) + timedelta(days=30)})
        self.sudo().message_post(body=self.env._("Invoice %(i)s raised for milestone '%(m)s'.", i=move.name, m=m.name), author_id=self.env.user.partner_id.id)
        return move.id

    def otm_ms_pay(self, ms_id, journal_id):
        self.ensure_one()
        self._otm_fin_role(ACC)
        m = self.sudo().otm_milestone_ids.filtered(lambda x: x.id == int(ms_id))
        inv = m.invoice_id
        if not inv or inv.state != "posted":
            raise UserError(self.env._("The milestone invoice is not posted."))
        if inv.payment_state in ("paid", "in_payment"):
            raise UserError(self.env._("Already paid."))
        self.env["account.payment.register"].with_context(active_model="account.move", active_ids=inv.ids).create({"journal_id": int(journal_id)}).action_create_payments()
        return True

    def otm_ms_followup(self, ms_id, note):
        self.ensure_one()
        self.check_access("read")
        self._otm_fin_role(ACC, MGR)
        note = str(note or "").strip()[:500]
        m = self.sudo().otm_milestone_ids.filtered(lambda x: x.id == int(ms_id))
        if not m or not note:
            raise UserError(self.env._("Write the follow-up note."))
        m.write({"followup_note": note, "followup_date": fields.Date.context_today(self)})
        self.sudo().message_post(body=self.env._("Payment follow-up (%(m)s): %(n)s", m=m.name, n=note), author_id=self.env.user.partner_id.id)
        return True

    # ---- company-wide finance overview ----
    @api.model
    def otm_finance_overview(self):
        roles = self._otm_user_roles()
        if ACC not in roles and MGR not in roles:
            raise UserError(self.env._("Finance is available to Accounts and Managers."))
        leads = self.search([("otm_stage", "in", BILLED_FROM)])
        rows, overdue = [], []
        for lead in leads.sudo():
            lead._otm_ms_sync_advance()
            untaxed, tax = lead._otm_contract()
            ms = [lead._otm_ms_dict(m, untaxed, untaxed + tax) for m in lead.otm_milestone_ids]
            billed = [r for r in ms if r["status"] != "planned"]
            invoiced = sum(r["amount_total"] for r in billed if r["status"] != "draft")
            outstanding = sum(r["residual"] for r in ms)
            od = [r for r in ms if r["status"] == "overdue"]
            petty = sum(self.env["otm.ft.petty"].sudo().search([("lead_id", "=", lead.id), ("kind", "=", "expense"), ("status", "=", "approved")]).mapped("amount"))
            cost = lead.otm_procurement_amount + petty
            for r in od:
                days = (fields.Date.context_today(self) - fields.Date.from_string(r["due"])).days if r["due"] else 0
                overdue.append({"lead_id": lead.id, "lead": lead.name, "customer": lead.partner_name or lead.partner_id.name or "", "milestone_id": r["id"], "milestone": r["name"],
                                "residual": r["residual"], "due": r["due"], "days": days, "followup_note": r["followup_note"], "followup_date": r["followup_date"]})
            rows.append({
                "id": lead.id, "name": lead.name, "customer": lead.partner_name or lead.partner_id.name or "", "stage": lead.otm_stage,
                "contract": untaxed + tax, "revenue": untaxed, "invoiced": invoiced, "paid": invoiced - outstanding, "outstanding": outstanding,
                "overdue": sum(r["residual"] for r in od), "cost": cost, "margin": untaxed - cost, "margin_pct": round((untaxed - cost) / untaxed * 100, 1) if untaxed else 0.0,
                "planned": bool(ms),
            })
        overdue.sort(key=lambda x: -x["days"])
        return {"rows": rows, "overdue": overdue, "can_bill": ACC in roles}
