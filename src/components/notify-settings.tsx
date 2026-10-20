"use client";
import { useState, useTransition } from "react";
import { saveNotifyAction, testNotifyAction } from "@/app/(dashboard)/m/admin/actions";
import type { NotifySettings } from "@/lib/odoo/leads";

export function NotifySettingsPanel({ cfg }: { cfg: NotifySettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [phone, setPhone] = useState("");
  const submit = (fd: FormData) => start(async () => setMsg(await saveNotifyAction(fd)));
  const inp = "h-9 w-full rounded border border-line bg-transparent px-2 text-sm";
  return (
    <form action={submit} className="glass space-y-3 p-5">
      <h2 className="font-semibold">Notifications</h2>
      <p className="text-xs text-muted">In-app notifications are always on. Email and WhatsApp are optional. WhatsApp uses any gateway that accepts a JSON POST {"{to, message}"} with a Bearer token.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={cfg.email} /> Also send staff notifications by email</label>
      <label className="block text-sm">WhatsApp gateway URL<input name="wa_url" defaultValue={cfg.wa_url} placeholder="https://..." className={inp} /></label>
      <label className="block text-sm">Gateway token {cfg.has_token && <span className="text-xs text-success">(saved — leave blank to keep)</span>}<input name="wa_token" type="password" autoComplete="off" className={inp} /></label>
      <label className="block text-sm">Meta lead secret (min 16 chars) {cfg.has_meta_secret && <span className="text-xs text-success">(saved — leave blank to keep)</span>}<input name="meta" type="password" autoComplete="off" className={inp} /></label>
      <p className="text-xs text-muted">Meta/n8n: POST JSON {"{name, phone, email, message, campaign}"} to <code>/otm_ft/meta_lead</code> on the Odoo host with header <code>X-FT-Secret</code>.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className="h-9 rounded bg-primary px-3 text-sm text-white disabled:opacity-50">Save</button>
        <input aria-label="Test phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Test phone e.g. 9715..." className="h-9 w-44 rounded border border-line bg-transparent px-2 text-sm" />
        <button type="button" disabled={pending || !phone} onClick={() => start(async () => setMsg(await testNotifyAction(phone)))} className="h-9 rounded border border-line px-3 text-sm disabled:opacity-50">Send test</button>
      </div>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-success">{msg.ok}</p>}
    </form>
  );
}
