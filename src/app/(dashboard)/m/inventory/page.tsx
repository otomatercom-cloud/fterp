import { ImportExport } from "@/components/import-export";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { NAV, canSee } from "@/lib/permissions/nav";
import { getInvItems, type InvItem } from "@/lib/odoo/leads";
import { InventoryList } from "@/components/inventory-panels";

export default async function InventoryPage() {
  const s = await requireSession();
  const item = NAV.find((n) => n.slug === "inventory");
  if (!item || !canSee(item, s.groups)) notFound();
  let d: { can_edit: boolean; items: InvItem[] } | null = null;
  try { d = await getInvItems(s); } catch { /* shown below */ }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Inventory</h1><p className="text-sm text-muted">Item master, vendor price history for comparison, and stock on hand</p></div>
      {d?.can_edit !== undefined && <ImportExport entity="items" canImport={!!d?.can_edit} />}
      {d ? <InventoryList items={d.items} canEdit={d.can_edit} /> : <p className="glass p-4 text-sm">Inventory is not available. Check access and that the FT Pipeline module is upgraded.</p>}
    </div>
  );
}
