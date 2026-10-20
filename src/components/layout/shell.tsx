"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Menu, PanelLeftClose, PanelLeftOpen, LogOut, X, Bell, Search, CheckSquare, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction, switchCompanyAction } from "@/app/login/actions";

type Item = { slug: string; label: string; icon: string };
type Props = { items: Item[]; userName: string; companies: { id: number; name: string }[]; companyId: number; children: React.ReactNode };

// Original logo file, unmodified. Its background matches the sidebar maroon.
function Logo({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <div className="mx-auto my-3 size-11 overflow-hidden rounded-lg bg-brand" aria-label="FT Interior Design & Architecture">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ft-logo.jpg" alt="FT Interior Design & Architecture" className="max-w-none" style={{ width: 130, marginLeft: -42, marginTop: -21 }} />
    </div>
  ) : (
    <div className="mx-3 mt-3 overflow-hidden rounded-xl bg-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ft-logo.jpg" alt="FT Interior Design & Architecture" className="mx-auto w-44" />
    </div>
  );
}

function NavList({ items, collapsed, onNavigate }: { items: Item[]; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
      {items.map((i) => {
        const href = i.slug === "dashboard" ? "/" : `/m/${i.slug}`;
        const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[i.icon] ?? Icons.Circle;
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={i.slug} href={href} onClick={onNavigate} title={i.label}
            className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors", active ? "bg-white/15 font-medium text-white shadow-[inset_3px_0_0_var(--color-gold)]" : "text-white/80 hover:bg-white/10 hover:text-white")}>
            <Icon className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{i.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ items, userName, companies, companyId, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className={cn("sticky top-0 hidden h-dvh flex-col border-r border-line bg-sidebar backdrop-blur-xl transition-[width] md:flex", collapsed ? "w-16" : "w-64")}>
        <Logo collapsed={collapsed} />
        <NavList items={items} collapsed={collapsed} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar">
            <div className="relative">
              <Logo collapsed={false} />
              <button aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute right-2 top-2 grid size-10 place-items-center text-white"><X className="size-5" /></button>
            </div>
            <NavList items={items} collapsed={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-sidebar px-3 backdrop-blur-xl">
          <button aria-label="Open menu" className="grid size-10 place-items-center md:hidden" onClick={() => setDrawer(true)}><Menu className="size-5" /></button>
          <button aria-label="Toggle sidebar" className="hidden size-10 place-items-center md:grid" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
          {companies.length > 1 ? (
            <form action={switchCompanyAction}>
              <select name="companyId" defaultValue={companyId} aria-label="Company" onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-9 max-w-40 rounded-md border border-line bg-card px-2 text-sm">
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </form>
          ) : (
            <span className="truncate text-sm text-muted">{companies[0]?.name}</span>
          )}
          <div className="relative ml-2 hidden max-w-md flex-1 sm:block">
            <Search className="absolute left-3 top-2.5 size-4 text-muted" />
            <input aria-label="Global search (not yet implemented)" disabled placeholder="Search — coming soon" className="h-9 w-full rounded-md border border-line bg-bg pl-9 text-sm" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button aria-label="Notifications (not yet implemented)" disabled className="grid size-10 place-items-center text-muted"><Bell className="size-5" /></button>
            <button aria-label="Pending approvals (not yet implemented)" disabled className="hidden size-10 place-items-center text-muted sm:grid"><CheckSquare className="size-5" /></button>
            <button aria-label="Help (not yet implemented)" disabled className="hidden size-10 place-items-center text-muted sm:grid"><HelpCircle className="size-5" /></button>
            <span className="hidden max-w-32 truncate px-2 text-sm md:block">{userName}</span>
            <form action={logoutAction}><button aria-label="Log out" className="grid size-10 place-items-center text-muted hover:text-danger"><LogOut className="size-5" /></button></form>
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
