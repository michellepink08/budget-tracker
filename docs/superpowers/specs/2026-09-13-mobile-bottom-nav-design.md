# Mobile Bottom Nav — Design

> **Superseded 2026-09-13** by [Plan 15](../plans/2026-09-13-plan-15-nav-overhaul.md) — the mobile bottom nav this describes was replaced with a left-side drawer, per updated navigation requirements. Kept here for history, not deleted.

**Status:** Approved by user, 2026-09-13

## Goal

Give the app the distinct mobile navigation the original design spec called for (`docs/superpowers/specs/2026-09-12-budget-tracker-design.md`, "Authenticated, mobile nav" section) — Home, Transactions, Add, Bills, Accounts as a bottom tab bar, with Loans & Cards, Reports, and Settings tucked into a "More" menu — instead of today's single `TopNav` (all 8 links in a horizontally-scrolling row) used unconditionally at every screen size.

## Context

`src/app/(app)/layout.tsx` renders one `TopNav` for every authenticated page, at every viewport width. `TopNav` already receives `accounts`/`categories` and renders an `AddTransactionButton` (a `Dialog`-based form). This spec adds a second, mobile-only navigation surface without duplicating that logic.

## Approach

- **Desktop unchanged:** `TopNav`'s link row (all 8 items) stays exactly as-is, just hidden below Tailwind's `md` breakpoint. Logo, Add button, and Sign out remain visible in a slim header at every width.
- **Mobile:** a new fixed-to-bottom `BottomNav`, visible only below `md`, with 6 tappable items: Home, Transactions, **Add** (visually emphasized, center), Bills, Accounts, **More**. This is one more than the spec's literal "5 items" list because the "More" menu itself needs a tap target to open it — the spec names what's *inside* More (Loans & Cards, Reports, Settings) but doesn't specify how it's invoked, so a 6th icon-only tab is the natural, discoverable choice.
- **Add button reuse:** `BottomNav` renders the *same* `AddTransactionButton` component `TopNav` already uses — not a second implementation. It needs the same `accounts`/`categories` props.
- **More menu:** reuses the existing `Dialog` component (no new shadcn/Base UI primitive introduced) — a simple list of links (Loans & Cards, Reports, Settings) plus a Sign out action, closing the dialog on navigation.
- **Layout:** `<main>` gets bottom padding below `md` so page content isn't hidden behind the fixed bar (a fixed-position element doesn't reserve layout space on its own).

## Components

### `src/components/nav/bottom-nav.tsx` (new)

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowLeftRight, Receipt, Wallet, MoreHorizontal, LogOut } from "lucide-react";
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

const tabs = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
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
        {tabs.slice(0, 2).map((tab) => (
          <BottomNavLink key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
        <div className="flex flex-col items-center">
          <AddTransactionButton accounts={accounts} categories={categories} />
        </div>
        {tabs.slice(2).map((tab) => (
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

`AddTransactionButton` currently always renders `<Button size="sm">` with a "Plus" icon + "Add" text — fine for a horizontal header, but too wide/labeled for a bottom-bar tab slot next to icon-only siblings. `AddTransactionButton` takes an optional `variant?: "header" | "tab"` prop (default `"header"`, preserving today's rendering exactly): `"tab"` renders a round icon-only button instead. This is one component with a rendering switch, not a forked copy — the dialog/form/state logic is identical either way.

### `src/components/nav/top-nav.tsx` (modify)

Wrap the existing `<nav className="flex items-center gap-4 ...">` link row with `hidden md:flex` (replacing the current unconditional `flex`), so the full 8-link row only renders at `md` and above. The header itself (logo, Add button, Sign out) stays visible at every width — mobile users still see Add/Sign out up top *and* the new bottom bar; this is an accepted minor redundancy for Add (both surfaces trigger the identical dialog) rather than hiding either.

### `src/app/(app)/layout.tsx` (modify)

Render `<BottomNav accounts={accounts} categories={categories} />` alongside `<TopNav>`, and add `pb-20 md:pb-6` (or similar) to `<main>` so content clears the fixed bottom bar height on mobile only.

## Testing

No new unit tests — this is presentational/routing UI with no domain logic, consistent with `TopNav` itself having no test file today. Verification is manual: resize the browser to a mobile width, confirm the bottom bar appears (and the desktop link row disappears), tap each tab and confirm navigation + active-state styling, tap Add and confirm the same transaction dialog opens, tap More and confirm the menu opens with working links and a working Sign out.

## Out of scope

- No swipe gestures, no animated tab transitions — plain instant navigation, matching the rest of the app's unadorned interaction style.
- No changes to what each destination page renders — only how it's reached on mobile.
- Categories/subcategories and recurring-rule management placement (already inside Settings per the original spec) — unaffected, out of scope for this pass.
