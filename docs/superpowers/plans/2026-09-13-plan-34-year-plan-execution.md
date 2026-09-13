# Plan 34 — Year Plan Execution Plan (Expected Scenario)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Year Plan feature (schema, reserve math, page, Dashboard integration) for the Expected scenario only, per `docs/superpowers/specs/2026-09-13-year-plan-design.md`.

**Architecture:** Three new Prisma models (`YearPlan`, `YearPlanPhase`, `IncomeForecast`) plus a thin CRUD layer (`src/lib/year-plan.ts`), a pure-function reserve-math module (`src/lib/year-plan-reserve.ts`, no Prisma dependency — same pattern as `computeSafeToSpend`), a new page (`src/app/(app)/year-plan/page.tsx`) with a grouped table + shaded-risk-zone chart, and two new compact Dashboard sections.

**Tech Stack:** Next.js Server Components/Actions, Prisma, Recharts (existing pattern), Vitest with mocked Prisma clients, zod.

---

## Task 1: Constants

**Files:**
- Modify: `src/lib/constants/financial.ts`

- [ ] Add three new const arrays, following the file's existing pattern exactly:

```typescript
export const YEAR_PLAN_PHASE_TYPES = [
  "FULL_ONBOARD",
  "PARTIAL_ONBOARD",
  "TRANSITION_HOME",
  "HOME_SALARY_ONLY",
  "EXPECTED_RETURN",
  "PARTIAL_RETURN",
  "CUSTOM",
] as const;
export type YearPlanPhaseType = (typeof YEAR_PLAN_PHASE_TYPES)[number];

// Phases whose cutoffs are "home" cutoffs for reserve-math purposes (Decision:
// only these two count toward computeRequiredReserve's cumulative walk).
export const HOME_PHASE_TYPES: readonly YearPlanPhaseType[] = ["HOME_SALARY_ONLY", "TRANSITION_HOME"];

export const INCOME_FORECAST_SOURCES = [
  "MY_SALARY",
  "MY_BONUS",
  "HUSBAND_SALARY",
  "ALLOTMENT",
  "PARTIAL_SALARY",
  "FINAL_SALARY",
  "CASH_BOND",
  "OTHER",
] as const;
export type IncomeForecastSource = (typeof INCOME_FORECAST_SOURCES)[number];

// Sources counted as "reliable income" in the reserve math (design doc:
// MY_SALARY + ALLOTMENT only).
export const RELIABLE_INCOME_SOURCES: readonly IncomeForecastSource[] = ["MY_SALARY", "ALLOTMENT"];

export const INCOME_FORECAST_STATUSES = ["CONFIRMED", "EXPECTED", "ESTIMATED", "UNCERTAIN"] as const;
export type IncomeForecastStatus = (typeof INCOME_FORECAST_STATUSES)[number];

// Statuses counted as "reliable" (design doc: CONFIRMED/EXPECTED only —
// ESTIMATED/UNCERTAIN lines are shown but excluded from reliable income).
export const RELIABLE_INCOME_STATUSES: readonly IncomeForecastStatus[] = ["CONFIRMED", "EXPECTED"];
```

- [ ] Commit:

```bash
git add src/lib/constants/financial.ts
git commit -m "feat(year-plan): add YearPlan/IncomeForecast constant enums"
```

---

## Task 2: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the three models**, plus back-relations on `User`, `SavingsGoal`, and `Transaction`. Insert the new models after `model SavingsGoal { ... }`:

```prisma
model YearPlan {
  id                    String   @id @default(cuid())
  userId                String
  name                  String
  startDate             DateTime
  endDate               DateTime
  minCashBuffer         Int      @default(0)
  scenario              String   @default("EXPECTED")
  vacationReserveGoalId String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                User             @relation(fields: [userId], references: [id])
  vacationReserveGoal SavingsGoal?     @relation(fields: [vacationReserveGoalId], references: [id])
  phases              YearPlanPhase[]
  forecasts           IncomeForecast[]
}

model YearPlanPhase {
  id                         String   @id @default(cuid())
  userId                     String
  yearPlanId                 String
  phaseType                  String
  startDate                  DateTime
  endDate                    DateTime
  label                      String?
  estimatedExpensesPerCutoff Int      @default(0)

  user      User             @relation(fields: [userId], references: [id])
  yearPlan  YearPlan         @relation(fields: [yearPlanId], references: [id])
  forecasts IncomeForecast[]
}

model IncomeForecast {
  id                  String    @id @default(cuid())
  userId              String
  yearPlanId          String
  phaseId             String?
  source              String
  expectedDate        DateTime
  expectedAmount      Int
  cutoffLabel         String
  status               String   @default("EXPECTED")
  actualTransactionId String?
  notes               String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  user              User           @relation(fields: [userId], references: [id])
  yearPlan          YearPlan       @relation(fields: [yearPlanId], references: [id])
  phase             YearPlanPhase? @relation(fields: [phaseId], references: [id])
  actualTransaction Transaction?   @relation(fields: [actualTransactionId], references: [id])
}
```

- [ ] **Step 2: Add back-relations.** In `model User`, add three lines alongside the existing relation list (after `savingsGoals SavingsGoal[]`):

```prisma
  yearPlans        YearPlan[]
  yearPlanPhases   YearPlanPhase[]
  incomeForecasts  IncomeForecast[]
```

In `model SavingsGoal`, add (after the `account Account @relation(...)` line):

```prisma
  yearPlans YearPlan[]
```

In `model Transaction`, add (after the existing relation lines):

```prisma
  incomeForecasts IncomeForecast[]
```

- [ ] **Step 3: Regenerate the Prisma Client** (no `db push` needed locally — Vercel applies schema changes to production at deploy time, per this project's established convention; local dev only needs updated types)

Run: `npm run db:generate`
Expected: "Generated Prisma Client" with no errors

- [ ] **Step 4: Validate the schema**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(year-plan): add YearPlan, YearPlanPhase, IncomeForecast models"
```

---

## Task 3: Domain CRUD (`src/lib/year-plan.ts`)

**Files:**
- Create: `src/lib/year-plan.ts`
- Test: `src/lib/year-plan.test.ts`

- [ ] **Step 1: Write failing tests** covering:
  - `createYearPlan` creates a plan scoped to `userId` and returns it
  - `addPhase` creates a phase linked to the given plan (rejects if the plan doesn't belong to `userId`)
  - `addIncomeForecast` creates a forecast linked to the given plan/phase (rejects if the plan doesn't belong to `userId`)
  - `linkForecastToTransaction` sets `actualTransactionId` on a forecast, and — the invariant the design doc calls out explicitly — **does not** call `prisma.transaction.update` or `prisma.account` at all (assert the test's transaction/account mocks were never called)
  - `getActiveYearPlan` returns the most recent `EXPECTED`-scenario plan for a user whose `endDate` hasn't passed, or `null` if none

```typescript
import { describe, expect, it, vi } from "vitest";
import {
  addIncomeForecast,
  addPhase,
  createYearPlan,
  getActiveYearPlan,
  linkForecastToTransaction,
} from "@/lib/year-plan";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    yearPlan: {
      create: vi.fn(async ({ data }: any) => ({ id: "plan-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    yearPlanPhase: {
      create: vi.fn(async ({ data }: any) => ({ id: "phase-1", ...data })),
    },
    incomeForecast: {
      create: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
    },
    transaction: { update: vi.fn(), findMany: vi.fn() },
    account: { update: vi.fn(), findMany: vi.fn() },
    ...overrides,
  } as any;
}

describe("createYearPlan", () => {
  it("creates a plan scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const plan = await createYearPlan(prisma, "user-1", {
      name: "2026 Onboard Cycle",
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2027, 5, 30),
      minCashBuffer: 2000000,
      vacationReserveGoalId: null,
    });
    expect(plan.id).toBe("plan-1");
    expect(prisma.yearPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", name: "2026 Onboard Cycle" }),
    });
  });
});

describe("addPhase", () => {
  it("rejects when the plan does not belong to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    });
    const result = await addPhase(prisma, "user-1", "plan-1", {
      phaseType: "HOME_SALARY_ONLY",
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 5, 30),
      label: null,
      estimatedExpensesPerCutoff: 4800000,
    });
    expect(result.ok).toBe(false);
  });

  it("creates a phase when the plan belongs to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }),
      },
    });
    const result = await addPhase(prisma, "user-1", "plan-1", {
      phaseType: "HOME_SALARY_ONLY",
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 5, 30),
      label: null,
      estimatedExpensesPerCutoff: 4800000,
    });
    expect(result.ok).toBe(true);
  });
});

describe("addIncomeForecast", () => {
  it("creates a forecast when the plan belongs to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }),
      },
    });
    const result = await addIncomeForecast(prisma, "user-1", "plan-1", {
      phaseId: null,
      source: "MY_SALARY",
      expectedDate: new Date(2026, 0, 15),
      expectedAmount: 3500000,
      cutoffLabel: "Jan 1-15",
      status: "EXPECTED",
      notes: null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("linkForecastToTransaction", () => {
  it("sets actualTransactionId without touching any Transaction or Account write", async () => {
    const prisma = makeFakePrisma({
      incomeForecast: {
        create: vi.fn(),
        update: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
        findFirst: vi.fn().mockResolvedValue({ id: "forecast-1", userId: "user-1" }),
      },
    });
    const result = await linkForecastToTransaction(prisma, "user-1", "forecast-1", "txn-1");
    expect(result.ok).toBe(true);
    expect(prisma.incomeForecast.update).toHaveBeenCalledWith({
      where: { id: "forecast-1" },
      data: { actualTransactionId: "txn-1" },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe("getActiveYearPlan", () => {
  it("returns null when the user has no plan yet", async () => {
    const prisma = makeFakePrisma();
    const plan = await getActiveYearPlan(prisma, "user-1");
    expect(plan).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/year-plan.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/year-plan.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";

export type YearPlanMutationResult = { ok: true; id: string } | { ok: false; error: string };

type YearPlanPrisma = Pick<PrismaClient, "yearPlan" | "yearPlanPhase" | "incomeForecast">;

export async function createYearPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  },
) {
  return prisma.yearPlan.create({ data: { userId, ...input } });
}

async function assertOwnedPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  yearPlanId: string,
): Promise<boolean> {
  const plan = await prisma.yearPlan.findFirst({ where: { id: yearPlanId, userId } });
  return plan !== null;
}

export async function addPhase(
  prisma: YearPlanPrisma,
  userId: string,
  yearPlanId: string,
  input: {
    phaseType: string;
    startDate: Date;
    endDate: Date;
    label: string | null;
    estimatedExpensesPerCutoff: number;
  },
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  const phase = await prisma.yearPlanPhase.create({ data: { userId, yearPlanId, ...input } });
  return { ok: true, id: phase.id };
}

export async function addIncomeForecast(
  prisma: YearPlanPrisma,
  userId: string,
  yearPlanId: string,
  input: {
    phaseId: string | null;
    source: string;
    expectedDate: Date;
    expectedAmount: number;
    cutoffLabel: string;
    status: string;
    notes: string | null;
  },
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  const forecast = await prisma.incomeForecast.create({ data: { userId, yearPlanId, ...input } });
  return { ok: true, id: forecast.id };
}

// Deliberately touches nothing but the forecast row — see the design doc's
// "double-counting safeguard": a forecast is never added to any balance,
// so linking it to the real transaction that eventually clears must not
// mutate that transaction or any account either. This is the whole point
// of the function; do not "helpfully" sync amounts here.
export async function linkForecastToTransaction(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  forecastId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const forecast = await prisma.incomeForecast.findFirst({ where: { id: forecastId, userId } });
  if (!forecast) return { ok: false, error: "Forecast not found" };
  await prisma.incomeForecast.update({ where: { id: forecastId }, data: { actualTransactionId: transactionId } });
  return { ok: true };
}

export async function getActiveYearPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  asOf: Date = new Date(),
) {
  return prisma.yearPlan.findFirst({
    where: { userId, scenario: "EXPECTED", endDate: { gte: asOf } },
    orderBy: { startDate: "desc" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/year-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/year-plan.ts src/lib/year-plan.test.ts
git commit -m "feat(year-plan): add createYearPlan/addPhase/addIncomeForecast/linkForecastToTransaction/getActiveYearPlan"
```

---

## Task 4: Reserve math (`src/lib/year-plan-reserve.ts`)

**Files:**
- Create: `src/lib/year-plan-reserve.ts`
- Test: `src/lib/year-plan-reserve.test.ts`

- [ ] **Step 1: Write failing tests directly from the design doc's worked example**

```typescript
import { describe, expect, it } from "vitest";
import {
  computeHomeCutoffCashFlow,
  computeRecommendedSavingPerCutoff,
  computeRemainingReserve,
  computeRequiredReserve,
  projectYearPlanCutoffs,
} from "@/lib/year-plan-reserve";

describe("computeHomeCutoffCashFlow", () => {
  it("is reliable income minus planned expenses", () => {
    expect(computeHomeCutoffCashFlow({ reliableIncome: 3500000, plannedExpenses: 4800000 })).toBe(-1300000);
  });
});

describe("computeRequiredReserve", () => {
  it("matches the design doc's worked example: 3 cutoffs at -13k, then +20k, buffer 20k -> 59k", () => {
    const cashFlows = [-1300000, -1300000, -1300000, 2000000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 0, minCashBuffer: 2000000 });
    expect(required).toBe(5900000);
  });

  it("returns 0 when the plan never dips below the buffer", () => {
    const cashFlows = [500000, 500000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 0, minCashBuffer: 200000 });
    expect(required).toBe(0);
  });

  it("returns 0 for a plan with no home cutoffs yet", () => {
    const required = computeRequiredReserve({ cashFlows: [], currentReserveAmount: 0, minCashBuffer: 200000 });
    expect(required).toBe(0);
  });

  it("accounts for a nonzero currentReserveAmount already cushioning the cumulative walk", () => {
    const cashFlows = [-1300000, -1300000, -1300000, 2000000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 1000000, minCashBuffer: 2000000 });
    // worst cumulative point is now (1,000,000 - 3,900,000) = -2,900,000 -> required = 2,900,000 + 2,000,000
    expect(required).toBe(4900000);
  });
});

describe("computeRemainingReserve", () => {
  it("subtracts assignedAmount from requiredReserve", () => {
    expect(computeRemainingReserve({ requiredReserve: 5900000, assignedAmount: 1000000 })).toBe(4900000);
  });

  it("floors at 0 when already fully reserved", () => {
    expect(computeRemainingReserve({ requiredReserve: 5900000, assignedAmount: 9000000 })).toBe(0);
  });
});

describe("computeRecommendedSavingPerCutoff", () => {
  it("divides remainingReserve by remainingFullIncomeCutoffs", () => {
    expect(
      computeRecommendedSavingPerCutoff({ remainingReserve: 5900000, remainingFullIncomeCutoffs: 3 }),
    ).toBe(Math.round(5900000 / 3));
  });

  it("returns null when there are no remaining full-income cutoffs (never divide by zero)", () => {
    expect(computeRecommendedSavingPerCutoff({ remainingReserve: 5900000, remainingFullIncomeCutoffs: 0 })).toBeNull();
  });

  it("excludes PARTIAL_ONBOARD cutoffs from the denominator (asserted at the caller level, see year-plan.test.ts-style integration below)", () => {
    // This function only ever receives the pre-filtered count; the filtering
    // itself is the caller's job (projectYearPlanCutoffs / the page loader),
    // asserted in the projectYearPlanCutoffs tests below.
    expect(computeRecommendedSavingPerCutoff({ remainingReserve: 1000000, remainingFullIncomeCutoffs: 1 })).toBe(
      1000000,
    );
  });
});

describe("projectYearPlanCutoffs", () => {
  const forecasts = [
    { cutoffLabel: "Cutoff 1", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 2", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 3", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 4", source: "PARTIAL_SALARY", status: "EXPECTED", expectedAmount: 2000000, phaseId: "partial" },
  ];
  const phases = [
    { id: "home", phaseType: "HOME_SALARY_ONLY", estimatedExpensesPerCutoff: 4800000 },
    { id: "partial", phaseType: "PARTIAL_ONBOARD", estimatedExpensesPerCutoff: 0 },
  ];

  it("computes a running closingBalance per cutoff and flags status", () => {
    const rows = projectYearPlanCutoffs({
      forecasts,
      phases,
      currentReserveAmount: 0,
      minCashBuffer: 2000000,
      recommendedSavingPerCutoff: null,
    });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      cutoffLabel: "Cutoff 1",
      phaseId: "home",
      reserveDelta: -1300000,
      closingBalance: -1300000,
    });
    expect(rows[2].closingBalance).toBe(-3900000);
    expect(rows[2].status).toBe("below");
    // Cutoff 4 (PARTIAL_ONBOARD) contributes its own cash flow (income - 0
    // expenses here) to the running balance, same as a home cutoff would —
    // only the *denominator* for recommended saving excludes it, not the walk.
    expect(rows[3].reserveDelta).toBe(2000000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/year-plan-reserve.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/year-plan-reserve.ts`**

```typescript
import { HOME_PHASE_TYPES, RELIABLE_INCOME_SOURCES, RELIABLE_INCOME_STATUSES } from "@/lib/constants/financial";

// Pure calculations — every input is a plain value/array by the time this
// is called, same "trivially testable, no Prisma" pattern as computeSafeToSpend.

export function computeHomeCutoffCashFlow(params: { reliableIncome: number; plannedExpenses: number }): number {
  return params.reliableIncome - params.plannedExpenses;
}

export function computeRequiredReserve(params: {
  cashFlows: number[];
  currentReserveAmount: number;
  minCashBuffer: number;
}): number {
  let cumulative = params.currentReserveAmount;
  let worst = params.currentReserveAmount;
  for (const flow of params.cashFlows) {
    cumulative += flow;
    if (cumulative < worst) worst = cumulative;
  }
  const shortfallBelowBuffer = params.minCashBuffer - worst;
  return shortfallBelowBuffer > 0 ? shortfallBelowBuffer : 0;
}

export function computeRemainingReserve(params: { requiredReserve: number; assignedAmount: number }): number {
  const remaining = params.requiredReserve - params.assignedAmount;
  return remaining > 0 ? remaining : 0;
}

export function computeRecommendedSavingPerCutoff(params: {
  remainingReserve: number;
  remainingFullIncomeCutoffs: number;
}): number | null {
  if (params.remainingFullIncomeCutoffs <= 0) return null;
  return Math.round(params.remainingReserve / params.remainingFullIncomeCutoffs);
}

type ForecastInput = {
  cutoffLabel: string;
  source: string;
  status: string;
  expectedAmount: number;
  phaseId: string | null;
};
type PhaseInput = { id: string; phaseType: string; estimatedExpensesPerCutoff: number };

export type YearPlanCutoffRow = {
  cutoffLabel: string;
  phaseId: string | null;
  reliableIncome: number;
  expenses: number;
  reserveDelta: number;
  closingBalance: number;
  status: "ok" | "near" | "below";
};

function statusFor(closingBalance: number, minCashBuffer: number): "ok" | "near" | "below" {
  if (closingBalance < minCashBuffer) return "below";
  if (closingBalance < minCashBuffer * 1.1) return "near";
  return "ok";
}

// Groups forecasts by cutoffLabel (in first-seen order — callers pass
// forecasts already sorted by expectedDate), sums reliable income per
// cutoff, looks up that cutoff's phase for its flat expense estimate, and
// walks a running closingBalance across all of them. A FULL_ONBOARD cutoff's
// delta is the plan's flat recommendedSavingPerCutoff (a contribution) when
// one is supplied; every other cutoff's delta is its own cash flow.
export function projectYearPlanCutoffs(params: {
  forecasts: ForecastInput[];
  phases: PhaseInput[];
  currentReserveAmount: number;
  minCashBuffer: number;
  recommendedSavingPerCutoff: number | null;
}): YearPlanCutoffRow[] {
  const phaseById = new Map(params.phases.map((p) => [p.id, p]));

  const byCutoff = new Map<string, ForecastInput[]>();
  for (const forecast of params.forecasts) {
    const existing = byCutoff.get(forecast.cutoffLabel) ?? [];
    existing.push(forecast);
    byCutoff.set(forecast.cutoffLabel, existing);
  }

  let cumulative = params.currentReserveAmount;
  const rows: YearPlanCutoffRow[] = [];
  for (const [cutoffLabel, group] of byCutoff) {
    const reliableIncome = group
      .filter(
        (f) =>
          RELIABLE_INCOME_SOURCES.includes(f.source as never) &&
          RELIABLE_INCOME_STATUSES.includes(f.status as never),
      )
      .reduce((sum, f) => sum + f.expectedAmount, 0);

    const phase = group[0].phaseId ? phaseById.get(group[0].phaseId) : undefined;
    const expenses = phase?.estimatedExpensesPerCutoff ?? 0;
    const isFullOnboard = phase?.phaseType === "FULL_ONBOARD";

    const reserveDelta =
      isFullOnboard && params.recommendedSavingPerCutoff !== null
        ? params.recommendedSavingPerCutoff
        : reliableIncome - expenses;

    cumulative += reserveDelta;

    rows.push({
      cutoffLabel,
      phaseId: group[0].phaseId,
      reliableIncome,
      expenses,
      reserveDelta,
      closingBalance: cumulative,
      status: statusFor(cumulative, params.minCashBuffer),
    });
  }
  return rows;
}

// Home-period phases (for callers building the cashFlows array that feeds
// computeRequiredReserve).
export { HOME_PHASE_TYPES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/year-plan-reserve.test.ts`
Expected: PASS. If `computeRequiredReserve`'s worked-example test fails, double check the cumulative walk starts from `currentReserveAmount` (not 0) and that `shortfallBelowBuffer` uses the *worst* (most negative) cumulative point, not the final one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/year-plan-reserve.ts src/lib/year-plan-reserve.test.ts
git commit -m "feat(year-plan): add reserve math (computeRequiredReserve, computeRemainingReserve, computeRecommendedSavingPerCutoff, projectYearPlanCutoffs)"
```

---

## Task 5: Validations + server actions

**Files:**
- Create: `src/lib/validations/year-plan.ts`
- Create: `src/actions/year-plan.actions.ts`

- [ ] **Step 1: Write `src/lib/validations/year-plan.ts`**

```typescript
import { z } from "zod";
import { INCOME_FORECAST_SOURCES, INCOME_FORECAST_STATUSES, YEAR_PLAN_PHASE_TYPES } from "@/lib/constants/financial";

export const yearPlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  minCashBuffer: z.number().nonnegative(), // major units; converted by the caller
  vacationReserveGoalId: z.string().nullable(),
});

export const yearPlanPhaseSchema = z.object({
  phaseType: z.enum(YEAR_PLAN_PHASE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  label: z.string().nullable(),
  estimatedExpensesPerCutoff: z.number().nonnegative(), // major units
});

export const incomeForecastSchema = z.object({
  phaseId: z.string().nullable(),
  source: z.enum(INCOME_FORECAST_SOURCES),
  expectedDate: z.coerce.date(),
  expectedAmount: z.number(), // major units
  cutoffLabel: z.string().min(1, "Cutoff label is required"),
  status: z.enum(INCOME_FORECAST_STATUSES),
  notes: z.string().nullable(),
});
```

- [ ] **Step 2: Write `src/actions/year-plan.actions.ts`**, mirroring `savings-goal.actions.ts`'s shape:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { yearPlanSchema, yearPlanPhaseSchema, incomeForecastSchema } from "@/lib/validations/year-plan";
import { addIncomeForecast, addPhase, createYearPlan } from "@/lib/year-plan";
import { toMinorUnits } from "@/lib/money";

export type YearPlanActionResult = { ok: true } | { ok: false; error: string };

export async function createYearPlanAction(currency: string, formData: FormData): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = yearPlanSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    minCashBuffer: Number(formData.get("minCashBuffer")),
    vacationReserveGoalId: formData.get("vacationReserveGoalId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the plan details" };

  await createYearPlan(prisma, session.user.id, {
    ...parsed.data,
    minCashBuffer: toMinorUnits(parsed.data.minCashBuffer, currency),
  });
  revalidatePath("/year-plan");
  return { ok: true };
}

export async function addPhaseAction(
  yearPlanId: string,
  currency: string,
  formData: FormData,
): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = yearPlanPhaseSchema.safeParse({
    phaseType: formData.get("phaseType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    label: formData.get("label") || null,
    estimatedExpensesPerCutoff: Number(formData.get("estimatedExpensesPerCutoff")),
  });
  if (!parsed.success) return { ok: false, error: "Please check the phase details" };

  const result = await addPhase(prisma, session.user.id, yearPlanId, {
    ...parsed.data,
    estimatedExpensesPerCutoff: toMinorUnits(parsed.data.estimatedExpensesPerCutoff, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}

export async function addIncomeForecastAction(
  yearPlanId: string,
  currency: string,
  formData: FormData,
): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = incomeForecastSchema.safeParse({
    phaseId: formData.get("phaseId") || null,
    source: formData.get("source"),
    expectedDate: formData.get("expectedDate"),
    expectedAmount: Number(formData.get("expectedAmount")),
    cutoffLabel: formData.get("cutoffLabel"),
    status: formData.get("status"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the forecast details" };

  const result = await addIncomeForecast(prisma, session.user.id, yearPlanId, {
    ...parsed.data,
    expectedAmount: toMinorUnits(parsed.data.expectedAmount, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no test file for actions/validations — matches project convention of not unit-testing thin server-action wrappers that just parse+delegate; the underlying domain functions are already tested in Task 3)

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations/year-plan.ts src/actions/year-plan.actions.ts
git commit -m "feat(year-plan): add validations and server actions for creating a plan, phase, and forecast"
```

---

## Task 6: Year Plan page

**Files:**
- Create: `src/app/(app)/year-plan/page.tsx`
- Create: `src/components/year-plan/year-plan-form-dialog.tsx` (create plan)
- Create: `src/components/year-plan/phase-form-dialog.tsx` (add phase)
- Create: `src/components/year-plan/forecast-form-dialog.tsx` (add forecast)
- Create: `src/components/year-plan/cutoff-table.tsx`
- Create: `src/components/year-plan/reserve-chart.tsx`
- Modify: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Add the nav link**

```typescript
import {
  Home,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";
```

Add `{ href: "/year-plan", label: "Year Plan", icon: CalendarRange },` to `navLinks`, right after the `Accounts` entry (before `Loans & Cards`).

- [ ] **Step 2: Write `reserve-chart.tsx`** (mirrors `income-vs-expense-chart.tsx`'s structure, but a shaded-area line per the approved mockup):

```tsx
"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";
import type { YearPlanCutoffRow } from "@/lib/year-plan-reserve";

export function ReserveChart({
  rows,
  minCashBuffer,
  currency,
}: {
  rows: YearPlanCutoffRow[];
  minCashBuffer: number;
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">No cutoffs to project yet.</p>;
  }

  const bufferMajor = toMajorUnits(minCashBuffer, currency);
  const chartData = rows.map((r) => ({
    name: r.cutoffLabel,
    closingBalance: toMajorUnits(r.closingBalance, currency),
    // A second series clipped to only the portion below the buffer, so the
    // shaded fill only appears in the risky stretch (Recharts renders a
    // gradient split via two stacked areas rather than a single conditional
    // fill — this "belowBuffer" series is the shaded one, riding under the
    // main line).
    belowBuffer: Math.min(toMajorUnits(r.closingBalance, currency), bufferMajor),
  }));

  return (
    <div className="h-72 w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            formatter={(value: number) => formatMoney(toMinorUnits(value, currency), currency)}
            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          />
          <ReferenceLine y={bufferMajor} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="belowBuffer"
            stroke="none"
            fill="var(--danger)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="closingBalance"
            stroke="var(--chart-1)"
            fill="none"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Write `cutoff-table.tsx`** — grouped columns (Cutoff | Income | Expenses | Reserve | Closing balance | Status), responsive to stacked cards below `sm`:

```tsx
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import type { YearPlanCutoffRow } from "@/lib/year-plan-reserve";

const STATUS_ICON: Record<YearPlanCutoffRow["status"], string> = { ok: "🟢", near: "🟡", below: "🔴" };

export function CutoffTable({ rows, currency }: { rows: YearPlanCutoffRow[]; currency: string }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">No cutoffs yet — add phases and income forecasts to see a projection.</p>;
  }

  return (
    <>
      {/* Desktop: grouped table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Cutoff</th>
              <th className="p-2">Income</th>
              <th className="p-2">Expenses</th>
              <th className="p-2">Reserve</th>
              <th className="p-2">Closing balance</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cutoffLabel} className="border-t border-border">
                <td className="p-2">{row.cutoffLabel}</td>
                <td className="p-2">{formatMoney(row.reliableIncome, currency)}</td>
                <td className="p-2">{formatMoney(row.expenses, currency)}</td>
                <td className={`p-2 ${row.reserveDelta < 0 ? "text-danger" : ""}`}>
                  {row.reserveDelta >= 0 ? "+" : ""}
                  {formatMoney(row.reserveDelta, currency)}
                </td>
                <td className="p-2">{formatMoney(row.closingBalance, currency)}</td>
                <td className="p-2">{STATUS_ICON[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <Card key={row.cutoffLabel} className="p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{row.cutoffLabel}</p>
              <span>{STATUS_ICON[row.status]}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Income {formatMoney(row.reliableIncome, currency)} · Expenses {formatMoney(row.expenses, currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              Reserve {row.reserveDelta >= 0 ? "+" : ""}
              {formatMoney(row.reserveDelta, currency)}
            </p>
            <p className="text-sm font-medium">Closing: {formatMoney(row.closingBalance, currency)}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Write the three form dialogs** (`year-plan-form-dialog.tsx`, `phase-form-dialog.tsx`, `forecast-form-dialog.tsx`), each following `savings-goal-form-dialog.tsx`'s exact shape (`"use client"`, `useForm`, a `Dialog`/`DialogTrigger`/`DialogContent`, calling the matching action from Task 5, `toast` on success/error, `router.refresh()`). Field lists:
  - `YearPlanFormDialog`: name (text), startDate/endDate (date), minCashBuffer (number), no goal picker yet (pass `vacationReserveGoalId: null` — a goal picker is a small enough follow-up that it doesn't block shipping the core forecasting tool; note this as a known gap in the component's top comment).
  - `PhaseFormDialog` (props: `yearPlanId`, `currency`): phaseType (select from `YEAR_PLAN_PHASE_TYPES`), startDate/endDate, label (optional text), estimatedExpensesPerCutoff (number).
  - `ForecastFormDialog` (props: `yearPlanId`, `phases` for a phase-select, `currency`): source (select from `INCOME_FORECAST_SOURCES`), expectedDate, expectedAmount, cutoffLabel (text), status (select from `INCOME_FORECAST_STATUSES`), phaseId (select, optional), notes (optional text).

- [ ] **Step 5: Write `src/app/(app)/year-plan/page.tsx`**

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveYearPlan } from "@/lib/year-plan";
import {
  computeRecommendedSavingPerCutoff,
  computeRemainingReserve,
  computeRequiredReserve,
  projectYearPlanCutoffs,
} from "@/lib/year-plan-reserve";
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";
import { YearPlanFormDialog } from "@/components/year-plan/year-plan-form-dialog";
import { PhaseFormDialog } from "@/components/year-plan/phase-form-dialog";
import { ForecastFormDialog } from "@/components/year-plan/forecast-form-dialog";
import { CutoffTable } from "@/components/year-plan/cutoff-table";
import { ReserveChart } from "@/components/year-plan/reserve-chart";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export default async function YearPlanPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const plan = await getActiveYearPlan(prisma, user.id);

  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Year Plan</h1>
          <YearPlanFormDialog currency={user.currency} />
        </div>
        <p className="text-muted-foreground">
          No Year Plan yet. Create one to start forecasting income and the reserve you'll need for a home period.
        </p>
      </div>
    );
  }

  const [phases, forecasts] = await Promise.all([
    prisma.yearPlanPhase.findMany({ where: { yearPlanId: plan.id } }),
    prisma.incomeForecast.findMany({ where: { yearPlanId: plan.id }, orderBy: { expectedDate: "asc" } }),
  ]);

  const goalAssignedAmount = plan.vacationReserveGoalId
    ? ((await prisma.savingsGoal.findUnique({ where: { id: plan.vacationReserveGoalId } }))?.assignedAmount ?? 0)
    : 0;

  const homePhaseIds = new Set(phases.filter((p) => HOME_PHASE_TYPES.includes(p.phaseType as never)).map((p) => p.id));
  // Rows are grouped by cutoffLabel, not 1:1 with `forecasts` — filter by
  // each row's own `phaseId` (not by re-indexing into `forecasts`).
  const cashFlows = projectYearPlanCutoffs({
    forecasts,
    phases,
    currentReserveAmount: 0,
    minCashBuffer: plan.minCashBuffer,
    recommendedSavingPerCutoff: null,
  })
    .filter((row) => row.phaseId !== null && homePhaseIds.has(row.phaseId))
    .map((r) => r.reserveDelta);

  const requiredReserve = computeRequiredReserve({
    cashFlows,
    currentReserveAmount: 0,
    minCashBuffer: plan.minCashBuffer,
  });
  const remainingReserve = computeRemainingReserve({ requiredReserve, assignedAmount: goalAssignedAmount });

  const remainingFullIncomeCutoffs = new Set(
    forecasts
      .filter((f) => {
        const phase = phases.find((p) => p.id === f.phaseId);
        return phase?.phaseType === "FULL_ONBOARD" && f.expectedDate >= new Date();
      })
      .map((f) => f.cutoffLabel),
  ).size;
  const recommendedSavingPerCutoff = computeRecommendedSavingPerCutoff({
    remainingReserve,
    remainingFullIncomeCutoffs,
  });

  const rows = projectYearPlanCutoffs({
    forecasts,
    phases,
    currentReserveAmount: goalAssignedAmount,
    minCashBuffer: plan.minCashBuffer,
    recommendedSavingPerCutoff,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Year Plan</h1>
        <div className="flex gap-2">
          <PhaseFormDialog yearPlanId={plan.id} currency={user.currency} />
          <ForecastFormDialog yearPlanId={plan.id} phases={phases} currency={user.currency} />
        </div>
      </div>

      <Card variant="highlight" className="p-4">
        <p className="text-sm text-muted-foreground">{plan.name}</p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Required reserve</p>
            <p className="text-lg font-medium">{formatMoney(requiredReserve, user.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Remaining to save</p>
            <p className="text-lg font-medium">{formatMoney(remainingReserve, user.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Recommended / cutoff</p>
            <p className="text-lg font-medium">
              {recommendedSavingPerCutoff === null ? "—" : formatMoney(recommendedSavingPerCutoff, user.currency)}
            </p>
          </div>
        </div>
      </Card>

      <CutoffTable rows={rows} currency={user.currency} />
      <ReserveChart rows={rows} minCashBuffer={plan.minCashBuffer} currency={user.currency} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit`, `npx eslint src/app/\(app\)/year-plan src/components/year-plan src/components/nav/nav-links.ts`, `npx next build`
Expected: all clean

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/year-plan" src/components/year-plan src/components/nav/nav-links.ts
git commit -m "feat(year-plan): add the Year Plan page (grouped table, shaded reserve chart, create/add-phase/add-forecast dialogs)"
```

---

## Task 7: Dashboard integration

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Fetch the active plan and derive the two summary values**, guarded so a user with no Year Plan sees nothing (not a placeholder card):

```typescript
import { getActiveYearPlan } from "@/lib/year-plan";
import { computeRecommendedSavingPerCutoff, computeRemainingReserve, computeRequiredReserve } from "@/lib/year-plan-reserve";
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";
```

Add `getActiveYearPlan(prisma, user.id)` to the existing `Promise.all`. When it resolves to a plan, fetch its phases/forecasts and compute `remainingReserve`/`recommendedSavingPerCutoff` exactly as Task 6's page does (extract the shared computation into `src/lib/year-plan-summary.ts` if duplicating it verbatim feels wrong — prefer that over copy-pasting the block).

- [ ] **Step 2: Add two new sections below the existing ones**, each rendering only when `plan` is non-null:

```tsx
{yearPlanSummary && (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">Expected income</p>
      {yearPlanSummary.nextForecast ? (
        <>
          <p className="text-2xl font-semibold">{formatMoney(yearPlanSummary.nextForecast.expectedAmount, user.currency)}</p>
          <p className="text-sm text-muted-foreground">
            {yearPlanSummary.nextForecast.source} · {yearPlanSummary.nextForecast.expectedDate.toLocaleDateString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No upcoming forecasts</p>
      )}
    </Card>
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">Year Plan reserve</p>
      <p className="text-2xl font-semibold">{formatMoney(yearPlanSummary.remainingReserve, user.currency)}</p>
      <p className="text-sm text-muted-foreground">
        {yearPlanSummary.recommendedSavingPerCutoff === null
          ? "No more full-income cutoffs to save from"
          : `${formatMoney(yearPlanSummary.recommendedSavingPerCutoff, user.currency)} / cutoff recommended`}
      </p>
    </Card>
  </div>
)}
```

- [ ] **Step 3: Typecheck, lint, full test suite, build**

Run: `npx tsc --noEmit`, `npx eslint "src/app/(app)/dashboard/page.tsx"`, `npx vitest run`, `npx next build`
Expected: all clean, all tests pass

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" src/lib/year-plan-summary.ts
git commit -m "feat(dashboard): add Expected income and Year Plan reserve sections (Plan 21.4's deferred slots)"
```

---

## Task 8: Final verification and deploy

- [ ] **Step 1:** `npx vitest run` — all tests pass (369 existing + new ones from Tasks 3-4)
- [ ] **Step 2:** `npx next build` — clean
- [ ] **Step 3:** `git push`
- [ ] **Step 4:** Wait ~60s for the Vercel deploy, then on the live site (demo account): visit `/year-plan`, create a plan, add a `HOME_SALARY_ONLY` phase with `estimatedExpensesPerCutoff`, add a couple of `MY_SALARY` forecasts, and confirm the table/chart render sane numbers. Then check the Dashboard shows the two new sections. Revert any demo-account data created during this check afterward (delete the test plan/phase/forecasts), matching this session's established practice of leaving the demo account in its original state after verification.
