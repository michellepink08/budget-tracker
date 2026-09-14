# Wine Theme v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate card interactivity, redesign the left navigation's visual identity (gradient, sections, active state, Quick Capture, branding), and add a small mobile profile menu — all visual/structural-grouping only, zero route/calculation/database/functionality changes.

**Architecture:** Every color token already exists in `globals.css` (Stage C) — this plan only touches component styling (`card.tsx`, `icon-badge.tsx`), the nav data source (`nav-links.ts`), the two nav shells (`side-nav.tsx`, `nav-drawer.tsx`), one new UI primitive (`dropdown-menu.tsx`, mirroring the existing `dialog.tsx`/`select.tsx` pattern over `@base-ui/react`), and `top-nav.tsx` + its one call site.

**Tech Stack:** Tailwind v4 (arbitrary-value utilities for the new gradient/glow), `class-variance-authority` (Card's variants), `@base-ui/react/menu` (new dropdown), the project's existing Vitest/Playwright/tsc/eslint/build toolchain for verification (nothing here needs new tests — no logic changed).

**Spec:** `docs/superpowers/specs/2026-09-14-wine-theme-v3-design.md`

---

### Task 1: Card hover/focus system

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/icon-badge.tsx`

- [ ] **Step 1: Extend `cardVariants` with the richer interactive treatment and per-variant border glow**

In `src/components/ui/card.tsx`, change:

```tsx
const cardVariants = cva("rounded-lg border bg-card text-card-foreground", {
  variants: {
    variant: {
      default:
        "border-border shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      raised:
        "border-border shadow-[0_8px_24px_rgba(114,29,66,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      highlight: "border-primary/30 bg-panel-soft shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)]",
      flat: "border-border shadow-none",
      // Plan-38 §5/§6 semantic tones. "Purpose" tones color an account or
      // amount by what kind of money it is; "status" tones color a card by
      // what state it's in. Always paired with an icon + text label in the
      // component that uses them — never color alone (plan-38 §5).
      disposable: "border-disposable-accent/30 bg-disposable-surface text-foreground",
      savings: "border-savings-accent/30 bg-savings-surface text-foreground",
      restricted: "border-restricted-accent/30 bg-restricted-surface text-foreground",
      expense: "border-expense-accent/30 bg-expense-surface text-foreground",
      completed: "border-completed-accent/30 bg-completed-surface text-foreground",
      warning: "border-warning/30 bg-warning-background text-foreground",
      danger: "border-danger/30 bg-danger-background text-foreground",
      info: "border-info/30 bg-info-background text-foreground",
      success: "border-success/30 bg-success-background text-foreground",
    },
    interactive: {
      true: "cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(114,29,66,0.12)] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      false: "",
    },
  },
  defaultVariants: { variant: "default", interactive: false },
})
```

to:

```tsx
const cardVariants = cva("group rounded-lg border bg-card text-card-foreground", {
  variants: {
    variant: {
      default:
        "border-border shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      raised:
        "border-border shadow-[0_8px_24px_rgba(114,29,66,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      highlight: "border-primary/30 bg-panel-soft shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)]",
      flat: "border-border shadow-none",
      // Plan-38 §5/§6 semantic tones. "Purpose" tones color an account or
      // amount by what kind of money it is; "status" tones color a card by
      // what state it's in. Always paired with an icon + text label in the
      // component that uses them — never color alone (plan-38 §5).
      disposable: "border-disposable-accent/30 bg-disposable-surface text-foreground",
      savings: "border-savings-accent/30 bg-savings-surface text-foreground",
      restricted: "border-restricted-accent/30 bg-restricted-surface text-foreground",
      expense: "border-expense-accent/30 bg-expense-surface text-foreground",
      completed: "border-completed-accent/30 bg-completed-surface text-foreground",
      warning: "border-warning/30 bg-warning-background text-foreground",
      danger: "border-danger/30 bg-danger-background text-foreground",
      info: "border-info/30 bg-info-background text-foreground",
      success: "border-success/30 bg-success-background text-foreground",
    },
    interactive: {
      // Wine theme v3: 2-3px lift (vs. the old 1px), a subtle 1.01 scale,
      // a background brighten, and a per-variant border glow (added below
      // via compoundVariants, since the glow color must match whichever
      // semantic variant the card already has). 200ms sits in the spec's
      // 180-220ms range. motion-reduce keeps the glow/shadow/brighten and
      // the focus ring but drops all movement, matching the same pattern
      // already used in side-nav.tsx's nav links.
      true:
        "cursor-pointer transition-[transform,box-shadow,filter] duration-200 ease-out" +
        " hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_8px_24px_rgba(114,29,66,0.16)] hover:brightness-105" +
        " focus-visible:-translate-y-0.5 focus-visible:scale-[1.01] focus-visible:shadow-[0_8px_24px_rgba(114,29,66,0.16)] focus-visible:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" +
        " active:translate-y-0 active:scale-100 active:shadow-[0_2px_8px_rgba(114,29,66,0.1)] active:brightness-100" +
        " motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 motion-reduce:focus-visible:translate-y-0 motion-reduce:focus-visible:scale-100",
      false: "",
    },
  },
  compoundVariants: [
    { variant: "disposable", interactive: true, class: "hover:border-disposable-accent/70 focus-visible:border-disposable-accent/70" },
    { variant: "savings", interactive: true, class: "hover:border-savings-accent/70 focus-visible:border-savings-accent/70" },
    { variant: "restricted", interactive: true, class: "hover:border-restricted-accent/70 focus-visible:border-restricted-accent/70" },
    { variant: "expense", interactive: true, class: "hover:border-expense-accent/70 focus-visible:border-expense-accent/70" },
    { variant: "completed", interactive: true, class: "hover:border-completed-accent/70 focus-visible:border-completed-accent/70" },
    { variant: "warning", interactive: true, class: "hover:border-warning/70 focus-visible:border-warning/70" },
    { variant: "danger", interactive: true, class: "hover:border-danger/70 focus-visible:border-danger/70" },
    { variant: "info", interactive: true, class: "hover:border-info/70 focus-visible:border-info/70" },
    { variant: "success", interactive: true, class: "hover:border-success/70 focus-visible:border-success/70" },
    { variant: "default", interactive: true, class: "hover:border-primary/40 focus-visible:border-primary/40" },
    { variant: "raised", interactive: true, class: "hover:border-primary/40 focus-visible:border-primary/40" },
    { variant: "highlight", interactive: true, class: "hover:border-primary/50 focus-visible:border-primary/50" },
    { variant: "flat", interactive: true, class: "hover:border-primary/30 focus-visible:border-primary/30" },
  ],
  defaultVariants: { variant: "default", interactive: false },
})
```

- [ ] **Step 2: Give `IconBadge` a group-hover lift for when it sits inside an interactive card**

In `src/components/ui/icon-badge.tsx`, change:

```tsx
const iconBadgeVariants = cva("flex shrink-0 items-center justify-center rounded-full", {
```

to:

```tsx
const iconBadgeVariants = cva(
  // The translate/duration only ever fires when an IconBadge sits inside
  // an interactive Card (which renders as `group` — see card.tsx) and
  // that card is hovered/focused; outside a Card this is inert, since
  // group-hover/group-focus-visible require a `.group` ancestor to exist.
  "flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
  {
```

Then close the extra paren this opens — change the end of the file's `cva` call from:

```tsx
    size: {
      sm: "size-7 [&_svg]:size-3.5",
      md: "size-9 [&_svg]:size-4.5",
    },
  },
  defaultVariants: { tone: "wine", size: "md" },
})
```

to:

```tsx
    size: {
      sm: "size-7 [&_svg]:size-3.5",
      md: "size-9 [&_svg]:size-4.5",
    },
  },
  defaultVariants: { tone: "wine", size: "md" },
  }
)
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Visually spot-check one interactive card**

Use the Browser pane: open `/dashboard` (an interactive card variant already exists there — e.g. the restricted-funds cards), hover over one, and confirm a visible lift + border-glow + brighten. No automated test — this is a pure styling change with no logic to unit-test.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/icon-badge.tsx
git commit -m "style(theme): richer card hover/focus system with per-variant border glow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Restructure `nav-links.ts` into main + PLAN & REVIEW groups

**Files:**
- Modify: `src/components/nav/nav-links.ts`

Splits the one flat list into `mainLinks`/`planLinks` for the sidebar's visual grouping, per the user's confirmed structure — Audit History (a 12th route not in their 11-item list) goes into `planLinks` after Reports. `navLinks` (the full flat list) stays exported too, since `top-nav.tsx` only needs "all links" for its page-title lookup, not the grouping.

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `src/components/nav/nav-links.ts` with:

```ts
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
  History,
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
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
];

export const planLinks: NavLink[] = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/year-plan", label: "Year Plan", icon: CalendarRange },
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit-log", label: "Audit History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Kept for consumers that just need "every nav link" without the
// grouping (TopNav's current-page-title lookup).
export const navLinks: NavLink[] = [...mainLinks, ...planLinks];

export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `side-nav.tsx` and `nav-drawer.tsx` (they still import the now-removed usage pattern) — expected, fixed in Tasks 3-4

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/nav-links.ts
git commit -m "refactor(nav): split nav-links into mainLinks/planLinks groups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Redesign `SideNav`

**Files:**
- Modify: `src/components/nav/side-nav.tsx`

Every visual change from the spec's §11-§13 lands here: the 3-stop gradient, rose glow + diagonal highlight decoration, branding tile, Quick Capture panel restyle (+ icon when collapsed), the cream-to-blush active item, section grouping, and the 216px/70px widths.

- [ ] **Step 1: Replace the full file**

Replace the full contents of `src/components/nav/side-nav.tsx` with:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/nav/side-nav.tsx`
Expected: no new errors

- [ ] **Step 4: Visually inspect on desktop, expanded and collapsed, both themes**

Use the Browser pane at desktop width: load any app page, confirm the new 3-stop gradient, rose glow, branding tile, restyled Quick Capture, the "PLAN & REVIEW" label between groups (with Audit History under it, after Reports), and the cream/blush active item on whichever page is current. Toggle the collapse button and confirm icons center, labels hide cleanly, and hovering/focusing an icon shows its pop-out name (including Quick Capture's). Toggle the OS/browser dark-mode preference (or the app's own theme toggle, if present) and confirm the active item and Quick Capture panel still read clearly against the sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/side-nav.tsx
git commit -m "style(nav): redesign SideNav — gradient, sections, active item, Quick Capture, branding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Update `NavDrawer` with the same section grouping

**Files:**
- Modify: `src/components/nav/nav-drawer.tsx`

The drawer keeps its own plain `bg-popover` surface and existing `bg-muted` active-item treatment (it isn't rendered against the wine gradient the way `SideNav` is, so the cream/blush active style from Task 3 doesn't apply here) — only the `mainLinks`/`planLinks` grouping changes.

- [ ] **Step 1: Replace the full file**

Replace the full contents of `src/components/nav/nav-drawer.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { mainLinks, planLinks, isNavLinkActive, type NavLink } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function NavDrawer({
  open,
  onOpenChange,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();

  function renderLink(link: NavLink) {
    const isActive = isNavLinkActive(pathname, link.href);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => onOpenChange(false)}
        className={
          (isActive ? "bg-muted font-medium" : "hover:bg-muted") +
          " flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {link.label}
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Main navigation"
        className="inset-y-0 left-0 top-0 h-full max-h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-[85vw]"
      >
        <DialogTitle className="sr-only">{APP_NAME} navigation</DialogTitle>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {mainLinks.map(renderLink)}
          <p className="mt-3 mb-1 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground">
            PLAN &amp; REVIEW
          </p>
          {planLinks.map(renderLink)}
        </nav>
        <div className="mt-2 flex flex-col gap-2 border-t pt-3">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Visually inspect on mobile width**

Use the Browser pane resized to mobile width: open the hamburger drawer, confirm both groups render with the "PLAN & REVIEW" label, Audit History appears after Reports, scrolling works if the list overflows, and there's still no bottom nav or "more" menu.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/nav-drawer.tsx
git commit -m "style(nav): group NavDrawer into main + PLAN & REVIEW sections

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: New `dropdown-menu.tsx` UI primitive

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`

Mirrors `dialog.tsx`/`select.tsx`'s existing pattern over `@base-ui/react` — token-driven (`bg-popover`/`text-popover-foreground`/`border-border`), dark-mode-safe by construction like every other overlay in the app, since it reuses the same CSS variables rather than any hard-coded color.

- [ ] **Step 1: Create the file**

Create `src/components/ui/dropdown-menu.tsx`:

```tsx
"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "cn"

const DropdownMenu = MenuPrimitive.Root

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "end",
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this file isn't imported by anything yet — Task 6 wires it in)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add a token-driven DropdownMenu primitive over @base-ui/react/menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Mobile profile menu in `TopNav`

**Files:**
- Modify: `src/components/nav/top-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`

Replaces today's always-visible Sign Out icon button with a small avatar (the account email's first letter) that opens a menu containing Sign Out — a real new dropdown, per the user's explicit choice, not a restyle.

- [ ] **Step 1: Pass the signed-in email down from the layout**

In `src/app/(app)/layout.tsx`, change:

```tsx
      <div className="flex flex-1 flex-col">
        <TopNav accounts={accounts} categories={categories} />
```

to:

```tsx
      <div className="flex flex-1 flex-col">
        <TopNav accounts={accounts} categories={categories} email={session?.user?.email ?? null} />
```

- [ ] **Step 2: Add the `email` prop and the profile menu**

In `src/components/nav/top-nav.tsx`, change:

```tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavDrawer } from "@/components/nav/nav-drawer";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
import { SignOutButton } from "@/components/nav/sign-out-button";
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQuickCaptureOpen(true)}
            aria-label="Quick Capture"
            className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
          >
            <span className="text-sm">⌘K</span>
          </button>
          {/* Reachable without opening the drawer — the panel (drawer) can
              be fully hidden on mobile, and Sign Out must never become
              unreachable when it is (plan-38 §8). */}
          <SignOutButton collapsed />
        </div>
      </div>
      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} accounts={accounts} categories={categories} />
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </header>
  );
}
```

to:

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Visually inspect the profile menu on mobile width**

Use the Browser pane at mobile width: confirm the avatar shows the signed-in demo account's email initial ("D" for `demo@example.com`), opening it shows the email and a Sign Out item, and Sign Out actually works (redirects to `/login`).

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/top-nav.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(nav): replace mobile's always-visible sign-out button with a profile menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: App-wide card/color audit

**Files:** none — read-only audit, matching the same pattern Stage K's Task 3 used.

- [ ] **Step 1: Tally semantic variant usage across all 12 page areas**

Run:

```bash
for area in accounts audit-log bills budget calendar dashboard loans-cards reports settings shopping transactions year-plan; do
  echo "== $area =="
  grep -rn "variant=\"disposable\"\|variant=\"savings\"\|variant=\"restricted\"\|variant=\"expense\"\|variant=\"completed\"\|variant=\"success\"\|variant=\"warning\"\|variant=\"danger\"\|variant=\"info\"\|tone=\"disposable\"\|tone=\"savings\"\|tone=\"restricted\"\|tone=\"expense\"\|tone=\"completed\"" "src/app/(app)/$area/page.tsx" "src/components/$area/" 2>/dev/null
done
```

Expected: a concrete list per area — record which pages use `Card`/`IconBadge`'s semantic variants directly, and confirm any page with zero direct matches (likely `audit-log`, per Stage K's finding) still doesn't need them, since it has no money-categorized amounts to color-code.

- [ ] **Step 2: Spot-check any page that shows adjacent boxes of different meaning**

For any page with 2+ semantic variants found in Step 1 (e.g. `dashboard`, `bills`, `budget`), read the actual component and confirm adjacent cards use *different* variants when they represent different meanings (e.g. a restricted-funds card next to a savings card should not both render `variant="default"`).

- [ ] **Step 3: Record findings**

No code changes expected unless Step 2 finds two adjacent boxes of genuinely different meaning sharing an identical variant — in that case, fix only that specific instance (a one-line variant-prop change), matching the existing established pattern rather than inventing a new one.

---

### Task 8: Full verification sweep and required manual inspection

**Files:** none — verification only.

- [ ] **Step 1: Full Vitest suite**

Run: `npx vitest run`
Expected: every test file passes (nothing here touches logic, so this confirms no accidental breakage)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src e2e`
Expected: no new errors (same 4 pre-existing unrelated warnings)

- [ ] **Step 4: Full Playwright e2e suite**

Run: `npx playwright test`
Expected: all 4 tests still pass — none of them assert on colors/gradients, only on functional flows, so this confirms the visual changes didn't break any interaction

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: succeeds, all 23 routes registered

- [ ] **Step 6: Reset the demo account**

Run: `npm run db:seed-demo`
Expected: succeeds — leaves the demo account clean after the e2e run

- [ ] **Step 7: Manual visual inspection — desktop, both themes**

Use the Browser pane at desktop width (`resize_window` preset `desktop`). For both light and dark (toggle via the app's own theme control, or `resize_window`'s `colorScheme` param): visit `/dashboard`, `/transactions`, `/budget`, `/bills`, `/shopping` and confirm cards, the sidebar, inputs, and any open dropdown all read clearly with the new hover/glow system and no near-black blending.

- [ ] **Step 8: Manual visual inspection — collapsed and expanded sidebar**

Toggle the sidebar's collapse button in both states; confirm every icon has a working pop-out label (including Quick Capture), Sign Out and Add Transaction stay properly aligned in the collapsed footer, and no label text is left partially visible.

- [ ] **Step 9: Manual visual inspection — tablet and mobile widths**

Use `resize_window` with `preset: "tablet"` then `preset: "mobile"`. Confirm the mobile top header, hamburger drawer (with its two sections), and the new profile menu all render correctly, with no horizontal overflow and no clipped tooltips/menus.

- [ ] **Step 10: No commit for this task — verification only.**
