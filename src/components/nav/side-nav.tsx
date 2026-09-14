"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { mainLinks, planLinks, isNavLinkActive, type NavLink } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

const COLLAPSE_STORAGE_KEY = "sidebarCollapsed";

// useSyncExternalStore reads localStorage in a hydration-safe way — the
// server snapshot is always "not collapsed" (matching what the server
// actually rendered), and the real client value is read on the client's
// first paint without ever calling setState from inside an effect.
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

export function SideNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeToStorage, getCollapsedSnapshot, getCollapsedServerSnapshot);

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(!collapsed));
    } catch {
      // Best-effort only — a failed write just means the preference
      // won't persist to the next visit, not a broken toggle now.
    }
    // The "storage" event only fires in *other* tabs — dispatch one
    // manually so this tab's own useSyncExternalStore re-reads too.
    window.dispatchEvent(new Event("storage"));
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

  function renderLink(link: NavLink) {
    const isActive = isNavLinkActive(pathname, link.href);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        className={
          (isActive
            ? // Wine theme v3 active item: cream-to-blush gradient, deep-wine
              // text/icon (inherited via currentColor) — same in both app
              // themes, since the sidebar's own wine backdrop no longer
              // changes between them either (see the gradient below).
              "bg-[linear-gradient(135deg,#FFF7FA,#F3C9D9)] font-medium text-[#4D102D] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_10px_rgba(0,0,0,0.15)]"
            : "text-[var(--nav-foreground)]/80 hover:bg-white/10") +
          " group relative flex items-center gap-2 rounded-lg px-3 py-2" +
          " transition-[transform,box-shadow,background-color] duration-150 ease-out" +
          " hover:translate-x-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.18)]" +
          " focus-visible:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60" +
          " motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:focus-visible:translate-x-0"
        }
      >
        <Icon
          className={
            "h-4 w-4 shrink-0 transition-transform duration-150 ease-out" +
            " group-hover:-translate-y-0.5 group-hover:scale-110 group-focus-visible:-translate-y-0.5 group-focus-visible:scale-110" +
            " motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100"
          }
        />
        {!collapsed && <span className="truncate">{link.label}</span>}
        {/* Collapsed-state pop-out name: a custom tooltip (not the
            native `title` attribute, which never appears on keyboard
            focus) so the page name is reachable by mouse and by
            keyboard alike, and is never clipped by the narrow rail
            (plan-38 §7). */}
        {collapsed && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.2)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            {link.label}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className={
        (collapsed ? "w-[70px]" : "w-[216px]") +
        " relative isolate hidden shrink-0 flex-col overflow-hidden bg-[linear-gradient(160deg,#741E45_0%,#52112F_50%,#2D0D20_100%)] text-[var(--nav-foreground)] shadow-[4px_0_24px_rgba(0,0,0,0.18)] transition-[width] md:flex"
      }
    >
      {/* Purely decorative — a rose glow near the upper-left corner and a
          soft diagonal highlight, both behind every real child via -z-10
          inside this aside's own `isolate` stacking context. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -left-12 -z-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(244,219,228,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,transparent_45%)]"
      />

      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4 font-semibold">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#FFF7FA,#F4DBE4)] text-[#4D102D] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_6px_rgba(0,0,0,0.15)]">
            <Wallet className="h-4 w-4" />
          </span>
          {!collapsed && <span className="truncate">{APP_NAME}</span>}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 rounded-md p-1 text-[var(--nav-foreground)]/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setQuickCaptureOpen(true)}
        className={
          (collapsed ? "justify-center" : "justify-between") +
          " group relative mx-2 mt-2 flex items-center gap-2 rounded-lg border border-[#F4DBE4]/25 bg-white/[0.06] px-3 py-2 text-left text-sm text-[var(--nav-foreground)]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-150 hover:border-[#F4DBE4]/40 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
        }
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && "Quick Capture"}
        </span>
        {!collapsed && <span className="text-xs opacity-60">⌘K</span>}
        {collapsed && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.2)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            Quick Capture (⌘K)
          </span>
        )}
      </button>

      {/* An elegant divider between the quick actions above and the page
          links below, rather than everything running together. */}
      <div className="mx-4 mt-3 border-t border-white/10" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 text-2xs">
        {mainLinks.map(renderLink)}
        {!collapsed && (
          <p className="mt-3 mb-1 px-3 text-[11px] font-semibold tracking-wide text-[var(--nav-foreground)]/50">
            PLAN &amp; REVIEW
          </p>
        )}
        {collapsed && <div className="mx-3 my-2 border-t border-white/10" />}
        {planLinks.map(renderLink)}
      </nav>

      <div
        className={
          (collapsed ? "items-center" : "items-stretch") +
          " flex flex-col gap-2 border-t border-white/10 p-3"
        }
      >
        <AddTransactionButton accounts={accounts} categories={categories} collapsed={collapsed} />
        <SignOutButton collapsed={collapsed} />
      </div>
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </aside>
  );
}
