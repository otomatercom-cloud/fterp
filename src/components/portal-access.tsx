"use client";
import { useState, useTransition } from "react";
import { createPortalUserAction } from "@/app/(dashboard)/m/portal/actions";

export function PortalAccess({ leadId, login, hasPartner }: { leadId: number; login: string | false; hasPartner: boolean }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  if (login) return <p className="text-sm">Customer login: <b>{login}</b> (customer signs in at the same address and sees My Projects).</p>;
  if (!hasPartner) return <p className="text-sm text-muted">Available once the estimate exists (customer contact is created then).</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Customer email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (login)" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
        <input aria-label="Temporary password" type="text" autoComplete="off" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Temporary password (8+)" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
        <button disabled={pending || !email || pwd.length < 8} onClick={() => start(async () => { const r = await createPortalUserAction(leadId, email, pwd); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Portal login created. Share the details with the customer." }); })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">Create login</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
    </div>
  );
}
