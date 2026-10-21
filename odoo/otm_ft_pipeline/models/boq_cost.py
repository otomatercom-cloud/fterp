from odoo import api, fields, models
from odoo.exceptions import UserError

from .boq import CATEGORIES
from .crm_lead import MGR, PROC, SM

COST_GROUPS = "otm_ft_pipeline.group_ft_manager,otm_ft_pipeline.group_ft_procurement,base.group_system"
P_MARGIN, P_BUFFER, P_STALE, P_VALID = "otm_ft_pipeline.cost_margin", "otm_ft_pipeline.cost_buffer", "otm_ft_pipeline.cost_stale_days", "otm_ft_pipeline.cost_valid_days"
DEFAULTS = {P_MARGIN: 25.0, P_BUFFER: 5.0, P_STALE: 60.0, P_VALID: 15.0}


class OtmFtTrade(models.Model):
    _name = "otm.ft.trade"
    _description = "FT Labour Trade"
    _order = "name"

    name = fields.Char(required=True)
    daily_rate = fields.Float(required=True, help="Daily wage per labourer (internal cost)")
    active = fields.Boolean(default=True)

    _name_uniq = models.Constraint("unique(name)", "Trade name must be unique.")


class OtmFtPackage(models.Model):
    _name = "otm.ft.package"
    _description = "FT Work Package"
    _order = "category, name"

    code = fields.Char(required=True, index=True)
    name = fields.Char(required=True)
    category = fields.Selection(CATEGORIES, default="other", required=True)
    unit = fields.Char(default="sqm", required=True)
    line_ids = fields.One2many("otm.ft.package.line", "package_id")
    trade_id = fields.Many2one("otm.ft.trade")
    workers = fields.Float(default=2)
    days_per_unit = fields.Float(help="Working days of the crew for 1 unit")
    install_unit = fields.Float(string="Installation per unit")
    active = fields.Boolean(default=True)

    _code_uniq = models.Constraint("unique(code)", "Package code must be unique.")


class OtmFtPackageLine(models.Model):
    _name = "otm.ft.package.line"
    _description = "FT Work Package Material"

    package_id = fields.Many2one("otm.ft.package", required=True, ondelete="cascade")
    item_id = fields.Many2one("otm.ft.item", required=True, ondelete="restrict")
    qty = fields.Float(string="Qty per unit", required=True, default=1.0)


class SaleOrderLineCost(models.Model):
    _inherit = "sale.order.line"

    otm_item_id = fields.Many2one("otm.ft.item", ondelete="set null")
    otm_pkg_id = fields.Many2one("otm.ft.package", ondelete="set null")
    otm_cost_line = fields.Boolean(help="Price is built from material + labour + installation")
    otm_mat = fields.Float(string="Material cost / unit (locked)", groups=COST_GROUPS)
    otm_trade_id = fields.Many2one("otm.ft.trade", ondelete="set null")
    otm_workers = fields.Float()
    otm_days = fields.Float()
    otm_wage = fields.Float(string="Daily wage (locked)", groups=COST_GROUPS)
    otm_inst = fields.Float(string="Installation / unit")
    otm_margin = fields.Float(string="Margin %", groups=COST_GROUPS)
    otm_price_date = fields.Date(string="Material price date")


class CrmLeadCost(models.Model):
    _inherit = "crm.lead"

    otm_est_valid_until = fields.Date(string="Estimate valid until", copy=False)

    # ---- settings ----
    @api.model
    def _otm_cp(self, key):
        v = self.env["ir.config_parameter"].sudo().get_param(key)
        try:
            return float(v) if v not in (None, False, "") else DEFAULTS[key]
        except ValueError:
            return DEFAULTS[key]

    def _otm_cost_ok(self):
        return any(r in self._otm_user_roles() for r in (MGR, PROC))

    def _otm_cost_use(self):
        if not (self._otm_cost_ok() or SM in self._otm_user_roles()):
            raise UserError(self.env._("You are not allowed to build BOQ costs."))

    def _otm_cost_edit(self):
        if not self._otm_cost_ok():
            raise UserError(self.env._("Only Manager or Procurement can manage labour rates and work packages."))

    # ---- material price (live from inventory) ----
    @api.model
    def _otm_item_price(self, item):
        """Latest recorded price incl. safety buffer. Returns (unit_price, date)."""
        last = item.sudo().price_ids[:1]
        if not last:
            raise UserError(self.env._("Item %s has no price yet. Record a price in Inventory first.", item.name))
        return last.price * (1 + self._otm_cp(P_BUFFER) / 100), last.date

    @api.model
    def _otm_fresh_mat(self, item, pkg):
        if pkg:
            total, dates = 0.0, []
            for pl in pkg.sudo().line_ids:
                p, d = self._otm_item_price(pl.item_id)
                total += p * pl.qty
                dates.append(d)
            return total, (min(dates) if dates else False)
        if item:
            return self._otm_item_price(item)
        return 0.0, False

    # ---- one line ----
    def _otm_calc_line(self, l, prev, trusted=False, fresh=False):
        """Authoritative price calculation. Returns (order-line vals, info)."""
        c = l.get("cost") or {}
        cost_role = self._otm_cost_ok() or trusted
        qty = float(l.get("qty") or 0)
        if qty <= 0:
            raise UserError(self.env._("Each line needs a quantity above 0."))
        Item, Pkg, Trade = self.env["otm.ft.item"].sudo(), self.env["otm.ft.package"].sudo(), self.env["otm.ft.trade"].sudo()
        item = Item.browse(int(c["item_id"])).exists() if c.get("item_id") else Item
        pkg = Pkg.browse(int(c["pkg_id"])).exists() if c.get("pkg_id") else Pkg
        trade = Trade.browse(int(c["trade_id"])).exists() if c.get("trade_id") else Trade
        old = prev.get(int(l["ref"])) if l.get("ref") else None
        same_src = bool(old) and old.otm_item_id == item and old.otm_pkg_id == pkg
        fresh_mat, mdate = self._otm_fresh_mat(item, pkg) if (item or pkg) else (0.0, False)
        if item or pkg:
            if not fresh and same_src:
                mat, mdate = old.otm_mat, old.otm_price_date
            else:
                mat = fresh_mat
        elif cost_role and c.get("mat") not in (None, ""):
            mat = float(c["mat"])
        else:
            mat = old.otm_mat if old else 0.0
        if trusted and c.get("mat") is not None:  # restoring a saved revision keeps its locked prices
            mat = float(c["mat"])
            mdate = fields.Date.to_date(c["price_date"]) if c.get("price_date") else mdate
        if trade and trusted and c.get("wage") is not None:
            wage = float(c["wage"])
        else:
            wage = (old.otm_wage if old and not fresh and old.otm_trade_id == trade else trade.daily_rate) if trade else 0.0
        workers, days = max(float(c.get("workers") or 0), 0.0), max(float(c.get("days") or 0), 0.0)
        inst = max(float(c.get("inst") or 0), 0.0)
        if cost_role and c.get("margin") not in (None, ""):
            margin = float(c["margin"])
        else:
            margin = old.otm_margin if old else self._otm_cp(P_MARGIN)
        if margin < 0 or margin > 500:
            raise UserError(self.env._("Margin must be between 0 and 500%."))
        labour = workers * days * wage
        unit_cost = mat + labour / qty + inst
        price = round(unit_cost * (1 + margin / 100), 2)
        vals = {"otm_cost_line": True, "otm_item_id": item.id, "otm_pkg_id": pkg.id, "otm_mat": mat, "otm_trade_id": trade.id, "otm_workers": workers, "otm_days": days,
                "otm_wage": wage, "otm_inst": inst, "otm_margin": margin, "otm_price_date": mdate or False, "price_unit": price}
        stale_days = self._otm_cp(P_STALE)
        stale = bool(mdate) and (fields.Date.context_today(self) - mdate).days > stale_days
        info = {"price": price, "mandays": workers * days, "stale": stale, "price_date": fields.Date.to_string(mdate) if mdate else False,
                "changed": abs(fresh_mat - mat) > 0.005 if (item or pkg) else False}
        if cost_role:
            info.update(mat=round(mat, 4), wage=wage, labour=round(labour, 2), unit_cost=round(unit_cost, 2), margin=margin, fresh_mat=round(fresh_mat, 4))
        return vals, info

    # ---- API: config & preview ----
    def otm_cost_config(self):
        roles = self._otm_user_roles()
        if not (any(r in roles for r in (MGR, PROC, SM))):
            raise UserError(self.env._("You are not allowed to build BOQ costs."))
        full = self._otm_cost_ok()
        trades = self.env["otm.ft.trade"].sudo().search([])
        pkgs = self.env["otm.ft.package"].sudo().search([])
        items = self.env["otm.ft.item"].sudo().search([], limit=2000)
        cat = dict(CATEGORIES)
        return {
            "can_cost": full, "margin": self._otm_cp(P_MARGIN), "buffer": self._otm_cp(P_BUFFER), "stale_days": self._otm_cp(P_STALE), "valid_days": self._otm_cp(P_VALID),
            "trades": [{"id": t.id, "name": t.name, "rate": t.daily_rate if full else 0.0} for t in trades],
            "items": [{"id": i.id, "code": i.code, "name": i.name, "unit": i.unit, "category": i.category, "has_price": bool(i.price_ids)} for i in items],
            "packages": [{"id": p.id, "code": p.code, "name": p.name, "category": p.category, "category_label": cat.get(p.category, ""), "unit": p.unit, "trade_id": p.trade_id.id or False, "workers": p.workers,
                          "days_per_unit": p.days_per_unit, "install_unit": p.install_unit,
                          "items": [{"item_id": x.item_id.id, "name": x.item_id.name, "qty": x.qty} for x in p.line_ids] if full else []} for p in pkgs],
        }

    def otm_cost_calc(self, lines):
        self.ensure_one()
        self._otm_cost_use()
        order = self.sudo().order_ids.filtered(lambda o: o.state == "draft")[:1]
        prev = {l.id: l for l in order.order_line}
        out = []
        for l in lines[:200]:
            if not l.get("cost"):
                out.append(None)
                continue
            _vals, info = self._otm_calc_line(l, prev)
            out.append(info)
        return out

    @api.model
    def otm_cost_save_config(self, margin, buffer, stale_days, valid_days):
        self._otm_cost_edit()
        vals = {P_MARGIN: margin, P_BUFFER: buffer, P_STALE: stale_days, P_VALID: valid_days}
        for k, v in vals.items():
            v = float(v)
            if v < 0 or (k == P_MARGIN and v > 500) or (k == P_BUFFER and v > 100):
                raise UserError(self.env._("Enter valid percentages and days."))
            self.env["ir.config_parameter"].sudo().set_param(k, str(v))
        return True

    @api.model
    def otm_save_trade(self, vals):
        self._otm_cost_edit()
        name, rate = str(vals.get("name") or "").strip()[:60], float(vals.get("rate") or 0)
        if not name or rate < 0:
            raise UserError(self.env._("Enter a trade name and a daily rate of 0 or more."))
        Trade = self.env["otm.ft.trade"].sudo().with_context(active_test=False)
        if Trade.search_count([("name", "=ilike", name), ("id", "!=", int(vals.get("id") or 0))]):
            raise UserError(self.env._("Trade %s already exists.", name))
        if vals.get("id"):
            Trade.browse(int(vals["id"])).write({"name": name, "daily_rate": rate, "active": True})
        else:
            Trade.create({"name": name, "daily_rate": rate})
        return True

    @api.model
    def otm_archive_trade(self, trade_id):
        self._otm_cost_edit()
        self.env["otm.ft.trade"].sudo().browse(int(trade_id)).write({"active": False})
        return True

    @api.model
    def otm_save_package(self, vals):
        self._otm_cost_edit()
        code, name, unit = str(vals.get("code") or "").strip().upper()[:30], str(vals.get("name") or "").strip()[:120], str(vals.get("unit") or "").strip()[:12]
        if not code or not name or not unit or vals.get("category") not in dict(CATEGORIES):
            raise UserError(self.env._("Enter code, name, category and unit."))
        items = [(int(x["item_id"]), float(x["qty"])) for x in (vals.get("items") or []) if x.get("item_id") and float(x.get("qty") or 0) > 0]
        data = {"code": code, "name": name, "unit": unit, "category": vals["category"], "trade_id": int(vals["trade_id"]) if vals.get("trade_id") else False,
                "workers": max(float(vals.get("workers") or 0), 0), "days_per_unit": max(float(vals.get("days_per_unit") or 0), 0), "install_unit": max(float(vals.get("install_unit") or 0), 0),
                "line_ids": [(5, 0, 0)] + [(0, 0, {"item_id": i, "qty": q}) for i, q in items]}
        Pkg = self.env["otm.ft.package"].sudo().with_context(active_test=False)
        if Pkg.search_count([("code", "=", code), ("id", "!=", int(vals.get("id") or 0))]):
            raise UserError(self.env._("Package code %s is already used.", code))
        if vals.get("id"):
            Pkg.browse(int(vals["id"])).write(dict(data, active=True))
        else:
            Pkg.create(data)
        return True

    @api.model
    def otm_archive_package(self, pkg_id):
        self._otm_cost_edit()
        self.env["otm.ft.package"].sudo().browse(int(pkg_id)).write({"active": False})
        return True

    # ---- price check / refresh ----
    def otm_price_check(self):
        self.ensure_one()
        self._otm_cost_use()
        full = self._otm_cost_ok()
        order = self.sudo().order_ids.sorted("id")[-1:]
        prev = {l.id: l for l in order.order_line}
        rows = []
        for l in order.order_line.filtered("otm_cost_line"):
            line = {"ref": l.id, "name": l.name, "qty": l.product_uom_qty, "cost": {"item_id": l.otm_item_id.id, "pkg_id": l.otm_pkg_id.id, "trade_id": l.otm_trade_id.id,
                                                                                    "workers": l.otm_workers, "days": l.otm_days, "inst": l.otm_inst}}
            try:
                _v, new = self._otm_calc_line(line, prev, fresh=True)
            except UserError as e:
                rows.append({"name": l.name, "error": str(e)})
                continue
            row = {"name": l.name, "old_price": l.price_unit, "new_price": new["price"], "pct": round((new["price"] - l.price_unit) / l.price_unit * 100, 1) if l.price_unit else 0.0}
            if full:
                row.update(old_mat=round(l.otm_mat, 2), new_mat=new["fresh_mat"], old_wage=l.otm_wage, new_wage=new["wage"])
            _o, cur = self._otm_calc_line(line, prev)
            row["stale"] = cur["stale"]
            rows.append(row)
        return rows

    def otm_price_refresh(self):
        self.ensure_one()
        self._otm_cost_use()
        order = self.sudo().order_ids.filtered(lambda o: o.state == "draft")[:1]
        if not order or self.otm_stage != "estimate_draft":
            raise UserError(self.env._("Prices can be refreshed only on a draft estimate."))
        lines = []
        for l in order.order_line.filtered(lambda x: not x.display_type):
            d = {"ref": l.id, "name": l.name, "qty": l.product_uom_qty, "price": l.price_unit, "category": l.otm_category or "other", "unit": l.otm_unit or ""}
            if l.otm_cost_line:
                d["cost"] = {"item_id": l.otm_item_id.id, "pkg_id": l.otm_pkg_id.id, "trade_id": l.otm_trade_id.id, "workers": l.otm_workers, "days": l.otm_days, "inst": l.otm_inst}
            lines.append(d)
        amount = self._otm_save_estimate(lines, fresh=True)
        self._otm_snapshot_estimate("refresh", force_reason=self.env._("Prices refreshed from inventory"))
        return amount

    def otm_set_valid_until(self, day):
        self.ensure_one()
        if not any(r in self._otm_user_roles() for r in (SM, MGR)):
            raise UserError(self.env._("Only a Sales Manager or Manager can change the validity date."))
        self.sudo().otm_est_valid_until = day or False
        return True

    # ---- cost summary ----
    def _otm_cost_summary(self, order):
        full = self._otm_cost_ok()
        mat = lab = inst = revenue = manual = 0.0
        mandays, crew, trades = 0.0, 0.0, {}
        for l in order.order_line.filtered(lambda x: not x.display_type):
            if not l.otm_cost_line:
                manual += l.price_subtotal
                continue
            md = l.otm_workers * l.otm_days
            mandays += md
            crew = max(crew, l.otm_workers)
            if l.otm_trade_id:
                trades[l.otm_trade_id.name] = trades.get(l.otm_trade_id.name, 0.0) + md
            mat += l.otm_mat * l.product_uom_qty
            lab += l.otm_workers * l.otm_days * l.otm_wage
            inst += l.otm_inst * l.product_uom_qty
            revenue += l.price_subtotal
        d = {"mandays": round(mandays, 2), "max_crew": crew, "trades": [{"trade": k, "mandays": round(v, 2)} for k, v in sorted(trades.items())], "has_cost": bool(mandays or mat or inst)}
        if full:
            cost = mat + lab + inst
            d.update(material=round(mat, 2), labour=round(lab, 2), installation=round(inst, 2), cost=round(cost, 2), revenue=round(revenue, 2), manual=round(manual, 2),
                     profit=round(revenue - cost, 2), profit_pct=round((revenue - cost) / revenue * 100, 1) if revenue else 0.0,
                     actual_material=self.otm_procurement_amount or 0.0)
        return d
