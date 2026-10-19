"use client";
import { useState, useTransition } from "react";
import { setFieldAction } from "@/app/(dashboard)/m/crm/actions";

type Props = { leadId: number; field: string; label: string; options?: { id: number; name: string }[]; value?: number };
export function FieldSetter({ leadId, field, label, options, value }: Props) {
  const [v, setV] = useState(String(value || ""));
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>();
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await setFieldAction(leadId, field, Number(v));
    setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Saved" });
  });
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={field}>{label}</label>
      <div className="flex gap-2">
        {options ? (
          <select id={field} value={v} onChange={(e) => setV(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-line px-2 text-sm">
            <option value="">Select…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <input id={field} type="number" min="0" step="0.01" value={v} onChange={(e) => setV(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
        )}
        <button onClick={save} disabled={pending || !v} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
    </div>
  );
}
