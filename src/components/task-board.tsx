"use client";
import { useState, useTransition } from "react";
import { addTaskAction, setTaskStatusAction } from "@/app/(dashboard)/m/projects/actions";
import type { Task } from "@/lib/odoo/leads";

const COLS: { key: Task["status"]; label: string }[] = [{ key: "todo", label: "To do" }, { key: "doing", label: "In progress" }, { key: "done", label: "Done" }];

export function TaskBoard({ leadId, tasks, canEdit }: { leadId: number; tasks: Task[]; canEdit: boolean }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"task" | "snag">("task");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ error?: string }>) => start(async () => setErr((await f()).error));
  const openSnags = tasks.filter((t) => t.kind === "snag" && t.status !== "done").length;
  return (
    <div className="space-y-3">
      {openSnags > 0 && <p className="text-xs text-warning">{openSnags} open snag(s) — all snags must be closed before handover.</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Task name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New task or snag" className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm" />
          <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as "task" | "snag")} className="h-10 rounded-md border border-line px-2 text-sm"><option value="task">Task</option><option value="snag">Snag</option></select>
          <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm" />
          <button disabled={pending || !name.trim()} onClick={() => run(async () => { const r = await addTaskAction(leadId, name, kind, due); if (!r.error) { setName(""); setDue(""); } return r; })} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">Add</button>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {COLS.map((c) => (
          <div key={c.key} className="rounded-lg border border-line bg-tint p-2">
            <p className="mb-2 px-1 text-xs font-medium text-muted">{c.label} · {tasks.filter((t) => t.status === c.key).length}</p>
            <ul className="space-y-2">
              {tasks.filter((t) => t.status === c.key).map((t) => (
                <li key={t.id} className="rounded-md border border-line bg-card p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span>{t.name}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${t.kind === "snag" ? "bg-danger/20 text-danger" : "bg-white/10 text-muted"}`}>{t.kind}</span>
                  </div>
                  {t.due && <p className="text-[11px] text-muted">Due {t.due}</p>}
                  {canEdit && (
                    <div className="mt-1 flex gap-1">
                      {COLS.filter((x) => x.key !== c.key).map((x) => (
                        <button key={x.key} disabled={pending} onClick={() => run(() => setTaskStatusAction(leadId, t.id, x.key))} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:bg-tint disabled:opacity-50">→ {x.label}</button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
