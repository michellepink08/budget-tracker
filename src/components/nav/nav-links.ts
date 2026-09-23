import {
  Home,
  ArrowLeftRight,
  PiggyBank,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  CalendarRange,
  ShoppingCart,
  CalendarDays,
  History,
  Table,
  HandCoins,
  Landmark,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { href: string; label: string; icon: LucideIcon };

// Single source of truth for the main nav items — SideNav (desktop) and
// NavDrawer (mobile/tablet) both render from these exact lists, so they
// can never drift apart into two different sets of links. Split into two
// groups (main vs. "PLAN & REVIEW") purely for the sidebar's visual
// grouping (wine theme v3) — routes, isNavLinkActive, and every existing
// link are otherwise unchanged. Audit History isn't in the user's own
// 11-item nav structure spec, but removing it would violate their own
// "do not remove existing routes" rule — placed under PLAN & REVIEW,
// after Reports, as the closest fit (also a review/history destination).
export const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budget", label: "Plan", icon: PiggyBank },
  { href: "/loans-cards", label: "Trackers", icon: BarChart3 },
  { href: "/shopping", label: "Grocery", icon: ShoppingCart },
];

export const planLinks: NavLink[] = [
  { href: "/accounts", label: "Manage accounts", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/ledger", label: "Ledger", icon: Table },
  { href: "/audit-log", label: "Audit History", icon: History },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];
export const settingsLink:NavLink={href:"/settings",label:"Settings",icon:Settings};
export const planningLinks:NavLink[]=[{href:"/budget",label:"Monthly Plan",icon:PiggyBank},{href:"/year-plan",label:"Yearly Plan",icon:CalendarRange},{href:"/calendar",label:"Calendar",icon:CalendarDays}];
export const trackerLinks:NavLink[]=[{href:"/loans-cards",label:"Loans & Cards",icon:CreditCard},{href:"/accounts?section=savings",label:"Savings",icon:Wallet},{href:"/tierra-alta",label:"Tierra Alta",icon:Landmark},{href:"/lending",label:"Lending & Repayments",icon:HandCoins}];

// Kept for consumers that just need "every nav link" without the
// grouping (TopNav's current-page-title lookup).
export const navLinks: NavLink[] = [...mainLinks, ...planLinks,...planningLinks,...trackerLinks,settingsLink];

export function isNavLinkActive(pathname: string | null, href: string): boolean {
  if(href==="/budget"&&["/calendar","/year-plan"].includes(pathname??""))return true;
  if(href==="/loans-cards"&&["/lending","/tierra-alta","/accounts"].includes(pathname??""))return true;
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
