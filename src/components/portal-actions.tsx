"use client";
import { useState, useTransition } from "react";
import { portalActionAction, raiseSnagAction } from "@/app/(dashboard)/m/portal/actions";

export function PortalActions({ leadId, canApprove, canSignoff, canRaiseSnag }: { leadId: number; canApprove: boolean; canSignoff: boolean; canRaiseSnag: boolean }) {
  const [issue, setIssue] = useState("");
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
      {canRaiseSnag && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Describe an issue" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={200} placeholder="Found an issue? e.g. Scratch on wardrobe door" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
          <button disabled={pending || !issue.trim()} onClick={() => start(async () => { const r = await raiseSnagAction(leadId, issue); setErr(r.error); if (!r.error) setIssue(""); })} className={`${btn} border border-line hover:bg-tint`}>Report issue</button>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}
