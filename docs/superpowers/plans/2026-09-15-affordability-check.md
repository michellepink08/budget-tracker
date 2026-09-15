# "Can I Afford This?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Dashboard card where typing an amount instantly shows whether it fits within the current
cutoff's Safe to Spend, with no server round-trip.

**Architecture:** A pure function (`checkAffordability`) does the arithmetic; a client component owns the
input's local state and renders the answer live as the value changes. The Dashboard already computes
`safeToSpend` server-side — it's simply passed down as a prop.

**Tech Stack:** Next.js App Router, React `useState`, Vitest.

---

### Task 1: `checkAffordability`

**Files:**
- Create: `src/lib/affordability.ts`
- Test: `src/lib/affordability.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { checkAffordability } from "@/lib/affordability";

describe("checkAffordability", () => {
  it("can afford it when the amount is less than safe-to-spend", () => {
    const result = checkAffordability(5000, 10000);
    expect(result).toEqual({ canAfford: true, remainingAfter: 5000 });
  });

  it("can afford it exactly when the amount equals safe-to-spend", () => {
    const result = checkAffordability(10000, 10000);
    expect(result).toEqual({ canAfford: true, remainingAfter: 0 });
  });

  it("cannot afford it when the amount exceeds safe-to-spend", () => {
    const result = checkAffordability(12000, 10000);
    expect(result).toEqual({ canAfford: false, remainingAfter: -2000 });
  });

  it("cannot afford anything when safe-to-spend is already negative", () => {
    const result = checkAffordability(100, -500);
    expect(result).toEqual({ canAfford: false, remainingAfter: -600 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/affordability.test.ts`
Expected: FAIL — `Cannot find module '@/lib/affordability'`

- [ ] **Step 3: Write the implementation**

```typescript
export type AffordabilityResult = { canAfford: boolean; remainingAfter: number };

// Pure arithmetic — both amounts are minor units. No Prisma, no server
// round-trip: the Dashboard already knows safeToSpend the moment it
// renders, so this only ever runs client-side against a value it already has.
export function checkAffordability(amount: number, safeToSpend: number): AffordabilityResult {
  return { canAfford: amount <= safeToSpend, remainingAfter: safeToSpend - amount };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/affordability.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/affordability.ts src/lib/affordability.test.ts
git commit -m "feat(dashboard): add checkAffordability

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `AffordabilityCheckCard`

**Files:**
- Create: `src/components/dashboard/affordability-check-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { checkAffordability } from "@/lib/affordability";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AffordabilityCheckCard({ safeToSpend, currency }: { safeToSpend: number; currency: string }) {
  const [amountText, setAmountText] = useState("");

  const amount = Number(amountText);
  const hasValidAmount = amountText.trim() !== "" && !Number.isNaN(amount) && amount > 0;
  const result = hasValidAmount ? checkAffordability(toMinorUnits(amount, currency), safeToSpend) : null;

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm text-muted-foreground">Can I afford this?</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="affordability-amount">Amount</Label>
        <Input
          id="affordability-amount"
          type="number"
          step="0.01"
          min="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.00"
        />
      </div>
      {result && (
        <p className={`mt-3 text-sm font-medium ${result.canAfford ? "text-success" : "text-destructive"}`}>
          {result.canAfford
            ? `Yes — ${formatMoney(result.remainingAfter, currency)} will still be safe to spend after this.`
            : `No — this would put you ${formatMoney(-result.remainingAfter, currency)} over your safe-to-spend.`}
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/affordability-check-card.tsx
git commit -m "feat(dashboard): add AffordabilityCheckCard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire it into the Dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { AffordabilityCheckCard } from "@/components/dashboard/affordability-check-card";
```

- [ ] **Step 2: Render it after the daily allowance card**

Replace:

```tsx
      <DailyAllowanceCard rows={dailyAllowances} currency={user.currency} />
```

with:

```tsx
      <DailyAllowanceCard rows={dailyAllowances} currency={user.currency} />

      <AffordabilityCheckCard safeToSpend={safeToSpend} currency={user.currency} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `safeToSpend` is already computed earlier in this file via `computeSafeToSpend(...)`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): show the affordability check card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification pass

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous total plus the 4 new `affordability.test.ts` tests)

- [ ] **Step 3: Lint changed files**

Run:
```bash
npx eslint src/lib/affordability.ts src/components/dashboard/affordability-check-card.tsx "src/app/(app)/dashboard/page.tsx"
```
Expected: no errors

- [ ] **Step 4: Manually verify against the demo account**

Using the Browser pane:
1. Go to the Dashboard, note the "Safe to spend" figure.
2. In the new "Can I afford this?" card, type an amount comfortably under that figure — confirm the green
   "Yes" message with the correct remaining-after amount.
3. Type an amount above it — confirm the red "No" message with the correct overage amount.
4. Clear the field — confirm the answer disappears (no stale message shown for an empty input).
5. No demo-data reset needed — this feature never writes anything.
