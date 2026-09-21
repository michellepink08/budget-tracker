"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { NavDrawer } from "@/components/nav/nav-drawer";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { navLinks } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TopNav({
  accounts,
  categories,
  email,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  email: string | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  const currentTitle =
    navLinks.find((link) => pathname === link.href || pathname?.startsWith(`${link.href}/`))?.label ?? APP_NAME;

  return (
    <header className="border-b bg-card text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-7">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="rounded-md border p-2 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold">{currentTitle}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQuickCaptureOpen(true)}
            aria-label="Quick Capture"
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <Search className="size-4"/><span>Quick Capture</span><span className="hidden text-xs text-muted-foreground sm:inline">Type or speak</span>
          </button>
          <AddTransactionButton accounts={accounts} categories={categories}/>
        </div>
      </div>
      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} accounts={accounts} categories={categories} />
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </header>
  );
}
