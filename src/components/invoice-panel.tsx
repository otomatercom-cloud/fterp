"use client";
import { useState, useTransition } from "react";
import { createInvoiceAction, postInvoiceAction, registerPaymentAction } from "@/app/(dashboard)/m/crm/actions";
import type { InvoiceInfo } from "@/lib/odoo/leads";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const btn = "h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60";

export function InvoicePanel({ leadId, stage, invoice, journals }: { leadId: number; stage: string; invoice: InvoiceInfo; journals: { id: number; name: string }[] }) {
  const [amount, setAmount] = useState("");
  const [journal, setJournal] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ error?: string }>) => { setErr(undefined); start(async () => setErr((await f()).error)); };
  return (
    <div className="space-y-3 text-sm">
      {invoice ? (
        <p>
          <strong>{invoice.name}</strong> · {invoice.state} · subtotal {fmt(invoice.untaxed)} + tax {fmt(invoice.tax)} = total {fmt(invoice.total)} · balance {fmt(invoice.residual)} · payment: <span className="font-medium">{invoice.payment_state.replace("_", " ")}</span>
          {" · "}<a className="text-gold underline" href={`/print/invoice/${leadId}`} target="_blank" rel="noreferrer">Print invoice</a>
        </p>
      ) : <p className="text-muted">No invoice yet.</p>}
      {stage === "invoice_draft" && !invoice && (
        <div className="flex gap-2">
          <input aria-label="Advance invoice amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Advance amount (excl. tax)" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3" />
          <button disabled={pending || !amount} className={btn} onClick={() => run(() => createInvoiceAction(leadId, Number(amount)))}>Create invoice</button>
        </div>
      )}
      {stage === "invoice_draft" && !invoice && <p className="text-xs text-muted">Company sales tax is added automatically. The advance received must equal the invoice total including tax.</p>}
      {stage === "invoice_draft" && invoice && invoice.state === "draft" && <button disabled={pending} className={btn} onClick={() => run(() => postInvoiceAction(leadId))}>Post invoice</button>}
      {stage === "payment_verification" && invoice && invoice.payment_state !== "paid" && invoice.payment_state !== "in_payment" && (
        <div className="flex gap-2">
          <select aria-label="Payment journal" value={journal} onChange={(e) => setJournal(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-line px-2">
            <option value="">Bank / cash journal…</option>
            {journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <button disabled={pending || !journal} className={btn} onClick={() => run(() => registerPaymentAction(leadId, Number(journal)))}>Register payment</button>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
