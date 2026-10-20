"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDesignAction, designAction_ } from "@/app/(dashboard)/m/design/actions";
import type { Design } from "@/lib/odoo/leads";

export const KIND_LABEL: Record<string, string> = { concept: "Concept", moodboard: "Mood board", material_board: "Material board", layout: "Layout / plan", render_3d: "3D render", shop_drawing: "Shop drawing" };
export const STATUS_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", changes_requested: "Changes requested", approved: "Approved" };
const TONE: Record<string, string> = { draft: "text-muted", in_review: "text-gold", changes_requested: "text-danger", approved: "text-success" };

function Files({ files }: { files: Design["files"] }) {
  if (!files.length) return <p className="mt-2 text-xs text-muted">No files uploaded yet.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={`/api/design-files/${f.id}`} target="_blank" rel="noreferrer" className="block w-20 text-center" title={f.name}>
          {f.pdf ? <span className="flex size-20 items-center justify-center rounded-md border border-line text-xs font-semibold text-gold">PDF</span>
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={`/api/design-files/${f.id}`} alt={f.name} className="size-20 rounded-md border border-line object-cover" />}
          <span className="block truncate text-[10px] text-muted">{f.rev} · {f.name}</span>
        </a>
      ))}
    </div>
  );
}

export function DesignList({ items, showProject, canAddFor }: { items: Design[]; showProject?: boolean; canAddFor?: number }) {
  const router = useRouter();
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const run = (f: () => Promise<{ error?: string }>) => start(async () => setErr((await f()).error));
  const upload = (file: File) => start(async () => {
    if (!target) return;
    const fd = new FormData(); fd.set("file", file);
    const r = await fetch(`/api/designs/${target}/file`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setErr(r.ok ? undefined : j.error ?? "Upload failed");
    if (r.ok) router.refresh();
    if (fileRef.current) fileRef.current.value = "";
  });
  void canAddFor;
  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" aria-label="Design file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {items.length === 0 ? <p className="text-sm text-muted">No design items yet.</p> : (
        <ul className="divide-y divide-line">
          {items.map((d) => (
            <li key={d.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{d.name}</b> <span className="text-xs text-muted">· {KIND_LABEL[d.kind]} · rev {d.revision}{d.due ? ` · due ${d.due}` : ""}{d.designer ? ` · ${d.designer}` : ""}</span>
                  {showProject && <> · <Link className="text-xs text-gold hover:underline" href={`/m/crm/${d.lead_id}`}>{d.lead}</Link></>}</span>
                <span className={`rounded-full border border-line px-2 py-0.5 text-[11px] ${TONE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
              </div>
              {d.note && <p className="mt-1 text-xs text-muted">{d.note}</p>}
              {d.review_note && d.status !== "approved" && <p className="mt-1 text-xs text-danger">Review: {d.review_note}</p>}
              {d.status === "approved" && <p className="mt-1 text-xs text-success">Approved by {d.approved_by}</p>}
              <Files files={d.files} />
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {d.can_edit && (d.status === "draft" || d.status === "changes_requested") && (
                  <>
                    <button disabled={pending} onClick={() => { setTarget(d.id); setTimeout(() => fileRef.current?.click(), 0); }} className="rounded border border-gold/50 px-2 py-0.5 text-[11px] text-gold hover:bg-tint disabled:opacity-50">+ file (rev {d.revision})</button>
                    <button disabled={pending} onClick={() => run(() => designAction_(d.id, "submit", ""))} className="rounded bg-primary px-2 py-0.5 text-[11px] text-white disabled:opacity-50">Send for review</button>
                  </>
                )}
                {d.can_review && d.status === "in_review" && (
                  <>
                    <input aria-label="Review note" value={note[d.id] ?? ""} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} placeholder="Note (required to request changes)" className="h-7 min-w-0 flex-1 rounded border border-line px-2 text-xs" />
                    <button disabled={pending} onClick={() => run(() => designAction_(d.id, "approve", note[d.id] ?? ""))} className="rounded bg-success/80 px-2 py-0.5 text-[11px] text-white disabled:opacity-50">Approve</button>
                    <button disabled={pending} onClick={() => run(() => designAction_(d.id, "request_changes", note[d.id] ?? ""))} className="rounded border border-danger/60 px-2 py-0.5 text-[11px] text-danger disabled:opacity-50">Request changes</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DesignAdd({ leadId, shopOnly }: { leadId: number; shopOnly?: boolean }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(shopOnly ? "shop_drawing" : "concept");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Design item name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Master bedroom concept" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
        <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm" />
        <input aria-label="Brief" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Brief (optional)" className="h-10 w-44 rounded-md border border-line px-3 text-sm" />
        <button disabled={pending || !name.trim()} onClick={() => start(async () => { const r = await addDesignAction(leadId, name, kind, due, note); setErr(r.error); if (!r.error) { setName(""); setDue(""); setNote(""); } })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">Add</button>
      </div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
