"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { APP_NAME } from "@/lib/config";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/bills", label: "Bills" },
  { href: "/accounts", label: "Accounts" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function SideNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-[var(--nav-background)] text-[var(--nav-foreground)] md:flex">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4 font-semibold">
        <Wallet className="h-5 w-5" />
        {APP_NAME}
      </div>
      <button
        type="button"
        onClick={() => setQuickCaptureOpen(true)}
        className="mx-2 mt-2 rounded-md border border-white/15 px-3 py-2 text-left text-sm text-[var(--nav-foreground)]/70 hover:bg-white/10"
      >
        Quick Capture <span className="float-right text-xs opacity-60">⌘K</span>
      </button>
      <nav className="flex flex-1 flex-col gap-1 p-2 text-sm">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                isActive
                  ? "rounded-md bg-white/15 px-3 py-2 font-medium"
                  : "rounded-md px-3 py-2 text-[var(--nav-foreground)]/80 hover:bg-white/10"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-2 border-t border-white/10 p-3">
        <AddTransactionButton accounts={accounts} categories={categories} />
        <SignOutButton />
      </div>
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </aside>
  );
}
