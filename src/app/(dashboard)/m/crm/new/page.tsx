"use client";
import { useActionState } from "react";
import Link from "next/link";
import { createLeadAction } from "../actions";

const inp = "h-11 w-full rounded-md border border-line px-3 text-sm focus:border-primary";
export default function NewLead() {
  const [st, action, pending] = useActionState(createLeadAction, {});
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New lead</h1>
      <form action={action} className="space-y-3 rounded-lg border border-line bg-card p-4 shadow-sm">
        {[["name", "Lead name", "text"], ["partner_name", "Customer name", "text"], ["phone", "Phone", "tel"], ["email_from", "Email", "email"], ["expected_revenue", "Expected budget", "number"]].map(([n, l, t]) => (
          <div key={n}><label htmlFor={n} className="mb-1 block text-sm font-medium">{l}</label><input id={n} name={n} type={t} min={t === "number" ? 0 : undefined} step="any" className={inp} required={n === "name" || n === "partner_name"} /></div>
        ))}
        <div><label htmlFor="otm_origin" className="mb-1 block text-sm font-medium">Source</label>
          <select id="otm_origin" name="otm_origin" className={inp} defaultValue="walkin"><option value="walkin">Walk-in (assigned to me)</option><option value="other">Other (Manager assigns)</option></select></div>
        <div><label htmlFor="description" className="mb-1 block text-sm font-medium">Notes</label><textarea id="description" name="description" rows={3} className="w-full rounded-md border border-line p-3 text-sm" /></div>
        <p className="text-xs text-muted">Meta leads arrive automatically and are round-robin assigned.</p>
        {st.error && <p role="alert" className="text-sm text-danger">{st.error}</p>}
        <div className="flex gap-2"><button disabled={pending} className="h-11 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Creating…" : "Create lead"}</button><Link href="/m/crm" className="grid h-11 place-items-center rounded-md border border-line px-5 text-sm hover:bg-tint">Cancel</Link></div>
      </form>
    </div>
  );
}
