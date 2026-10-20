"use client";
import { useState, useTransition } from "react";
import { addSiteUpdateAction } from "@/app/(dashboard)/m/projects/actions";

export function SiteUpdateForm({ leadId, current }: { leadId: number; current: number }) {
  const [percent, setPercent] = useState(current);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await addSiteUpdateAction(leadId, percent, note);
    if (r.error) setErr(r.error); else { setErr(undefined); setNote(""); }
  });
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="pct" className="mb-1 flex justify-between text-sm font-medium"><span>Overall progress</span><span className="text-gold">{percent}%</span></label>
        <input id="pct" type="range" min={current} max={100} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="w-full accent-[#e8bf7e]" />
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">Work done</label>
        <textarea id="note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ceiling framing completed in living room" className="w-full rounded-md border border-line p-3 text-sm" />
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button disabled={pending || !note.trim()} onClick={submit} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">{pending ? "Saving…" : "Add site update"}</button>
    </div>
  );
}
