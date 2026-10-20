"use client";
import Link from "next/link";
import { useState } from "react";
import { CAL_KIND as KIND } from "@/lib/workflow/labels";
import type { CalEvent } from "@/lib/odoo/leads";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");

export function DashCalendar({ month, events, today }: { month: string; events: CalEvent[]; today: string }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const total = Math.ceil((offset + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - offset + i)));
  const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const [sel, setSel] = useState(today.slice(0, 7) === month ? today : `${month}-01`);
  const prev = new Date(Date.UTC(y, m - 2, 1)), next = new Date(Date.UTC(y, m, 1));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const list = byDay.get(sel) ?? [];
  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Calendar <span className="text-sm font-normal text-muted">· {first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span></h2>
        <div className="flex gap-1 text-sm">
          <Link href={`/?cm=${ym(prev)}`} aria-label="Previous month" className="rounded border border-line px-2 py-0.5">‹</Link>
          <Link href="/" className="rounded border border-line px-2 py-0.5 text-xs leading-6">Today</Link>
          <Link href={`/?cm=${ym(next)}`} aria-label="Next month" className="rounded border border-line px-2 py-0.5">›</Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const k = key(d), inMonth = d.getUTCMonth() === m - 1, evs = byDay.get(k) ?? [];
          return (
            <button key={k} onClick={() => setSel(k)} aria-label={`${k}: ${evs.length} items`} aria-pressed={sel === k}
              className={`flex h-14 flex-col items-center rounded-md border p-1 text-xs ${sel === k ? "border-gold bg-tint" : "border-line"} ${inMonth ? "" : "opacity-40"} ${k === today ? "ring-1 ring-gold" : ""}`}>
              <span className={k === today ? "font-bold text-gold" : ""}>{d.getUTCDate()}</span>
              <span className="mt-auto flex flex-wrap justify-center gap-0.5">{evs.slice(0, 4).map((e, i) => <i key={i} className={`size-1.5 rounded-full ${KIND[e.kind].dot}`} />)}{evs.length > 4 && <span className="text-[9px]">+{evs.length - 4}</span>}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">{(Object.keys(KIND) as CalEvent["kind"][]).map((k) => <span key={k}><i className={`mr-1 inline-block size-2 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</span>)}</div>
      <h3 className="mt-3 text-sm font-semibold">{sel}</h3>
      {list.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
        <ul className="mt-1 space-y-1 text-sm">{list.map((e, i) => <li key={i}><Link href={e.link} className="flex items-start gap-2 rounded border border-line p-2 hover:bg-tint"><i className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND[e.kind].dot}`} /><span><b>{e.title}</b><br /><span className="text-xs text-muted">{e.project}</span></span></Link></li>)}</ul>
      )}
    </div>
  );
}
