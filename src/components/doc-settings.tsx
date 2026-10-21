"use client";
import { useState, useTransition } from "react";
import { saveDocSettingsAction } from "@/app/(dashboard)/m/admin/actions";
import type { DocSettings } from "@/lib/odoo/leads";

export function DocSettingsPanel({ cfg }: { cfg: DocSettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const ta = "w-full rounded border border-line bg-transparent p-2 text-sm";
  return (
    <form action={(fd) => start(async () => setMsg(await saveDocSettingsAction(fd)))} className="glass space-y-3 p-5">
      <h2 className="font-semibold">Printed documents (quotation, PO, receipt, payslip)</h2>
      <p className="text-xs text-muted">Company name, address, logo and TRN/VAT come from Odoo: Settings → Companies ({cfg.company}{cfg.vat ? `, TRN ${cfg.vat}` : ", no TRN set"}{cfg.has_logo ? ", logo set" : ", no logo"}). Terms and bank details below print at the bottom of quotations and purchase orders.</p>
      <label className="block text-sm">Terms &amp; conditions<textarea name="terms" rows={4} maxLength={3000} defaultValue={cfg.terms} className={ta} /></label>
      <label className="block text-sm">Bank details<textarea name="bank" rows={3} maxLength={1000} defaultValue={cfg.bank} className={ta} /></label>
      <button disabled={pending} className="h-9 rounded bg-primary px-3 text-sm text-white disabled:opacity-50">Save</button>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-success">{msg.ok}</p>}
    </form>
  );
}
