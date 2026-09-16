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
  { href: "/budget", label: "Monthly Plan", icon: PiggyBank },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
];

export const planLinks: NavLink[] = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/year-plan", label: "Year Plan", icon: CalendarRange },
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
  { href: "/lending", label: "Lending", icon: HandCoins },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/ledger", label: "Ledger", icon: Table },
  { href: "/audit-log", label: "Audit History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Kept for consumers that just need "every nav link" without the
// grouping (TopNav's current-page-title lookup).
export const navLinks: NavLink[] = [...mainLinks, ...planLinks];

export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
