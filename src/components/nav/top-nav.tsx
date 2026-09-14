"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { NavDrawer } from "@/components/nav/nav-drawer";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { signOutAction } from "@/actions/auth.actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  const initial = email?.[0]?.toUpperCase() ?? "?";

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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQuickCaptureOpen(true)}
            aria-label="Quick Capture"
            className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
          >
            <span className="text-sm">⌘K</span>
          </button>
          {/* Sign Out must never become unreachable when the drawer is
              closed (plan-38 §8) — a small profile menu replaces the old
              always-visible icon button, still reachable in one tap. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
                />
              }
            >
              {initial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {email && <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>}
              <DropdownMenuItem onClick={() => signOutAction()}>
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} accounts={accounts} categories={categories} />
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </header>
  );
}
