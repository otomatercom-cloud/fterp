import Link from "next/link";
import type { QueueItem } from "@/lib/odoo/leads";

export function WorkQueue({ title, hint, items }: { title: string; hint?: string; items: QueueItem[] }) {
  if (!items.length) return null;
  return (
    <section className="glass p-5">
      <h2 className="mb-1 font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <ul className="space-y-1 text-sm">
        {items.map((q) => (
          <li key={q.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-line p-2">
            <Link href={`/m/crm/${q.id}`} className="font-medium hover:underline">{q.name}{q.customer ? <span className="font-normal text-muted"> · {q.customer}</span> : null}</Link>
            <span className="text-xs text-muted">{q.stage}{q.note ? ` · ${q.note}` : ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
