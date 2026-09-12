# Dashboard Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and surface "safe to spend" (dashboard card + Quick Capture answer), reuse the existing funding-recommendation banner on the dashboard, and reorder the dashboard so the new figure leads — completing the Quick Capture roadmap's final phase.

**Architecture:** `computeSafeToSpend` is a pure function (no Prisma) taking already-known numbers/lists — the dashboard page and `answerQuestion` each gather its inputs from data they already fetch (or one small additional fetch) and call it. `FundingRecommendationBanner` and `getRecommendedFundingTransfer` are reused exactly as they already exist on the Bills page — no changes to either.

**Tech Stack:** TypeScript, Prisma (mocked in tests), Vitest.

---

### Task 1: `computeSafeToSpend` pure function

**Files:**
- Create: `src/lib/safe-to-spend.ts`
- Test: `src/lib/safe-to-spend.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { computeSafeToSpend } from "@/lib/safe-to-spend";

const cutoffEnd = new Date(2026, 8, 30);

describe("computeSafeToSpend", () => {
  it("equals liquid funds when there are no payables and nothing remaining", () => {
    const result = computeSafeToSpend({
      liquidFunds: 100000,
      totalRemaining: 0,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
    });
    expect(result).toBe(100000);
  });

  it("subtracts a standalone payable due before the cutoff", () => {
    const result = computeSafeToSpend({
      liquidFunds: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
    });
    expect(result).toBe(80000);
  });

  it("does not subtract a payable due after the cutoff", () => {
    const result = computeSafeToSpend({
      liquidFunds: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 9, 5) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
    });
    expect(result).toBe(100000);
  });

  it("excludes a payable tied to a restricted-fund account even if due before the cutoff", () => {
    const result = computeSafeToSpend({
      liquidFunds: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-restricted", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(["acc-restricted"]),
      cutoffEnd,
    });
    expect(result).toBe(100000);
  });

  it("subtracts totalRemaining", () => {
    const result = computeSafeToSpend({
      liquidFunds: 100000,
      totalRemaining: 30000,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
    });
    expect(result).toBe(70000);
  });

  it("can go negative when obligations and remaining budget exceed liquid funds", () => {
    const result = computeSafeToSpend({
      liquidFunds: 10000,
      totalRemaining: 5000,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
    });
    expect(result).toBe(-15000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/safe-to-spend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function computeSafeToSpend(params: {
  liquidFunds: number;
  totalRemaining: number;
  payables: { accountId: string; amount: number; dueDate: Date }[];
  restrictedAccountIds: Set<string>;
  cutoffEnd: Date;
}): number {
  const obligations = params.payables
    .filter((p) => !params.restrictedAccountIds.has(p.accountId) && p.dueDate <= params.cutoffEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  return params.liquidFunds - obligations - params.totalRemaining;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/safe-to-spend.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/safe-to-spend.ts src/lib/safe-to-spend.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/safe-to-spend.ts src/lib/safe-to-spend.test.ts
git commit -m "feat(dashboard): add computeSafeToSpend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire `safe_to_spend` into Quick Capture

**Files:**
- Modify: `src/lib/quick-capture/answer-question.ts`
- Modify (test): `src/lib/quick-capture/answer-question.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the existing `"reports unavailable for safe_to_spend"` test in `src/lib/quick-capture/answer-question.test.ts` with:

```ts
  it("answers safe_to_spend using liquid funds, remaining budget, and upcoming obligations", async () => {
    const prisma = makeFakePrisma({
      account: {
        // Two different queries share this one mock (computeLiquidFunds's
        // includeInLiquidFunds:true and listRestrictedFundGroups's :false) —
        // branch on the filter so each gets the right accounts back.
        findMany: vi.fn((args: { where: { includeInLiquidFunds?: boolean } }) =>
          Promise.resolve(args.where.includeInLiquidFunds === false ? [] : [{ id: "acc-1" }]),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 100000 }),
      },
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1", endDate: new Date(2026, 8, 30) }),
        create: vi.fn(),
      },
      budgetAllocation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "alloc-1", categoryId: "cat-1", category: { name: "Food" }, plannedAmount: 20000, rolloverAmount: 0, rolloverMode: "RESET" },
          ]),
      },
      payable: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ accountId: "acc-1", amount: 15000, dueDate: new Date(2026, 8, 20) }]),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "safe_to_spend" }));
    expect(result.kind).toBe("amount");
    if (result.kind === "amount") {
      expect(result.label).toBe("Safe to spend");
      // liquidFunds 100000 - obligations 15000 - totalRemaining (20000 planned - 0 actual) = 65000
      expect(result.amountMinorUnits).toBe(65000);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts`
Expected: FAIL — `safe_to_spend` still returns `unavailable`.

- [ ] **Step 3: Implement**

Add imports at the top of `src/lib/quick-capture/answer-question.ts`:

```ts
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
```

Widen `AnswerPrisma` to add `"budgetAllocation"`:

```ts
type AnswerPrisma = Pick<
  PrismaClient,
  "account" | "transaction" | "budgetPeriod" | "budgetAllocation" | "category" | "payable" | "creditCard"
>;
```

Replace the `safe_to_spend` stub case:

```ts
    case "safe_to_spend":
      return { kind: "unavailable", message: "Safe-to-spend isn't available yet" };
```

with:

```ts
    case "safe_to_spend": {
      const [liquidFunds, period, restrictedGroups] = await Promise.all([
        computeLiquidFunds(prisma, userId),
        resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay),
        listRestrictedFundGroups(prisma, userId),
      ]);
      const allocations = await listAllocationsWithActuals(prisma, userId, period.id);
      const totalRemaining = allocations.reduce(
        (sum, a) => sum + (a.effectivePlanned - a.actual),
        0,
      );
      const payables = await listDuePayables(prisma, userId, period.endDate);
      const restrictedAccountIds = new Set(restrictedGroups.map((g) => g.accountId));
      const safeToSpend = computeSafeToSpend({
        liquidFunds,
        totalRemaining,
        payables: payables as { accountId: string; amount: number; dueDate: Date }[],
        restrictedAccountIds,
        cutoffEnd: period.endDate,
      });
      return { kind: "amount", label: "Safe to spend", amountMinorUnits: safeToSpend };
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts`
Expected: PASS (all existing + the replaced test).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat(quick-capture): answer safe_to_spend for real

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Dashboard — safe-to-spend card, funding banner, reordering

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

No test file — presentational, matches this codebase's convention (manual verification instead).

- [ ] **Step 1: Add the new imports**

```ts
import { listAccounts } from "@/lib/accounts";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";
```

- [ ] **Step 2: Add the two new parallel fetches**

Change the existing `Promise.all` to also fetch accounts, the cutoff-scoped due payables, and the funding recommendation:

```ts
  const [liquidFunds, allocations, duePayables, dueInstallments, restrictedFunds, accounts, cutoffDuePayables, recommendation] =
    await Promise.all([
      computeLiquidFunds(prisma, user.id),
      listAllocationsWithActuals(prisma, user.id, activePeriod.id),
      listDuePayables(prisma, user.id, horizon),
      listDueInstallmentPayments(prisma, user.id, horizon),
      listRestrictedFundGroups(prisma, user.id),
      listAccounts(prisma, user.id),
      listDuePayables(prisma, user.id, activePeriod.endDate),
      getRecommendedFundingTransfer(prisma, user.id, now),
    ]);
```

- [ ] **Step 3: Compute safe-to-spend and the recommendation view**

Directly after the existing `totalRemaining` calculation, add:

```ts
  const restrictedAccountIds = new Set(restrictedFunds.map((f) => f.accountId));
  const safeToSpend = computeSafeToSpend({
    liquidFunds,
    totalRemaining,
    payables: cutoffDuePayables,
    restrictedAccountIds,
    cutoffEnd: activePeriod.endDate,
  });

  let recommendationView = null;
  if (recommendation) {
    const fromAccount = accounts.find((a) => a.id === recommendation.fromAccountId);
    const toAccount = accounts.find((a) => a.id === recommendation.toAccountId);
    if (fromAccount && toAccount) {
      recommendationView = {
        fromAccountName: fromAccount.name,
        toAccountName: toAccount.name,
        amount: recommendation.amount,
        currency: fromAccount.currency,
      };
    }
  }
```

(This mirrors exactly how `src/app/(app)/bills/page.tsx` already builds its own `recommendationView` — same shape, same null-safety.)

- [ ] **Step 4: Reorder the JSX**

Replace the existing stat-row `<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">...</div>` block with a four-column version with Safe to spend first:

```tsx
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Safe to spend</p>
          <p className="text-2xl font-semibold">{formatMoney(safeToSpend, user.currency)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Liquid funds</p>
          <p className="text-2xl font-semibold">{formatMoney(liquidFunds, user.currency)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Budgeted this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalPlanned, user.currency)}</p>
          <p className="text-sm text-muted-foreground">{formatMoney(totalActual, user.currency)} spent</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Remaining this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalRemaining, user.currency)}</p>
        </div>
      </div>

      <FundingRecommendationBanner recommendation={recommendationView} />
```

placed directly after the stat row and before the existing "Upcoming (next 7 days)" `<div>` — `FundingRecommendationBanner` already renders nothing (`return null`) when `recommendation` is `null`, so no extra conditional is needed here.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/dashboard/page.tsx"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): add safe-to-spend card and funding banner, reorder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (336 existing + 6 new + 1 replaced = 342), zero regressions.

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no type errors, no new lint errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

Wait for the deployment to go live at `https://budget-tracker-maiava.vercel.app`.

- [ ] **Step 4: Manually verify on the live deployment**

Log in as the demo account and:
- Confirm the Dashboard now shows a "Safe to spend" card first in the stat row, with a plausible number.
- Compare it by hand against the demo data: liquid funds minus any pending payables due before the cycle's end minus the remaining budgeted amount.
- If the demo data has a funding recommendation showing on the Bills page, confirm the same banner now also appears on the Dashboard with matching figures; if not, temporarily create a payable that would trigger one (matching the Bills page's own existing recommendation conditions) to confirm the banner renders correctly, then revert the demo data change.
- Ask Quick Capture "Am I safe to spend right now?" (or whatever phrasing this app's existing `safe_to_spend` pattern matches — check `QUESTION_PATTERNS` in `deterministic-parser.ts` for the exact wording) and confirm it returns a real number instead of "Safe-to-spend isn't available yet."

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (counts), build clean, live verification outcomes. This is the final phase of the Quick Capture roadmap — say so explicitly, and note any residual known limitations (e.g. the Phase 4 `account_balance` wording gap) for the user's awareness. Hand off to `finishing-a-development-branch`.
