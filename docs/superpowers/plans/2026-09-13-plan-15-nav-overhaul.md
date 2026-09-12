# Navigation Overhaul (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `BottomNav` (mobile bottom tab bar + "More" menu) and replace it with a left-side off-canvas drawer; give desktop `SideNav` a collapsible icon-only mode with tooltips, active-state, and a remembered preference.

**Architecture:** A shared `navLinks` list (with icons added) used by both `SideNav` and the new `NavDrawer`, so the two surfaces can never drift apart. `NavDrawer` reuses the existing `Dialog` primitive repositioned to a full-height left panel — not a bespoke component — to get outside-click/Escape/focus-trap/scroll-lock for free. `TopNav` becomes the slim mobile header (hamburger + page title + Quick Capture).

**Tech Stack:** No new dependencies.

---

### Task 1: Shared `navLinks` (with icons)

**Files:**
- Create: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Write the shared list**

```typescript
// src/components/nav/nav-links.ts
import {
  Home,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
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
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — this file isn't imported anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/nav-links.ts
git commit -m "feat: add shared navLinks list for desktop and mobile nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `SideNav` gains collapse, tooltips, and persistence

**Files:**
- Modify: `src/components/nav/side-nav.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
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
        {collapsed ? "⌘K" : (
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
                (isActive
                  ? "bg-white/15 font-medium"
                  : "text-[var(--nav-foreground)]/80 hover:bg-white/10") +
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/side-nav.tsx
git commit -m "feat: add collapse/expand, tooltips, and persistence to SideNav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `NavDrawer` for mobile/tablet

**Files:**
- Create: `src/components/nav/nav-drawer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { navLinks, isNavLinkActive } from "@/components/nav/nav-links";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Main navigation"
        className="inset-y-0 left-0 top-0 h-full max-h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-[85vw]"
      >
        <DialogTitle className="sr-only">{APP_NAME} navigation</DialogTitle>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = isNavLinkActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => onOpenChange(false)}
                className={
                  (isActive ? "bg-muted font-medium" : "hover:bg-muted") +
                  " flex items-center gap-3 rounded-md px-3 py-2 text-sm"
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
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

(`DialogTitle` is required by Base UI's Dialog for its accessible name even when visually hidden — `sr-only` keeps it out of view while still satisfying that.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — this component isn't wired in anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/nav-drawer.tsx
git commit -m "feat: add NavDrawer for mobile/tablet navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `TopNav` becomes the mobile header

**Files:**
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
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

  const currentTitle = navLinks.find((link) => pathname === link.href || pathname?.startsWith(`${link.href}/`))
    ?.label ?? APP_NAME;

  return (
    <header className="border-b bg-[var(--nav-background)] text-[var(--nav-foreground)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold">{currentTitle}</span>
        <button
          type="button"
          onClick={() => setQuickCaptureOpen(true)}
          aria-label="Quick Capture"
          className="rounded-md p-1 hover:bg-white/10"
        >
          <span className="text-sm">⌘K</span>
        </button>
      </div>
      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} accounts={accounts} categories={categories} />
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/top-nav.tsx
git commit -m "feat: turn TopNav into the mobile header (hamburger + title + Quick Capture)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete `BottomNav`, wire the new layout

**Files:**
- Delete: `src/components/nav/bottom-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Delete the old bottom nav**

```bash
git rm src/components/nav/bottom-nav.tsx
```

- [ ] **Step 2: Update the app layout**

Find:

```tsx
import { TopNav } from "@/components/nav/top-nav";
import { SideNav } from "@/components/nav/side-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
```

Replace with:

```tsx
import { TopNav } from "@/components/nav/top-nav";
import { SideNav } from "@/components/nav/side-nav";
```

Find:

```tsx
  return (
    <div className="flex min-h-screen bg-background">
      <SideNav accounts={accounts} categories={categories} />
      <div className="flex flex-1 flex-col">
        <TopNav accounts={accounts} categories={categories} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-20 md:pb-6">{children}</main>
        <BottomNav accounts={accounts} categories={categories} />
      </div>
    </div>
  );
```

Replace with:

```tsx
  return (
    <div className="flex min-h-screen bg-background">
      <SideNav accounts={accounts} categories={categories} />
      <div className="flex flex-1 flex-col">
        <TopNav accounts={accounts} categories={categories} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
```

(`pb-20` is removed — nothing is fixed to the bottom of the viewport on mobile anymore, so the extra bottom padding that used to clear the bottom bar is no longer needed.)

- [ ] **Step 3: Full verification**

Run: `npm test` — expected PASS, all existing tests (no test touches this layout or any nav component).
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors.
Run: `npm run build` — expected clean production build.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: replace BottomNav with the mobile header + NavDrawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Mark Plan 8 superseded

**Files:**
- Modify: `docs/superpowers/plans/2026-09-13-plan-8-mobile-bottom-nav.md`
- Modify: `docs/superpowers/specs/2026-09-13-mobile-bottom-nav-design.md`

- [ ] **Step 1: Add a superseded note to both documents**

At the very top of each file, right after the title line, add:

```markdown

> **Superseded 2026-09-13** by [Plan 15](2026-09-13-plan-15-nav-overhaul.md) — the mobile bottom nav this describes was replaced with a left-side drawer, per updated navigation requirements. Kept here for history, not deleted.
```

(Adjust the relative path in the spec file, which lives in `specs/` not `plans/`, to `../plans/2026-09-13-plan-15-nav-overhaul.md`.)

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-09-13-plan-8-mobile-bottom-nav.md docs/superpowers/specs/2026-09-13-mobile-bottom-nav-design.md
git commit -m "docs: mark the mobile bottom nav plan/spec as superseded

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 5; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Manual verification against the live deployment**

Once Vercel shows the deploy "Ready," on the real production URL:
1. **Desktop:** click the collapse toggle — confirm the sidebar shrinks to icon-only, labels disappear, tooltips (native browser hover title) appear on the icons, and the active page's icon is still visibly highlighted. Reload the page — confirm the collapsed state persisted.
2. **Mobile (resize to a narrow viewport):** confirm no bottom bar exists anymore. Tap the hamburger — confirm the drawer slides in from the left showing every nav item in one list, plus Add/Sign out at the bottom, and the current page's title shows correctly in the header.
3. Tap a nav link inside the drawer — confirm it navigates and the drawer closes.
4. Open the drawer again, tap outside it (on the dimmed backdrop) — confirm it closes.
5. Open the drawer again, press Escape (if testing with a keyboard attached) — confirm it closes.
6. Confirm the mobile header's Quick Capture button still opens the Quick Capture panel correctly.
