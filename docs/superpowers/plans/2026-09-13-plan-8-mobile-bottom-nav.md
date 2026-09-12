# Mobile Bottom Nav Implementation Plan

> **Superseded 2026-09-13** by [Plan 15](2026-09-13-plan-15-nav-overhaul.md) — the mobile bottom nav this describes was replaced with a left-side drawer, per updated navigation requirements. Kept here for history, not deleted.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the distinct mobile bottom navigation (Home, Transactions, Add, Bills, Accounts, More) the original design spec called for, alongside the existing desktop `TopNav`.

**Architecture:** `TopNav`'s link row hides below the `md` breakpoint; a new `BottomNav` renders only below `md`; `AddTransactionButton` gains a `variant` prop so both nav surfaces share one implementation instead of forking it.

**Tech Stack:** Existing Tailwind breakpoints, existing `Dialog`/`Button` components (Base UI-backed) — no new dependencies.

---

### Task 1: Give `AddTransactionButton` a `variant` prop

**Files:**
- Modify: `src/components/transactions/add-transaction-button.tsx`

- [ ] **Step 1: Add the `variant` prop, defaulting to today's exact rendering**

Replace the file's contents with:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function AddTransactionButton({
  accounts,
  categories,
  variant = "header",
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  variant?: "header" | "tab";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "tab" ? (
            <Button size="icon" className="rounded-full" aria-label="Add transaction" />
          ) : (
            <Button size="sm" className="gap-1" />
          )
        }
      >
        <Plus className="h-4 w-4" />
        {variant === "header" && "Add"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <TransactionForm accounts={accounts} categories={categories} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (0 errors) — `TopNav`'s existing `<AddTransactionButton accounts={accounts} categories={categories} />` call has no `variant`, so it still gets `"header"` and renders identically to before.

- [ ] **Step 3: Commit**

```bash
git add src/components/transactions/add-transaction-button.tsx
git commit -m "feat: add a tab variant to AddTransactionButton for the mobile bottom nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Build `BottomNav`

**Files:**
- Create: `src/components/nav/bottom-nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (0 errors). This component isn't imported anywhere yet, so it can't break existing pages — Task 3 wires it in.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/bottom-nav.tsx
git commit -m "feat: add BottomNav component for mobile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Hide `TopNav`'s link row on mobile

**Files:**
- Modify: `src/components/nav/top-nav.tsx:40`

- [ ] **Step 1: Change the nav row's className**

Find:
```tsx
<nav className="flex items-center gap-4 overflow-x-auto text-sm">
```
Replace with:
```tsx
<nav className="hidden items-center gap-4 overflow-x-auto text-sm md:flex">
```

(The logo, `AddTransactionButton`, and `SignOutButton` in the rest of the header are untouched — they stay visible at every width.)

- [ ] **Step 2: Commit**

```bash
git add src/components/nav/top-nav.tsx
git commit -m "feat: hide TopNav's link row below the md breakpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire `BottomNav` into the app layout

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Import and render `BottomNav`, add mobile bottom padding**

Find:
```tsx
import { TopNav } from "@/components/nav/top-nav";
```
Add right after it:
```tsx
import { BottomNav } from "@/components/nav/bottom-nav";
```

Find:
```tsx
  return (
    <div className="min-h-screen bg-background">
      <TopNav accounts={accounts} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
```
Replace with:
```tsx
  return (
    <div className="min-h-screen bg-background">
      <TopNav accounts={accounts} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">{children}</main>
      <BottomNav accounts={accounts} categories={categories} />
    </div>
  );
```

- [ ] **Step 2: Full verification**

Run: `npm test` — expected PASS, 225 tests (no test touches this layout or either nav component).
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors (same 4 pre-existing informational warnings).
Run: `npm run build` — expected clean production build.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: render BottomNav in the app layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Manual browser verification

**Files:** none (manual verification only)

- [ ] **Step 1: Resize to a mobile viewport and confirm the swap**

Using the local dev server (or the deployed app), resize the browser to a mobile width (e.g. 390×844). Confirm: `TopNav`'s link row is gone; a fixed bottom bar with 6 items (Home, Transactions, a round Add button, Bills, Accounts, More) is visible; page content isn't hidden behind it (scroll to the bottom of a long page and confirm the last item is fully visible above the bar).

- [ ] **Step 2: Confirm each tab navigates and highlights correctly**

Tap Home, Transactions, Bills, Accounts in turn — confirm each navigates to the right page and the active tab is styled differently (accent-colored) from the inactive ones.

- [ ] **Step 3: Confirm Add works identically to the desktop header's Add**

Tap the center Add button — confirm the same "Add transaction" dialog opens, and submitting it behaves the same as it does from the desktop header.

- [ ] **Step 4: Confirm the More menu**

Tap More — confirm a dialog opens listing Loans & Cards, Reports, Settings, and a working Sign out. Tap Loans & Cards (or Reports, or Settings) and confirm it navigates there and the dialog closes.

- [ ] **Step 5: Confirm desktop is unaffected**

Resize back to a desktop width (e.g. 1280×800). Confirm `TopNav`'s full 8-link row is back, and no bottom bar is visible.

---

### Task 6: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 4; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

The GitHub-connected Vercel project auto-deploys from `master`. Once it's live, redo Task 5's checks against the real production URL (not just local dev) — mobile CSS/layout can't regress from a deploy, but this confirms the deployed build matches what was verified locally.
