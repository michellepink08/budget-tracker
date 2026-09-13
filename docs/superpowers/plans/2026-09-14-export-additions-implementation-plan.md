# Export Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend CSV/XLSX/JSON export beyond transactions to every model added since (Year Plan, Shopping, Receipts, Custom Reminders), plus a combined JSON full-backup — without touching the existing `/api/export/transactions` route's behavior.

**Architecture:** `src/lib/export-format.ts`'s `toCsv`/`toXlsx` are hardcoded to `TransactionExportRow`'s columns today, despite Plan 26's roadmap doc assuming they're already generic — Task 1 fixes that (adds a `columns` parameter; behavior for transactions is unchanged). Each new model family gets its own row-builder file (mirroring `export-transactions.ts`), a new parameterized route `/api/export/[kind]/route.ts` dispatches among them by a `kind` path segment, and a separate `/api/export/backup/route.ts` produces one combined JSON file with every model family (transactions included), preserving relationships as raw foreign-key ids. Export "kind" granularity is one flat table per Prisma model (an 8th "kind," a plan's linked vacation-reserve `SavingsGoal`, is folded into the Year Plan row rather than given its own kind, since it isn't its own model).

**Tech Stack:** Next.js Route Handlers, Prisma, ExcelJS (already a dependency, used by `toXlsx`), Vitest.

---

## Task 1: Generalize `toCsv`/`toXlsx` to take an explicit columns list

**Files:**
- Modify: `src/lib/export-format.ts`
- Modify: `src/lib/export-format.test.ts`
- Modify: `src/lib/export-transactions.ts`
- Modify: `src/app/api/export/transactions/route.ts`

- [ ] **Step 1: Update the failing tests to the new signature**

Replace `src/lib/export-format.test.ts`'s content:

```ts
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";

const COLUMNS = [
  "date",
  "type",
  "amountMajorUnits",
  "currency",
  "account",
  "destinationAccount",
  "category",
  "description",
  "notes",
];

const rows = [
  {
    date: "2026-09-13",
    type: "EXPENSE",
    amountMajorUnits: -180,
    currency: "PHP",
    account: "Cash",
    destinationAccount: null,
    category: "Food",
    description: "Lunch",
    notes: null,
  },
];

describe("toCsv", () => {
  it("writes a header row and one data row, in the given column order", () => {
    const csv = toCsv(COLUMNS, rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "date,type,amountMajorUnits,currency,account,destinationAccount,category,description,notes",
    );
    expect(lines[1]).toBe("2026-09-13,EXPENSE,-180,PHP,Cash,,Food,Lunch,");
  });

  it("escapes a value containing a comma", () => {
    const csv = toCsv(COLUMNS, [{ ...rows[0], description: "Lunch, with tip" }]);
    expect(csv).toContain('"Lunch, with tip"');
  });

  it("escapes a value containing a double quote by doubling it", () => {
    const csv = toCsv(COLUMNS, [{ ...rows[0], notes: 'Said "thanks"' }]);
    expect(csv).toContain('"Said ""thanks"""');
  });

  it("renders a null field as empty, not the string 'null'", () => {
    const csv = toCsv(COLUMNS, rows);
    expect(csv).not.toContain("null");
  });

  it("only emits the columns given, even if a row has extra fields", () => {
    const csv = toCsv(["date", "description"], [{ ...rows[0], secret: "ignore me" }]);
    expect(csv.trim().split("\n")).toEqual(["date,description", "2026-09-13,Lunch"]);
  });
});

describe("toJson", () => {
  it("round-trips to an array with the expected shape", () => {
    const parsed = JSON.parse(toJson(rows));
    expect(parsed).toEqual(rows);
  });
});

describe("toXlsx", () => {
  it("produces a workbook with a worksheet named after the given sheet name", async () => {
    const buffer = await toXlsx("Transactions", COLUMNS, rows);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Transactions");
    expect(sheet).toBeDefined();
    const header = sheet!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(COLUMNS);
    const dataRow = sheet!.getRow(2).values as unknown[];
    expect(dataRow[1]).toBe("2026-09-13");
    expect(dataRow[3]).toBe(-180);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/export-format.test.ts`
Expected: FAIL — `toCsv`/`toXlsx` still take the old one-argument (rows-only) / three-argument-without-sheet-name signatures.

- [ ] **Step 3: Implement**

Replace `src/lib/export-format.ts`'s content:

```ts
import ExcelJS from "exceljs";

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => csvField(row[col])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function toJson(rows: unknown[]): string {
  return JSON.stringify(rows, null, 2);
}

export async function toXlsx(
  sheetName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(columns);
  for (const row of rows) {
    sheet.addRow(columns.map((col) => row[col]));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/export-format.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Update `export-transactions.ts` to own its column list**

In `src/lib/export-transactions.ts`, add this exported constant right after the `TransactionExportRow` type:

```ts
export const TRANSACTION_EXPORT_COLUMNS: (keyof TransactionExportRow)[] = [
  "date",
  "type",
  "amountMajorUnits",
  "currency",
  "account",
  "destinationAccount",
  "category",
  "description",
  "notes",
];
```

- [ ] **Step 6: Update the transactions route to pass columns explicitly**

In `src/app/api/export/transactions/route.ts`, change the import:
```ts
import { buildTransactionExportRows, TRANSACTION_EXPORT_COLUMNS } from "@/lib/export-transactions";
```
and change:
```ts
  const body: BodyInit =
    format === "csv" ? toCsv(rows) : format === "json" ? toJson(rows) : new Uint8Array(await toXlsx(rows));
```
to:
```ts
  const body: BodyInit =
    format === "csv"
      ? toCsv(TRANSACTION_EXPORT_COLUMNS, rows)
      : format === "json"
        ? toJson(rows)
        : new Uint8Array(await toXlsx("Transactions", TRANSACTION_EXPORT_COLUMNS, rows));
```

- [ ] **Step 7: Run the full suite, typecheck, and build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all pass; the transactions export route's actual output is byte-for-byte unchanged (same columns, same sheet name).

- [ ] **Step 8: Commit**

```bash
git add src/lib/export-format.ts src/lib/export-format.test.ts src/lib/export-transactions.ts src/app/api/export/transactions/route.ts
git commit -m "refactor(export): generalize toCsv/toXlsx to take an explicit columns list (plan-26 prep)"
```

---

## Task 2: Year Plan export (assumptions + linked vacation-reserve goal)

**Files:**
- Create: `src/lib/export-year-plan.ts`
- Test: `src/lib/export-year-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-year-plan.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildYearPlanExportRows, YEAR_PLAN_EXPORT_COLUMNS } from "@/lib/export-year-plan";

function makeFakePrisma(plans: unknown[]) {
  return {
    yearPlan: { findMany: vi.fn().mockResolvedValue(plans) },
  } as any;
}

describe("buildYearPlanExportRows", () => {
  it("maps each plan's assumptions and linked vacation-reserve goal into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        id: "plan-1",
        name: "2026 trip home",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        minCashBuffer: 500000,
        scenario: "EXPECTED",
        vacationReserveGoal: { targetAmount: 2000000, assignedAmount: 800000 },
      },
    ]);

    const rows = await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        name: "2026 trip home",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        minCashBufferMajorUnits: 5000,
        scenario: "EXPECTED",
        currency: "PHP",
        vacationReserveTargetMajorUnits: 20000,
        vacationReserveAssignedMajorUnits: 8000,
      },
    ]);
  });

  it("renders vacation-reserve fields as null when no goal is linked", async () => {
    const prisma = makeFakePrisma([
      {
        id: "plan-1",
        name: "No goal yet",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        minCashBuffer: 0,
        scenario: "EXPECTED",
        vacationReserveGoal: null,
      },
    ]);

    const rows = await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(rows[0].vacationReserveTargetMajorUnits).toBeNull();
    expect(rows[0].vacationReserveAssignedMajorUnits).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(prisma.yearPlan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { vacationReserveGoal: true },
      orderBy: { startDate: "asc" },
    });
  });

  it("exports the exact column order expected by CSV/XLSX", () => {
    expect(YEAR_PLAN_EXPORT_COLUMNS).toEqual([
      "name",
      "startDate",
      "endDate",
      "minCashBufferMajorUnits",
      "scenario",
      "currency",
      "vacationReserveTargetMajorUnits",
      "vacationReserveAssignedMajorUnits",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-year-plan.test.ts`
Expected: FAIL — `Cannot find module '@/lib/export-year-plan'`.

- [ ] **Step 3: Implement**

Create `src/lib/export-year-plan.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type YearPlanExportRow = {
  name: string;
  startDate: string;
  endDate: string;
  minCashBufferMajorUnits: number;
  scenario: string;
  currency: string;
  vacationReserveTargetMajorUnits: number | null;
  vacationReserveAssignedMajorUnits: number | null;
};

export const YEAR_PLAN_EXPORT_COLUMNS: (keyof YearPlanExportRow)[] = [
  "name",
  "startDate",
  "endDate",
  "minCashBufferMajorUnits",
  "scenario",
  "currency",
  "vacationReserveTargetMajorUnits",
  "vacationReserveAssignedMajorUnits",
];

export async function buildYearPlanExportRows(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  currency: string,
): Promise<YearPlanExportRow[]> {
  const plans = await prisma.yearPlan.findMany({
    where: { userId },
    include: { vacationReserveGoal: true },
    orderBy: { startDate: "asc" },
  });

  return (
    plans as unknown as {
      name: string;
      startDate: Date;
      endDate: Date;
      minCashBuffer: number;
      scenario: string;
      vacationReserveGoal: { targetAmount: number | null; assignedAmount: number } | null;
    }[]
  ).map((plan) => ({
    name: plan.name,
    startDate: formatDateLocal(plan.startDate),
    endDate: formatDateLocal(plan.endDate),
    minCashBufferMajorUnits: toMajorUnits(plan.minCashBuffer, currency),
    scenario: plan.scenario,
    currency,
    vacationReserveTargetMajorUnits:
      plan.vacationReserveGoal?.targetAmount != null
        ? toMajorUnits(plan.vacationReserveGoal.targetAmount, currency)
        : null,
    vacationReserveAssignedMajorUnits: plan.vacationReserveGoal
      ? toMajorUnits(plan.vacationReserveGoal.assignedAmount, currency)
      : null,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-year-plan.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-year-plan.ts src/lib/export-year-plan.test.ts
git commit -m "feat(export): add Year Plan export row-builder (plan-26)"
```

---

## Task 3: Year Plan phases export

**Files:**
- Create: `src/lib/export-year-plan-phases.ts`
- Test: `src/lib/export-year-plan-phases.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-year-plan-phases.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildYearPlanPhaseExportRows, YEAR_PLAN_PHASE_EXPORT_COLUMNS } from "@/lib/export-year-plan-phases";

function makeFakePrisma(phases: unknown[]) {
  return {
    yearPlanPhase: { findMany: vi.fn().mockResolvedValue(phases) },
  } as any;
}

describe("buildYearPlanPhaseExportRows", () => {
  it("maps each phase into a flat row, joined with its plan's name", async () => {
    const prisma = makeFakePrisma([
      {
        phaseType: "SOLO_FIELD",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 5, 30),
        label: "Deployment",
        estimatedExpensesPerCutoff: 250000,
        yearPlan: { name: "2026 trip home" },
      },
    ]);

    const rows = await buildYearPlanPhaseExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        yearPlanName: "2026 trip home",
        phaseType: "SOLO_FIELD",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        label: "Deployment",
        estimatedExpensesPerCutoffMajorUnits: 2500,
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildYearPlanPhaseExportRows(prisma, "user-1", "PHP");

    expect(prisma.yearPlanPhase.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { yearPlan: true },
      orderBy: { startDate: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-year-plan-phases.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-year-plan-phases.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type YearPlanPhaseExportRow = {
  yearPlanName: string;
  phaseType: string;
  startDate: string;
  endDate: string;
  label: string | null;
  estimatedExpensesPerCutoffMajorUnits: number;
  currency: string;
};

export const YEAR_PLAN_PHASE_EXPORT_COLUMNS: (keyof YearPlanPhaseExportRow)[] = [
  "yearPlanName",
  "phaseType",
  "startDate",
  "endDate",
  "label",
  "estimatedExpensesPerCutoffMajorUnits",
  "currency",
];

export async function buildYearPlanPhaseExportRows(
  prisma: Pick<PrismaClient, "yearPlanPhase">,
  userId: string,
  currency: string,
): Promise<YearPlanPhaseExportRow[]> {
  const phases = await prisma.yearPlanPhase.findMany({
    where: { userId },
    include: { yearPlan: true },
    orderBy: { startDate: "asc" },
  });

  return (
    phases as unknown as {
      phaseType: string;
      startDate: Date;
      endDate: Date;
      label: string | null;
      estimatedExpensesPerCutoff: number;
      yearPlan: { name: string };
    }[]
  ).map((phase) => ({
    yearPlanName: phase.yearPlan.name,
    phaseType: phase.phaseType,
    startDate: formatDateLocal(phase.startDate),
    endDate: formatDateLocal(phase.endDate),
    label: phase.label,
    estimatedExpensesPerCutoffMajorUnits: toMajorUnits(phase.estimatedExpensesPerCutoff, currency),
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-year-plan-phases.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-year-plan-phases.ts src/lib/export-year-plan-phases.test.ts
git commit -m "feat(export): add Year Plan phases export row-builder (plan-26)"
```

---

## Task 4: Income forecasts export

**Files:**
- Create: `src/lib/export-income-forecasts.ts`
- Test: `src/lib/export-income-forecasts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-income-forecasts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildIncomeForecastExportRows, INCOME_FORECAST_EXPORT_COLUMNS } from "@/lib/export-income-forecasts";

function makeFakePrisma(forecasts: unknown[]) {
  return {
    incomeForecast: { findMany: vi.fn().mockResolvedValue(forecasts) },
  } as any;
}

describe("buildIncomeForecastExportRows", () => {
  it("maps each forecast into a flat row, joined with its plan's name", async () => {
    const prisma = makeFakePrisma([
      {
        source: "Salary",
        expectedDate: new Date(2026, 2, 15),
        expectedAmount: 5000000,
        cutoffLabel: "March 1-15",
        status: "EXPECTED",
        notes: null,
        yearPlan: { name: "2026 trip home" },
      },
    ]);

    const rows = await buildIncomeForecastExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        yearPlanName: "2026 trip home",
        source: "Salary",
        expectedDate: "2026-03-15",
        expectedAmountMajorUnits: 50000,
        cutoffLabel: "March 1-15",
        status: "EXPECTED",
        notes: null,
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildIncomeForecastExportRows(prisma, "user-1", "PHP");

    expect(prisma.incomeForecast.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { yearPlan: true },
      orderBy: { expectedDate: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-income-forecasts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-income-forecasts.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type IncomeForecastExportRow = {
  yearPlanName: string;
  source: string;
  expectedDate: string;
  expectedAmountMajorUnits: number;
  cutoffLabel: string;
  status: string;
  notes: string | null;
  currency: string;
};

export const INCOME_FORECAST_EXPORT_COLUMNS: (keyof IncomeForecastExportRow)[] = [
  "yearPlanName",
  "source",
  "expectedDate",
  "expectedAmountMajorUnits",
  "cutoffLabel",
  "status",
  "notes",
  "currency",
];

export async function buildIncomeForecastExportRows(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  currency: string,
): Promise<IncomeForecastExportRow[]> {
  const forecasts = await prisma.incomeForecast.findMany({
    where: { userId },
    include: { yearPlan: true },
    orderBy: { expectedDate: "asc" },
  });

  return (
    forecasts as unknown as {
      source: string;
      expectedDate: Date;
      expectedAmount: number;
      cutoffLabel: string;
      status: string;
      notes: string | null;
      yearPlan: { name: string };
    }[]
  ).map((forecast) => ({
    yearPlanName: forecast.yearPlan.name,
    source: forecast.source,
    expectedDate: formatDateLocal(forecast.expectedDate),
    expectedAmountMajorUnits: toMajorUnits(forecast.expectedAmount, currency),
    cutoffLabel: forecast.cutoffLabel,
    status: forecast.status,
    notes: forecast.notes,
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-income-forecasts.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-income-forecasts.ts src/lib/export-income-forecasts.test.ts
git commit -m "feat(export): add Income Forecasts export row-builder (plan-26)"
```

---

## Task 5: Shopping catalog export

**Files:**
- Create: `src/lib/export-shopping-catalog.ts`
- Test: `src/lib/export-shopping-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-shopping-catalog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildCatalogExportRows, SHOPPING_CATALOG_EXPORT_COLUMNS } from "@/lib/export-shopping-catalog";

function makeFakePrisma(items: unknown[]) {
  return {
    shoppingCatalogItem: { findMany: vi.fn().mockResolvedValue(items) },
  } as any;
}

describe("buildCatalogExportRows", () => {
  it("maps each catalog item into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        canonicalName: "Nestle Chocolate Milk",
        brand: "Nestle",
        size: "1L",
        unit: "carton",
        defaultQuantity: 2,
        isFavorite: true,
        category: { name: "Groceries" },
        store: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildCatalogExportRows(prisma, "user-1");

    expect(rows).toEqual([
      {
        canonicalName: "Nestle Chocolate Milk",
        brand: "Nestle",
        size: "1L",
        unit: "carton",
        defaultQuantity: 2,
        isFavorite: true,
        category: "Groceries",
        preferredStore: "SM Supermarket",
      },
    ]);
  });

  it("excludes archived items and scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildCatalogExportRows(prisma, "user-1");

    expect(prisma.shoppingCatalogItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { category: true, store: true },
      orderBy: { canonicalName: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-shopping-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-shopping-catalog.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export type CatalogExportRow = {
  canonicalName: string;
  brand: string | null;
  size: string | null;
  unit: string | null;
  defaultQuantity: number;
  isFavorite: boolean;
  category: string | null;
  preferredStore: string | null;
};

export const SHOPPING_CATALOG_EXPORT_COLUMNS: (keyof CatalogExportRow)[] = [
  "canonicalName",
  "brand",
  "size",
  "unit",
  "defaultQuantity",
  "isFavorite",
  "category",
  "preferredStore",
];

export async function buildCatalogExportRows(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
): Promise<CatalogExportRow[]> {
  const items = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    include: { category: true, store: true },
    orderBy: { canonicalName: "asc" },
  });

  return (
    items as unknown as {
      canonicalName: string;
      brand: string | null;
      size: string | null;
      unit: string | null;
      defaultQuantity: number;
      isFavorite: boolean;
      category: { name: string } | null;
      store: { name: string } | null;
    }[]
  ).map((item) => ({
    canonicalName: item.canonicalName,
    brand: item.brand,
    size: item.size,
    unit: item.unit,
    defaultQuantity: item.defaultQuantity,
    isFavorite: item.isFavorite,
    category: item.category?.name ?? null,
    preferredStore: item.store?.name ?? null,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-shopping-catalog.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-shopping-catalog.ts src/lib/export-shopping-catalog.test.ts
git commit -m "feat(export): add Shopping Catalog export row-builder (plan-26)"
```

---

## Task 6: Shopping lists export (one row per list item)

**Files:**
- Create: `src/lib/export-shopping-lists.ts`
- Test: `src/lib/export-shopping-lists.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-shopping-lists.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildShoppingExportRows, SHOPPING_LIST_EXPORT_COLUMNS } from "@/lib/export-shopping-lists";

function makeFakePrisma(items: unknown[]) {
  return {
    shoppingListItem: { findMany: vi.fn().mockResolvedValue(items) },
  } as any;
}

describe("buildShoppingExportRows", () => {
  it("maps each list item into a flat row, joined with its list's name", async () => {
    const prisma = makeFakePrisma([
      {
        freeTextName: null,
        quantity: 2,
        unit: "carton",
        estimatedUnitPrice: 15000,
        priority: "NORMAL",
        isSelected: true,
        isPurchased: false,
        notes: null,
        list: { name: "This week", plannedDate: new Date(2026, 8, 20) },
        catalogItem: { canonicalName: "Nestle Chocolate Milk" },
        preferredStore: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        listName: "This week",
        plannedDate: "2026-09-20",
        itemName: "Nestle Chocolate Milk",
        quantity: 2,
        unit: "carton",
        estimatedUnitPriceMajorUnits: 150,
        preferredStore: "SM Supermarket",
        priority: "NORMAL",
        isSelected: true,
        isPurchased: false,
        notes: null,
        currency: "PHP",
      },
    ]);
  });

  it("falls back to freeTextName when no catalog item is linked", async () => {
    const prisma = makeFakePrisma([
      {
        freeTextName: "Random snack",
        quantity: 1,
        unit: null,
        estimatedUnitPrice: null,
        priority: "NORMAL",
        isSelected: false,
        isPurchased: false,
        notes: null,
        list: { name: "This week", plannedDate: null },
        catalogItem: null,
        preferredStore: null,
      },
    ]);

    const rows = await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(rows[0].itemName).toBe("Random snack");
    expect(rows[0].estimatedUnitPriceMajorUnits).toBeNull();
    expect(rows[0].plannedDate).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(prisma.shoppingListItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { list: true, catalogItem: true, preferredStore: true },
      orderBy: [{ list: { createdAt: "desc" } }, { sortOrder: "asc" }],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-shopping-lists.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-shopping-lists.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ShoppingListExportRow = {
  listName: string;
  plannedDate: string | null;
  itemName: string;
  quantity: number;
  unit: string | null;
  estimatedUnitPriceMajorUnits: number | null;
  preferredStore: string | null;
  priority: string;
  isSelected: boolean;
  isPurchased: boolean;
  notes: string | null;
  currency: string;
};

export const SHOPPING_LIST_EXPORT_COLUMNS: (keyof ShoppingListExportRow)[] = [
  "listName",
  "plannedDate",
  "itemName",
  "quantity",
  "unit",
  "estimatedUnitPriceMajorUnits",
  "preferredStore",
  "priority",
  "isSelected",
  "isPurchased",
  "notes",
  "currency",
];

export async function buildShoppingExportRows(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  currency: string,
): Promise<ShoppingListExportRow[]> {
  const items = await prisma.shoppingListItem.findMany({
    where: { userId },
    include: { list: true, catalogItem: true, preferredStore: true },
    orderBy: [{ list: { createdAt: "desc" } }, { sortOrder: "asc" }],
  });

  return (
    items as unknown as {
      freeTextName: string | null;
      quantity: number;
      unit: string | null;
      estimatedUnitPrice: number | null;
      priority: string;
      isSelected: boolean;
      isPurchased: boolean;
      notes: string | null;
      list: { name: string; plannedDate: Date | null };
      catalogItem: { canonicalName: string } | null;
      preferredStore: { name: string } | null;
    }[]
  ).map((item) => ({
    listName: item.list.name,
    plannedDate: item.list.plannedDate ? formatDateLocal(item.list.plannedDate) : null,
    itemName: item.catalogItem?.canonicalName ?? item.freeTextName ?? "",
    quantity: item.quantity,
    unit: item.unit,
    estimatedUnitPriceMajorUnits:
      item.estimatedUnitPrice !== null ? toMajorUnits(item.estimatedUnitPrice, currency) : null,
    preferredStore: item.preferredStore?.name ?? null,
    priority: item.priority,
    isSelected: item.isSelected,
    isPurchased: item.isPurchased,
    notes: item.notes,
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-shopping-lists.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-shopping-lists.ts src/lib/export-shopping-lists.test.ts
git commit -m "feat(export): add Shopping Lists export row-builder (plan-26)"
```

---

## Task 7: Shopping price-history export

**Files:**
- Create: `src/lib/export-price-history.ts`
- Test: `src/lib/export-price-history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-price-history.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildPriceHistoryExportRows, PRICE_HISTORY_EXPORT_COLUMNS } from "@/lib/export-price-history";

function makeFakePrisma(rows: unknown[]) {
  return {
    shoppingPriceHistory: { findMany: vi.fn().mockResolvedValue(rows) },
  } as any;
}

describe("buildPriceHistoryExportRows", () => {
  it("maps each price-history row into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        unitPrice: 15000,
        confirmedAt: new Date(2026, 8, 1),
        source: "RECEIPT",
        catalogItem: { canonicalName: "Nestle Chocolate Milk" },
        store: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildPriceHistoryExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        itemName: "Nestle Chocolate Milk",
        store: "SM Supermarket",
        unitPriceMajorUnits: 150,
        confirmedAt: "2026-09-01",
        source: "RECEIPT",
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildPriceHistoryExportRows(prisma, "user-1", "PHP");

    expect(prisma.shoppingPriceHistory.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { catalogItem: true, store: true },
      orderBy: { confirmedAt: "desc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-price-history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-price-history.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type PriceHistoryExportRow = {
  itemName: string;
  store: string | null;
  unitPriceMajorUnits: number;
  confirmedAt: string;
  source: string;
  currency: string;
};

export const PRICE_HISTORY_EXPORT_COLUMNS: (keyof PriceHistoryExportRow)[] = [
  "itemName",
  "store",
  "unitPriceMajorUnits",
  "confirmedAt",
  "source",
  "currency",
];

export async function buildPriceHistoryExportRows(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  currency: string,
): Promise<PriceHistoryExportRow[]> {
  const rows = await prisma.shoppingPriceHistory.findMany({
    where: { userId },
    include: { catalogItem: true, store: true },
    orderBy: { confirmedAt: "desc" },
  });

  return (
    rows as unknown as {
      unitPrice: number;
      confirmedAt: Date;
      source: string;
      catalogItem: { canonicalName: string };
      store: { name: string } | null;
    }[]
  ).map((row) => ({
    itemName: row.catalogItem.canonicalName,
    store: row.store?.name ?? null,
    unitPriceMajorUnits: toMajorUnits(row.unitPrice, currency),
    confirmedAt: formatDateLocal(row.confirmedAt),
    source: row.source,
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-price-history.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-price-history.ts src/lib/export-price-history.test.ts
git commit -m "feat(export): add Shopping Price History export row-builder (plan-26)"
```

---

## Task 8: Receipts ("purchases") export — one row per receipt line

**Files:**
- Create: `src/lib/export-receipts.ts`
- Test: `src/lib/export-receipts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-receipts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildPurchaseExportRows, RECEIPT_EXPORT_COLUMNS } from "@/lib/export-receipts";

function makeFakePrisma(lines: unknown[]) {
  return {
    receiptLine: { findMany: vi.fn().mockResolvedValue(lines) },
  } as any;
}

describe("buildPurchaseExportRows", () => {
  it("maps each receipt line into a flat row, joined with its receipt's store/date/status", async () => {
    const prisma = makeFakePrisma([
      {
        name: "Milk",
        quantity: 1,
        unitPrice: 15000,
        lineTotal: 15000,
        excluded: false,
        receipt: {
          purchaseDate: new Date(2026, 8, 1),
          status: "CONFIRMED",
          store: { name: "SM Supermarket" },
        },
      },
    ]);

    const rows = await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        purchaseDate: "2026-09-01",
        store: "SM Supermarket",
        status: "CONFIRMED",
        itemName: "Milk",
        quantity: 1,
        unitPriceMajorUnits: 150,
        lineTotalMajorUnits: 150,
        excluded: false,
        currency: "PHP",
      },
    ]);
  });

  it("renders a null purchaseDate/unitPrice as null, not a crash", async () => {
    const prisma = makeFakePrisma([
      {
        name: "Unpriced item",
        quantity: 1,
        unitPrice: null,
        lineTotal: 0,
        excluded: false,
        receipt: { purchaseDate: null, status: "DRAFT", store: null },
      },
    ]);

    const rows = await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(rows[0].purchaseDate).toBeNull();
    expect(rows[0].unitPriceMajorUnits).toBeNull();
    expect(rows[0].store).toBeNull();
  });

  it("scopes to the given user — image bytes/objectKeys are never included (images aren't queried at all)", async () => {
    const prisma = makeFakePrisma([]);

    await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(prisma.receiptLine.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { receipt: { include: { store: true } } },
      orderBy: { receipt: { purchaseDate: "desc" } },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-receipts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-receipts.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ReceiptExportRow = {
  purchaseDate: string | null;
  store: string | null;
  status: string;
  itemName: string;
  quantity: number;
  unitPriceMajorUnits: number | null;
  lineTotalMajorUnits: number;
  excluded: boolean;
  currency: string;
};

export const RECEIPT_EXPORT_COLUMNS: (keyof ReceiptExportRow)[] = [
  "purchaseDate",
  "store",
  "status",
  "itemName",
  "quantity",
  "unitPriceMajorUnits",
  "lineTotalMajorUnits",
  "excluded",
  "currency",
];

// Deliberately never touches ReceiptImage — a receipt's images are
// represented only by their objectKey pointer, and only in the JSON full
// backup (src/lib/export-backup.ts), never here and never as bytes.
export async function buildPurchaseExportRows(
  prisma: Pick<PrismaClient, "receiptLine">,
  userId: string,
  currency: string,
): Promise<ReceiptExportRow[]> {
  const lines = await prisma.receiptLine.findMany({
    where: { userId },
    include: { receipt: { include: { store: true } } },
    orderBy: { receipt: { purchaseDate: "desc" } },
  });

  return (
    lines as unknown as {
      name: string;
      quantity: number;
      unitPrice: number | null;
      lineTotal: number;
      excluded: boolean;
      receipt: { purchaseDate: Date | null; status: string; store: { name: string } | null };
    }[]
  ).map((line) => ({
    purchaseDate: line.receipt.purchaseDate ? formatDateLocal(line.receipt.purchaseDate) : null,
    store: line.receipt.store?.name ?? null,
    status: line.receipt.status,
    itemName: line.name,
    quantity: line.quantity,
    unitPriceMajorUnits: line.unitPrice !== null ? toMajorUnits(line.unitPrice, currency) : null,
    lineTotalMajorUnits: toMajorUnits(line.lineTotal, currency),
    excluded: line.excluded,
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-receipts.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-receipts.ts src/lib/export-receipts.test.ts
git commit -m "feat(export): add Receipts (Purchases) export row-builder (plan-26)"
```

---

## Task 9: Custom reminders export

**Files:**
- Create: `src/lib/export-custom-reminders.ts`
- Test: `src/lib/export-custom-reminders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-custom-reminders.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildCustomReminderExportRows, CUSTOM_REMINDER_EXPORT_COLUMNS } from "@/lib/export-custom-reminders";

function makeFakePrisma(reminders: unknown[]) {
  return {
    customReminder: { findMany: vi.fn().mockResolvedValue(reminders) },
  } as any;
}

describe("buildCustomReminderExportRows", () => {
  it("maps each reminder into a flat row", async () => {
    const prisma = makeFakePrisma([
      { label: "Passport renewal", date: new Date(2026, 5, 1), amount: 500000, state: "UPCOMING" },
    ]);

    const rows = await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        label: "Passport renewal",
        date: "2026-06-01",
        amountMajorUnits: 5000,
        state: "UPCOMING",
        currency: "PHP",
      },
    ]);
  });

  it("renders a null amount as null", async () => {
    const prisma = makeFakePrisma([
      { label: "Renew license", date: new Date(2026, 5, 1), amount: null, state: "UPCOMING" },
    ]);

    const rows = await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(rows[0].amountMajorUnits).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(prisma.customReminder.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { date: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-custom-reminders.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export-custom-reminders.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type CustomReminderExportRow = {
  label: string;
  date: string;
  amountMajorUnits: number | null;
  state: string;
  currency: string;
};

export const CUSTOM_REMINDER_EXPORT_COLUMNS: (keyof CustomReminderExportRow)[] = [
  "label",
  "date",
  "amountMajorUnits",
  "state",
  "currency",
];

export async function buildCustomReminderExportRows(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  currency: string,
): Promise<CustomReminderExportRow[]> {
  const reminders = await prisma.customReminder.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  return (
    reminders as unknown as { label: string; date: Date; amount: number | null; state: string }[]
  ).map((reminder) => ({
    label: reminder.label,
    date: formatDateLocal(reminder.date),
    amountMajorUnits: reminder.amount !== null ? toMajorUnits(reminder.amount, currency) : null,
    state: reminder.state,
    currency,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-custom-reminders.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-custom-reminders.ts src/lib/export-custom-reminders.test.ts
git commit -m "feat(export): add Custom Reminders export row-builder (plan-26)"
```

---

## Task 10: `/api/export/[kind]/route.ts` — the parameterized route for the 8 new kinds

**Files:**
- Create: `src/lib/export-kinds.ts`
- Test: `src/lib/export-kinds.test.ts`
- Create: `src/app/api/export/[kind]/route.ts`

Centralize the "kind → builder + columns + sheet name" mapping in one small registry file, so the route itself stays a thin dispatcher (same shape as the existing transactions route).

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-kinds.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EXPORT_KINDS, getExportKind } from "@/lib/export-kinds";

describe("EXPORT_KINDS", () => {
  it("has an entry for every new export kind", () => {
    expect(Object.keys(EXPORT_KINDS).sort()).toEqual(
      [
        "custom-reminders",
        "income-forecasts",
        "price-history",
        "receipts",
        "shopping-catalog",
        "shopping-lists",
        "year-plan",
        "year-plan-phases",
      ].sort(),
    );
  });
});

describe("getExportKind", () => {
  it("returns the registry entry for a known kind", () => {
    expect(getExportKind("year-plan")).toBe(EXPORT_KINDS["year-plan"]);
  });

  it("returns undefined for an unknown kind", () => {
    expect(getExportKind("not-a-real-kind")).toBeUndefined();
  });

  it("every entry's build function is callable with a matching fake prisma (smoke test)", async () => {
    for (const kind of Object.values(EXPORT_KINDS)) {
      const fakePrisma = new Proxy(
        {},
        { get: () => ({ findMany: vi.fn().mockResolvedValue([]) }) },
      );
      const rows = await kind.build(fakePrisma as any, "user-1", "PHP");
      expect(rows).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-kinds.test.ts`
Expected: FAIL — `Cannot find module '@/lib/export-kinds'`.

- [ ] **Step 3: Implement**

Create `src/lib/export-kinds.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { buildYearPlanExportRows, YEAR_PLAN_EXPORT_COLUMNS } from "@/lib/export-year-plan";
import { buildYearPlanPhaseExportRows, YEAR_PLAN_PHASE_EXPORT_COLUMNS } from "@/lib/export-year-plan-phases";
import { buildIncomeForecastExportRows, INCOME_FORECAST_EXPORT_COLUMNS } from "@/lib/export-income-forecasts";
import { buildCatalogExportRows, SHOPPING_CATALOG_EXPORT_COLUMNS } from "@/lib/export-shopping-catalog";
import { buildShoppingExportRows, SHOPPING_LIST_EXPORT_COLUMNS } from "@/lib/export-shopping-lists";
import { buildPriceHistoryExportRows, PRICE_HISTORY_EXPORT_COLUMNS } from "@/lib/export-price-history";
import { buildPurchaseExportRows, RECEIPT_EXPORT_COLUMNS } from "@/lib/export-receipts";
import { buildCustomReminderExportRows, CUSTOM_REMINDER_EXPORT_COLUMNS } from "@/lib/export-custom-reminders";

export type ExportKindEntry = {
  sheetName: string;
  columns: string[];
  // Every builder takes (prisma, userId, currency) — buildCatalogExportRows
  // is the one exception (no money fields), so it's wrapped to match the
  // same shape and just ignores the currency argument.
  build: (prisma: PrismaClient, userId: string, currency: string) => Promise<Record<string, unknown>[]>;
};

export const EXPORT_KINDS: Record<string, ExportKindEntry> = {
  "year-plan": {
    sheetName: "Year Plan",
    columns: YEAR_PLAN_EXPORT_COLUMNS,
    build: buildYearPlanExportRows,
  },
  "year-plan-phases": {
    sheetName: "Year Plan Phases",
    columns: YEAR_PLAN_PHASE_EXPORT_COLUMNS,
    build: buildYearPlanPhaseExportRows,
  },
  "income-forecasts": {
    sheetName: "Income Forecasts",
    columns: INCOME_FORECAST_EXPORT_COLUMNS,
    build: buildIncomeForecastExportRows,
  },
  "shopping-catalog": {
    sheetName: "Shopping Catalog",
    columns: SHOPPING_CATALOG_EXPORT_COLUMNS,
    build: (prisma, userId) => buildCatalogExportRows(prisma, userId),
  },
  "shopping-lists": {
    sheetName: "Shopping Lists",
    columns: SHOPPING_LIST_EXPORT_COLUMNS,
    build: buildShoppingExportRows,
  },
  "price-history": {
    sheetName: "Price History",
    columns: PRICE_HISTORY_EXPORT_COLUMNS,
    build: buildPriceHistoryExportRows,
  },
  receipts: {
    sheetName: "Receipts",
    columns: RECEIPT_EXPORT_COLUMNS,
    build: buildPurchaseExportRows,
  },
  "custom-reminders": {
    sheetName: "Custom Reminders",
    columns: CUSTOM_REMINDER_EXPORT_COLUMNS,
    build: buildCustomReminderExportRows,
  },
};

export function getExportKind(kind: string): ExportKindEntry | undefined {
  return EXPORT_KINDS[kind];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-kinds.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Create the route**

Create `src/app/api/export/[kind]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExportKind } from "@/lib/export-kinds";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind } = await params;
  const entry = getExportKind(kind);
  if (!entry) {
    return NextResponse.json({ error: "Unknown export kind" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "";
  if (!["csv", "json", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const rows = await entry.build(prisma, user.id, user.currency);

  const body: BodyInit =
    format === "csv"
      ? toCsv(entry.columns, rows)
      : format === "json"
        ? toJson(rows)
        : new Uint8Array(await toXlsx(entry.sheetName, entry.columns, rows));

  return new NextResponse(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${kind}.${format}"`,
    },
  });
}
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: no errors; the build's route list includes `/api/export/[kind]`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export-kinds.ts src/lib/export-kinds.test.ts "src/app/api/export/[kind]/route.ts"
git commit -m "feat(export): add the parameterized /api/export/[kind] route (plan-26)"
```

---

## Task 11: Combined JSON full-backup export

**Files:**
- Create: `src/lib/export-backup.ts`
- Test: `src/lib/export-backup.test.ts`
- Create: `src/app/api/export/backup/route.ts`

The backup keeps every foreign key as its raw id (never resolving to a display name) so relationships stay intact and the file is, in principle, re-importable — unlike the per-kind CSV/XLSX/JSON exports above, which resolve ids to display names for readability.

- [ ] **Step 1: Write the failing test**

Create `src/lib/export-backup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildFullBackup } from "@/lib/export-backup";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const empty = { findMany: vi.fn().mockResolvedValue([]) };
  return {
    transaction: empty,
    yearPlan: empty,
    yearPlanPhase: empty,
    incomeForecast: empty,
    shoppingCatalogItem: empty,
    shoppingList: empty,
    shoppingListItem: empty,
    shoppingPriceHistory: empty,
    receipt: empty,
    receiptLine: empty,
    receiptImage: empty,
    customReminder: empty,
    ...overrides,
  } as any;
}

describe("buildFullBackup", () => {
  it("queries every included model scoped to the user, and returns one key per model", async () => {
    const prisma = makeFakePrisma();

    const backup = await buildFullBackup(prisma, "user-1");

    expect(Object.keys(backup).sort()).toEqual(
      [
        "transactions",
        "yearPlans",
        "yearPlanPhases",
        "incomeForecasts",
        "shoppingCatalogItems",
        "shoppingLists",
        "shoppingListItems",
        "shoppingPriceHistory",
        "receipts",
        "receiptLines",
        "receiptImages",
        "customReminders",
      ].sort(),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.receiptImage.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("includes a receipt image's objectKey but the shape has no field for image bytes", async () => {
    const prisma = makeFakePrisma({
      receiptImage: {
        findMany: vi.fn().mockResolvedValue([{ id: "img-1", receiptId: "receipt-1", objectKey: "receipts/a.jpg" }]),
      },
    });

    const backup = await buildFullBackup(prisma, "user-1");

    expect(backup.receiptImages).toEqual([{ id: "img-1", receiptId: "receipt-1", objectKey: "receipts/a.jpg" }]);
  });

  it("preserves relationships as raw ids (does not resolve a transaction's accountId to a name)", async () => {
    const prisma = makeFakePrisma({
      transaction: {
        findMany: vi.fn().mockResolvedValue([{ id: "txn-1", accountId: "acc-1", categoryId: "cat-1", amount: -500 }]),
      },
    });

    const backup = await buildFullBackup(prisma, "user-1");

    expect(backup.transactions).toEqual([{ id: "txn-1", accountId: "acc-1", categoryId: "cat-1", amount: -500 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/export-backup.test.ts`
Expected: FAIL — `Cannot find module '@/lib/export-backup'`.

- [ ] **Step 3: Implement**

Create `src/lib/export-backup.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export type FullBackup = {
  transactions: unknown[];
  yearPlans: unknown[];
  yearPlanPhases: unknown[];
  incomeForecasts: unknown[];
  shoppingCatalogItems: unknown[];
  shoppingLists: unknown[];
  shoppingListItems: unknown[];
  shoppingPriceHistory: unknown[];
  receipts: unknown[];
  receiptLines: unknown[];
  receiptImages: unknown[];
  customReminders: unknown[];
};

// Every list is the model's raw rows, scoped to the user — every foreign
// key (accountId, categoryId, catalogItemId, receiptId, ...) is left as
// the id it already is, exactly matching how the schema itself relates
// these rows, so the file can in principle be re-imported later.
export async function buildFullBackup(
  prisma: Pick<
    PrismaClient,
    | "transaction"
    | "yearPlan"
    | "yearPlanPhase"
    | "incomeForecast"
    | "shoppingCatalogItem"
    | "shoppingList"
    | "shoppingListItem"
    | "shoppingPriceHistory"
    | "receipt"
    | "receiptLine"
    | "receiptImage"
    | "customReminder"
  >,
  userId: string,
): Promise<FullBackup> {
  const where = { where: { userId } };

  const [
    transactions,
    yearPlans,
    yearPlanPhases,
    incomeForecasts,
    shoppingCatalogItems,
    shoppingLists,
    shoppingListItems,
    shoppingPriceHistory,
    receipts,
    receiptLines,
    receiptImages,
    customReminders,
  ] = await Promise.all([
    prisma.transaction.findMany(where),
    prisma.yearPlan.findMany(where),
    prisma.yearPlanPhase.findMany(where),
    prisma.incomeForecast.findMany(where),
    prisma.shoppingCatalogItem.findMany(where),
    prisma.shoppingList.findMany(where),
    prisma.shoppingListItem.findMany(where),
    prisma.shoppingPriceHistory.findMany(where),
    prisma.receipt.findMany(where),
    prisma.receiptLine.findMany(where),
    prisma.receiptImage.findMany(where),
    prisma.customReminder.findMany(where),
  ]);

  return {
    transactions,
    yearPlans,
    yearPlanPhases,
    incomeForecasts,
    shoppingCatalogItems,
    shoppingLists,
    shoppingListItems,
    shoppingPriceHistory,
    receipts,
    receiptLines,
    receiptImages,
    customReminders,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/export-backup.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Create the route**

Create `src/app/api/export/backup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildFullBackup } from "@/lib/export-backup";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backup = await buildFullBackup(prisma, session.user.id);

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="backup.json"',
    },
  });
}
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: no errors; the build's route list includes `/api/export/backup`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export-backup.ts src/lib/export-backup.test.ts src/app/api/export/backup/route.ts
git commit -m "feat(export): add the combined JSON full-backup export (plan-26)"
```

---

## Task 12: Settings UI — export-kind selector and a full-backup link

**Files:**
- Modify: `src/components/settings/export-settings.tsx`

- [ ] **Step 1: Add a "What to export" selector above the existing format/filter fields**

In `src/components/settings/export-settings.tsx`, the form currently always submits to `/api/export/transactions` — change it to a client component that switches the form's `action` based on the selected kind, since transaction-only filters (account/category/type/date) don't apply to the other kinds.

Replace the whole file:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const EXPORT_KIND_OPTIONS = [
  { value: "transactions", label: "Transactions" },
  { value: "year-plan", label: "Year Plan" },
  { value: "year-plan-phases", label: "Year Plan Phases" },
  { value: "income-forecasts", label: "Income Forecasts" },
  { value: "shopping-catalog", label: "Shopping Catalog" },
  { value: "shopping-lists", label: "Shopping Lists" },
  { value: "price-history", label: "Shopping Price History" },
  { value: "receipts", label: "Receipts" },
  { value: "custom-reminders", label: "Custom Reminders" },
];

export function ExportSettings({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [kind, setKind] = useState("transactions");
  const isTransactions = kind === "transactions";

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action={isTransactions ? "/api/export/transactions" : `/api/export/${kind}`}
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-kind" className="text-sm">
              What to export
            </label>
            <select
              id="export-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            >
              {EXPORT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-format" className="text-sm">
              Format
            </label>
            <select
              id="export-format"
              name="format"
              defaultValue="csv"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="json">JSON</option>
            </select>
          </div>

          {isTransactions && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-type" className="text-sm">
                  Type
                </label>
                <select
                  id="export-type"
                  name="type"
                  defaultValue=""
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                >
                  <option value="">All types</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="REFUND">Refund</option>
                  <option value="CREDIT_CARD_PAYMENT">Credit card payment</option>
                  <option value="LOAN_PAYMENT">Loan payment</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-account" className="text-sm">
                  Account
                </label>
                <select
                  id="export-account"
                  name="accountId"
                  defaultValue=""
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-category" className="text-sm">
                  Category
                </label>
                <select
                  id="export-category"
                  name="categoryId"
                  defaultValue=""
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-date-from" className="text-sm">
                  From
                </label>
                <input
                  id="export-date-from"
                  type="date"
                  name="dateFrom"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-date-to" className="text-sm">
                  To
                </label>
                <input
                  id="export-date-to"
                  type="date"
                  name="dateTo"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
              </div>
            </>
          )}
        </div>

        <Button type="submit" className="self-start">
          Export
        </Button>
      </form>

      <a
        href="/api/export/backup"
        className="self-start text-sm text-muted-foreground underline"
      >
        Download a full backup (JSON, every model, relationships preserved)
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npx eslint src/components/settings/export-settings.tsx && npx vitest run && npx next build`
Expected: no errors, all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/export-settings.tsx
git commit -m "feat(export): add an export-kind selector and full-backup link to Settings (plan-26)"
```

---

## Task 13: Full verification sweep

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes, including all new ones from Tasks 1–12.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: no new errors (any pre-existing unrelated warnings are fine).

- [ ] **Step 4: Production build**

Run: `npx next build`
Expected: succeeds; route list includes `/api/export/[kind]` and `/api/export/backup` alongside the untouched `/api/export/transactions`.

- [ ] **Step 5: No commit for this task** — verification only.
