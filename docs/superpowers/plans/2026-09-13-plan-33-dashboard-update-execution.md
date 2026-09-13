# Plan 33 — Dashboard Balance Overview Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Plan 21 (Phases 21.1–21.3) — purpose-scoped dashboard totals, a revised `computeSafeToSpend`, and a three-card dashboard layout. Phase 21.4 stays deferred to Plans 22/23 per the roadmap.

**Architecture:** Two new thin, purpose-filtered aggregate functions (`computeDisposableTotal`, `computeSavingsTotal`) plus a `computeConfirmedReserves` helper live in a new `src/lib/purpose-totals.ts`. `computeSafeToSpend` (already a pure function) gains two new parameters and a renamed base-total parameter, with all three call sites (dashboard page, quick-capture `answer-question.ts`, its own test) updated in lockstep. The dashboard page is restructured from a flat 4-stat grid into three purpose-scoped `Card`s, with the existing Upcoming/funding-banner/budget sections re-homed below, unchanged in logic.

**Tech Stack:** Next.js Server Components, Prisma, Vitest with mocked Prisma clients (existing project convention).

---

## Task 1: `computeDisposableTotal` and `computeSavingsTotal`

**Files:**
- Create: `src/lib/purpose-totals.ts`
- Test: `src/lib/purpose-totals.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { computeDisposableTotal, computeSavingsTotal, computeConfirmedReserves } from "@/lib/purpose-totals";

function makePrisma(accounts: { id: string; purpose: string }[], balances: Record<string, number>, savingsGoals: { assignedAmount: number; account: { purpose: string } }[] = []) {
  return {
    account: {
      findMany: vi.fn(async ({ where }: { where: { purpose: string } }) =>
        accounts.filter((a) => a.purpose === where.purpose),
      ),
    },
    transaction: {
      findMany: vi.fn(async ({ where }: { where: { accountId: string } }) => {
        // computeAccountBalance sums transactions; stub via balances map instead by
        // mocking computeAccountBalance directly is simpler — see Step 3 note.
        return [];
      }),
    },
    savingsGoal: {
      findMany: vi.fn(async () => savingsGoals),
    },
  };
}

describe("computeDisposableTotal", () => {
  it("sums computeAccountBalance only for DISPOSABLE-purpose accounts", async () => {
    vi.doMock("@/lib/account-balance", () => ({
      computeAccountBalance: vi.fn(async (_prisma: unknown, accountId: string) =>
        ({ "a1": 5000, "a2": 3000 })[accountId] ?? 0,
      ),
    }));
    const { computeDisposableTotal: fn } = await import("@/lib/purpose-totals");
    const prisma = makePrisma([
      { id: "a1", purpose: "DISPOSABLE" },
      { id: "a2", purpose: "SAVINGS" },
    ], {});
    const total = await fn(prisma as never, "user-1");
    expect(total).toBe(5000);
    vi.doUnmock("@/lib/account-balance");
  });
});

describe("computeSavingsTotal", () => {
  it("sums computeAccountBalance only for SAVINGS-purpose accounts", async () => {
    vi.doMock("@/lib/account-balance", () => ({
      computeAccountBalance: vi.fn(async (_prisma: unknown, accountId: string) =>
        ({ "a1": 5000, "a2": 3000 })[accountId] ?? 0,
      ),
    }));
    const { computeSavingsTotal: fn } = await import("@/lib/purpose-totals");
    const prisma = makePrisma([
      { id: "a1", purpose: "DISPOSABLE" },
      { id: "a2", purpose: "SAVINGS" },
    ], {});
    const total = await fn(prisma as never, "user-1");
    expect(total).toBe(3000);
    vi.doUnmock("@/lib/account-balance");
  });
});

describe("computeConfirmedReserves", () => {
  it("sums assignedAmount only for goals on a DISPOSABLE-purpose account", async () => {
    const { computeConfirmedReserves: fn } = await import("@/lib/purpose-totals");
    const prisma = {
      savingsGoal: {
        findMany: vi.fn(async () => [
          { assignedAmount: 1000, account: { purpose: "DISPOSABLE" } },
          { assignedAmount: 9000, account: { purpose: "SAVINGS" } },
        ]),
      },
    };
    const total = await fn(prisma as never, "user-1");
    expect(total).toBe(1000);
  });

  it("returns 0 when there are no goals", async () => {
    const { computeConfirmedReserves: fn } = await import("@/lib/purpose-totals");
    const prisma = { savingsGoal: { findMany: vi.fn(async () => []) } };
    const total = await fn(prisma as never, "user-1");
    expect(total).toBe(0);
  });
});
```

Note: the `vi.doMock`/dynamic-`import` pattern above mocks `computeAccountBalance` per-test because `purpose-totals.ts` calls it directly (it isn't passed in) — mirror the mocking style already used in `src/lib/liquid-funds.test.ts` if that file mocks the same way; check it first and match its exact pattern rather than introducing a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/purpose-totals.test.ts`
Expected: FAIL — `Cannot find module '@/lib/purpose-totals'`

- [ ] **Step 3: Implement `src/lib/purpose-totals.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

async function sumBalancesForPurpose(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
  purpose: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: { userId, archivedAt: null, purpose },
  });
  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );
  return balances.reduce((sum, balance) => sum + balance, 0);
}

export async function computeDisposableTotal(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  return sumBalancesForPurpose(prisma, userId, "DISPOSABLE");
}

export async function computeSavingsTotal(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  return sumBalancesForPurpose(prisma, userId, "SAVINGS");
}

// "Confirmed reserves" per the design doc: a SavingsGoal amount only counts
// here when its account is DISPOSABLE-purpose — a SAVINGS-purpose goal's
// balance was never in disposableTotal to begin with, so counting it again
// here would double-subtract it. The UI never offers assigning a goal to a
// DISPOSABLE account today, so this is normally 0 — that's intentional, not
// a bug (see docs/superpowers/specs/2026-09-13-major-features-design.md section C).
export async function computeConfirmedReserves(
  prisma: Pick<PrismaClient, "savingsGoal">,
  userId: string,
): Promise<number> {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId },
    include: { account: true },
  });
  return goals
    .filter((g: { account: { purpose: string } }) => g.account.purpose === "DISPOSABLE")
    .reduce((sum: number, g: { assignedAmount: number }) => sum + g.assignedAmount, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/purpose-totals.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/purpose-totals.ts src/lib/purpose-totals.test.ts
git commit -m "feat(dashboard): add computeDisposableTotal, computeSavingsTotal, computeConfirmedReserves"
```

---

## Task 2: Revise `computeSafeToSpend`

**Files:**
- Modify: `src/lib/safe-to-spend.ts`
- Modify: `src/lib/safe-to-spend.test.ts`

- [ ] **Step 1: Update the failing/changed tests first**

Read `src/lib/safe-to-spend.test.ts` in full before editing — update every existing case to the new parameter shape (`disposableTotal` replaces `liquidFunds`; add `requiredTransfers` and `confirmedReserves`, defaulting existing cases to `0` for both so their expected outputs are unchanged), and add two new cases:

```typescript
it("subtracts requiredTransfers from the total", () => {
  const result = computeSafeToSpend({
    disposableTotal: 10000,
    totalRemaining: 0,
    payables: [],
    restrictedAccountIds: new Set(),
    cutoffEnd: new Date("2026-01-31"),
    requiredTransfers: 2000,
    confirmedReserves: 0,
  });
  expect(result).toBe(8000);
});

it("subtracts confirmedReserves from the total", () => {
  const result = computeSafeToSpend({
    disposableTotal: 10000,
    totalRemaining: 0,
    payables: [],
    restrictedAccountIds: new Set(),
    cutoffEnd: new Date("2026-01-31"),
    requiredTransfers: 0,
    confirmedReserves: 1500,
  });
  expect(result).toBe(8500);
});

it("confirmedReserves is a no-op in the realistic case where goals live on SAVINGS accounts (regression guard — do not remove this term as dead code)", () => {
  const result = computeSafeToSpend({
    disposableTotal: 8000,
    totalRemaining: 0,
    payables: [],
    restrictedAccountIds: new Set(),
    cutoffEnd: new Date("2026-01-31"),
    requiredTransfers: 0,
    confirmedReserves: 0,
  });
  expect(result).toBe(8000);
});
```

- [ ] **Step 2: Run tests to verify the updated/new ones fail**

Run: `npx vitest run src/lib/safe-to-spend.test.ts`
Expected: FAIL — `liquidFunds`/missing-param type errors, or wrong totals against the old implementation

- [ ] **Step 3: Update `src/lib/safe-to-spend.ts`**

```typescript
// A pure computation — every input is already a plain value or array by the
// time this is called, so there's no query logic here to get wrong, and it's
// trivially unit-testable without a Prisma mock.
export function computeSafeToSpend(params: {
  disposableTotal: number;
  totalRemaining: number;
  payables: { accountId: string; amount: number; dueDate: Date }[];
  restrictedAccountIds: Set<string>;
  cutoffEnd: Date;
  requiredTransfers: number;
  confirmedReserves: number;
}): number {
  const obligations = params.payables
    .filter((p) => !params.restrictedAccountIds.has(p.accountId) && p.dueDate <= params.cutoffEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  return (
    params.disposableTotal -
    obligations -
    params.totalRemaining -
    params.requiredTransfers -
    params.confirmedReserves
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/safe-to-spend.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/safe-to-spend.ts src/lib/safe-to-spend.test.ts
git commit -m "feat(dashboard): revise computeSafeToSpend with requiredTransfers and confirmedReserves terms"
```

---

## Task 3: Update `answer-question.ts`'s `safe_to_spend` case

**Files:**
- Modify: `src/lib/quick-capture/answer-question.ts:171-189`
- Test: check `src/lib/quick-capture/answer-question.test.ts` (or equivalent) for the existing `safe_to_spend` case and extend it

- [ ] **Step 1: Read the existing test for the `safe_to_spend` case**

Find the test file covering `answer-question.ts` (likely `src/lib/quick-capture/answer-question.test.ts`) and locate its `safe_to_spend` case. Note its mocked-Prisma shape so Step 3 below matches it exactly (particularly: does it already mock `savingsGoal.findMany` and `getRecommendedFundingTransfer`? If not, add the mocks needed for the new calls).

- [ ] **Step 2: Extend that test**

Add mocked `account.findMany` results for the two new purpose-total queries (or reuse existing mocked account/transaction data if it already covers this), plus a `savingsGoal.findMany` mock returning `[]` (so `confirmedReserves` is 0), plus a funding-recommendation mock returning `null` (so `requiredTransfers` is 0) for the baseline case — then add one case where a funding recommendation exists and assert its `amount` is subtracted from the returned `safe_to_spend` value.

Run: `npx vitest run <the test file>`
Expected: FAIL until Step 3 lands

- [ ] **Step 3: Update the `safe_to_spend` case**

```typescript
case "safe_to_spend": {
  const [disposableTotal, period, restrictedGroups, confirmedReserves, recommendation] = await Promise.all([
    computeDisposableTotal(prisma, userId),
    resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay),
    listRestrictedFundGroups(prisma, userId),
    computeConfirmedReserves(prisma, userId),
    getRecommendedFundingTransfer(prisma, userId, now),
  ]);
  const allocations = await listAllocationsWithActuals(prisma, userId, period.id);
  const totalRemaining = allocations.reduce((sum, a) => sum + (a.effectivePlanned - a.actual), 0);
  const payables = await listDuePayables(prisma, userId, period.endDate);
  const restrictedAccountIds = new Set(restrictedGroups.map((g) => g.accountId));
  const safeToSpend = computeSafeToSpend({
    disposableTotal,
    totalRemaining,
    payables: payables as { accountId: string; amount: number; dueDate: Date }[],
    restrictedAccountIds,
    cutoffEnd: period.endDate,
    requiredTransfers: recommendation?.amount ?? 0,
    confirmedReserves,
  });
  return { kind: "amount", label: "Safe to spend", amountMinorUnits: safeToSpend };
}
```

Update the file's imports: replace `computeLiquidFunds` with `computeDisposableTotal, computeConfirmedReserves` from `@/lib/purpose-totals`, and add `getRecommendedFundingTransfer` from `@/lib/transfer-recommendations` (check whether it's already imported for another case in this file first — don't double-import).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run <the test file>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat(dashboard): wire the revised computeSafeToSpend into the safe_to_spend quick-capture answer"
```

---

## Task 4: Three-card dashboard layout

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Update the page's data fetching**

Replace the `computeLiquidFunds` call with `computeDisposableTotal`, `computeSavingsTotal`, and `computeConfirmedReserves` (all from `@/lib/purpose-totals`), fetched alongside the existing `Promise.all` calls. Update the `computeSafeToSpend` call site to match Task 2's new parameter shape (`disposableTotal`, `requiredTransfers: recommendation?.amount ?? 0`, `confirmedReserves`).

- [ ] **Step 2: Replace the 4-stat grid with three purpose-scoped cards**

Replace the `<div className="grid ...">` block (the four `Card`s: Safe to spend / Liquid funds / Budgeted this cycle / Remaining this cycle) with:

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
  <Card variant="highlight" className="p-4">
    <p className="text-sm text-muted-foreground">Disposable Accounts</p>
    <p className="text-2xl font-semibold">{formatMoney(disposableTotal, user.currency)}</p>
    <p className="mt-2 text-sm text-muted-foreground">Safe to spend</p>
    <p className="text-lg font-medium">{formatMoney(safeToSpend, user.currency)}</p>
  </Card>
  <Card className="p-4">
    <p className="text-sm text-muted-foreground">Savings &amp; Reserves</p>
    <p className="text-2xl font-semibold">{formatMoney(savingsTotal, user.currency)}</p>
  </Card>
  <Card className="p-4">
    <p className="text-sm text-muted-foreground">Restricted Checking</p>
    <p className="text-2xl font-semibold">
      {formatMoney(restrictedFunds.reduce((sum, f) => sum + f.balance, 0), user.currency)}
    </p>
  </Card>
</div>

<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <Card className="p-4">
    <p className="text-sm text-muted-foreground">Budgeted this cycle</p>
    <p className="text-2xl font-semibold">{formatMoney(totalPlanned, user.currency)}</p>
    <p className="text-sm text-muted-foreground">{formatMoney(totalActual, user.currency)} spent</p>
  </Card>
  <Card className="p-4">
    <p className="text-sm text-muted-foreground">Remaining this cycle</p>
    <p className="text-2xl font-semibold">{formatMoney(totalRemaining, user.currency)}</p>
  </Card>
</div>
```

Leave everything below (the `FundingRecommendationBanner`, "Upcoming" section, "Restricted funds" list) exactly as-is — same components, same data, just visually following the new cards. (The roadmap's "Restricted Checking" summary card above is a new compact total; the existing detailed "Restricted funds" list below stays, unchanged, since it carries obligation/next-payable detail the compact card doesn't.)

- [ ] **Step 3: Manual verification (no test file — page-only change, matches project convention)**

Run: `npx tsc --noEmit` and `npx eslint src/app/(app)/dashboard/page.tsx`
Expected: both clean

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): three-card purpose-scoped layout (Disposable/Savings/Restricted)"
```

---

## Task 5: Final verification and deploy

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (357 existing + new ones from Tasks 1–3)

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: clean build

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Live verification**

Wait ~60s for the Vercel deploy, then load `https://budget-tracker-maiava.vercel.app/dashboard` (demo account: `demo@example.com` / `demopassword123`) and confirm:
- Three top cards render: Disposable Accounts (with Safe to spend beneath it), Savings & Reserves, Restricted Checking
- The numbers are sane (no NaN, no negative-looking totals that don't match the demo account's known balances)
- Budgeted/Remaining cards, funding banner, and Upcoming section still render below, unchanged
