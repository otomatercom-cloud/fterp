export type NavItem = { slug: string; label: string; icon: string; groups?: string[] };

// `groups` = any-of Odoo group xmlids. Empty = every internal user.
// Custom role groups (otm_*) will be added when the Odoo addon exists; base.group_system always passes.
export const NAV: NavItem[] = [
  { slug: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { slug: "tasks", label: "My Tasks", icon: "ListChecks" },
  { slug: "crm", label: "CRM & Sales", icon: "Users", groups: ["sales_team.group_sale_salesman", "sales_team.group_sale_manager", "otm_ft_pipeline.group_ft_sales_manager", "otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_project_manager", "otm_ft_pipeline.group_ft_procurement", "otm_ft_pipeline.group_ft_accounts"] },
  { slug: "design", label: "Design Studio", icon: "PenTool" },
  { slug: "boq", label: "Estimation & BOQ", icon: "Calculator" },
  { slug: "projects", label: "Projects", icon: "FolderKanban", groups: ["otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_project_manager", "otm_ft_pipeline.group_ft_sales_manager", "otm_ft_pipeline.group_ft_accounts", "otm_ft_pipeline.group_ft_procurement"] },
  { slug: "shop-drawings", label: "Shop Drawings", icon: "Ruler" },
  { slug: "joinery", label: "Joinery Workshop", icon: "Hammer", groups: ["otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_project_manager", "otm_ft_pipeline.group_ft_procurement"] },
  { slug: "procurement", label: "Procurement", icon: "ShoppingCart", groups: ["purchase.group_purchase_user", "purchase.group_purchase_manager"] },
  { slug: "installation", label: "Installation", icon: "HardHat" },
  { slug: "finance", label: "Finance & Accounts", icon: "Landmark", groups: ["account.group_account_invoice", "account.group_account_manager"] },
  { slug: "petty-cash", label: "Petty Cash", icon: "Wallet" },
  { slug: "hr", label: "HR & Payroll", icon: "UserCog", groups: ["hr.group_hr_user", "hr.group_hr_manager"] },
  { slug: "manufacturing", label: "Manufacturing", icon: "Factory", groups: ["mrp.group_mrp_user", "mrp.group_mrp_manager"] },
  { slug: "intercompany", label: "Intercompany Orders", icon: "ArrowLeftRight", groups: ["purchase.group_purchase_manager", "sales_team.group_sale_manager"] },
  { slug: "portal", label: "My Projects", icon: "Globe", groups: ["base.group_portal"] },
  { slug: "process-flow", label: "Process Flow", icon: "Workflow" },
  { slug: "reports", label: "Reports", icon: "BarChart3", groups: ["otm_ft_pipeline.group_ft_manager", "otm_ft_pipeline.group_ft_sales_manager", "otm_ft_pipeline.group_ft_accounts"] },
  { slug: "admin", label: "Settings", icon: "Settings" },
];

export function canSee(item: NavItem, userGroups: string[]): boolean {
  if (userGroups.includes("base.group_system")) return true;
  if (item.slug === "admin") return false;
  if (!item.groups || item.groups.length === 0) return userGroups.includes("base.group_user");
  return item.groups.some((g) => userGroups.includes(g));
}
