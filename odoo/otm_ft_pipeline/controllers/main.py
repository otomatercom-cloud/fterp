import hmac
import json

from odoo import http
from odoo.http import request

P_META = "otm_ft_pipeline.meta_secret"


class FtMetaLead(http.Controller):
    @http.route("/otm_ft/meta_lead", type="http", auth="public", methods=["POST"], csrf=False)
    def meta_lead(self, **_kw):
        """Meta / middleware lead intake. Header X-FT-Secret must match the secret set in Settings.
        Body (JSON): {"name": "...", "phone": "...", "email": "...", "message": "...", "campaign": "..."}."""
        env = request.env(su=True)
        secret = env["ir.config_parameter"].get_param(P_META) or ""
        given = request.httprequest.headers.get("X-FT-Secret", "")
        if not secret or not hmac.compare_digest(secret.encode(), given.encode()):
            return request.make_json_response({"error": "unauthorized"}, status=401)
        try:
            data = json.loads(request.httprequest.get_data(as_text=True) or "{}")
        except ValueError:
            return request.make_json_response({"error": "invalid json"}, status=400)
        name = str(data.get("name") or "").strip()[:120]
        phone = str(data.get("phone") or "").strip()[:40]
        email = str(data.get("email") or "").strip()[:120]
        if not name or not (phone or email):
            return request.make_json_response({"error": "name and phone or email are required"}, status=400)
        note = str(data.get("message") or "").strip()[:1000]
        campaign = str(data.get("campaign") or "").strip()[:120]
        lead = env["crm.lead"].with_context(mail_create_nolog=True).create({
            "name": f"{name} - Meta" + (f" ({campaign})" if campaign else ""), "type": "opportunity", "partner_name": name, "phone": phone, "email_from": email,
            "description": note, "otm_origin": "meta",
        })
        if lead.user_id:
            env["crm.lead"]._otm_notify(lead.user_id, f"New Meta lead: {name}", note[:200] or "Call the customer.", f"/m/crm/{lead.id}", "task", lead)
        return request.make_json_response({"id": lead.id, "assigned_to": lead.user_id.name or ""})
