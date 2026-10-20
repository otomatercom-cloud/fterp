"use client";
import { useState, useTransition } from "react";
import { portalActionAction } from "@/app/(dashboard)/m/portal/actions";

export function PortalActions({ leadId, canApprove, canSignoff }: { leadId: number; canApprove: boolean; canSignoff: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const run = (a: string, ask: string) => { if (confirm(ask)) start(async () => setErr((await portalActionAction(leadId, a)).error)); };
  const btn = "h-10 rounded-md px-4 text-sm font-medium disabled:opacity-60";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canApprove && <>
          <button disabled={pending} onClick={() => run("client_approve", "Approve this estimate?")} className={`${btn} bg-primary text-white hover:bg-primary-dark`}>Approve estimate</button>
          <button disabled={pending} onClick={() => run("client_requests_changes", "Ask FT Interior Design to revise the estimate?")} className={`${btn} border border-line hover:bg-tint`}>Request changes</button>
        </>}
        {canSignoff && <button disabled={pending} onClick={() => run("confirm_handover", "Confirm that the work is handed over to you?")} className={`${btn} bg-primary text-white hover:bg-primary-dark`}>Confirm handover</button>}
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}
