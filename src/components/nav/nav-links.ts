import {
  Home,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  CalendarRange,
  ShoppingCart,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { href: string; label: string; icon: LucideIcon };

// Single source of truth for the main nav items — SideNav (desktop) and
// NavDrawer (mobile/tablet) both render from this exact list, so they
// can never drift apart into two different sets of links.
export const navLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/year-plan", label: "Year Plan", icon: CalendarRange },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
