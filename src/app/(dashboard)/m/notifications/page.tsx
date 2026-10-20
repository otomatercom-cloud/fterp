import { requireSession } from "@/lib/auth/session";
import { getNotifications, getMsgLog, type MsgLog } from "@/lib/odoo/leads";
import { NotificationList } from "@/components/notification-list";

export default async function NotificationsPage() {
  const s = await requireSession();
  let data = { unread: 0, items: [] as Awaited<ReturnType<typeof getNotifications>>["items"] };
  try { data = await getNotifications(s); } catch { /* module missing */ }
  let log: MsgLog[] = [];
  try { log = await getMsgLog(s); } catch { /* not a manager */ }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <NotificationList items={data.items} unread={data.unread} />
      {log.length > 0 && (
        <div className="glass space-y-2 p-5">
          <h2 className="font-semibold">Outbound messages (WhatsApp / email)</h2>
          <ul className="space-y-1 text-xs">
            {log.map((m) => (
              <li key={m.id} className="rounded border border-line p-2">
                <span className={m.status === "sent" ? "text-success" : m.status === "failed" ? "text-danger" : "text-muted"}>{m.status}</span> · {m.channel} · {m.to} · {m.date}
                <p className="text-muted">{m.text}{m.error ? ` — ${m.error}` : ""}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
