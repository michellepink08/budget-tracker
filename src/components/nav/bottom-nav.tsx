"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowLeftRight, Receipt, Wallet, MoreHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { SignOutButton } from "@/components/nav/sign-out-button";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

const leftTabs = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
];

const rightTabs = [
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: Wallet },
];

const moreLinks = [
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function BottomNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t bg-[var(--nav-background)] py-2 md:hidden">
        {leftTabs.map((tab) => (
          <BottomNavLink key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
        <AddTransactionButton accounts={accounts} categories={categories} variant="tab" />
        {rightTabs.map((tab) => (
          <BottomNavLink key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 text-xs text-[var(--nav-foreground)]/70"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {moreLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                className="rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t pt-2">
              <SignOutButton />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BottomNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "flex flex-col items-center gap-0.5 text-xs text-[var(--primary)]"
          : "flex flex-col items-center gap-0.5 text-xs text-[var(--nav-foreground)]/70"
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
