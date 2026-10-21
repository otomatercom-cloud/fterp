"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Printer, Trash2, Upload } from "lucide-react";
import { deleteDocAction } from "@/app/(dashboard)/m/crm/actions";
import type { DocItem } from "@/lib/odoo/leads";

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocsPanel({ leadId, kinds, docs, prints }: { leadId: number; kinds: Record<string, string>; docs: DocItem[]; prints: { href: string; label: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("other");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr(undefined);
    const fd = new FormData(); fd.append("file", f); fd.append("kind", kind);
    const r = await fetch(`/api/leads/${leadId}/docs`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Upload failed" }));
    setBusy(false);
    if (r.error) setErr(r.error); else router.refresh();
  };
  return (
    <div className="space-y-3 text-sm">
      {prints.length > 0 && (
        <div className="flex flex-wrap gap-2">{prints.map((p) => <a key={p.href} href={p.href} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 hover:bg-tint"><Printer className="size-4" /> {p.label}</a>)}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-line px-2 text-sm">{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-white"><Upload className="size-4" /> {busy ? "Uploading…" : "Upload file"}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <span className="text-xs text-muted">PDF, image, Excel, Word, CSV · up to 5 MB</span>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {docs.length === 0 ? <p className="text-xs text-muted">No documents uploaded yet (contract, signed quotation, customer LPO, ID copy, vendor bills).</p> : (
        <ul className="divide-y divide-line">{docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-muted" /><span className="truncate">{d.name}</span><span className="shrink-0 text-xs text-muted">{kinds[d.kind] ?? d.kind} · {kb(d.size)} · {d.user} · {d.date.slice(0, 10)}</span></span>
            <span className="flex items-center gap-3 text-xs">
              <a href={`/api/docs/${d.id}`} className="flex items-center gap-1 text-gold"><Download className="size-3.5" /> Download</a>
              {d.can_delete && <button disabled={pending} onClick={() => confirm(`Delete ${d.name}?`) && start(async () => { const r = await deleteDocAction(d.id); if (r.error) setErr(r.error); else router.refresh(); })} className="text-danger"><Trash2 className="size-3.5" /></button>}
            </span>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
