import json
import logging
import re

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR, PM, PROC, ROLE_GROUPS, SM, TRANSITIONS

_logger = logging.getLogger(__name__)
P_EMAIL = "otm_ft_pipeline.notify_email"
P_WA_URL = "otm_ft_pipeline.wa_webhook"
P_WA_TOKEN = "otm_ft_pipeline.wa_token"
P_META = "otm_ft_pipeline.meta_secret"

# customer WhatsApp texts per transition action: (stage the lead lands in) -> text
CUSTOMER_TEXT = {
    "send_to_client@sent_to_client": "Dear {name}, your estimate for {lead} is ready. Please review it in your FT portal and approve or request changes.",
    "send_to_client@awaiting_advance": "Dear {name}, the advance invoice for {lead} has been shared. Work will begin once the advance is received.",
    "verify_payment@work_started": "Dear {name}, we have received your payment for {lead}. Work on your project is starting. You can follow progress in your FT portal.",
    "complete_work@handover": "Dear {name}, the work on {lead} is complete and ready for handover. Please review it in your FT portal and tell us about any snags.",
    "confirm_handover@completed": "Dear {name}, thank you for choosing FT Interior Design & Architecture. Your project {lead} is now completed.",
}


class OtmFtNotification(models.Model):
    _name = "otm.ft.notification"
    _description = "FT In-app Notification"
    _order = "id desc"

    user_id = fields.Many2one("res.users", required=True, ondelete="cascade", index=True)
    title = fields.Char(required=True)
    body = fields.Char()
    link = fields.Char()
    kind = fields.Selection([("task", "Action needed"), ("info", "Info"), ("alert", "Alert")], default="info")
    is_read = fields.Boolean(default=False, index=True)
    lead_id = fields.Many2one("crm.lead", ondelete="cascade")


class OtmFtMsgLog(models.Model):
    _name = "otm.ft.msg.log"
    _description = "FT Outbound Message Log"
    _order = "id desc"

    channel = fields.Selection([("whatsapp", "WhatsApp"), ("email", "Email")], required=True)
    recipient = fields.Char()
    text = fields.Text()
    status = fields.Selection([("sent", "Sent"), ("failed", "Failed"), ("skipped", "Skipped")], required=True)
    error = fields.Char()
    kind = fields.Char()
    lead_id = fields.Many2one("crm.lead", ondelete="set null")


class CrmLeadNotify(models.Model):
    _inherit = "crm.lead"

    # ---- low-level senders (never raise into the business flow) ----
    @api.model
    def _otm_param(self, key, default=""):
        return self.env["ir.config_parameter"].sudo().get_param(key, default) or default

    @api.model
    def _otm_log_msg(self, channel, recipient, text, status, error="", kind="", lead=None):
        self.env["otm.ft.msg.log"].sudo().create({"channel": channel, "recipient": (recipient or "")[:60], "text": text[:1000], "status": status, "error": (error or "")[:200], "kind": kind, "lead_id": lead.id if lead else False})

    @api.model
    def _otm_send_wa(self, phone, text, kind="", lead=None):
        """POST {to, message} to the admin-configured WhatsApp gateway; logs the result."""
        url, token = self._otm_param(P_WA_URL), self._otm_param(P_WA_TOKEN)
        digits = re.sub(r"\D", "", phone or "")
        if not url or not url.startswith(("http://", "https://")):
            return False
        if len(digits) < 8:
            self._otm_log_msg("whatsapp", phone, text, "skipped", "No valid phone number", kind, lead)
            return False
        try:
            import requests
            r = requests.post(url, json={"to": digits, "message": text, "kind": kind}, headers={"Authorization": f"Bearer {token}"} if token else {}, timeout=8)
            ok = r.status_code < 300
            self._otm_log_msg("whatsapp", digits, text, "sent" if ok else "failed", "" if ok else f"HTTP {r.status_code}", kind, lead)
            return ok
        except Exception as e:  # network/gateway problems must never block the workflow
            _logger.warning("WhatsApp gateway error: %s", e)
            self._otm_log_msg("whatsapp", digits, text, "failed", str(e), kind, lead)
            return False

    @api.model
    def _otm_notify(self, users, title, body="", link="", kind="info", lead=None):
        """In-app notification (+ optional email) for each user. Deduplicates identical unread notices."""
        Note = self.env["otm.ft.notification"].sudo()
        email_on = self._otm_param(P_EMAIL, "0") == "1"
        for u in users.filtered(lambda x: x.active and not x.share):
            if Note.search_count([("user_id", "=", u.id), ("title", "=", title), ("is_read", "=", False)]):
                continue
            Note.create({"user_id": u.id, "title": title[:200], "body": (body or "")[:300], "link": link, "kind": kind, "lead_id": lead.id if lead else False})
            if email_on and u.email:
                try:
                    self.env["mail.mail"].sudo().create({"subject": title[:200], "body_html": "<p>%s</p>" % (body or title), "email_to": u.email, "auto_delete": True})
                    self._otm_log_msg("email", u.email, title, "sent", "", kind, lead)
                except Exception as e:
                    self._otm_log_msg("email", u.email, title, "failed", str(e), kind, lead)

    @api.model
    def _otm_users_with(self, role):
        return self.env["res.users"].sudo().search([("group_ids", "in", self.env.ref(ROLE_GROUPS[role]).id), ("active", "=", True), ("share", "=", False)])

    def _otm_stage_owners(self, to_stage):
        """Users who must act on this lead at its new stage."""
        self.ensure_one()
        roles = {r for (frm, _a), (_to, rs) in TRANSITIONS.items() if frm == to_stage for r in rs}
        users = self.env["res.users"]
        for r in roles:
            if r == SM:
                users |= self.sudo().user_id
            elif r == PM:
                users |= self.sudo().otm_project_manager_id
            else:
                users |= self._otm_users_with(r)
        return users

    def _otm_after_transition(self, action, from_stage, to_stage):
        """Called after every stage change: notify the next actors and message the customer."""
        self.ensure_one()
        try:
            labels = dict(self._fields["otm_stage"].selection)
            owners = self._otm_stage_owners(to_stage) - self.env.user
            if owners:
                self._otm_notify(owners, f"{self.name}: {labels.get(to_stage, to_stage)}", "Action needed on this lead.", f"/m/crm/{self.id}", "task", self)
            text = CUSTOMER_TEXT.get(f"{action}@{to_stage}")
            lead = self.sudo()
            phone = lead.phone or lead.partner_id.phone
            if text and phone:
                self._otm_send_wa(phone, text.format(name=lead.partner_name or lead.partner_id.name or "Customer", lead=lead.name), "stage", lead)
        except Exception as e:
            _logger.warning("Notification error for lead %s: %s", self.id, e)

    # ---- scheduled reminders ----
    @api.model
    def otm_cron_reminders(self):
        today = fields.Date.context_today(self)
        env = self.sudo().env
        for m in env["otm.ft.milestone"].search([("invoice_id.state", "=", "posted"), ("invoice_id.payment_state", "not in", ("paid", "in_payment"))]):
            due = m.invoice_id.invoice_date_due or m.due_date
            if not due or due >= today:
                continue
            lead = m.lead_id
            days = (today - due).days
            self._otm_notify(self._otm_users_with(ACC), f"Overdue payment: {lead.name}", f"{m.name}: {days} days overdue, balance {m.invoice_id.amount_residual:g}", f"/m/crm/{lead.id}", "alert", lead)
            recent = env["otm.ft.msg.log"].search_count([("lead_id", "=", lead.id), ("kind", "=", "reminder"), ("create_date", ">=", fields.Datetime.now() - __import__("datetime").timedelta(days=7))])
            phone = lead.phone or lead.partner_id.phone
            if phone and not recent:
                self._otm_send_wa(phone, f"Dear {lead.partner_name or 'Customer'}, a payment of {m.invoice_id.amount_residual:g} for {lead.name} ({m.name}) was due on {due}. Please arrange payment at your earliest convenience.", "reminder", lead)
        for g in env["otm.ft.contact.log"].search([("followup_done", "=", False), ("followup_date", "<=", today)]):
            owner = g.lead_id.user_id or g.user_id
            self._otm_notify(owner, f"Follow up: {g.lead_id.partner_name or g.lead_id.name}", g.text[:200], f"/m/customers/{g.lead_id.id}", "task" if g.followup_date == today else "alert", g.lead_id)
        for po in env["purchase.order"].search([("otm_lead_id", "!=", False), ("state", "in", ("purchase", "done")), ("otm_receipt_state", "!=", "received"), ("otm_expected_date", "<", today)]):
            self._otm_notify(self._otm_users_with(PROC), f"Delivery overdue: {po.name}", f"{po.partner_id.name} · expected {po.otm_expected_date}", "/m/procurement", "alert", po.otm_lead_id)
        return True

    # ---- API for the Next.js app ----
    @api.model
    def otm_notifications(self):
        Note = self.env["otm.ft.notification"].sudo()
        rows = Note.search([("user_id", "=", self.env.user.id)], limit=100)
        return {"unread": Note.search_count([("user_id", "=", self.env.user.id), ("is_read", "=", False)]), "items": [
            {"id": n.id, "title": n.title, "body": n.body or "", "link": n.link or "", "kind": n.kind, "read": n.is_read, "date": fields.Datetime.to_string(n.create_date)} for n in rows]}

    @api.model
    def otm_notif_count(self):
        return self.env["otm.ft.notification"].sudo().search_count([("user_id", "=", self.env.user.id), ("is_read", "=", False)])

    @api.model
    def otm_notif_read(self, note_id=0):
        dom = [("user_id", "=", self.env.user.id), ("is_read", "=", False)]
        if note_id:
            dom.append(("id", "=", int(note_id)))
        self.env["otm.ft.notification"].sudo().search(dom).write({"is_read": True})
        return True

    @api.model
    def otm_msg_log(self):
        if MGR not in self._otm_user_roles():
            raise UserError(self.env._("Only a Manager can see the outbound message log."))
        return [{"id": m.id, "channel": m.channel, "to": m.recipient or "", "text": m.text or "", "status": m.status, "error": m.error or "", "kind": m.kind or "", "lead": m.lead_id.name or "", "date": fields.Datetime.to_string(m.create_date)}
                for m in self.env["otm.ft.msg.log"].sudo().search([], limit=100)]

    @api.model
    def otm_ms_remind(self, ms_id):
        if ACC not in self._otm_user_roles():
            raise UserError(self.env._("Only Accounts can send payment reminders."))
        m = self.env["otm.ft.milestone"].sudo().browse(int(ms_id))
        inv = m.invoice_id
        if not m.exists() or inv.state != "posted" or inv.payment_state in ("paid", "in_payment"):
            raise UserError(self.env._("There is no unpaid invoice for this milestone."))
        self.browse(m.lead_id.id).check_access("read")
        lead = m.lead_id
        phone = lead.phone or lead.partner_id.phone
        if not self._otm_param(P_WA_URL):
            raise UserError(self.env._("WhatsApp is not configured. An administrator can set it in Settings → Notifications."))
        if not phone:
            raise UserError(self.env._("This customer has no phone number."))
        ok = self._otm_send_wa(phone, f"Dear {lead.partner_name or 'Customer'}, a payment of {inv.amount_residual:g} for {lead.name} ({m.name}) is pending. Please arrange payment at your earliest convenience.", "reminder", lead)
        if not ok:
            raise UserError(self.env._("The message could not be sent. See the outbound log."))
        return True

    # ---- admin settings ----
    @api.model
    def _otm_admin_only(self):
        if not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only an administrator can change notification settings."))

    @api.model
    def otm_notify_settings(self):
        self._otm_admin_only()
        return {"email": self._otm_param(P_EMAIL, "0") == "1", "wa_url": self._otm_param(P_WA_URL), "has_token": bool(self._otm_param(P_WA_TOKEN)), "has_meta_secret": bool(self._otm_param(P_META))}

    @api.model
    def otm_notify_save(self, email, wa_url, wa_token, meta_secret):
        self._otm_admin_only()
        icp = self.env["ir.config_parameter"].sudo()
        wa_url = str(wa_url or "").strip()
        if wa_url and not wa_url.startswith(("http://", "https://")):
            raise UserError(self.env._("The WhatsApp gateway URL must start with http:// or https://."))
        icp.set_param(P_EMAIL, "1" if email else "0")
        icp.set_param(P_WA_URL, wa_url)
        if str(wa_token or "").strip():
            icp.set_param(P_WA_TOKEN, str(wa_token).strip())
        if str(meta_secret or "").strip():
            if len(str(meta_secret).strip()) < 16:
                raise UserError(self.env._("The Meta secret must be at least 16 characters."))
            icp.set_param(P_META, str(meta_secret).strip())
        return True

    @api.model
    def otm_notify_test(self, phone):
        self._otm_admin_only()
        if not self._otm_param(P_WA_URL):
            raise UserError(self.env._("Save the WhatsApp gateway URL first."))
        if not self._otm_send_wa(phone, "Test message from FT ERP. Notifications are working.", "test"):
            raise UserError(self.env._("The gateway did not accept the message. See the outbound log."))
        return True

    # ---- hooks for other modules' events ----
    @api.model
    def _otm_hook_users(self, *roles):
        users = self.env["res.users"]
        for r in roles:
            users |= self._otm_users_with(r)
        return users
