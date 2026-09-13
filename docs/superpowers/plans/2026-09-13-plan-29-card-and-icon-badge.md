# Card & IconBadge Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 20.2 of the visual-design roadmap — a shared `Card` component (default/raised/highlight surfaces, an `interactive` flag reserved for Phase 20.3) and `IconBadge` component, then migrate every hand-written `<div className="rounded-lg border ...">` across the app to `Card`.

**Architecture:** `Card` follows this codebase's existing shadcn/cva pattern exactly (see `src/components/ui/button.tsx`) — a `cva`-driven className builder, `cn` merge, `data-slot` attribute. It is a **mechanical, non-restructuring swap**: each hand-written div becomes `<Card className="...">` keeping every other existing className/child unchanged. No component's internal layout, props, or logic changes. `interactive` is built into the variant now (for Phase 20.3 to turn on) but is not applied to anything in this phase — every row migrated here stays non-interactive, since none of them are actually clickable today (confirmed by inspection: every row is an informational container with buttons/dialogs inside, never itself a link or click target).

**Tech Stack:** React, `class-variance-authority`, the `cn` package (already a dependency, used identically by `Button`).

---

### Task 1: `Card` component

**Files:**
- Create: `src/components/ui/card.tsx`

No test file — presentational-only, matching this codebase's convention for every other `src/components/ui/*` primitive (none have tests).

- [ ] **Step 1: Write the component**

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const cardVariants = cva("rounded-lg border bg-card text-card-foreground", {
  variants: {
    variant: {
      default:
        "border-border shadow-[0_2px_8px_rgba(84,19,43,0.07),0_1px_2px_rgba(44,23,32,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      raised:
        "border-border shadow-[0_8px_24px_rgba(84,19,43,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]",
      highlight: "border-primary/30 bg-panel-soft shadow-[0_2px_8px_rgba(84,19,43,0.07),0_1px_2px_rgba(44,23,32,0.05)]",
      flat: "border-border shadow-none",
    },
    interactive: {
      true: "cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(84,19,43,0.12)] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      false: "",
    },
  },
  defaultVariants: { variant: "default", interactive: false },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

function Card({ className, variant, interactive, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 data-slot="card-title" className={cn("text-md font-semibold", className)} {...props} />
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-2", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent, cardVariants }
```

(`CardHeader`/`CardTitle`/`CardContent` are available for later phases that want the fuller structure — this migration only needs bare `Card` itself, since every existing div is a flat container, not a header+title+content layout.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/ui/card.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(design): add the shared Card component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `IconBadge` component

**Files:**
- Create: `src/components/ui/icon-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { LucideIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const iconBadgeVariants = cva("flex shrink-0 items-center justify-center rounded-full", {
  variants: {
    tone: {
      wine: "bg-primary/10 text-primary",
      berry: "bg-[color-mix(in_oklch,var(--chart-1),transparent_85%)] text-[var(--chart-1)]",
      blush: "bg-accent text-accent-foreground",
      success: "bg-success-background text-success",
    },
    size: {
      sm: "size-7 [&_svg]:size-3.5",
      md: "size-9 [&_svg]:size-4.5",
    },
  },
  defaultVariants: { tone: "wine", size: "md" },
})

export interface IconBadgeProps extends VariantProps<typeof iconBadgeVariants> {
  icon: LucideIcon
  className?: string
}

function IconBadge({ icon: Icon, tone, size, className }: IconBadgeProps) {
  return (
    <span className={cn(iconBadgeVariants({ tone, size }), className)}>
      <Icon />
    </span>
  )
}

export { IconBadge, iconBadgeVariants }
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/ui/icon-badge.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/icon-badge.tsx
git commit -m "feat(design): add the shared IconBadge component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Migrate every plain card div to `Card`

**Files (each gets the same mechanical treatment — add the `Card` import, replace the opening/closing div tag, keep every other className/child exactly as-is):**

- [ ] **Step 1:** `src/app/(app)/dashboard/page.tsx` — 6 occurrences (the 4 stat cards, the upcoming-item row, the restricted-fund card). Each `<div className="rounded-lg border p-4">` → `<Card className="p-4">` (and `p-3` variants keep `p-3`).
- [ ] **Step 2:** `src/app/(app)/transactions/page.tsx` — 1 occurrence (the "Add transaction" wrapper).
- [ ] **Step 3:** `src/components/accounts/account-list.tsx` — 1 occurrence (per-account row).
- [ ] **Step 4:** `src/components/bills/payable-list.tsx` — 1 occurrence (per-payable row).
- [ ] **Step 5:** `src/components/bills/recurring-payable-list.tsx` — 1 occurrence.
- [ ] **Step 6:** `src/components/budget/allocation-list.tsx` — 1 occurrence.
- [ ] **Step 7:** `src/components/categories/category-list.tsx` — 1 occurrence.
- [ ] **Step 8:** `src/components/loans-cards/credit-card-list.tsx` — 1 occurrence.
- [ ] **Step 9:** `src/components/loans-cards/installment-purchase-list.tsx` — 1 occurrence.
- [ ] **Step 10:** `src/components/loans-cards/loan-list.tsx` — 1 occurrence.
- [ ] **Step 11:** `src/components/quick-capture/quick-capture-panel.tsx` — 1 occurrence (the per-draft preview card).
- [ ] **Step 12:** `src/components/recurring/rule-list.tsx` — 1 occurrence.
- [ ] **Step 13:** `src/components/transactions/transaction-list.tsx` — 1 occurrence (per-transaction row).
- [ ] **Step 14:** `src/app/page.tsx` (public landing page) — 1 occurrence (a feature-highlight card).

For each file: import `{ Card }` from `"@/components/ui/card"`, change the div's opening tag to `<Card` (keeping every existing class after `rounded-lg border` — e.g. `className="flex items-center justify-between p-4"` once `rounded-lg border` itself is removed since `Card` already supplies it) and its closing `</div>` to `</Card>`. Do not touch anything else in the file.

- [ ] **Step 15: Typecheck and lint everything touched**

Run: `npx tsc --noEmit && npx eslint src/app src/components`
Expected: no errors.

- [ ] **Step 16: Run the full test suite**

Run: `npx vitest run`
Expected: all tests still pass unchanged (every file touched here is presentational, none has test coverage — this just confirms nothing elsewhere broke).

- [ ] **Step 17: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" "src/app/(app)/transactions/page.tsx" src/app/page.tsx src/components/accounts/account-list.tsx src/components/bills/payable-list.tsx src/components/bills/recurring-payable-list.tsx src/components/budget/allocation-list.tsx src/components/categories/category-list.tsx src/components/loans-cards/credit-card-list.tsx src/components/loans-cards/installment-purchase-list.tsx src/components/loans-cards/loan-list.tsx src/components/quick-capture/quick-capture-panel.tsx src/components/recurring/rule-list.tsx src/components/transactions/transaction-list.tsx
git commit -m "refactor(design): migrate plain card divs to the shared Card component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Migrate the four "highlighted/due-soon" banners to `Card variant=\"highlight\"`

**Files:**
- Modify: `src/components/bills/due-payables-banner.tsx`
- Modify: `src/components/bills/recurring-payable-due-list.tsx`
- Modify: `src/components/loans-cards/due-installment-payments-banner.tsx`
- Modify: `src/components/recurring/due-list.tsx`

These four already share one distinct pattern (`rounded-lg border border-primary/30 bg-primary/5 p-4` outer, `bg-background` inner rows) — this migrates them to the new `highlight` surface (`--panel-soft`, per the design doc's "soft rose panel" token) instead of a generic `bg-primary/5` tint, and switches the inner rows to `bg-card` so they contrast against the now-tinted outer panel (today's `bg-background` inner-on-`bg-primary/5`-outer would read as flat/low-contrast against the new panel-soft tone).

- [ ] **Step 1:** In each of the four files, change the outer `<div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">` to `<Card variant="highlight" className="flex flex-col gap-3 p-4">` (add the `Card` import).
- [ ] **Step 2:** In each file, change the inner per-item `<form ...className="... bg-background p-3">` (or equivalent inner row) to use `bg-card` instead of `bg-background`.
- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/bills/due-payables-banner.tsx src/components/bills/recurring-payable-due-list.tsx src/components/loans-cards/due-installment-payments-banner.tsx src/components/recurring/due-list.tsx`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/bills/due-payables-banner.tsx src/components/bills/recurring-payable-due-list.tsx src/components/loans-cards/due-installment-payments-banner.tsx src/components/recurring/due-list.tsx
git commit -m "refactor(design): migrate the due-soon banners to Card variant=highlight

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `FundingRecommendationBanner` and the export form

**Files:**
- Modify: `src/components/bills/funding-recommendation-banner.tsx`
- Modify: `src/components/settings/export-settings.tsx`

- [ ] **Step 1:** `funding-recommendation-banner.tsx` — its `<div className="rounded-lg border border-dashed p-4 text-sm">` becomes `<Card className="border-dashed p-4 text-sm">` (the dashed border is a deliberate "suggestion, not a fact" visual cue — kept, layered on top of `Card`'s own border/shadow).
- [ ] **Step 2:** `export-settings.tsx`'s root is a `<form>`, not a `<div>` — `Card` isn't swapped in directly here (a `<form>` element, not `Card`'s `<div>`). Instead, apply the same visual language manually: change `className="flex flex-col gap-3 rounded-lg border p-4"` to `className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_8px_rgba(84,19,43,0.07),0_1px_2px_rgba(44,23,32,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]"` — same look as a default `Card`, without changing the element type.
- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/bills/funding-recommendation-banner.tsx src/components/settings/export-settings.tsx`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/bills/funding-recommendation-banner.tsx src/components/settings/export-settings.tsx
git commit -m "refactor(design): apply the Card surface to the remaining banner/form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, same count as before this phase (no test was added or removed — purely presentational).

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

- [ ] **Step 4: Manually verify on the live deployment**

- Visit Dashboard, Transactions, Budget, Bills, Accounts, Loans & Cards, Categories (Settings), and the public landing page — confirm every card-like surface now shows a visible shadow and sits on `--card`/`--card-secondary`, distinct from the page background, in both light and dark mode.
- Confirm the Bills page's "Due this week" banner and the Loans & Cards due-installments banner now render with the soft rose/panel tint (`--panel-soft`) instead of the old flat `bg-primary/5`, and their inner per-item rows are visibly a different, contrasting surface (`--card`) from the panel itself.
- Confirm the Quick Capture preview cards still render correctly (shadow, no layout regression) when parsing a command.
- Confirm nothing regressed functionally — Add/Edit/Archive/Delete buttons on every migrated list still work.

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (count unchanged), build clean, live verification outcomes, and that this completes Phase 20.2 — hand off to `finishing-a-development-branch`, then note Phase 20.3 (hover/focus/pressed interaction states) is next.
