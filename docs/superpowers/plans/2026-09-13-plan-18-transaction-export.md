# Transaction Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings → Data export of the transaction ledger in CSV, XLSX, and JSON, filterable by date range/account/category/type, always scoped server-side to the authenticated user.

**Architecture:** `listTransactions`'s filter-building logic is extracted into a reusable `buildTransactionWhereClause`. A new `export-transactions.ts` builds readable export rows (resolved account/category names, signed major-unit amounts) from those same filters. A new `export-format.ts` serializes rows to each format. A `GET` route handler wires auth + filters + format together and returns a downloadable file. A plain GET `<form>` in Settings is the only UI — no client JS needed since a `Content-Disposition: attachment` response is a download on its own.

**Tech Stack:** TypeScript, Prisma (mocked in tests), `exceljs` (new dependency) for `.xlsx` generation, Next.js Route Handlers, Vitest.

---

### Task 0: Add the `exceljs` dependency

- [ ] **Step 1: Install**

```bash
npm install exceljs
```

- [ ] **Step 2: Confirm it's in `package.json` and commit the lockfile change**

```bash
git add package.json package-lock.json
git commit -m "chore: add exceljs for XLSX export

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 1: Extract `buildTransactionWhereClause`

**Files:**
- Modify: `src/lib/transactions.ts`

No new test — `listTransactions`'s existing tests in `src/lib/transactions.test.ts` (asserting the exact `where` object passed to `findMany`) already cover this; a pure refactor must keep them passing unchanged.

- [ ] **Step 1: Refactor**

Replace:

```ts
export async function listTransactions(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
) {
  const where: Record<string, unknown> = { userId };

  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.search) where.description = { contains: filters.search };
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return prisma.transaction.findMany({ where, orderBy: { date: "desc" } });
}
```

with:

```ts
export function buildTransactionWhereClause(userId: string, filters: TransactionFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { userId };

  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.search) where.description = { contains: filters.search };
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return where;
}

export async function listTransactions(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
) {
  return prisma.transaction.findMany({
    where: buildTransactionWhereClause(userId, filters),
    orderBy: { date: "desc" },
  });
}
```

- [ ] **Step 2: Run the existing test file to confirm nothing broke**

Run: `npx vitest run src/lib/transactions.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/lib/transactions.ts
git commit -m "refactor(transactions): extract buildTransactionWhereClause

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `export-transactions.ts` — row building

**Files:**
- Create: `src/lib/export-transactions.ts`
- Test: `src/lib/export-transactions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildTransactionExportRows } from "@/lib/export-transactions";

function makeFakePrisma(transactions: unknown[] = []) {
  return {
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
  } as any;
}

describe("buildTransactionExportRows", () => {
  it("queries with the expected where, include, and order", async () => {
    const prisma = makeFakePrisma();
    await buildTransactionExportRows(prisma, "user-1", { accountId: "acc-1" });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", accountId: "acc-1" },
      orderBy: { date: "desc" },
      include: { account: true, destinationAccount: true, category: true },
    });
  });

  it("maps a resolved row to a readable export row", async () => {
    const prisma = makeFakePrisma([
      {
        date: new Date(2026, 8, 13),
        type: "EXPENSE",
        amount: -18000,
        description: "Lunch",
        notes: null,
        account: { name: "Cash", currency: "PHP" },
        destinationAccount: null,
        category: { name: "Food" },
      },
    ]);
    const [row] = await buildTransactionExportRows(prisma, "user-1", {});
    expect(row).toEqual({
      date: "2026-09-13",
      type: "EXPENSE",
      amountMajorUnits: -180,
      currency: "PHP",
      account: "Cash",
      destinationAccount: null,
      category: "Food",
      description: "Lunch",
      notes: null,
    });
  });

  it("resolves a destination account name for a transfer", async () => {
    const prisma = makeFakePrisma([
      {
        date: new Date(2026, 8, 1),
        type: "TRANSFER",
        amount: -100000,
        description: "Transfer",
        notes: null,
        account: { name: "BPI Savings", currency: "PHP" },
        destinationAccount: { name: "GCash" },
        category: null,
      },
    ]);
    const [row] = await buildTransactionExportRows(prisma, "user-1", {});
    expect(row.destinationAccount).toBe("GCash");
    expect(row.category).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/export-transactions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";
import { buildTransactionWhereClause, type TransactionFilters } from "@/lib/transactions";
import { toMajorUnits } from "@/lib/money";

export type TransactionExportRow = {
  date: string;
  type: string;
  amountMajorUnits: number;
  currency: string;
  account: string;
  destinationAccount: string | null;
  category: string | null;
  description: string;
  notes: string | null;
};

export async function buildTransactionExportRows(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
): Promise<TransactionExportRow[]> {
  const transactions = await prisma.transaction.findMany({
    where: buildTransactionWhereClause(userId, filters),
    orderBy: { date: "desc" },
    include: { account: true, destinationAccount: true, category: true },
  });

  return (
    transactions as unknown as {
      date: Date;
      type: string;
      amount: number;
      description: string;
      notes: string | null;
      account: { name: string; currency: string };
      destinationAccount: { name: string } | null;
      category: { name: string } | null;
    }[]
  ).map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    type: t.type,
    amountMajorUnits: toMajorUnits(t.amount, t.account.currency),
    currency: t.account.currency,
    account: t.account.name,
    destinationAccount: t.destinationAccount?.name ?? null,
    category: t.category?.name ?? null,
    description: t.description,
    notes: t.notes,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/export-transactions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/export-transactions.ts src/lib/export-transactions.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export-transactions.ts src/lib/export-transactions.test.ts
git commit -m "feat(export): add buildTransactionExportRows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `export-format.ts` — CSV / JSON / XLSX serializers

**Files:**
- Create: `src/lib/export-format.ts`
- Test: `src/lib/export-format.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";
import type { TransactionExportRow } from "@/lib/export-transactions";

const rows: TransactionExportRow[] = [
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
  it("writes a header row and one data row", () => {
    const csv = toCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "date,type,amountMajorUnits,currency,account,destinationAccount,category,description,notes",
    );
    expect(lines[1]).toBe("2026-09-13,EXPENSE,-180,PHP,Cash,,Food,Lunch,");
  });

  it("escapes a value containing a comma", () => {
    const csv = toCsv([{ ...rows[0], description: "Lunch, with tip" }]);
    expect(csv).toContain('"Lunch, with tip"');
  });

  it("escapes a value containing a double quote by doubling it", () => {
    const csv = toCsv([{ ...rows[0], notes: 'Said "thanks"' }]);
    expect(csv).toContain('"Said ""thanks"""');
  });

  it("renders a null field as empty, not the string 'null'", () => {
    const csv = toCsv(rows);
    expect(csv).not.toContain("null");
  });
});

describe("toJson", () => {
  it("round-trips to an array with the expected shape", () => {
    const parsed = JSON.parse(toJson(rows));
    expect(parsed).toEqual(rows);
  });
});

describe("toXlsx", () => {
  it("produces a workbook with a Transactions worksheet matching the rows", async () => {
    const buffer = await toXlsx(rows);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Transactions");
    expect(sheet).toBeDefined();
    const header = sheet!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([
      "date",
      "type",
      "amountMajorUnits",
      "currency",
      "account",
      "destinationAccount",
      "category",
      "description",
      "notes",
    ]);
    const dataRow = sheet!.getRow(2).values as unknown[];
    expect(dataRow[1]).toBe("2026-09-13");
    expect(dataRow[3]).toBe(-180);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/export-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import ExcelJS from "exceljs";
import type { TransactionExportRow } from "@/lib/export-transactions";

const COLUMNS: (keyof TransactionExportRow)[] = [
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

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: TransactionExportRow[]): string {
  const header = COLUMNS.join(",");
  const lines = rows.map((row) => COLUMNS.map((col) => csvField(row[col])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function toJson(rows: TransactionExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export async function toXlsx(rows: TransactionExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(COLUMNS as string[]);
  for (const row of rows) {
    sheet.addRow(COLUMNS.map((col) => row[col]));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/export-format.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/export-format.ts src/lib/export-format.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export-format.ts src/lib/export-format.test.ts
git commit -m "feat(export): add CSV/JSON/XLSX serializers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The download route

**Files:**
- Create: `src/app/api/export/transactions/route.ts`

No test file — a thin route handler wiring together already-tested pieces, consistent with this codebase's existing convention of not testing route handlers/UI plumbing (see `src/app/api/auth/[...nextauth]/route.ts`, also untested).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildTransactionExportRows } from "@/lib/export-transactions";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";
import type { TransactionFilters } from "@/lib/transactions";

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format") ?? "";
  if (!["csv", "json", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const filters: TransactionFilters = {
    accountId: params.get("accountId") ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    type: params.get("type") ?? undefined,
    dateFrom: parseDate(params.get("dateFrom")),
    dateTo: parseDate(params.get("dateTo")),
  };

  const rows = await buildTransactionExportRows(prisma, session.user.id, filters);

  const body = format === "csv" ? toCsv(rows) : format === "json" ? toJson(rows) : await toXlsx(rows);

  return new NextResponse(body as any, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="transactions.${format}"`,
    },
  });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/api/export/transactions/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/export/transactions/route.ts"
git commit -m "feat(export): add the transaction export download route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Settings UI

**Files:**
- Create: `src/components/settings/export-settings.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Write the form component**

```tsx
type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

export function ExportSettings({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <form method="get" action="/api/export/transactions" className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-format" className="text-sm">
            Format
          </label>
          <select id="export-format" name="format" defaultValue="csv" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-type" className="text-sm">
            Type
          </label>
          <select id="export-type" name="type" defaultValue="" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
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
          <select id="export-account" name="accountId" defaultValue="" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
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
          <select id="export-category" name="categoryId" defaultValue="" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
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
          <input id="export-date-from" type="date" name="dateFrom" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-date-to" className="text-sm">
            To
          </label>
          <input id="export-date-to" type="date" name="dateTo" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>
      </div>

      <button
        type="submit"
        className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/80"
      >
        Export
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Wire it into the Settings page**

In `src/app/(app)/settings/page.tsx`, add the import:

```ts
import { ExportSettings } from "@/components/settings/export-settings";
```

Add a new section after "Recurring" and before the demo-data block:

```tsx
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Export</h2>
        <ExportSettings accounts={accounts} categories={categories} />
      </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/export-settings.tsx "src/app/(app)/settings/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/export-settings.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat(settings): add the transaction export form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (327 existing + 3 + 7 = 337), zero regressions.

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no type errors, no new lint errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

Wait for the deployment to go live at `https://budget-tracker-maiava.vercel.app`.

- [ ] **Step 4: Manually verify on the live deployment**

Log in as the demo account and, from Settings:
- Export with no filters in CSV, then XLSX, then JSON — confirm each downloads (the sandboxed browser tool may not be able to save the file itself; at minimum confirm the response headers/status via `read_network_requests` show a `200` with the correct `Content-Type`/`Content-Disposition` for each format).
- Apply a date range and/or account filter and confirm (via the network request's response body, fetched through `read_network_requests`) that only matching transactions are present.
- Confirm the route requires authentication (a request without a valid session cookie gets `401` — check this via the response, not by actually logging out mid-flow if that would disrupt the demo session).

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (counts), build clean, live verification outcomes; hand off to `finishing-a-development-branch`.
