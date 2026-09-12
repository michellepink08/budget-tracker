"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { navLinks, isNavLinkActive } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

const COLLAPSE_STORAGE_KEY = "sidebarCollapsed";

export function SideNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Read the stored preference once, after mount — reading localStorage
  // during the initial render would disagree between server and client
  // and trigger a hydration mismatch.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true");
    } catch {
      // localStorage can throw (private browsing, blocked site data) —
      // fall back to the expanded default, already set above.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // Best-effort only — a failed write just means the preference
        // won't persist to the next visit, not a broken toggle now.
      }
      return next;
    });
  }

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
    <aside
      className={
        (collapsed ? "w-16" : "w-56") +
        " hidden shrink-0 flex-col bg-[var(--nav-background)] text-[var(--nav-foreground)] transition-[width] md:flex"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4 font-semibold">
        <div className="flex items-center gap-2 overflow-hidden">
          <Wallet className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">{APP_NAME}</span>}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 rounded-md p-1 text-[var(--nav-foreground)]/70 hover:bg-white/10"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setQuickCaptureOpen(true)}
        title="Quick Capture (⌘K)"
        className="mx-2 mt-2 rounded-md border border-white/15 px-3 py-2 text-left text-sm text-[var(--nav-foreground)]/70 hover:bg-white/10"
      >
        {collapsed ? (
          "⌘K"
        ) : (
          <>
            Quick Capture <span className="float-right text-xs opacity-60">⌘K</span>
          </>
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-1 p-2 text-sm">
        {navLinks.map((link) => {
          const isActive = isNavLinkActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={
                (isActive ? "bg-white/15 font-medium" : "text-[var(--nav-foreground)]/80 hover:bg-white/10") +
                " flex items-center gap-2 rounded-md px-3 py-2"
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{link.label}</span>}
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
