"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavDrawer } from "@/components/nav/nav-drawer";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { navLinks } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TopNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  const currentTitle =
    navLinks.find((link) => pathname === link.href || pathname?.startsWith(`${link.href}/`))?.label ?? APP_NAME;

  return (
    <header className="border-b bg-[var(--nav-background)] text-[var(--nav-foreground)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold">{currentTitle}</span>
        <button
          type="button"
          onClick={() => setQuickCaptureOpen(true)}
          aria-label="Quick Capture"
          className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
        >
          <span className="text-sm">⌘K</span>
        </button>
      </div>
      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} accounts={accounts} categories={categories} />
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </header>
  );
}
