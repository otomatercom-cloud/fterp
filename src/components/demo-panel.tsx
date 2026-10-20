"use client";
import { useState, useTransition } from "react";
import { loadDemoAction, removeDemoAction } from "@/app/(dashboard)/m/admin/actions";

const D = "@ftdemo.com";
const LOGINS: [string, string, string][] = [
  ["demo.sales1" + D, "Sales Manager", "Own leads, estimates, send to client, record payment, portal access, design"],
  ["demo.sales2" + D, "Sales Manager", "Sees only its own leads (leads alternate with sales1)"],
  ["demo.manager" + D, "Manager", "Assign leads and PMs, approve estimate/prices, approve designs, reports"],
  ["demo.pm1" + D, "Project Manager", "Own projects: site updates, tasks, joinery, installation, handover"],
  ["demo.pm2" + D, "Project Manager", "Other projects (checks PM scoping)"],
  ["demo.procurement" + D, "Procurement", "Costing check, prices, purchase orders"],
  ["demo.accounts" + D, "Accounts", "Advance invoice, payment verification"],
  ["demo.factory" + D, "Factory (Manufacturing)", "Accept orders, move production stages, dispatch (company: FT Furniture Factory)"],
  ["demo.customer1" + D, "Customer (portal)", "Business Bay Office: project progress, report snag"],
  ["demo.customer2" + D, "Customer (portal)", "Co-working Space: approve estimate / request changes"],
  ["demo.customer3" + D, "Customer (portal)", "Downtown Cafe: confirm handover"],
];

export function DemoPanel({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const run = (fn: typeof loadDemoAction) => start(async () => setMsg(await fn()));
  return (
    <div className="glass space-y-3 p-5">
      <h2 className="font-semibold">Demo data</h2>
      <p className="text-sm text-muted">
        Creates 32 sample leads across every stage, with estimates, costing, design items and drawings, purchase orders, invoices, tasks, joinery, installations with photos, site updates, history, plus a login for every role.
        Currently loaded: <b className="text-ink">{count}</b> demo leads.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || count > 0} onClick={() => run(loadDemoAction)} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {pending ? "Working…" : "Load demo data"}
        </button>
        <button disabled={pending || count === 0} onClick={() => confirm("Remove all demo leads?") && run(removeDemoAction)} className="h-10 rounded-md border border-line px-4 text-sm hover:bg-tint disabled:opacity-50">
          Remove demo data
        </button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-gold">Demo logins (password for all: <code>Demo@2026</code>)</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="py-1">Login</th><th>Role</th><th>Test with</th></tr></thead>
          <tbody className="divide-y divide-line">
            {LOGINS.map(([l, r, t]) => <tr key={l}><td className="py-1 font-mono">{l}</td><td>{r}</td><td className="text-muted">{t}</td></tr>)}
          </tbody>
        </table>
      </details>
      {msg.ok && <p role="status" className="text-sm text-success">{msg.ok}</p>}
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
    </div>
  );
}
