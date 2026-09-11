# Plan 2A: Financial Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schema + domain services for accounts, categories, subcategories, budget periods, and transactions — cycle-date math, transaction classification, and transfer logic — all unit tested, plus fictional demo seed data. **No UI, no server actions, no pages** — those are Plan 2B onward. **Budget allocations/rollover, recurring rules, liquid-funds totals, and reconciliation are Plan 3A** (per the design spec's roadmap) — this plan deliberately does not build `BudgetAllocation` or `RecurringRule`, and does not build a liquid-funds or reconciliation service, even though earlier drafting explored them; keep this plan to exactly the Plan 2A scope.

**Architecture:** Every domain calculation is a small, dependency-injected, pure-where-possible function in `src/lib/`, following the same pattern already used for auth/onboarding (`createUser`, `completeOnboarding`): accept a `Pick<PrismaClient, ...>` (or plain data) so tests run against a mocked Prisma client, never a real database. The one subtlety worth internalizing before writing any of this: **a transfer creates two transaction rows, each a self-contained signed ledger entry against its own `accountId`** — see the design spec's "Account-balance rules" section. That single rule is what keeps every other balance calculation in this plan free of per-type branching.

**Tech Stack:** Same as Plan 1/onboarding (Next.js, Prisma + better-sqlite3 driver adapter, zod, Vitest). No new dependencies needed.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` (updated same day as this plan) — especially "Core Concepts" and "Data Model." This plan implements that spec; it doesn't re-derive it.

**Environment reminder:** this machine blocks `prisma db push`/`migrate` (native binary). Task 3 updates `prisma/schema.prisma` **and** `prisma/schema.sql` together and applies them with `npm run db:push`, per the existing workaround — do not attempt `npx prisma migrate` or `npx prisma db push` directly.

---

### Task 1: Domain constants

**Files:**
- Create: `src/lib/constants/financial.ts`

- [ ] **Step 1: Write the constants**

```typescript
// src/lib/constants/financial.ts
//
// SQLite has no enum type, so Prisma can't declare `enum` blocks against
// this datasource — every "one of a fixed set" column below is a plain
// String in the schema. These const arrays are the single source of truth
// for each fixed value set; zod schemas and UI option lists both import
// from here instead of re-listing the values.

export const ACCOUNT_TYPES = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "EWALLET",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
  "EXCLUDED_FUND",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_TYPES = ["INCOME", "EXPENSE", "SAVINGS", "DEBT_PAYMENT"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "BALANCE_ADJUSTMENT",
  "TRANSFER_FEE",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["PENDING", "CLEARED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const BUDGET_PERIOD_STATUSES = ["UPCOMING", "ACTIVE", "CLOSED"] as const;
export type BudgetPeriodStatus = (typeof BUDGET_PERIOD_STATUSES)[number];

// ROLLOVER_MODES and RECURRING_FREQUENCIES are Plan 3A (BudgetAllocation
// and RecurringRule don't exist yet) — add them there, not here.
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add shared financial domain constants"
```

---

### Task 2: Centralize the (temporary) app name

**Files:**
- Create: `src/lib/config.ts`
- Modify: `src/app/layout.tsx`, `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Write the config**

```typescript
// src/lib/config.ts
// Single place to rename the product later — nothing else should
// hardcode the app name.
export const APP_NAME = "Budget Tracker";
```

- [ ] **Step 2: Use it in the root layout's metadata**

In `src/app/layout.tsx`, add the import and replace the hardcoded strings:

```typescript
import { APP_NAME } from "@/lib/config";
```

```typescript
export const metadata: Metadata = {
  title: APP_NAME,
  description: "Personal budget tracker",
};
```

- [ ] **Step 3: Use it in the top nav**

In `src/components/nav/top-nav.tsx`, replace the hardcoded `Budget` text:

```tsx
import { APP_NAME } from "@/lib/config";
```

```tsx
<div className="flex items-center gap-2 font-semibold">
  <Wallet className="h-5 w-5" />
  {APP_NAME}
</div>
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: centralize the app name into one config constant"
```

---

### Task 3: Extend the schema (accounts, categories, subcategories, budget periods, transactions)

**`BudgetAllocation` and `RecurringRule` are Plan 3A — do not add them
here.** This task adds exactly: `Account`, `Category`, `Subcategory`,
`BudgetPeriod`, `Transaction`.

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add the new models to `prisma/schema.prisma`**

Add relation fields to the existing `User` model:

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  cycleStartDay Int      @default(1)
  currency      String   @default("PHP")
  accentColor   String   @default("coral")
  themeMode     String   @default("system")
  createdAt     DateTime @default(now())
  onboardedAt   DateTime?

  accounts      Account[]
  categories    Category[]
  subcategories Subcategory[]
  budgetPeriods BudgetPeriod[]
  transactions  Transaction[]
}
```

Append the new models:

```prisma
model Account {
  id                      String    @id @default(cuid())
  userId                  String
  name                    String
  accountType             String
  openingBalance          Int       @default(0)
  currency                String    @default("PHP")
  includeInLiquidFunds    Boolean   @default(true)
  isPrimaryFundingAccount Boolean   @default(false)
  color                   String
  icon                    String
  archivedAt              DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  user             User          @relation(fields: [userId], references: [id])
  transactionsFrom Transaction[] @relation("TransactionAccount")
  transactionsTo   Transaction[] @relation("TransactionDestinationAccount")
}

model Category {
  id         String    @id @default(cuid())
  userId     String
  name       String
  type       String
  color      String
  icon       String
  sortOrder  Int       @default(0)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user          User          @relation(fields: [userId], references: [id])
  subcategories Subcategory[]
  transactions  Transaction[]
}

model Subcategory {
  id         String    @id @default(cuid())
  userId     String
  categoryId String
  name       String
  sortOrder  Int       @default(0)
  archivedAt DateTime?

  user         User          @relation(fields: [userId], references: [id])
  category     Category      @relation(fields: [categoryId], references: [id])
  transactions Transaction[]
}

model BudgetPeriod {
  id        String   @id @default(cuid())
  userId    String
  name      String
  startDate DateTime
  endDate   DateTime
  status    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id])
  transactions Transaction[]

  @@unique([userId, startDate])
}

model Transaction {
  id                   String   @id @default(cuid())
  userId               String
  date                 DateTime
  type                 String
  amount               Int
  accountId            String
  destinationAccountId String?
  categoryId           String?
  subcategoryId        String?
  budgetPeriodId       String?
  description          String
  notes                String?
  status               String   @default("CLEARED")
  linkedTransactionId  String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user               User          @relation(fields: [userId], references: [id])
  account            Account       @relation("TransactionAccount", fields: [accountId], references: [id])
  destinationAccount Account?      @relation("TransactionDestinationAccount", fields: [destinationAccountId], references: [id])
  category           Category?     @relation(fields: [categoryId], references: [id])
  subcategory        Subcategory?  @relation(fields: [subcategoryId], references: [id])
  budgetPeriod       BudgetPeriod? @relation(fields: [budgetPeriodId], references: [id])
}
```

- [ ] **Step 2: Add the matching tables to `prisma/schema.sql`**

Append (after the existing `User` table):

```sql
CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "openingBalance" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "includeInLiquidFunds" INTEGER NOT NULL DEFAULT 1,
  "isPrimaryFundingAccount" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account" ("userId");

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "Category_userId_idx" ON "Category" ("userId");

CREATE TABLE IF NOT EXISTS "Subcategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE INDEX IF NOT EXISTS "Subcategory_categoryId_idx" ON "Subcategory" ("categoryId");

CREATE TABLE IF NOT EXISTS "BudgetPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetPeriod_userId_startDate_key" ON "BudgetPeriod" ("userId", "startDate");

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "destinationAccountId" TEXT,
  "categoryId" TEXT,
  "subcategoryId" TEXT,
  "budgetPeriodId" TEXT,
  "description" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CLEARED',
  "linkedTransactionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("destinationAccountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id"),
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory" ("id"),
  FOREIGN KEY ("budgetPeriodId") REFERENCES "BudgetPeriod" ("id")
);
CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction" ("userId");
CREATE INDEX IF NOT EXISTS "Transaction_accountId_idx" ON "Transaction" ("accountId");
CREATE INDEX IF NOT EXISTS "Transaction_destinationAccountId_idx" ON "Transaction" ("destinationAccountId");
CREATE INDEX IF NOT EXISTS "Transaction_budgetPeriodId_idx" ON "Transaction" ("budgetPeriodId");
```

- [ ] **Step 3: Regenerate the client and push the schema**

These are pure additions (`CREATE TABLE IF NOT EXISTS`) — no need to delete `prisma/dev.db` this time.

```bash
npm run db:generate
npm run db:push
```

Expected: output lists `Account, BudgetPeriod, Category, Subcategory, Transaction, User` as the tables.

- [ ] **Step 4: Verify the project still typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add accounts, categories, subcategories, budget periods, and transactions to the schema"
```

---

### Task 4: Money helper (with tests)

**Files:**
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/money.test.ts
import { describe, expect, it } from "vitest";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

describe("toMinorUnits", () => {
  it("converts a major-unit amount to minor units", () => {
    expect(toMinorUnits(19.99, "PHP")).toBe(1999);
    expect(toMinorUnits(100, "USD")).toBe(10000);
  });
});

describe("toMajorUnits", () => {
  it("converts a minor-unit amount to major units", () => {
    expect(toMajorUnits(1999, "PHP")).toBe(19.99);
    expect(toMajorUnits(10000, "USD")).toBe(100);
  });
});

describe("formatMoney", () => {
  it("formats a positive PHP amount with the peso sign", () => {
    expect(formatMoney(150000, "PHP")).toBe("₱1500.00");
  });

  it("formats a positive USD amount with the dollar sign", () => {
    expect(formatMoney(500, "USD")).toBe("$5.00");
  });

  it("formats a negative amount with a leading minus sign before the currency symbol", () => {
    expect(formatMoney(-500, "USD")).toBe("-$5.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/money.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/money'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/money.ts
// All amounts elsewhere in the app are stored as integers in minor units
// (centavos for PHP, cents for USD). This is the one place that converts
// between minor units and a human-readable major-unit display value.

const MINOR_UNITS_PER_MAJOR: Record<string, number> = { PHP: 100, USD: 100 };
const CURRENCY_SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$" };

function factorFor(currency: string): number {
  return MINOR_UNITS_PER_MAJOR[currency] ?? 100;
}

export function toMinorUnits(majorUnits: number, currency: string): number {
  return Math.round(majorUnits * factorFor(currency));
}

export function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / factorFor(currency);
}

export function formatMoney(minorUnits: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const major = toMajorUnits(minorUnits, currency);
  const sign = major < 0 ? "-" : "";
  const abs = Math.abs(major).toFixed(2);
  return `${sign}${symbol}${abs}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/money.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add money formatting helper (integer minor units)"
```

---

### Task 5: Cycle-date service (with tests)

**Files:**
- Create: `src/lib/cycle.ts`
- Test: `src/lib/cycle.test.ts`

This is the most bug-prone piece of logic in the whole app — it gets its
own thorough test file covering every example from the design spec plus
short-month and leap-year edge cases.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/cycle.test.ts
import { describe, expect, it } from "vitest";
import { formatCycleRange, getCurrentCycle, getCycleForDate } from "@/lib/cycle";

function d(year: number, month1based: number, day: number): Date {
  return new Date(year, month1based - 1, day);
}

describe("getCycleForDate — worked examples from the spec (cycleStartDay = 11)", () => {
  it("Sep 10 belongs to Aug 11 - Sep 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 9, 10));
    expect(start).toEqual(d(2026, 8, 11));
    expect(end).toEqual(d(2026, 9, 10));
  });

  it("Sep 11 belongs to Sep 11 - Oct 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 9, 11));
    expect(start).toEqual(d(2026, 9, 11));
    expect(end).toEqual(d(2026, 10, 10));
  });

  it("Oct 10 belongs to Sep 11 - Oct 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 10, 10));
    expect(start).toEqual(d(2026, 9, 11));
    expect(end).toEqual(d(2026, 10, 10));
  });

  it("Oct 11 belongs to Oct 11 - Nov 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 10, 11));
    expect(start).toEqual(d(2026, 10, 11));
    expect(end).toEqual(d(2026, 11, 10));
  });
});

describe("getCycleForDate — short-month clamping (cycleStartDay = 31)", () => {
  it("clamps to Feb 28 in a non-leap year, and the prior cycle starts Jan 31", () => {
    const { start, end } = getCycleForDate(31, d(2026, 2, 15));
    expect(start).toEqual(d(2026, 1, 31));
    expect(end).toEqual(d(2026, 2, 27));
  });

  it("clamps to Feb 29 in a leap year", () => {
    const { start, end } = getCycleForDate(31, d(2028, 2, 20));
    expect(start).toEqual(d(2028, 1, 31));
    expect(end).toEqual(d(2028, 2, 28));
  });

  it("a date on/after the clamped boundary starts the next cycle there", () => {
    const { start, end } = getCycleForDate(31, d(2026, 2, 28));
    expect(start).toEqual(d(2026, 2, 28));
    expect(end).toEqual(d(2026, 3, 30));
  });

  it("clamps to day 30 in a 30-day month (April)", () => {
    const { start, end } = getCycleForDate(31, d(2026, 4, 15));
    expect(start).toEqual(d(2026, 3, 31));
    expect(end).toEqual(d(2026, 4, 29));
  });
});

describe("getCycleForDate — validation", () => {
  it("rejects a cycleStartDay outside 1-31", () => {
    expect(() => getCycleForDate(0, new Date())).toThrow();
    expect(() => getCycleForDate(32, new Date())).toThrow();
  });
});

describe("getCurrentCycle", () => {
  it("delegates to getCycleForDate using the provided 'now'", () => {
    const now = d(2026, 9, 15);
    expect(getCurrentCycle(11, now)).toEqual(getCycleForDate(11, now));
  });
});

describe("formatCycleRange", () => {
  it("formats a range within the same year", () => {
    expect(formatCycleRange({ start: d(2026, 9, 11), end: d(2026, 10, 10) })).toBe(
      "Sep 11 – Oct 10, 2026",
    );
  });

  it("formats a range spanning two years", () => {
    expect(formatCycleRange({ start: d(2026, 12, 25), end: d(2027, 1, 24) })).toBe(
      "Dec 25, 2026 – Jan 24, 2027",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/cycle.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/cycle'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/cycle.ts
// Computes which custom budget cycle a given date falls into, based on
// the user's cycleStartDay (1-31). This is the one place this math
// happens — every page/report/service that needs "what cycle is this
// date in" calls into here instead of re-deriving it.

export type CycleRange = { start: Date; end: Date };

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function effectiveStartDay(year: number, monthIndex0: number, cycleStartDay: number): number {
  return Math.min(cycleStartDay, daysInMonth(year, monthIndex0));
}

function monthCandidateStart(year: number, monthIndex0: number, cycleStartDay: number): Date {
  return new Date(year, monthIndex0, effectiveStartDay(year, monthIndex0, cycleStartDay));
}

function shiftMonth(
  year: number,
  monthIndex0: number,
  delta: number,
): { year: number; monthIndex0: number } {
  const total = monthIndex0 + delta;
  return {
    year: year + Math.floor(total / 12),
    monthIndex0: ((total % 12) + 12) % 12,
  };
}

function subtractOneDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

export function getCycleForDate(cycleStartDay: number, date: Date): CycleRange {
  if (!Number.isInteger(cycleStartDay) || cycleStartDay < 1 || cycleStartDay > 31) {
    throw new Error(`cycleStartDay must be an integer between 1 and 31, got ${cycleStartDay}`);
  }

  const year = date.getFullYear();
  const monthIndex0 = date.getMonth();
  const normalized = new Date(year, monthIndex0, date.getDate());

  const thisMonthStart = monthCandidateStart(year, monthIndex0, cycleStartDay);

  if (normalized.getTime() >= thisMonthStart.getTime()) {
    const next = shiftMonth(year, monthIndex0, 1);
    const nextMonthStart = monthCandidateStart(next.year, next.monthIndex0, cycleStartDay);
    return { start: thisMonthStart, end: subtractOneDay(nextMonthStart) };
  }

  const prev = shiftMonth(year, monthIndex0, -1);
  const prevMonthStart = monthCandidateStart(prev.year, prev.monthIndex0, cycleStartDay);
  return { start: prevMonthStart, end: subtractOneDay(thisMonthStart) };
}

export function getCurrentCycle(cycleStartDay: number, now: Date = new Date()): CycleRange {
  return getCycleForDate(cycleStartDay, now);
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatCycleRange(range: CycleRange): string {
  const { start, end } = range;
  const startLabel = `${MONTH_ABBR[start.getMonth()]} ${start.getDate()}`;
  const endLabel = `${MONTH_ABBR[end.getMonth()]} ${end.getDate()}`;

  if (start.getFullYear() === end.getFullYear()) {
    return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
  }
  return `${startLabel}, ${start.getFullYear()} – ${endLabel}, ${end.getFullYear()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/cycle.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add custom budget-cycle date service with thorough edge-case tests"
```

---

### Task 6: Transaction classification (with tests)

**Files:**
- Create: `src/lib/transaction-rules.ts`
- Test: `src/lib/transaction-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/transaction-rules.test.ts
import { describe, expect, it } from "vitest";
import { accountEffect, signedAmountForType } from "@/lib/transaction-rules";

describe("signedAmountForType", () => {
  it("keeps inflow types positive", () => {
    expect(signedAmountForType("INCOME", 5000)).toBe(5000);
    expect(signedAmountForType("REFUND", 1200)).toBe(1200);
  });

  it("negates outflow types", () => {
    expect(signedAmountForType("EXPENSE", 5000)).toBe(-5000);
    expect(signedAmountForType("SAVINGS", 2000)).toBe(-2000);
    expect(signedAmountForType("LOAN_PAYMENT", 3000)).toBe(-3000);
    expect(signedAmountForType("CREDIT_CARD_PAYMENT", 4000)).toBe(-4000);
    expect(signedAmountForType("TRANSFER_FEE", 150)).toBe(-150);
  });

  it("rejects a negative magnitude", () => {
    expect(() => signedAmountForType("EXPENSE", -100)).toThrow();
  });
});

describe("accountEffect", () => {
  it("returns the transaction's amount when it belongs to the queried account", () => {
    expect(accountEffect({ accountId: "acc-1", amount: 5000 }, "acc-1")).toBe(5000);
    expect(accountEffect({ accountId: "acc-1", amount: -2000 }, "acc-1")).toBe(-2000);
  });

  it("returns 0 for an unrelated account", () => {
    expect(accountEffect({ accountId: "acc-1", amount: 5000 }, "acc-2")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/transaction-rules.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/transaction-rules'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/transaction-rules.ts
// Classifies transaction types into signed effects. See the design spec's
// "Account-balance rules": every transaction row is a self-contained
// signed ledger entry against its own accountId — a transfer's two rows
// (src/lib/transfers.ts) are just two such entries with opposite signs.

export type SignableTransactionType =
  | "EXPENSE"
  | "INCOME"
  | "REFUND"
  | "SAVINGS"
  | "LOAN_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "TRANSFER_FEE";

const INFLOW_TYPES = new Set<SignableTransactionType>(["INCOME", "REFUND"]);
const OUTFLOW_TYPES = new Set<SignableTransactionType>([
  "EXPENSE",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
]);

/**
 * Given a transaction type (everything except TRANSFER and
 * BALANCE_ADJUSTMENT, which get their sign from elsewhere — see
 * src/lib/transfers.ts for TRANSFER; BALANCE_ADJUSTMENT is Plan 3A
 * reconciliation work and isn't built yet) and a non-negative magnitude,
 * returns the signed amount to store on the transaction row.
 */
export function signedAmountForType(type: SignableTransactionType, magnitude: number): number {
  if (magnitude < 0) {
    throw new Error(`magnitude must be non-negative, got ${magnitude}`);
  }
  if (INFLOW_TYPES.has(type)) return magnitude;
  if (OUTFLOW_TYPES.has(type)) return -magnitude;
  throw new Error(`Unhandled transaction type: ${type}`);
}

/**
 * The effect a transaction row has on the balance of the given account.
 * Every row's `amount` already carries the correct sign for its own
 * `accountId` (see signedAmountForType and src/lib/transfers.ts) — this
 * just filters out rows that don't belong to the account being computed.
 */
export function accountEffect(
  transaction: { accountId: string; amount: number },
  accountId: string,
): number {
  return transaction.accountId === accountId ? transaction.amount : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/transaction-rules.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add transaction classification (signed-amount rules)"
```

---

### Task 7: Budget-period resolution (with tests)

**Files:**
- Create: `src/lib/budget-period.ts`
- Test: `src/lib/budget-period.test.ts`

Finds the `BudgetPeriod` row for the cycle containing a date, creating one
if it doesn't exist yet. **Manual override** (letting a user reassign a
transaction to a different period than its date would auto-suggest) is not
this function's concern — callers (Plan 2B's transaction actions) can pass
an explicit `budgetPeriodId` instead of calling this resolver at all.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/budget-period.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";

function makeFakePrisma(existing: unknown = null) {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "period-new" }),
    },
  } as any;
}

describe("resolveBudgetPeriodForDate", () => {
  it("returns the existing period for that cycle if one already exists", async () => {
    const existing = { id: "period-1" };
    const prisma = makeFakePrisma(existing);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toBe(existing);
    expect(prisma.budgetPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a new period matching the cycle when none exists", async () => {
    const prisma = makeFakePrisma(null);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toEqual({ id: "period-new" });
    expect(prisma.budgetPeriod.create).toHaveBeenCalledTimes(1);
    const args = prisma.budgetPeriod.create.mock.calls[0][0];
    expect(args.data.userId).toBe("user-1");
    expect(args.data.startDate).toEqual(new Date(2026, 7, 11));
    expect(args.data.endDate).toEqual(new Date(2026, 8, 10));
    expect(args.data.status).toBe("ACTIVE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/budget-period.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/budget-period'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/budget-period.ts
import type { PrismaClient } from "@prisma/client";
import { formatCycleRange, getCycleForDate } from "@/lib/cycle";

export async function resolveBudgetPeriodForDate(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  date: Date,
  cycleStartDay: number,
) {
  const { start, end } = getCycleForDate(cycleStartDay, date);

  const existing = await prisma.budgetPeriod.findUnique({
    where: { userId_startDate: { userId, startDate: start } },
  });
  if (existing) {
    return existing;
  }

  return prisma.budgetPeriod.create({
    data: {
      userId,
      name: formatCycleRange({ start, end }),
      startDate: start,
      endDate: end,
      status: "ACTIVE",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/budget-period.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add budget-period resolution service"
```

---

### Task 8: Transfer creation (with tests)

**Files:**
- Create: `src/lib/transfers.ts`
- Test: `src/lib/transfers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/transfers.test.ts
import { describe, expect, it, vi } from "vitest";
import { createTransfer } from "@/lib/transfers";

function makeFakePrisma() {
  let nextId = 1;
  return {
    transaction: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: `txn-${nextId++}`, ...data }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("createTransfer", () => {
  it("creates two linked rows: a negative outgoing row and a positive incoming row", async () => {
    const prisma = makeFakePrisma();

    const result = await createTransfer(prisma, {
      userId: "user-1",
      date: new Date(2026, 8, 15),
      amount: 5000,
      sourceAccountId: "acc-checking",
      destinationAccountId: "acc-savings",
      description: "Move to savings",
    });

    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);

    const outgoingArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(outgoingArgs.type).toBe("TRANSFER");
    expect(outgoingArgs.amount).toBe(-5000);
    expect(outgoingArgs.accountId).toBe("acc-checking");
    expect(outgoingArgs.destinationAccountId).toBe("acc-savings");

    const incomingArgs = prisma.transaction.create.mock.calls[1][0].data;
    expect(incomingArgs.type).toBe("TRANSFER");
    expect(incomingArgs.amount).toBe(5000);
    expect(incomingArgs.accountId).toBe("acc-savings");
    expect(incomingArgs.destinationAccountId).toBe("acc-checking");
    expect(incomingArgs.linkedTransactionId).toBe(result.outgoingTransactionId);

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: result.outgoingTransactionId },
      data: { linkedTransactionId: result.incomingTransactionId },
    });
  });

  it("rejects a negative amount", async () => {
    const prisma = makeFakePrisma();
    await expect(
      createTransfer(prisma, {
        userId: "user-1",
        date: new Date(),
        amount: -100,
        sourceAccountId: "acc-1",
        destinationAccountId: "acc-2",
        description: "invalid",
      }),
    ).rejects.toThrow();
  });

  it("rejects the same account as both source and destination", async () => {
    const prisma = makeFakePrisma();
    await expect(
      createTransfer(prisma, {
        userId: "user-1",
        date: new Date(),
        amount: 100,
        sourceAccountId: "acc-1",
        destinationAccountId: "acc-1",
        description: "invalid",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/transfers.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/transfers'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/transfers.ts
import type { PrismaClient } from "@prisma/client";

export type CreateTransferInput = {
  userId: string;
  date: Date;
  amount: number; // non-negative magnitude, minor units
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  budgetPeriodId?: string;
};

export type TransferResult = {
  outgoingTransactionId: string;
  incomingTransactionId: string;
};

/**
 * Creates the two linked rows for a transfer between two of the user's
 * own accounts: a negative row on the source account and a positive row
 * on the destination account, sharing linkedTransactionId. The
 * transferred amount never counts as income or spending — a transfer fee
 * (its own TRANSFER_FEE transaction, created like any other outflow) is
 * the only part of a transfer that counts as an expense.
 */
export async function createTransfer(
  prisma: Pick<PrismaClient, "transaction">,
  input: CreateTransferInput,
): Promise<TransferResult> {
  if (input.amount < 0) {
    throw new Error(`amount must be non-negative, got ${input.amount}`);
  }
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new Error("sourceAccountId and destinationAccountId must differ");
  }

  const outgoing = await prisma.transaction.create({
    data: {
      userId: input.userId,
      date: input.date,
      type: "TRANSFER",
      amount: -input.amount,
      accountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      description: input.description,
      budgetPeriodId: input.budgetPeriodId,
    },
  });

  const incoming = await prisma.transaction.create({
    data: {
      userId: input.userId,
      date: input.date,
      type: "TRANSFER",
      amount: input.amount,
      accountId: input.destinationAccountId,
      destinationAccountId: input.sourceAccountId,
      description: input.description,
      budgetPeriodId: input.budgetPeriodId,
      linkedTransactionId: outgoing.id,
    },
  });

  await prisma.transaction.update({
    where: { id: outgoing.id },
    data: { linkedTransactionId: incoming.id },
  });

  return { outgoingTransactionId: outgoing.id, incomingTransactionId: incoming.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/transfers.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add transfer creation service (two linked, oppositely-signed rows)"
```

---

### Task 9: Account-balance service (with tests)

**Files:**
- Create: `src/lib/account-balance.ts`
- Test: `src/lib/account-balance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/account-balance.test.ts
import { describe, expect, it, vi } from "vitest";
import { computeAccountBalance } from "@/lib/account-balance";

function makeFakePrisma(openingBalance: number, transactions: { amount: number }[]) {
  return {
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance }),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions.map((t) => ({ accountId: "acc-1", ...t }))),
    },
  } as any;
}

describe("computeAccountBalance", () => {
  it("sums the opening balance and every transaction row's signed amount", async () => {
    const prisma = makeFakePrisma(10000, [
      { amount: 2000 }, // income
      { amount: -500 }, // expense
      { amount: 1000 }, // incoming transfer
      { amount: -300 }, // transfer fee
    ]);

    const balance = await computeAccountBalance(prisma, "acc-1");

    expect(balance).toBe(10000 + 2000 - 500 + 1000 - 300);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { accountId: "acc-1" } });
  });

  it("returns just the opening balance when there are no transactions", async () => {
    const prisma = makeFakePrisma(5000, []);
    const balance = await computeAccountBalance(prisma, "acc-1");
    expect(balance).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/account-balance.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/account-balance'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/account-balance.ts
import type { PrismaClient } from "@prisma/client";
import { accountEffect } from "@/lib/transaction-rules";

export async function computeAccountBalance(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  accountId: string,
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  const transactions = await prisma.transaction.findMany({ where: { accountId } });

  const net = transactions.reduce((sum, txn) => sum + accountEffect(txn, accountId), 0);

  return account.openingBalance + net;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/account-balance.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add account-balance service"
```

---

### Task 10: Fictional demo seed data

**Files:**
- Create: `scripts/seed-demo-data.mjs`
- Modify: `package.json` (add `db:seed-demo` script)

- [ ] **Step 1: Write the seed script**

```javascript
// scripts/seed-demo-data.mjs
//
// Seeds fictional financial data for the demo account (for portfolio
// screenshots/demoing). Safe to re-run: clears the demo user's existing
// financial rows first, then re-inserts. Only ever touches the account
// belonging to DEMO_EMAIL — never real user data. Every name/amount here
// is made up.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const DEMO_EMAIL = "demo@example.com";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
if (!user) {
  console.error(`No user found for ${DEMO_EMAIL}. Run "npm run db:demo-user" first.`);
  process.exit(1);
}

// Clear this user's existing financial rows (children first).
await prisma.transaction.deleteMany({ where: { userId: user.id } });
await prisma.budgetPeriod.deleteMany({ where: { userId: user.id } });
await prisma.subcategory.deleteMany({ where: { userId: user.id } });
await prisma.category.deleteMany({ where: { userId: user.id } });
await prisma.account.deleteMany({ where: { userId: user.id } });

const checking = await prisma.account.create({
  data: {
    userId: user.id,
    name: "Everyday Checking",
    accountType: "CHECKING",
    openingBalance: 4500000, // ₱45,000.00
    currency: "PHP",
    includeInLiquidFunds: true,
    isPrimaryFundingAccount: true,
    color: "blue",
    icon: "landmark",
  },
});

const savings = await prisma.account.create({
  data: {
    userId: user.id,
    name: "Rainy Day Savings",
    accountType: "SAVINGS",
    openingBalance: 12000000, // ₱120,000.00
    currency: "PHP",
    includeInLiquidFunds: true,
    color: "green",
    icon: "piggy-bank",
  },
});

const creditCard = await prisma.account.create({
  data: {
    userId: user.id,
    name: "Everyday Rewards Card",
    accountType: "CREDIT_CARD",
    openingBalance: -850000, // owes ₱8,500.00
    currency: "PHP",
    includeInLiquidFunds: false,
    color: "purple",
    icon: "credit-card",
  },
});

const categoryDefs = {
  salary: { name: "Salary", type: "INCOME", color: "green", icon: "wallet" },
  groceries: { name: "Groceries", type: "EXPENSE", color: "coral", icon: "shopping-cart" },
  rent: { name: "Rent", type: "EXPENSE", color: "neutral", icon: "home" },
  dining: { name: "Dining Out", type: "EXPENSE", color: "coral", icon: "utensils" },
  transport: { name: "Transport", type: "EXPENSE", color: "blue", icon: "car" },
  entertainment: { name: "Entertainment", type: "EXPENSE", color: "purple", icon: "film" },
};

const categories = {};
for (const [key, def] of Object.entries(categoryDefs)) {
  categories[key] = await prisma.category.create({ data: { userId: user.id, ...def } });
}

const now = new Date();
const budgetPeriod = await prisma.budgetPeriod.create({
  data: {
    userId: user.id,
    name: "Current cycle",
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    status: "ACTIVE",
  },
});

// Budget allocations (planned amounts per category) are Plan 3A —
// BudgetAllocation doesn't exist yet, so this seed only creates the
// period itself plus transactions against it.

function daysAgo(n) {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt;
}

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(10),
    type: "INCOME",
    amount: 3500000,
    accountId: checking.id,
    categoryId: categories.salary.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Monthly salary",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(9),
    type: "EXPENSE",
    amount: -1500000,
    accountId: checking.id,
    categoryId: categories.rent.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Rent payment",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(7),
    type: "EXPENSE",
    amount: -320000,
    accountId: checking.id,
    categoryId: categories.groceries.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Weekly groceries",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(5),
    type: "EXPENSE",
    amount: -95000,
    accountId: checking.id,
    categoryId: categories.dining.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Dinner with friends",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(4),
    type: "REFUND",
    amount: 25000,
    accountId: checking.id,
    categoryId: categories.groceries.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Refund for returned item",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(6),
    type: "CREDIT_CARD_PAYMENT",
    amount: -300000,
    accountId: checking.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Credit card payment",
  },
});

// A transfer: two linked rows sharing linkedTransactionId (see src/lib/transfers.ts).
const transferOut = await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(3),
    type: "TRANSFER",
    amount: -500000,
    accountId: checking.id,
    destinationAccountId: savings.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Move to savings",
  },
});
const transferIn = await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(3),
    type: "TRANSFER",
    amount: 500000,
    accountId: savings.id,
    destinationAccountId: checking.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Move to savings",
    linkedTransactionId: transferOut.id,
  },
});
await prisma.transaction.update({
  where: { id: transferOut.id },
  data: { linkedTransactionId: transferIn.id },
});

// Recurring rules are Plan 3A — RecurringRule doesn't exist yet.

console.log(`Seeded fictional demo data for ${DEMO_EMAIL}.`);

await prisma.$disconnect();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"db:seed-demo": "node scripts/seed-demo-data.mjs"
```

- [ ] **Step 3: Run it**

```bash
npm run db:seed-demo
```

Expected: `Seeded fictional demo data for demo@example.com.`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add fictional demo seed data script"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run the whole test suite**

```bash
npm test
```

Expected: every test file passes, including all new ones from Tasks 4-9
(money, cycle, transaction-rules, budget-period, transfers,
account-balance) on top of the existing 14.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Sanity-check the seeded data directly against SQLite**

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');
console.log(db.prepare('SELECT name FROM Account').all());
console.log(db.prepare('SELECT type, amount, description FROM \"Transaction\" ORDER BY date').all());
db.close();
"
```

Expected: 3 accounts (Everyday Checking, Rainy Day Savings, Everyday
Rewards Card) and the transaction rows from Task 10's seed, with signed
amounts matching what was written (e.g. the rent expense as `-1500000`,
salary as `3500000`).

- [ ] **Step 4: Commit any fixes found**

```bash
git add -A
git commit -m "fix: address issues found during Plan 2A verification"
```
