import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/workflow/boq";
import type { DocCompany, PrintData } from "@/lib/odoo/leads";

const fmt = (n: number) => (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const th = "border-b border-neutral-400 py-1.5 text-left text-xs font-semibold uppercase text-neutral-600";

function Frame({ c, title, no, meta, children, terms = true }: { c: DocCompany; title: string; no?: string; meta?: [string, string][]; children: ReactNode; terms?: boolean }) {
  return (
    <article className="mx-auto min-h-[27cm] w-full max-w-[21cm] bg-white p-8 text-sm text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#7b1e2b] pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.logo && <img src={c.logo} alt="" className="h-14 w-auto max-w-40 object-contain" />}
          <div><p className="text-lg font-bold text-[#7b1e2b]">{c.name}</p>
            <p className="text-xs text-neutral-600">{c.address}</p>
            <p className="text-xs text-neutral-600">{[c.phone, c.email, c.website].filter(Boolean).join(" · ")}{c.vat ? ` · TRN/VAT: ${c.vat}` : ""}</p></div>
        </div>
        <div className="text-right"><p className="text-xl font-bold uppercase tracking-wide">{title}</p>{no && <p className="text-xs text-neutral-600">No. {no}</p>}
          {meta?.map(([k, v]) => v ? <p key={k} className="text-xs text-neutral-600">{k}: {v}</p> : null)}</div>
      </header>
      <div className="space-y-4 py-4">{children}</div>
      {terms && (c.terms || c.bank) && (
        <footer className="grid gap-4 border-t border-neutral-300 pt-3 text-xs text-neutral-600 sm:grid-cols-2 print:grid-cols-2">
          {c.terms && <div><p className="mb-0.5 font-semibold text-neutral-800">Terms &amp; conditions</p><p className="whitespace-pre-line">{c.terms}</p></div>}
          {c.bank && <div><p className="mb-0.5 font-semibold text-neutral-800">Bank details</p><p className="whitespace-pre-line">{c.bank}</p></div>}
        </footer>
      )}
    </article>
  );
}
const Party = ({ label, name, lines }: { label: string; name: string; lines: (string | undefined)[] }) => (
  <div><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="font-semibold">{name}</p>{lines.filter(Boolean).map((l, i) => <p key={i} className="text-xs text-neutral-600">{l}</p>)}</div>
);
const Sign = ({ left, right }: { left: string; right: string }) => (
  <div className="grid grid-cols-2 gap-10 pt-14 text-xs text-neutral-600">{[left, right].map((t) => <div key={t} className="border-t border-neutral-500 pt-1">{t}<br />Name / Signature / Date</div>)}</div>
);
const Totals = ({ cur, untaxed, tax, total, taxName }: { cur: string; untaxed: number; tax: number; total: number; taxName: string }) => (
  <dl className="ml-auto grid w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-right">
    <dt className="text-neutral-600">Subtotal</dt><dd>{cur} {fmt(untaxed)}</dd>
    <dt className="text-neutral-600">{taxName}</dt><dd>{cur} {fmt(tax)}</dd>
    <dt className="border-t border-neutral-400 pt-1 font-bold">Total</dt><dd className="border-t border-neutral-400 pt-1 font-bold">{cur} {fmt(total)}</dd>
  </dl>
);

export function PrintDoc({ d }: { d: PrintData }) {
  const c = d.company, cur = c.currency;
  if (d.kind === "quotation") {
    const cats = Array.from(new Set((d.lines as { category: string }[]).map((l) => l.category)));
    return (
      <Frame c={c} title="Quotation" no={d.number} meta={[["Date", d.date], ["Valid until", d.valid_until]]}>
        <div className="grid grid-cols-2 gap-4"><Party label="Quotation for" name={d.customer.name} lines={[d.customer.person, d.customer.address, d.customer.phone, d.customer.email]} /><Party label="Project" name={d.project} lines={[d.prepared_by && `Prepared by ${d.prepared_by}`]} /></div>
        <table className="w-full"><thead><tr><th className={th}>#</th><th className={th}>Description</th><th className={`${th} text-right`}>Qty</th><th className={th}>Unit</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr></thead>
          <tbody>{cats.map((cat) => {
            const rows = (d.lines as { name: string; qty: number; unit: string; price: number; subtotal: number; category: string }[]).filter((l) => l.category === cat);
            return [
              cats.length > 1 && <tr key={cat} className="bg-neutral-100"><td colSpan={5} className="py-1 pl-1 text-xs font-semibold">{CATEGORIES[cat] ?? cat}</td><td className="py-1 text-right text-xs font-semibold">{fmt(rows.reduce((a, r) => a + r.subtotal, 0))}</td></tr>,
              ...rows.map((l, i) => <tr key={cat + i} className="border-b border-neutral-200"><td className="py-1.5 pr-2 text-neutral-500">{i + 1}</td><td className="py-1.5 pr-2">{l.name}</td><td className="py-1.5 text-right">{l.qty}</td><td className="py-1.5 pl-2">{l.unit}</td><td className="py-1.5 text-right">{fmt(l.price)}</td><td className="py-1.5 text-right">{fmt(l.subtotal)}</td></tr>),
            ];
          })}</tbody></table>
        <Totals cur={cur} untaxed={d.untaxed} tax={d.tax} total={d.total} taxName={d.tax_name} />
        <Sign left="Customer acceptance" right={`For ${c.name}`} />
      </Frame>
    );
  }
  if (d.kind === "invoice") {
    return (
      <Frame c={c} title={d.state === "posted" ? "Tax invoice" : "Invoice (draft)"} no={d.number} meta={[["Date", d.date], ["Due", d.due], ["Status", d.payment_state === "paid" ? "PAID" : ""]]}>
        <div className="grid grid-cols-2 gap-4"><Party label="Bill to" name={d.customer.name} lines={[d.customer.address, d.customer.phone, d.customer.email]} /><Party label="Project" name={d.project} lines={[]} /></div>
        <table className="w-full"><thead><tr><th className={th}>#</th><th className={th}>Description</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>Amount</th></tr></thead>
          <tbody>{(d.lines as { name: string; qty: number; price: number; subtotal: number }[]).map((l, i) => <tr key={i} className="border-b border-neutral-200"><td className="py-1.5 text-neutral-500">{i + 1}</td><td className="py-1.5 pr-2">{l.name}</td><td className="py-1.5 text-right">{l.qty}</td><td className="py-1.5 text-right">{fmt(l.price)}</td><td className="py-1.5 text-right">{fmt(l.subtotal)}</td></tr>)}</tbody></table>
        <Totals cur={cur} untaxed={d.untaxed} tax={d.tax} total={d.total} taxName="Tax" />
        {d.balance > 0 && d.balance < d.total && <p className="text-right text-xs">Balance due: <b>{cur} {fmt(d.balance)}</b></p>}
        <Sign left="Customer" right={`For ${c.name}`} />
      </Frame>
    );
  }
  if (d.kind === "po") {
    return (
      <Frame c={c} title="Purchase order" no={d.number} meta={[["Date", d.date], ["Expected delivery", d.expected]]}>
        <div className="grid grid-cols-2 gap-4"><Party label="Vendor" name={d.vendor.name} lines={[d.vendor.address, d.vendor.phone, d.vendor.email]} /><Party label="Deliver for project" name={d.project} lines={[d.prepared_by && `Prepared by ${d.prepared_by}`]} /></div>
        <table className="w-full"><thead><tr><th className={th}>#</th><th className={th}>Description</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>Amount</th></tr></thead>
          <tbody>{(d.lines as { name: string; qty: number; price: number; subtotal: number }[]).map((l, i) => <tr key={i} className="border-b border-neutral-200"><td className="py-1.5 text-neutral-500">{i + 1}</td><td className="py-1.5 pr-2">{l.name}</td><td className="py-1.5 text-right">{l.qty}</td><td className="py-1.5 text-right">{fmt(l.price)}</td><td className="py-1.5 text-right">{fmt(l.subtotal)}</td></tr>)}</tbody></table>
        <Totals cur={cur} untaxed={d.untaxed} tax={d.tax} total={d.total} taxName="Tax" />
        <Sign left="Vendor acknowledgement" right="Authorised signatory" />
      </Frame>
    );
  }
  if (d.kind === "receipt") {
    return (
      <Frame c={c} title="Payment receipt" meta={[["Invoice", d.invoice]]} terms={false}>
        <div className="grid grid-cols-2 gap-4"><Party label="Received from" name={d.customer.name} lines={[d.customer.address, d.customer.phone]} /><Party label="Project" name={d.project} lines={[`Received by ${d.received_by}`]} /></div>
        <table className="w-full"><thead><tr><th className={th}>Payment</th><th className={th}>Date</th><th className={th}>Method</th><th className={`${th} text-right`}>Amount</th></tr></thead>
          <tbody>{(d.payments as { number: string; date: string; amount: number; journal: string }[]).map((p, i) => <tr key={i} className="border-b border-neutral-200"><td className="py-1.5">{p.number}</td><td>{p.date}</td><td>{p.journal}</td><td className="text-right">{cur} {fmt(p.amount)}</td></tr>)}</tbody></table>
        <dl className="ml-auto grid w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-right"><dt className="text-neutral-600">Invoice total</dt><dd>{cur} {fmt(d.invoice_total)}</dd><dt className="font-bold">Balance due</dt><dd className="font-bold">{cur} {fmt(d.balance)}</dd></dl>
        <p className="text-xs text-neutral-500">This is a computer-generated receipt. Thank you for your payment.</p>
        <Sign left="Customer" right={`For ${c.name}`} />
      </Frame>
    );
  }
  if (d.kind === "payslip") {
    return (
      <Frame c={c} title="Payslip" meta={[["Month", String(d.month).slice(0, 7)], ["Status", d.status]]} terms={false}>
        <div className="grid grid-cols-2 gap-4"><Party label="Employee" name={d.employee} lines={[d.designation, d.code && `Code ${d.code}`]} /><Party label="Pay basis" name={d.pay_type === "daily" ? "Daily wage" : "Monthly salary"} lines={[`Rate ${fmt(d.rate)}`, `Paid days ${d.paid_days} of ${d.working_days}`]} /></div>
        <table className="w-full"><tbody>
          {([["Basic pay", d.base], ["Allowances", d.allowances], ["Deductions", -d.deductions]] as [string, number][]).map(([k, v]) => <tr key={k} className="border-b border-neutral-200"><td className="py-1.5">{k}</td><td className="py-1.5 text-right">{cur} {fmt(v)}</td></tr>)}
          <tr><td className="py-2 font-bold">Net pay</td><td className="py-2 text-right font-bold">{cur} {fmt(d.net)}</td></tr></tbody></table>
        {d.note && <p className="text-xs text-neutral-600">Note: {d.note}</p>}
        {d.paid_on && <p className="text-xs text-neutral-600">Paid on {d.paid_on}</p>}
        <Sign left="Employee" right="Authorised signatory" />
      </Frame>
    );
  }
  return (
    <Frame c={c} title="Handover certificate" meta={[["Date", d.date]]} terms={false}>
      <div className="grid grid-cols-2 gap-4"><Party label="Customer" name={d.customer.name} lines={[d.customer.address, d.customer.phone]} /><Party label="Project" name={d.project} lines={[`Project Manager: ${d.project_manager || "—"}`, `Sales Manager: ${d.sales_manager || "—"}`]} /></div>
      <p className="leading-relaxed">This is to certify that the interior works for the above project, with a site progress of <b>{d.progress}%</b>, have been completed and handed over to the customer in good order{d.invoice ? ` (Advance invoice ${d.invoice})` : ""}. Any snag items noted below will be attended to as agreed.</p>
      <p className="text-xs text-neutral-600">Contract value (excl. tax): {cur} {fmt(d.contract)}</p>
      <div className="h-32 rounded border border-dashed border-neutral-400 p-2 text-xs text-neutral-500">Snag / remarks</div>
      <Sign left="Customer acceptance" right={`For ${c.name} (Project Manager)`} />
    </Frame>
  );
}
