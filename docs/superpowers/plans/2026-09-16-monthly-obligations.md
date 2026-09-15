# Monthly Obligations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split Bills experience with a cycle-based Monthly Obligations view that clearly separates regular bills, loans/installments, and credit cards while showing expected, actual, and remaining payment amounts.

**Architecture:** Keep existing `Payable` and `RecurringPayable` records as the source for regular bills. Add a small `CyclePaymentPlan` persistence model for user-entered loan and credit-card payment targets in one budget period, and add explicit transaction source links so actual loan/card payments never depend on a shared category or description. A pure aggregation service constructs the three-section page view model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, Zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-16-monthly-obligations-design.md`

## Global Constraints

- Do not create historical transactions or alter the user's opening balances.
- Keep the existing Budget page and existing Bills management controls.
- Show regular bills, loans & installments, and credit cards in distinct sections.
- Persist one editable loan/card plan per budget period; never overwrite a loan's normal monthly payment or a card's credit limit.
- New loan and credit-card payment transactions must carry an explicit source link.
- Exclude archived loans/installments and inactive recurring bills from future-cycle views.
- Verify Prisma migration, focused tests, type check, and production build before deployment.

---

## File structure

- `prisma/schema.prisma` — adds `CyclePaymentPlan` and explicit payment-source links on `Transaction`.
- `src/lib/cycle-payment-plans.ts` — owns plan defaults, upsert validation, and persistence operations.
- `src/lib/monthly-obligations.ts` — builds an ordered, presentation-ready obligations view model from bills, plans, and payment transactions.
- `src/actions/cycle-payment-plan.actions.ts` — authenticated server action for saving a loan/card plan for the selected period.
- `src/actions/loan.actions.ts`, `src/actions/credit-card.actions.ts`, `src/lib/loans.ts`, `src/lib/credit-cards.ts` — store loan/card source links when a payment is recorded.
- `src/lib/loans.ts` and a one-off migration script — make every existing loan use a unique Loan subcategory.
- `src/app/(app)/bills/page.tsx` — selects the period and supplies the aggregation view model.
- `src/components/bills/monthly-obligations-summary.tsx` — renders total expected, paid, and remaining amounts.
- `src/components/bills/monthly-obligations-section.tsx` — renders one labelled section of obligation rows.
- `src/components/bills/cycle-payment-plan-dialog.tsx` — edits a selected loan/card expected amount for one cycle.
- `src/lib/cycle-payment-plans.test.ts` and `src/lib/monthly-obligations.test.ts` — service-level behavior and regression coverage.

### Task 1: Add cycle-plan and payment-source persistence

**Files:**
- Modify: `prisma/schema.prisma:390-503, 528-541`
- Create: `src/lib/cycle-payment-plans.ts`
- Create: `src/lib/cycle-payment-plans.test.ts`
- Modify: `src/lib/loans.test.ts`
- Modify: `src/lib/credit-cards.test.ts`

**Interfaces:**
- Produces `CyclePaymentPlanInput = { budgetPeriodId: string; sourceType: "LOAN" | "CREDIT_CARD"; sourceId: string; expectedAmount: number; dueDate: Date }`.
- Produces `upsertCyclePaymentPlan(prisma, userId, input): Promise<{ ok: true; plan: CyclePaymentPlan } | { ok: false; error: string }>`.
- Produces `listCyclePaymentPlans(prisma, userId, budgetPeriodId): Promise<CyclePaymentPlan[]>`.
- Extends transaction creation with optional `loanId` and `creditCardId` values.

- [ ] **Step 1: Write failing plan-upsert tests**

```ts
it("creates one credit-card plan for a budget period", async () => {
  const prisma = makeFakePrisma();
  const result = await upsertCyclePaymentPlan(prisma, "user-1", {
    budgetPeriodId: "period-1",
    sourceType: "CREDIT_CARD",
    sourceId: "card-1",
    expectedAmount: 5_000,
    dueDate: new Date("2026-09-30"),
  });

  expect(result).toEqual({ ok: true, plan: expect.objectContaining({ expectedAmount: 5_000 }) });
  expect(prisma.cyclePaymentPlan.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { budgetPeriodId_sourceType_sourceId: { budgetPeriodId: "period-1", sourceType: "CREDIT_CARD", sourceId: "card-1" } },
  }));
});

it("rejects a plan whose source does not belong to the user", async () => {
  const prisma = makeFakePrisma({ loan: { findFirst: vi.fn().mockResolvedValue(null) } });
  await expect(upsertCyclePaymentPlan(prisma, "user-1", {
    budgetPeriodId: "period-1", sourceType: "LOAN", sourceId: "other-users-loan", expectedAmount: 1_000, dueDate: new Date("2026-09-15"),
  })).resolves.toEqual({ ok: false, error: "Loan not found" });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/cycle-payment-plans.test.ts`

Expected: FAIL because `cycle-payment-plans.ts` and `upsertCyclePaymentPlan` do not exist.

- [ ] **Step 3: Add the schema and generate Prisma client**

Add these fields and relations, using explicit relation names to prevent ambiguity:

```prisma
model CyclePaymentPlan {
  id             String   @id @default(cuid())
  userId         String
  budgetPeriodId String
  sourceType     String
  sourceId       String
  expectedAmount Int
  dueDate        DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id])
  budgetPeriod BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])

  @@unique([budgetPeriodId, sourceType, sourceId])
  @@index([userId, budgetPeriodId])
}
```

Add `cyclePaymentPlans CyclePaymentPlan[]` to `User` and `BudgetPeriod`. Add nullable `loanId` / `creditCardId` plus named relations from `Transaction` to `Loan` and `CreditCard`; add the inverse `paymentTransactions` relation arrays to both sources. Run `node .\\node_modules\\prisma\\build\\index.js generate` after the schema change.

- [ ] **Step 4: Implement the smallest plan service**

```ts
export async function upsertCyclePaymentPlan(prisma: CyclePlanPrisma, userId: string, input: CyclePaymentPlanInput) {
  const source = input.sourceType === "LOAN"
    ? await prisma.loan.findFirst({ where: { id: input.sourceId, userId, archivedAt: null } })
    : await prisma.creditCard.findFirst({ where: { id: input.sourceId, userId } });
  if (!source) return { ok: false as const, error: input.sourceType === "LOAN" ? "Loan not found" : "Credit card not found" };

  const plan = await prisma.cyclePaymentPlan.upsert({
    where: { budgetPeriodId_sourceType_sourceId: { budgetPeriodId: input.budgetPeriodId, sourceType: input.sourceType, sourceId: input.sourceId } },
    create: { userId, ...input },
    update: { expectedAmount: input.expectedAmount, dueDate: input.dueDate },
  });
  return { ok: true as const, plan };
}
```

Validate period ownership before the upsert and require `expectedAmount >= 0`.

- [ ] **Step 5: Run focused tests and the Prisma type check**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/cycle-payment-plans.test.ts src/lib/loans.test.ts src/lib/credit-cards.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all targeted tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit the persistence layer**

```powershell
git add prisma/schema.prisma src/lib/cycle-payment-plans.ts src/lib/cycle-payment-plans.test.ts src/lib/loans.test.ts src/lib/credit-cards.test.ts
git commit -m "feat: add cycle payment plans"
```

### Task 2: Link payment transactions to their real sources and repair loan identities

**Files:**
- Modify: `src/lib/loans.ts:70-105`
- Modify: `src/lib/credit-cards.ts:55-105`
- Modify: `src/lib/installment-purchases.ts:86-145`
- Modify: `src/actions/loan.actions.ts`
- Modify: `src/actions/credit-card.actions.ts`
- Create: `scripts/repair-loan-subcategories.mjs`
- Modify: `src/lib/loans.test.ts`
- Modify: `src/lib/credit-cards.test.ts`
- Modify: `src/lib/installment-purchases.test.ts`

**Interfaces:**
- `makeLoanPayment` writes `loanId: loan.id` on its created transaction.
- `makeCreditCardPayment` writes `creditCardId: card.id` on its outgoing transaction.
- `payInstallmentTerm` continues to use `InstallmentPayment.paidTransactionId`; it does not create a cycle plan.
- `repair-loan-subcategories.mjs` maps every active loan to a distinct subcategory under category `Loan` and updates only loan records.

- [ ] **Step 1: Write failing source-link regression tests**

```ts
it("links a loan payment transaction to only the paid loan", async () => {
  const prisma = makeFakePrisma();
  await makeLoanPayment(prisma, "user-1", 11, "loan-1", { accountId: "cash-1", amount: 2_000, date: new Date("2026-09-15") });
  expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ loanId: "loan-1" }) }));
});

it("links the outgoing card payment transaction to its credit card", async () => {
  const prisma = makeFakePrisma();
  await makeCreditCardPayment(prisma, "user-1", 11, "card-1", { accountId: "cash-1", amount: 2_000, date: new Date("2026-09-15") });
  expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ creditCardId: "card-1" }) }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/loans.test.ts src/lib/credit-cards.test.ts`

Expected: FAIL because the created transaction data has no source-link field.

- [ ] **Step 3: Implement source links without changing payment amounts or categories**

Pass `loanId: loan.id` into `createExpenseLikeTransaction` from `makeLoanPayment`. Extend its accepted draft type only as needed so the field reaches `transaction.create`. In `makeCreditCardPayment`, add `creditCardId: card.id` to the outgoing payment row only; the incoming linked card-account row remains an account movement rather than a second payment.

- [ ] **Step 4: Implement the one-off loan subcategory repair script**

The script must:

```js
const loanCategory = await prisma.category.findFirst({ where: { userId, name: "Loan" } });
for (const loan of activeLoans) {
  const target = await prisma.subcategory.upsert({
    where: { userId_categoryId_name: { userId, categoryId: loanCategory.id, name: loan.name } },
    create: { userId, categoryId: loanCategory.id, name: loan.name },
    update: {},
  });
  await prisma.loan.update({ where: { id: loan.id }, data: { categoryId: loanCategory.id, subcategoryId: target.id } });
}
```

Use a `--user-email` argument, print the count of repaired loans, and exit without writes if the target user does not exist. Add the matching unique constraint to the schema only if it is absent; otherwise use `findFirst` + `create` to preserve the current schema.

- [ ] **Step 5: Run focused tests and inspect the script in dry mode**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/loans.test.ts src/lib/credit-cards.test.ts src/lib/installment-purchases.test.ts
node scripts/repair-loan-subcategories.mjs --user-email michellepgar@gmail.com --dry-run
```

Expected: tests pass; dry run prints the loans that would be assigned distinct subcategories and makes no database writes.

- [ ] **Step 6: Commit the source-link layer**

```powershell
git add src/lib/loans.ts src/lib/credit-cards.ts src/lib/installment-purchases.ts src/actions/loan.actions.ts src/actions/credit-card.actions.ts scripts/repair-loan-subcategories.mjs src/lib/loans.test.ts src/lib/credit-cards.test.ts src/lib/installment-purchases.test.ts
git commit -m "feat: link obligation payments to their sources"
```

### Task 3: Build the monthly-obligations aggregation service

**Files:**
- Create: `src/lib/monthly-obligations.ts`
- Create: `src/lib/monthly-obligations.test.ts`
- Modify: `src/lib/cycle-payment-plans.ts`

**Interfaces:**
- Produces `ObligationSection = "REGULAR_BILLS" | "LOANS_INSTALLMENTS" | "CREDIT_CARDS"`.
- Produces `MonthlyObligationRow = { id: string; section: ObligationSection; sourceType: string; sourceId: string; name: string; expected: number; actual: number; remaining: number; dueDate: Date | null; status: "UNPLANNED" | "UPCOMING" | "PARTIAL" | "PAID" | "OVERPAID"; accountName: string | null; currency: string }`.
- Produces `getMonthlyObligations(prisma, userId, budgetPeriodId): Promise<{ sections: Record<ObligationSection, MonthlyObligationRow[]>; totals: { expected: number; actual: number; remaining: number } }>`.

- [ ] **Step 1: Write failing aggregation tests**

```ts
it("uses a saved loan plan instead of the loan monthly default", async () => {
  const result = await getMonthlyObligations(makeFakePrisma({
    loans: [{ id: "loan-1", name: "SPayLater", monthlyPayment: 1_500, dueDay: 15 }],
    cyclePaymentPlans: [{ sourceType: "LOAN", sourceId: "loan-1", expectedAmount: 2_000, dueDate: new Date("2026-09-15") }],
  }), "user-1", "period-1");
  expect(result.sections.LOANS_INSTALLMENTS[0]).toMatchObject({ expected: 2_000, remaining: 2_000, status: "UPCOMING" });
});

it("keeps an unplanned credit card visible with no expected payment", async () => {
  const result = await getMonthlyObligations(makeFakePrisma({ creditCards: [{ id: "card-1", account: { name: "BPI Amore", currency: "PHP" } }] }), "user-1", "period-1");
  expect(result.sections.CREDIT_CARDS[0]).toMatchObject({ expected: 0, actual: 0, status: "UNPLANNED" });
});

it("does not apply one loan payment to another loan", async () => {
  const result = await getMonthlyObligations(makeFakePrisma({
    loans: [{ id: "loan-a", name: "A", monthlyPayment: 1_000 }, { id: "loan-b", name: "B", monthlyPayment: 1_000 }],
    transactions: [{ loanId: "loan-a", amount: -1_000, budgetPeriodId: "period-1" }],
  }), "user-1", "period-1");
  expect(result.sections.LOANS_INSTALLMENTS.map((row) => [row.sourceId, row.actual])).toEqual([["loan-a", 1_000], ["loan-b", 0]]);
});
```

- [ ] **Step 2: Run the aggregation test to verify it fails**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/monthly-obligations.test.ts`

Expected: FAIL because `getMonthlyObligations` does not exist.

- [ ] **Step 3: Implement section-specific source loading**

Load the selected `BudgetPeriod` first and reject an unowned id. Then load:

```ts
const [payables, loans, installments, cards, plans, transactions] = await Promise.all([
  prisma.payable.findMany({ where: { userId, dueDate: { gte: period.startDate, lte: period.endDate } }, include: { account: true } }),
  prisma.loan.findMany({ where: { userId, archivedAt: null }, orderBy: { dueDay: "asc" } }),
  prisma.installmentPayment.findMany({ where: { userId, dueDate: { gte: period.startDate, lte: period.endDate }, installmentPurchase: { archivedAt: null } }, include: { installmentPurchase: { include: { account: true } } } }),
  prisma.creditCard.findMany({ where: { userId }, include: { account: true } }),
  listCyclePaymentPlans(prisma, userId, budgetPeriodId),
  prisma.transaction.findMany({ where: { userId, budgetPeriodId } }),
]);
```

Build regular-bill actuals from `Payable.paidTransactionId`, loan actuals from `transaction.loanId`, installment actuals from `InstallmentPayment.paidTransactionId`, and card actuals from outgoing transactions with `creditCardId`. Convert stored negative outgoing amounts to positive display amounts. Compute `remaining = expected - actual` and derive status in this order: `UNPLANNED`, `OVERPAID`, `PAID`, `PARTIAL`, `UPCOMING`.

- [ ] **Step 4: Run the aggregation tests to verify they pass**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/lib/monthly-obligations.test.ts src/lib/cycle-payment-plans.test.ts`

Expected: all tests pass, including the two-loan isolation regression.

- [ ] **Step 5: Commit the aggregation service**

```powershell
git add src/lib/monthly-obligations.ts src/lib/monthly-obligations.test.ts src/lib/cycle-payment-plans.ts src/lib/cycle-payment-plans.test.ts
git commit -m "feat: aggregate monthly obligations"
```

### Task 4: Add authenticated plan editing and the grouped Bills UI

**Files:**
- Create: `src/actions/cycle-payment-plan.actions.ts`
- Create: `src/components/bills/cycle-payment-plan-dialog.tsx`
- Create: `src/components/bills/monthly-obligations-summary.tsx`
- Create: `src/components/bills/monthly-obligations-section.tsx`
- Modify: `src/app/(app)/bills/page.tsx`
- Modify: `src/components/bills/payable-list.tsx`
- Modify: `src/components/bills/due-payables-banner.tsx`
- Modify: `src/components/loans-cards/loan-payment-dialog.tsx`
- Modify: `src/components/loans-cards/credit-card-payment-dialog.tsx`

**Interfaces:**
- `saveCyclePaymentPlanAction(formData): Promise<{ ok: true } | { ok: false; error: string }>` accepts `budgetPeriodId`, `sourceType`, `sourceId`, `expectedAmount`, and `dueDate`.
- `MonthlyObligationsSection` consumes `{ title: string; rows: MonthlyObligationRow[]; periodId: string; currency: string }`.
- Existing payment dialogs gain optional `periodId?: string`; when supplied, they return to the selected obligations period after refresh.

- [ ] **Step 1: Write failing server-action tests**

```ts
it("rejects an invalid negative expected payment", async () => {
  const formData = new FormData();
  formData.set("expectedAmount", "-1");
  await expect(saveCyclePaymentPlanAction(formData)).resolves.toEqual({ ok: false, error: "Please check the payment plan" });
});

it("revalidates the Bills page after saving a card plan", async () => {
  const result = await saveCyclePaymentPlanAction(makePlanFormData({ sourceType: "CREDIT_CARD", sourceId: "card-1", expectedAmount: "5000" }));
  expect(result).toEqual({ ok: true });
  expect(revalidatePath).toHaveBeenCalledWith("/bills");
});
```

- [ ] **Step 2: Run the action test to verify it fails**

Run: `node .\\node_modules\\vitest\\vitest.mjs run src/actions/cycle-payment-plan.actions.test.ts`

Expected: FAIL because the action module does not exist.

- [ ] **Step 3: Implement the validated plan action**

Use this schema, convert major units with the source account's currency, verify authentication, and revalidate `/bills`:

```ts
const cyclePaymentPlanSchema = z.object({
  budgetPeriodId: z.string().min(1),
  sourceType: z.enum(["LOAN", "CREDIT_CARD"]),
  sourceId: z.string().min(1),
  expectedAmount: z.number().min(0),
  dueDate: z.date(),
});
```

- [ ] **Step 4: Build the summary and section components**

Render the summary in this order: `Expected`, `Paid`, `Remaining`. Render each row with the exact labels `Expected`, `Paid`, `Remaining`, `Due`, and a status pill. Use the row source type to show the existing payment dialog or the plan dialog. Render these headings in this fixed order: `Regular bills`, `Loans & installments`, `Credit cards`.

- [ ] **Step 5: Replace the Bills page body with the selected-period obligations view**

Use the current-cycle resolver and a `periodId` search parameter exactly as the Budget page does. Preserve the existing `Add recurring bill` and `Add bill` controls. Keep due-soon and funding banners below the obligations summary; do not show the old duplicated all-bills lists once the new grouped sections are present.

- [ ] **Step 6: Run UI-adjacent tests, type check, and build**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run src/actions/cycle-payment-plan.actions.test.ts src/lib/monthly-obligations.test.ts src/lib/payables.test.ts
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\next\dist\bin\next build --webpack
```

Expected: every test passes, TypeScript exits with code 0, and the production build completes.

- [ ] **Step 7: Commit the obligations UI**

```powershell
git add src/actions/cycle-payment-plan.actions.ts src/actions/cycle-payment-plan.actions.test.ts src/components/bills/cycle-payment-plan-dialog.tsx src/components/bills/monthly-obligations-summary.tsx src/components/bills/monthly-obligations-section.tsx src/app/(app)/bills/page.tsx src/components/bills/payable-list.tsx src/components/bills/due-payables-banner.tsx src/components/loans-cards/loan-payment-dialog.tsx src/components/loans-cards/credit-card-payment-dialog.tsx
git commit -m "feat: add monthly obligations view"
```

### Task 5: Apply the safe user-data repair and release verification

**Files:**
- Modify: `README.md` (add a short Monthly Obligations usage note)
- Modify: `docs/superpowers/specs/2026-09-16-monthly-obligations-design.md` only if implementation differs from its approved behavior

**Interfaces:**
- `scripts/repair-loan-subcategories.mjs --user-email <email> --apply` is the only command that changes existing loan category links.

- [ ] **Step 1: Run the repair script in dry mode and record the proposed changes**

Run: `node scripts/repair-loan-subcategories.mjs --user-email michellepgar@gmail.com --dry-run`

Expected: one line per active loan, each with a distinct target Loan subcategory; no database writes.

- [ ] **Step 2: Obtain explicit confirmation immediately before applying the live data repair**

Present the dry-run loan list and ask the user to approve the `--apply` command. Do not run it without that confirmation because it changes existing financial categorization.

- [ ] **Step 3: Apply the approved repair and verify the resulting links**

Run:

```powershell
node scripts/repair-loan-subcategories.mjs --user-email michellepgar@gmail.com --apply
node scripts/repair-loan-subcategories.mjs --user-email michellepgar@gmail.com --dry-run
```

Expected: the apply command reports repaired loan count; the follow-up dry run reports no remaining shared or incorrect loan subcategories.

- [ ] **Step 4: Run final verification**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\next\dist\bin\next build --webpack
```

Expected: all tests pass, TypeScript exits with code 0, and the production build completes.

- [ ] **Step 5: Commit release documentation and deploy only after user approval**

```powershell
git add README.md docs/superpowers/specs/2026-09-16-monthly-obligations-design.md
git commit -m "docs: explain monthly obligations"
& "C:\Program Files\nodejs\npx.cmd" vercel --prod --yes
```

Confirm the returned deployment status is `Ready` before reporting completion.
