import csv
import io
import json
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

from .crm_lead import ACC, MGR
from .petty import CATS

P_JOURNAL = "otm_ft_pipeline.petty_journal"
P_SOURCE = "otm_ft_pipeline.petty_source_journal"
P_DIFF = "otm_ft_pipeline.petty_diff_account"
P_MAP = "otm_ft_pipeline.petty_accounts"
P_LOW = "otm_ft_pipeline.petty_low"
LIMIT_PARAM = "otm_ft_pipeline.petty_limit"


class OtmFtPettyCount(models.Model):
    _name = "otm.ft.petty.count"
    _description = "FT Petty Cash Count"
    _order = "id desc"

    holder_id = fields.Many2one("res.users", required=True, index=True)
    date = fields.Date(default=fields.Date.context_today)
    expected = fields.Float()
    counted = fields.Float()
    difference = fields.Float()
    note = fields.Char()
    counted_by = fields.Many2one("res.users")
    adjust_id = fields.Many2one("otm.ft.petty", ondelete="set null")


class OtmFtPettyPost(models.Model):
    _inherit = "otm.ft.petty"

    def _otm_petty_post_entry(self):
        """Post a balanced journal entry per approved petty row. Never raises: a missing setup leaves the row 'unposted'."""
        icp = self.env["ir.config_parameter"].sudo()
        for t in self.sudo():
            if t.move_id or t.status != "approved":
                continue
            try:
                journal = self.env["account.journal"].sudo().browse(int(icp.get_param(P_JOURNAL) or 0)).exists()
                if not journal or not journal.default_account_id:
                    t.post_error = "Petty cash journal is not set up"
                    continue
                cash = journal.default_account_id
                maps = json.loads(icp.get_param(P_MAP) or "{}")
                amt = round(abs(t.amount), 2)
                if t.kind == "expense":
                    other = self.env["account.account"].sudo().browse(int(maps.get(t.category) or maps.get("other") or 0)).exists()
                    dr, cr = other, cash
                elif t.kind == "topup":
                    src = self.env["account.journal"].sudo().browse(int(icp.get_param(P_SOURCE) or 0)).exists()
                    other = src.default_account_id
                    dr, cr = cash, other
                else:  # cash count adjustment: positive = excess, negative = shortage
                    other = self.env["account.account"].sudo().browse(int(icp.get_param(P_DIFF) or 0)).exists()
                    dr, cr = (cash, other) if t.amount > 0 else (other, cash)
                if not other or not amt:
                    t.post_error = "Account for this entry is not set up"
                    continue
                label = "%s %s" % (t.ref or "PC", t.description or t.kind)
                with self.env.cr.savepoint():  # a failed entry must not poison the surrounding cash transaction
                    move = self.env["account.move"].sudo().with_company(journal.company_id).create({
                        "move_type": "entry", "journal_id": journal.id, "date": t.date or fields.Date.context_today(self), "ref": label[:120],
                        "line_ids": [(0, 0, {"account_id": dr.id, "debit": amt, "credit": 0.0, "name": label[:120]}), (0, 0, {"account_id": cr.id, "debit": 0.0, "credit": amt, "name": label[:120]})],
                    })
                    move.action_post()
                t.write({"move_id": move.id, "post_error": False})
            except Exception as e:  # accounting problems must not block the cash workflow; they show as 'unposted'
                t.post_error = str(e)[:200]
        return True


class CrmLeadPettyAcct(models.Model):
    _inherit = "crm.lead"

    @api.model
    def _otm_petty_reviewer(self):
        roles = self._otm_petty_role()
        if ACC not in roles and MGR not in roles:
            raise UserError(self.env._("Only Accounts or a Manager can do this."))
        return roles

    @api.model
    def _otm_petty_low_alert(self, holder):
        icp = self.env["ir.config_parameter"].sudo()
        try:
            low = float(icp.get_param(P_LOW, "100"))
        except ValueError:
            low = 100.0
        bal, _p = self._otm_petty_balance(holder.id)
        if bal < low:
            users = holder | self._otm_hook_users("accounts")
            self._otm_notify(users, f"Low petty cash: {holder.name}", f"Balance {bal:g} is below {low:g}. Request or approve a top-up.", "/m/petty-cash", "alert")

    # ---- replenishment request ----
    @api.model
    def otm_petty_topup_request(self, amount, note=""):
        self._otm_petty_role()
        amount = round(float(amount or 0), 2)
        if amount <= 0 or amount > 1e7:
            raise UserError(self.env._("Enter an amount above 0."))
        if self.env["otm.ft.petty"].sudo().search_count([("holder_id", "=", self.env.user.id), ("kind", "=", "topup"), ("status", "=", "pending")]):
            raise UserError(self.env._("You already have a top-up request waiting."))
        self.env["otm.ft.petty"].sudo().create({"holder_id": self.env.user.id, "kind": "topup", "amount": amount, "description": str(note or "Top-up request").strip()[:200] or "Top-up request", "status": "pending"})
        self._otm_notify(self._otm_hook_users("accounts", "manager") - self.env.user, f"Petty cash top-up requested: {self.env.user.name}", f"Amount {amount:g}", "/m/petty-cash", "task")
        return True

    # ---- cash count / reconciliation ----
    @api.model
    def otm_petty_count(self, user_id, counted, note=""):
        self._otm_petty_reviewer()
        holder = self.env["res.users"].sudo().browse(int(user_id))
        counted = round(float(counted if counted is not None else -1), 2)
        if not holder.exists() or holder.share or counted < 0:
            raise UserError(self.env._("Choose a holder and enter the counted cash (0 or more)."))
        if holder == self.env.user and not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Someone else must count your cash."))
        expected, pend = self._otm_petty_balance(holder.id)
        diff = round(counted - expected, 2)
        note = str(note or "").strip()[:200]
        if diff and not note:
            raise UserError(self.env._("Write the reason for the difference (%s).", diff))
        adj = self.env["otm.ft.petty"].sudo()
        if diff:
            adj = adj.create({"holder_id": holder.id, "kind": "adjust", "amount": diff, "status": "approved", "description": ("Cash count: " + note)[:200], "reviewed_by": self.env.user.id, "reviewed_on": fields.Datetime.now()})
            adj._otm_petty_post_entry()
        self.env["otm.ft.petty.count"].sudo().create({"holder_id": holder.id, "expected": expected, "counted": counted, "difference": diff, "note": note, "counted_by": self.env.user.id, "adjust_id": adj.id or False})
        return diff

    # ---- accounting setup ----
    @api.model
    def _otm_setup_company(self):
        return self.env.company

    @api.model
    def otm_petty_setup(self):
        self._otm_petty_reviewer()
        icp = self.env["ir.config_parameter"].sudo()
        comp = self.env.company
        J = self.env["account.journal"].sudo()
        A = self.env["account.account"].sudo()
        cash_j = J.search([("type", "=", "cash"), ("company_ids", "in", comp.ids)]) if "company_ids" in J._fields else J.search([("type", "=", "cash"), ("company_id", "=", comp.id)])
        src_j = J.search([("type", "in", ("bank", "cash")), ("company_ids", "in", comp.ids)]) if "company_ids" in J._fields else J.search([("type", "in", ("bank", "cash")), ("company_id", "=", comp.id)])
        try:
            accts = A.search([("account_type", "in", ("expense", "expense_direct_cost", "income_other", "expense_depreciation"))], limit=300)
        except Exception:
            accts = A.search([], limit=300)
        maps = json.loads(icp.get_param(P_MAP) or "{}")
        configured = bool(icp.get_param(P_JOURNAL))
        try:
            low = float(icp.get_param(P_LOW, "100"))
        except ValueError:
            low = 100.0
        return {
            "can_edit": MGR in self._otm_user_roles() or self.env.user.has_group("base.group_system"),
            "configured": configured, "journal": int(icp.get_param(P_JOURNAL) or 0), "source": int(icp.get_param(P_SOURCE) or 0), "diff_account": int(icp.get_param(P_DIFF) or 0),
            "map": maps, "limit": self._otm_petty_limit(), "low": low,
            "journals": [{"id": j.id, "name": j.name} for j in cash_j], "sources": [{"id": j.id, "name": j.name} for j in src_j],
            "accounts": [{"id": a.id, "name": f"{a.code} {a.name}"} for a in accts], "cats": [{"key": k, "label": v} for k, v in CATS],
        }

    @api.model
    def otm_petty_setup_save(self, journal, source, diff_account, mapping, limit, low):
        self._otm_petty_reviewer()
        if MGR not in self._otm_user_roles() and not self.env.user.has_group("base.group_system"):
            raise UserError(self.env._("Only a Manager can change the petty cash setup."))
        limit, low = float(limit or 0), float(low or 0)
        if limit <= 0 or low < 0:
            raise UserError(self.env._("Enter a valid approval limit and low-balance level."))
        J, A = self.env["account.journal"].sudo(), self.env["account.account"].sudo()
        j = J.browse(int(journal or 0)).exists()
        if j and (j.type != "cash" or not j.default_account_id):
            raise UserError(self.env._("The petty cash journal must be a Cash journal with a default account."))
        clean = {}
        for k, v in (mapping or {}).items():
            if k in dict(CATS) and v and A.browse(int(v)).exists():
                clean[k] = int(v)
        icp = self.env["ir.config_parameter"].sudo()
        icp.set_param(P_JOURNAL, str(j.id or ""))
        icp.set_param(P_SOURCE, str(int(source or 0) or ""))
        icp.set_param(P_DIFF, str(int(diff_account or 0) or ""))
        icp.set_param(P_MAP, json.dumps(clean))
        icp.set_param(LIMIT_PARAM, str(limit))
        icp.set_param(P_LOW, str(low))
        return True

    @api.model
    def otm_petty_post_pending(self):
        self._otm_petty_reviewer()
        rows = self.env["otm.ft.petty"].sudo().search([("status", "=", "approved"), ("move_id", "=", False)], order="id", limit=500)
        rows._otm_petty_post_entry()
        return {"posted": len(rows.filtered(lambda r: r.move_id)), "failed": len(rows.filtered(lambda r: not r.move_id))}

    # ---- statement ----
    @api.model
    def otm_petty_statement(self, month):
        roles = self._otm_petty_role()
        reviewer = ACC in roles or MGR in roles
        try:
            first = fields.Date.from_string(f"{month}-01")
        except Exception:
            raise UserError(self.env._("Choose a valid month."))
        nxt = (first + timedelta(days=32)).replace(day=1)
        Petty = self.env["otm.ft.petty"].sudo()
        dom = [("status", "=", "approved")] + ([] if reviewer else [("holder_id", "=", self.env.user.id)])
        rows = Petty.search(dom, order="date, id")
        signed = lambda r: -r.amount if r.kind == "expense" else r.amount
        holders = {}
        for r in rows:
            h = holders.setdefault(r.holder_id.id, {"holder": r.holder_id.name, "opening": 0.0, "topups": 0.0, "expenses": 0.0, "adjust": 0.0, "lines": []})
            d = r.date or first
            if d < first:
                h["opening"] += signed(r)
            elif d < nxt:
                h["topups" if r.kind == "topup" else "expenses" if r.kind == "expense" else "adjust"] += abs(r.amount) if r.kind != "adjust" else r.amount
                h["lines"].append([fields.Date.to_string(d), r.ref or "", r.kind, r.category or "", r.description or "", signed(r), r.lead_id.name or "", r.move_id.name or ""])
        out = []
        for h in holders.values():
            h["closing"] = round(h["opening"] + h["topups"] - h["expenses"] + h["adjust"], 2)
            out.append(h)
        return sorted(out, key=lambda x: x["holder"])

    @api.model
    def otm_petty_statement_csv(self, month):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Holder", "Date", "Ref", "Type", "Category", "Description", "Amount (+in / -out)", "Project", "Journal entry"])
        for h in self.otm_petty_statement(month):
            w.writerow([h["holder"], "", "", "OPENING", "", "", round(h["opening"], 2), "", ""])
            for ln in h["lines"]:
                w.writerow([h["holder"], *ln[:5], ln[5], ln[6], ln[7]])
            w.writerow([h["holder"], "", "", "CLOSING", "", "", h["closing"], "", ""])
        return buf.getvalue()
