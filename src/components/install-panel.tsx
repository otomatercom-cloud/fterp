"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInstallAction, setInstallStatusAction } from "@/app/(dashboard)/m/projects/actions";
import type { Install } from "@/lib/odoo/leads";

const STATUS = { planned: "Planned", in_progress: "In progress", done: "Done" } as const;

export function Photos({ photos }: { photos: Install["photos"] }) {
  if (!photos.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((p) => (
        <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${p.id}`} alt={`${p.label} photo`} className="size-16 rounded-md border border-line object-cover" />
          <span className="block text-center text-[10px] text-muted">{p.label}</span>
        </a>
      ))}
    </div>
  );
}

export function InstallPanel({ leadId, items, canEdit }: { leadId: number; items: Install[]; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"site_visit" | "installation">("installation");
  const [date, setDate] = useState("");
  const [team, setTeam] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<{ id: number; label: "before" | "after" } | null>(null);
  const run = (f: () => Promise<{ error?: string }>) => start(async () => setErr((await f()).error));
  const upload = (file: File) => start(async () => {
    if (!target) return;
    const fd = new FormData(); fd.set("file", file); fd.set("label", target.label);
    const r = await fetch(`/api/installs/${target.id}/photo`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setErr(r.ok ? undefined : j.error ?? "Upload failed");
    if (r.ok) router.refresh();
    if (fileRef.current) fileRef.current.value = "";
  });
  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Visit or installation name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen cabinet installation" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
          <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 rounded-md border border-line px-2 text-sm"><option value="installation">Installation</option><option value="site_visit">Site visit</option></select>
          <input aria-label="Planned date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm" />
          <input aria-label="Crew" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Crew / visitors" className="h-10 w-40 rounded-md border border-line px-3 text-sm" />
          <button disabled={pending || !name.trim()} onClick={() => run(async () => { const r = await addInstallAction(leadId, name, kind, date, team); if (!r.error) { setName(""); setDate(""); setTeam(""); } return r; })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">Add</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Photo file" />
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      {items.length === 0 ? <p className="text-sm text-muted">No site visits or installations planned yet.</p> : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{i.name}</b> <span className="text-xs text-muted">· {i.kind === "site_visit" ? "Site visit" : "Installation"}{i.date ? ` · ${i.date}` : ""}{i.team ? ` · ${i.team}` : ""}</span></span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{STATUS[i.status]}</span>
              </div>
              <Photos photos={i.photos} />
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(Object.keys(STATUS) as (keyof typeof STATUS)[]).filter((k) => k !== i.status).map((k) => <button key={k} disabled={pending} onClick={() => run(() => setInstallStatusAction(i.id, k))} className="rounded border border-line px-2 py-0.5 text-[11px] hover:bg-tint disabled:opacity-50">→ {STATUS[k]}</button>)}
                  {(["before", "after"] as const).map((l) => <button key={l} disabled={pending} onClick={() => { setTarget({ id: i.id, label: l }); setTimeout(() => fileRef.current?.click(), 0); }} className="rounded border border-gold/50 px-2 py-0.5 text-[11px] text-gold hover:bg-tint disabled:opacity-50">+ {l} photo</button>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
