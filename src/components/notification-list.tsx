"use client";
import Link from "next/link";
import { useTransition } from "react";
import { markReadAction } from "@/app/(dashboard)/m/notifications/actions";
import type { Notif } from "@/lib/odoo/leads";

const DOT = { task: "bg-gold", alert: "bg-danger", info: "bg-muted" } as const;

export function NotificationList({ items, unread }: { items: Notif[]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass space-y-2 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{unread} unread</span>
        {unread > 0 && <button disabled={pending} onClick={() => start(async () => { await markReadAction(0); })} className="text-xs text-gold underline disabled:opacity-50">Mark all read</button>}
      </div>
      {items.length === 0 && <p className="text-sm text-muted">No notifications yet.</p>}
      <ul className="space-y-1">
        {items.map((n) => (
          <li key={n.id} className={`flex items-start gap-2 rounded border border-line p-2 text-sm ${n.read ? "opacity-60" : ""}`}>
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[n.kind]}`} />
            <div className="min-w-0 flex-1">
              {n.link ? <Link href={n.link} onClick={() => { if (!n.read) void markReadAction(n.id); }} className="font-medium hover:underline">{n.title}</Link> : <b>{n.title}</b>}
              {n.body && <p className="text-xs text-muted">{n.body}</p>}
              <p className="text-[10px] text-muted">{n.date} UTC</p>
            </div>
            {!n.read && <button disabled={pending} onClick={() => start(async () => { await markReadAction(n.id); })} className="text-[11px] text-muted underline">Read</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
