# Phase One Financial Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if Michelle chooses delegated execution. Steps use checkbox syntax for tracking.

**Goal:** Repair income and card planning with verified ledger accounting, explicit date confidence and zero-duplicate repeat runs, before any layout redesign.

**Architecture:** Extend existing cycle income/payment plans. Keep signed transactions authoritative for account and liability balances, use statement snapshots only for statement-specific amounts, and project one shared obligation representation into existing pages. Separate pure repair planning from the locked database runner.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, Prisma 7.10, PostgreSQL/Neon, TypeScript, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-one-financial-repairs-design.md`

## Global constraints

- Actual project: `D:\Budget Tracker`; preserve unrelated dirty files and completed September imports.
- No navigation or layout redesign in Phase 1.
- All monetary values are integer centavos.
- Date status is separate: CONFIRMED, ESTIMATED, UNSET; UNSET date is null.
- A past confirmed obligation with remaining > 0 is overdue, including partially paid obligations.
- EastWest purchases count exactly once as historical Health/Hospital expenses; no cash movement.
- Quoted liability targets are live verification checks, never forced balances; stop on mismatch before writing.
- Maya's existing transaction is linked, never recreated; no duplicate cash-side/card-side payment allocation.
- Actual income eligibility uses transaction type and category; source references group eligible income.
- Repairs rerun with zero duplicates and preserve subsequent legitimate edits.
- No automatic balancing adjustments.

## File responsibilities

- `prisma/schema.prisma` and additive migration: category-backed income plans, nullable/confidence-aware payment dates, funding and ledger payment relationships, statement metadata.
- `src/lib/financial-obligations.ts` with tests: pure date validation, payment status/routing and statement/liability calculations.
- Existing `cycle-income-plans.ts`, `cycle-payment-plans.ts`, `monthly-obligations.ts`, `copy-last-cycle.ts`: shared model integration, actual contributors, safe copying.
- Existing action/form/table files: accept and preserve unset/estimated dates and source identities without redesign.
- Existing `dashboard-overdue.ts`, Dashboard page, `calendar/aggregate.ts`: shared plan overrides and remaining-amount overdue rules.
- Existing transaction rules/validation and `lending.ts`, `loans.ts`: repayment classification and explicit named-loan isolation.
- `scripts/phase-one-repair-core.mjs` and tests: pure audit, matching and repair plan.
- `scripts/repair-phase-one.mjs`: read-only default, rollback/apply modes, lock, audited preconditions and reconciliation.
- `scripts/phase-one-live.test.mjs`: opt-in live/rollback integration checks.
- `docs/phase-one-financial-reconciliation.md`: actual verified results and exceptions.

### Task 1: Add confidence-aware plans and statement metadata

**Interfaces:** Export `DueDateStatus = "CONFIRMED" | "ESTIMATED" | "UNSET"` and `validateDueDate(date: Date | null, status: DueDateStatus): boolean`. Payment plans expose `dueDate`, `dueDateStatus`, `fundingAccountId`, `statementAmount`, `statementDate`, `payments`; each payment references one existing negative payment transaction, with allocated amount. Statement metadata is not a card liability override.

- [ ] Write `src/lib/financial-obligations.test.ts` first:

```ts
expect(validateDueDate(null, "UNSET")).toBe(true);
expect(validateDueDate(new Date("2026-10-25"), "ESTIMATED")).toBe(true);
expect(validateDueDate(null, "CONFIRMED")).toBe(false);
expect(validateDueDate(new Date("2026-10-25"), "UNSET")).toBe(false);
```

- [ ] Run `npx vitest run src/lib/financial-obligations.test.ts`; confirm missing implementation failure.
- [ ] Implement validation and additive schema changes. Use stable category/subcategory references on CycleIncomePlan; add opposite relations on Category/Subcategory. Add funding relation on Account. Add payment association with unique transaction identity, plan relationship, amount and user ownership. Add nullable statement amount/date on existing CyclePaymentPlan, not a separate editable liability field.

```ts
export function validateDueDate(date: Date | null, status: DueDateStatus) {
  return status === "UNSET" ? date === null : date instanceof Date && Number.isFinite(date.getTime());
}
```

- [ ] Generate client, inspect the SQL diff before applying; ensure no drops or destructive casts. Existing plan dates migrate as ESTIMATED unless independently verified. Validate with `npx prisma validate`.
- [ ] Run focused tests, stage only task files, commit `feat: add confidence-aware financial plan metadata`.

### Task 2: Derive categorized income and safely migrate source references

**Files:** `src/lib/cycle-income-plans.ts`, its tests, income actions/table/dialog, copy-last-cycle and tests.

**Interfaces:** `listCycleIncomePlans(prisma, userId, budgetPeriodId)` returns existing row fields plus `actual`, `difference`, `actualReceivedDate`, contributor transaction IDs. Create/update accepts validated income category/subcategory references. Dates use the full cycle final day; links do not bypass eligibility.

- [ ] Add a failing test with Income/Engage transaction description “Engage salary,” plan source Engage, amount 2404668 and expected 2200000. Include same-description EXPENSE and wrong-category INCOME records; neither qualifies.

```ts
expect(result.find(r => r.source === "Engage")).toMatchObject({actual: 2404668, difference: 204668});
```

- [ ] Run `npx vitest run src/lib/cycle-income-plans.test.ts`; verify the changed-description case fails on current name equality.
- [ ] Fetch category/subcategory source references and eligible transactions. Group by stable source reference, not description; validate owner/type and prevent overlapping plans counting one transaction twice. Return contributor IDs and latest actual received date. Explicitly expose uncategorized income as needing review rather than silently deleting it from ledger income totals.
- [ ] Update source selection in existing forms without visual restructuring. Copy source references but never actual links. The repair runner will map known sources and classify verified manually linked Allotment/Papa records; no guessed classification.
- [ ] Run source mutation/copy/action tests and type checking. Commit only task files.

### Task 3: Validate payment links and use shared obligation calculations

**Files:** payment-plan library/tests/action/form, monthly-obligations/tests, copy-last-cycle/tests, new financial-obligations library/tests.

**Interfaces:** `classifyObligation({dueDate, dueDateStatus, remaining}, today)` returns PAID, OVERDUE, UPCOMING, LATER or UNSCHEDULED; UPCOMING spans today through seven days. `linkPlanPayment(prisma, userId, planId, transactionId, amount)` validates owner, type, named loan/card, negative ledger side and allocation uniqueness. `buildMonthlyObligations` returns confidence/funding/contributors with remaining and payment status.

- [ ] Write failing cases for partial overdue, unset overriding saved due-day, estimated past not overdue, duplicate payment association and incoming card-side rejection.

```ts
expect(classifyObligation({dueDate:new Date("2026-09-10"),dueDateStatus:"CONFIRMED",remaining:500},new Date("2026-09-17"))).toBe("OVERDUE");
expect(classifyObligation({dueDate:null,dueDateStatus:"UNSET",remaining:3571173},new Date("2026-09-17"))).toBe("UNSCHEDULED");
```

- [ ] Run focused tests and confirm failures.
- [ ] Implement payment linking inside a transaction with owner checks and a database uniqueness guard. Actual uses allocated existing payments; a payment associated elsewhere is not auto-counted again. Legacy unlinked fallback accepts only explicit named loan/card payment types and negative outflows. Do not aggregate both ledger sides or purchases by cardId.
- [ ] Make form date optional, add confidence/funding fields, preserve explicit UNSET on amount-only edits; remove fallback to today's date. Upsert must not reset links or statement amounts on ordinary edits. Copy null dates and funding references, but clear links and statement-specific snapshots instead of copying a paid statement into another cycle.
- [ ] Display “Needs a due date,” estimated badge and linked status in existing table. Run focused tests/type check; commit task files.

### Task 4: Integrate existing Dashboard and Calendar and protect loan/repayment rules

**Files:** dashboard-overdue/tests, Dashboard page, calendar aggregate/tests, loans/tests, lending/tests, transaction-rules/tests and relevant transaction type validation.

**Interfaces:** Shared plan projection from Task 3 supplies remaining/date confidence to page adapters; explicit plans supersede generated due-day entries in their owning custom cycle. Calendar omits UNSET date events; Dashboard exposes unscheduled plans. Estimated dates never become confirmed overdue.

- [ ] Add failing tests: UnionBank saved dueDay10 produces no overdue event when plan date is UNSET; Maya paid plan is PAID; BPI appears October5; EastWest appears October25 ESTIMATED next cycle; partial past confirmed loan remains overdue.
- [ ] Run focused tests and confirm failures. Read installed Next guides on server/client components and cache revalidation before action/page modifications.
- [ ] Fetch plans with cycle ranges and associations for Dashboard/Calendar, suppress only corresponding generated occurrences, not unrelated cycles. Use remaining > 0 and CONFIRMED for overdue. Pass confidence/status/funding through existing presentation without new layout.
- [ ] Add named-loan isolation test with two loans sharing a category but distinct loanId; switch production loan calculation to explicit IDs with owner/type checks and unambiguous legacy fallback. Keep verified SLoans independent.
- [ ] Add positive RECEIVABLE_REPAYMENT signing and dedicated repayment-helper test; ensure Income/Expenses reports exclude it. Retain refund-as-expense-offset tests. Implement only scoped financial rule fixes.
- [ ] Run integration and full current tests; commit only changed task files, excluding pre-existing edits.

### Task 5: Build atomic idempotent repair planner and apply after live checks

**Files:** new repair core, core tests, runner, live tests; existing imports remain unchanged except tests explicitly reconciled to newly authorized historical records.

**Interfaces:** `planPhaseOneRepair(state)` returns creates/updates/links/conflicts and projected financial checks. Default runner reads only. Flags `--rollback-check` and `--apply` are mutually exclusive, require `--user-email`. `reconcilePhaseOne(state)` reports cards, account differences, cycle totals and protected loans/receivables.

- [ ] Write core failing tests for empty repairs, existing matches, ambiguous duplicates, liability mismatch, preserved future user edits, Maya link reuse and zero second-run changes.

```js
const first = planPhaseOneRepair(before);
assert.equal(first.conflicts.length, 0);
const second = planPhaseOneRepair(project(before, first));
assert.equal(Object.values(second.creates).flat().length, 0);
assert.equal(second.updates.length, 0);
assert.equal(second.links.length, 0);
```

- [ ] Run core tests and confirm missing implementation failure.
- [ ] Implement stable deterministic identities and audit markers; match transactions by owner/date/account/type/amount, stopping on ambiguous matches. Create exact cycles, Health/Hospital classification and two EastWest EXPENSE card rows only if absent. Match Engage existing record and income source references. Link Maya negative cash-side existing payment. Create four existing-model card plans with approved amounts/dates/confidence/funding and statement metadata. Preserve existing verified alternative funding accounts.
- [ ] Runner re-reads inside a user-scoped advisory lock and row locks, checks targets (BPI3252965, Maya1869566, UB5911173, EastWest pre-repair0 or verified repaired4551914), existing payment identities and account openings. Stop on mismatch, never update balances to meet targets. Apply all writes and audit records atomically; unknown/conflicting data prevents apply.
- [ ] Dry run; inspect each proposed write and projected cycle/card totals. Run rollback mode, compare every model's before/after persisted rows by stable ordering, confirming no leaked writes. Simulate UnionBank payment only inside rollback, checking residual2340000 and unchanged expense totals.
- [ ] Apply only after checks pass. Immediately re-run `--apply`; require zero new/updated/link/audit records and no duplicates. Compare cash balances to pre-repair values, protected loan openings/remaining and Mama zero receivable. Verify historical health4551914/current net expenses697501/next expenses0 and Engage2404668. If live new activity exists, report delta and stop rather than force old figures.
- [ ] Commit repair code/test files and audit report, not credentials or account secrets.

### Task 6: Verify exit gate and publish actual reconciliation

**Files:** live tests and `docs/phase-one-financial-reconciliation.md`.

- [ ] Add live checks for four plan records, exact statement amounts/confidence/cycles, existing Maya payment ID, Engage source actual, EastWest historical expenses and no cash movement, exact two SLoans and duplicate-free repeat audit.
- [ ] Run `npm test` with opt-in database flag enabled for live tests, `npx tsc --noEmit`, `npm run build` and existing focused end-to-end/browser checks for Dashboard/Plan/Calendar. Record any blocked checks honestly.
- [ ] Read live data again and produce card table: statement original/remaining, total liability, planned payment, paid amount/status, date/confidence, cycle. Include all account differences, income/expense totals, SLoans, receivables and second-run counts.
- [ ] Verify no layout/nav changes and preserve unrelated work. State Phase 1 passed only after all required checks pass; do not deploy or start Phase 2 implicitly. Hand off report and implementation results.
