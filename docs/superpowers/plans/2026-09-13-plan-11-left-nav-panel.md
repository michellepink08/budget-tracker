# Left Nav Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop top nav bar with a fixed left-side vertical panel. Mobile stays exactly as Plan 8 built it (bottom tab bar), untouched.

**Architecture:** `TopNav` shrinks to a mobile-only slim header (logo + Add + Sign out, no links); a new `SideNav` component holds the desktop link list as a normal-flow flex sibling; the app layout becomes a horizontal flex root (`SideNav` beside a vertical column of header/main/bottom-nav) instead of a plain stacked column.

**Tech Stack:** No new dependencies — existing Tailwind classes, existing `AddTransactionButton`/`SignOutButton` components reused as-is.

---

### Task 1: Strip `TopNav` down to a mobile-only slim header

**Files:**
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
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
  return (
    <header className="border-b bg-[var(--nav-background)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--nav-foreground)]">
          <Wallet className="h-5 w-5" />
          {APP_NAME}
        </div>
        <div className="flex items-center gap-2">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

(The 8-item `links` array, `usePathname`, and the link-row JSX are all removed from this file — they move to the new `SideNav` in Task 2. The whole `<header>` is now `md:hidden`, where before only the inner link row was.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: this will show an error at this point — `src/app/(app)/layout.tsx` still expects the old `TopNav` shape, and nothing renders `SideNav` yet, so desktop temporarily has no links. That's expected mid-task; Task 2 and Task 3 complete the picture. Confirm the only errors (if any) are unrelated to this file, and no syntax errors exist in the new `top-nav.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/top-nav.tsx
git commit -m "feat: strip TopNav down to a mobile-only slim header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Build `SideNav`

**Files:**
- Create: `src/components/nav/side-nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
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

  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-[var(--nav-background)] text-[var(--nav-foreground)] md:flex">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4 font-semibold">
        <Wallet className="h-5 w-5" />
        {APP_NAME}
      </div>
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
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — this file isn't imported anywhere yet, so it can't break anything; Task 3 wires it in.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/side-nav.tsx
git commit -m "feat: add SideNav component for the desktop left panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `SideNav` into the app layout

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Import `SideNav`**

Find:
```tsx
import { TopNav } from "@/components/nav/top-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
```
Replace with:
```tsx
import { TopNav } from "@/components/nav/top-nav";
import { SideNav } from "@/components/nav/side-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
```

- [ ] **Step 2: Restructure the returned JSX**

Find:
```tsx
  return (
    <div className="min-h-screen bg-background">
      <TopNav accounts={accounts} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">{children}</main>
      <BottomNav accounts={accounts} categories={categories} />
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-20 md:pb-6">{children}</main>
        <BottomNav accounts={accounts} categories={categories} />
      </div>
    </div>
  );
```

- [ ] **Step 3: Full verification**

Run: `npm test` — expected PASS, 225 tests (no test touches this layout or any nav component).
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors.
Run: `npm run build` — expected clean production build.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: render SideNav as a left panel on desktop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Manual browser verification

**Files:** none (manual verification only)

- [ ] **Step 1: Desktop**

Resize to a desktop width (≥ 768px). Confirm: the left panel is visible with logo, all 8 links, Add button, and Sign out; no top bar is visible; clicking each link navigates correctly and highlights as active (background block, not underline); clicking Add opens the same transaction dialog as before; Sign out works.

- [ ] **Step 2: Mobile**

Resize to a mobile width (< 768px). Confirm: this looks pixel-for-pixel identical to before this plan — slim top header (logo, Add, Sign out) and the bottom tab bar (Home/Transactions/Add/Bills/Accounts/More), no left panel visible at all.

---

### Task 5: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 3; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Redo Task 4's checks against the real production URL** once Vercel shows the deploy "Ready."
