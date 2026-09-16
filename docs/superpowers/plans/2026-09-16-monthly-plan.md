# Monthly Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/budget` the single Monthly Plan workspace for expected income, category budgets, and bills/payments, each compared with actual transactions.

**Architecture:** Add a `CycleIncomePlan` model for cycle-specific expected income. Reuse `BudgetAllocation` for planned category spending and `CyclePaymentPlan` for loan/card payment plans. Build one server-side Monthly Plan aggregator and render three tables in `/budget`; `/bills` redirects to that page. A copy service creates only missing editable plan records from the prior cycle, never transactions or actuals.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Zod, Vitest, shadcn-style UI components.

**Spec:** `docs/superpowers/specs/2026-09-16-monthly-plan-design.md`

## Global Constraints

- Use PHP/minor-unit money handling through existing `toMinorUnits` and `formatMoney` helpers.
- Scope every read and write to the authenticated user and selected `BudgetPeriod`.
- Actual amounts always derive from recorded transactions; planning actions never create transactions or move money.
- Copied plans must remain editable and must not duplicate existing destination-cycle records.
- Preserve existing unrelated dirty Loans & Cards files and do not stage them.

---

### Task 1: Add cycle-specific expected-income storage and service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/cycle-income-plans.ts`
- Create: `src/lib/cycle-income-plans.test.ts`

**Interfaces:**
- Produces `CycleIncomePlanInput`, `listCycleIncomePlans`, `createCycleIncomePlan`, `updateCycleIncomePlan`, and `deleteCycleIncomePlan`.
- Consumes `BudgetPeriod`, `Transaction`, and the signed-in user ID.

- [ ] **Step 1: Write failing tests for owned-cycle creation, transaction-derived actual, and ownership rejection**

```ts
it("creates an expected income row only for the user's budget period", async () => {
  const result = await createCycleIncomePlan(prisma, "user-1", {
    budgetPeriodId: "period-1", source: "Salary", expectedAmount: 5000000,
    expectedDate: new Date(2026, 8, 25),
  });
  expect(result).toEqual({ ok: true, id: "income-1" });
});

it("returns the linked transaction amount as actual received", async () => {
  const rows = await listCycleIncomePlans(prisma, "user-1", "period-1");
  expect(rows[0]).toMatchObject({ expectedAmount: 5000000, actual: 4850000, difference: -150000 });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/cycle-income-plans.test.ts`

Expected: FAIL because the model/service is not defined.

- [ ] **Step 3: Add the Prisma model and relations**

```prisma
model CycleIncomePlan {
  id                  String   @id @default(cuid())
  userId              String
  budgetPeriodId      String
  source              String
  expectedAmount      Int
  expectedDate        DateTime
  actualTransactionId String?  @unique
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  user              User         @relation(fields: [userId], references: [id])
  budgetPeriod      BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])
  actualTransaction Transaction? @relation("CycleIncomeActual", fields: [actualTransactionId], references: [id])

  @@index([userId, budgetPeriodId])
}
```

Add the inverse relations to `User`, `BudgetPeriod`, and `Transaction`. Run `node .\\node_modules\\prisma\\build\\index.js generate` after updating the schema.

- [ ] **Step 4: Implement the service**

```ts
export type CycleIncomePlanInput = {
  budgetPeriodId: string;
  source: string;
  expectedAmount: number;
  expectedDate: Date;
  notes?: string | null;
};

export async function listCycleIncomePlans(prisma: IncomePlanPrisma, userId: string, budgetPeriodId: string) {
  // include actualTransaction; actual is abs(transaction.amount) or zero
  // difference is actual - expectedAmount
}
```

Validate period ownership for creates and updates. For links, verify the transaction belongs to the user, is `INCOME`, and is inside the selected budget period before setting `actualTransactionId`.

- [ ] **Step 5: Run focused tests and commit**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/cycle-income-plans.test.ts`

Expected: PASS.

```powershell
git add prisma/schema.prisma src/lib/cycle-income-plans.ts src/lib/cycle-income-plans.test.ts
git commit -m "feat: add cycle income plans"
```

### Task 2: Add Monthly Plan actions and editable income rows

**Files:**
- Create: `src/actions/cycle-income-plan.actions.ts`
- Create: `src/components/budget/cycle-income-plan-form-dialog.tsx`
- Create: `src/components/budget/cycle-income-plan-table.tsx`
- Modify: `src/actions/cycle-payment-plan.actions.ts`
- Modify: `src/components/bills/monthly-obligations-section.tsx`
- Test: `src/lib/cycle-income-plans.test.ts`

**Interfaces:**
- Consumes Task 1 service and existing `saveCyclePaymentPlanAction`.
- Produces visible success/error feedback for income and payment-plan saves.

- [ ] **Step 1: Write failing tests for income validation and a plan save result**

```ts
it("rejects an expected income amount below zero", async () => {
  const result = await createCycleIncomePlan(prisma, "user-1", { ...validInput, expectedAmount: -1 });
  expect(result).toEqual({ ok: false, error: "Expected amount must be zero or more" });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/cycle-income-plans.test.ts`

Expected: FAIL with the current permissive service.

- [ ] **Step 3: Implement server actions and client feedback**

Create Zod-validated server actions for create, update, delete, and link-actual-income. Create a client table that uses `useActionState`/toast feedback and shows Source, Expected, Actual received, Difference, Expected date, and Edit/Delete controls. Each row has a picker containing only unlinked `INCOME` transactions owned by the user and inside the selected cycle; selecting one creates the exact match, and a linked transaction cannot be reused by another income row. Update payment-plan save UI to show `Saved` or the returned error instead of silently posting.

```ts
export async function saveCycleIncomePlanAction(formData: FormData) {
  // authenticate, parse source/amount/date, convert major units, save, revalidate /budget
}
```

- [ ] **Step 4: Run focused tests and TypeScript**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/cycle-income-plans.test.ts`

Run: `node .\\node_modules\\typescript\\bin\\tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/actions/cycle-income-plan.actions.ts src/components/budget/cycle-income-plan-form-dialog.tsx src/components/budget/cycle-income-plan-table.tsx src/actions/cycle-payment-plan.actions.ts src/components/bills/monthly-obligations-section.tsx src/lib/cycle-income-plans.test.ts
git commit -m "feat: add editable monthly income plans"
```

### Task 3: Build the combined Monthly Plan aggregation and copy-last-cycle service

**Files:**
- Create: `src/lib/monthly-plan.ts`
- Create: `src/lib/monthly-plan.test.ts`
- Create: `src/lib/copy-last-cycle.ts`
- Create: `src/lib/copy-last-cycle.test.ts`
- Create: `src/actions/copy-last-cycle.actions.ts`

**Interfaces:**
- Consumes `listCycleIncomePlans`, `listAllocationsWithActuals`, `buildMonthlyObligations`, and `listCyclePaymentPlans`.
- Produces `buildMonthlyPlanSummary` and `copyLastCyclePlans`.

- [ ] **Step 1: Write failing summary and copy tests**

```ts
it("calculates income and spending differences independently", () => {
  expect(buildMonthlyPlanSummary({ expectedIncome: 5000000, actualIncome: 4800000, plannedSpending: 3200000, actualSpending: 3500000 }))
    .toEqual({ incomeDifference: -200000, spendingDifference: 300000, unallocated: 1800000 });
});

it("copies missing plans but never actual transaction links or duplicate allocations", async () => {
  const result = await copyLastCyclePlans(prisma, "user-1", "previous", "destination");
  expect(result).toEqual({ ok: true, incomeCopied: 1, allocationsCopied: 2, paymentPlansCopied: 1 });
});
```

- [ ] **Step 2: Run both focused tests to verify failure**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/monthly-plan.test.ts src/lib/copy-last-cycle.test.ts`

Expected: FAIL because neither service exists.

- [ ] **Step 3: Implement the pure summary builder**

```ts
export function buildMonthlyPlanSummary(input: {
  expectedIncome: number; actualIncome: number; plannedSpending: number; actualSpending: number;
}) {
  return {
    incomeDifference: input.actualIncome - input.expectedIncome,
    spendingDifference: input.actualSpending - input.plannedSpending,
    unallocated: input.actualIncome - input.plannedSpending,
  };
}
```

- [ ] **Step 4: Implement safe copy service and action**

Find the immediately preceding period by `endDate < destination.startDate`, newest first. Copy only missing allocations using the existing category/subcategory uniqueness rules, income rows without `actualTransactionId`, and payment plans with their expected amount/due date. Return counts; never overwrite destination plans.

- [ ] **Step 5: Run focused tests and commit**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/monthly-plan.test.ts src/lib/copy-last-cycle.test.ts`

Expected: PASS.

```powershell
git add src/lib/monthly-plan.ts src/lib/monthly-plan.test.ts src/lib/copy-last-cycle.ts src/lib/copy-last-cycle.test.ts src/actions/copy-last-cycle.actions.ts
git commit -m "feat: add monthly plan copy workflow"
```

### Task 4: Assemble the Monthly Plan page and retire the duplicate Bills entry point

**Files:**
- Modify: `src/app/(app)/budget/page.tsx`
- Modify: `src/app/(app)/bills/page.tsx`
- Create: `src/components/budget/monthly-plan-summary.tsx`
- Create: `src/components/budget/copy-last-cycle-button.tsx`
- Modify: `src/components/budget/allocation-list.tsx`
- Test: `src/lib/monthly-plan.test.ts`

**Interfaces:**
- Consumes Tasks 1-3 outputs.
- Produces the final `/budget` Monthly Plan workspace and `/bills` redirect.

- [ ] **Step 1: Write a failing summary-row test**

```ts
it("shows a positive spending difference when actual spending exceeds plan", () => {
  expect(buildMonthlyPlanSummary({ expectedIncome: 0, actualIncome: 0, plannedSpending: 100000, actualSpending: 125000 }).spendingDifference).toBe(25000);
});
```

- [ ] **Step 2: Run it to verify failure, then implement the view**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/monthly-plan.test.ts`

In `/budget`, retain period selection, add Copy Last Cycle, render summary cards, Income table, existing allocation table with Difference column (`actual - planned`), and Monthly Obligations table. Update the heading and help text to `Monthly Plan`. Replace `/bills` content with `redirect("/budget")`.

- [ ] **Step 3: Run focused tests, complete suite, and production build**

Run: `node .\\node_modules\\vitest\\vitest.mjs run`

Run: `node .\\node_modules\\typescript\\bin\\tsc --noEmit`

Run: `node .\\node_modules\\next\\dist\\bin\\next build --webpack`

Expected: all tests, TypeScript, and build PASS.

- [ ] **Step 4: Commit and deploy**

```powershell
git add src/app/(app)/budget/page.tsx src/app/(app)/bills/page.tsx src/components/budget/monthly-plan-summary.tsx src/components/budget/copy-last-cycle-button.tsx src/components/budget/allocation-list.tsx
git commit -m "feat: unify budget and bills into monthly plan"
npx vercel --prod --yes
```

## Self-review

- Spec coverage: Tasks 1-2 implement editable expected income and visible save results; Task 3 implements differences and copy behavior; Task 4 implements the unified page and Bills redirect.
- Placeholder scan: no TODO/TBD or unspecified implementation steps remain.
- Type consistency: cycle income plans use `budgetPeriodId`, actual transaction IDs are optional, and every aggregation uses existing minor-unit amounts.
