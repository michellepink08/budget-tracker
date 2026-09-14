# Ledger Page & Credit Card Balance Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix credit card payments to actually reduce what a card owes (a real two-sided ledger entry, like transfers already work), then build a new read-only `/ledger` page showing five purpose-grouped transaction tables (Disposable, Credit, Restricted, Savings, Debt/Loans) with a date-range picker, newest-first.

**Architecture:** `makeCreditCardPayment` gains a second linked transaction row on the card's own account (mirroring `src/lib/transfers.ts::createTransfer`'s two-row pattern) — no schema change, since `destinationAccountId` and `linkedTransactionId` already exist on `Transaction`. A new `src/lib/ledger.ts` computes each account's running balance chronologically per purpose group and returns rows newest-first for display. A new page and three small presentational components render it.

**Tech Stack:** Next.js App Router, Prisma, Vitest, Tailwind — all consistent with the existing codebase.

---

### Task 1: Credit card payment becomes a two-sided ledger entry

**Files:**
- Modify: `src/lib/credit-cards.ts`
- Test: `src/lib/credit-cards.test.ts`

- [ ] **Step 1: Replace the `makeCreditCardPayment` test with one that expects a two-sided entry**

Open `src/lib/credit-cards.test.ts` and replace the entire `describe("makeCreditCardPayment", ...)` block (including its `makeFakePrisma` helper) with:

```typescript
function makeFakePrisma(card: unknown = SAMPLE_CARD) {
  const prisma: any = {
    creditCard: {
      create: vi.fn().mockResolvedValue({ id: "card-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(card),
      findMany: vi.fn().mockResolvedValue([]),
    },
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-checking", name: "Everyday Checking" }),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: "txn-outgoing", budgetPeriodId: "period-1" })
        .mockResolvedValueOnce({ id: "txn-incoming" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}
```

This replaces the *existing* `makeFakePrisma` near the top of the file (used by `createCreditCard`/`updateCreditCard`/`listCreditCards` tests too) — keep using it for those tests unchanged; only its body is expanding with `account` and `transaction.update`, and `transaction.create` now returns two different values across the two calls `makeCreditCardPayment` will make.

Then replace the `describe("makeCreditCardPayment", ...)` block with:

```typescript
describe("makeCreditCardPayment", () => {
  it("creates a two-sided entry: an outgoing row on the paying account and a linked incoming row on the card's account", async () => {
    const prisma = makeFakePrisma();

    const result = await makeCreditCardPayment(prisma, "user-1", 25, "card-1", {
      accountId: "acc-checking",
      amount: 300000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: true, transactionId: "txn-outgoing" });

    const outgoingArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(outgoingArgs.type).toBe("CREDIT_CARD_PAYMENT");
    expect(outgoingArgs.amount).toBe(-300000);
    expect(outgoingArgs.accountId).toBe("acc-checking");

    const incomingArgs = prisma.transaction.create.mock.calls[1][0].data;
    expect(incomingArgs.type).toBe("CREDIT_CARD_PAYMENT");
    expect(incomingArgs.amount).toBe(300000);
    expect(incomingArgs.accountId).toBe("acc-cc"); // SAMPLE_CARD.accountId
    expect(incomingArgs.destinationAccountId).toBe("acc-checking");
    expect(incomingArgs.linkedTransactionId).toBe("txn-outgoing");
    expect(incomingArgs.description).toBe("Payment from Everyday Checking");
    expect(incomingArgs.budgetPeriodId).toBe("period-1");

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-outgoing" },
      data: { linkedTransactionId: "txn-incoming", destinationAccountId: "acc-cc" },
    });
  });

  it("reports not found for a card the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await makeCreditCardPayment(prisma, "user-1", 25, "card-1", {
      accountId: "acc-checking",
      amount: 300000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: false, error: "Credit card not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/credit-cards.test.ts`
Expected: FAIL — the current `makeCreditCardPayment` only creates one transaction row, so `prisma.transaction.create.mock.calls[1]` is undefined and `prisma.account.findUniqueOrThrow`/`prisma.transaction.update` are never called.

- [ ] **Step 3: Implement the two-sided entry**

In `src/lib/credit-cards.ts`, replace the `makeCreditCardPayment` function (keep everything above it — `CreditCardInput`, `CreditCardMutationResult`, `createCreditCard`, `updateCreditCard`, `listCreditCards` — unchanged) with:

```typescript
export type CreditCardPaymentInput = { accountId: string; amount: number; date: Date };

export type MakeCreditCardPaymentResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: string };

type MakePaymentPrisma = Pick<
  PrismaClient,
  "creditCard" | "transaction" | "account" | "budgetPeriod" | "$transaction"
>;

// Records a real two-sided ledger entry, mirroring src/lib/transfers.ts's
// createTransfer: an outgoing row on the paying account (unchanged from
// before) plus a new incoming row on the card's own account, linked via
// linkedTransactionId. computeAccountBalance sums by accountId, so the
// card's balance now actually drops by the payment — the same way any
// other movement between two of the user's own accounts already works.
// Nesting prisma.$transaction inside the caller's own $transaction
// (src/actions/credit-card.actions.ts already wraps this call) is the
// same pattern createTransfer already relies on for transfers.
export async function makeCreditCardPayment(
  prisma: MakePaymentPrisma,
  userId: string,
  cycleStartDay: number,
  creditCardId: string,
  input: CreditCardPaymentInput,
): Promise<MakeCreditCardPaymentResult> {
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } });
  if (!card) {
    return { ok: false, error: "Credit card not found" };
  }
  const payingAccount = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });

  return prisma.$transaction(async (tx) => {
    const outgoing = await createExpenseLikeTransaction(tx, userId, cycleStartDay, {
      type: "CREDIT_CARD_PAYMENT",
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      description: "Credit card payment",
    });

    const incoming = await tx.transaction.create({
      data: {
        userId,
        date: input.date,
        type: "CREDIT_CARD_PAYMENT",
        amount: input.amount,
        accountId: card.accountId,
        destinationAccountId: input.accountId,
        budgetPeriodId: outgoing.budgetPeriodId,
        description: `Payment from ${payingAccount.name}`,
        linkedTransactionId: outgoing.id,
      },
    });

    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { linkedTransactionId: incoming.id, destinationAccountId: card.accountId },
    });

    return { ok: true, transactionId: outgoing.id };
  });
}
```

`src/lib/credit-cards.ts` already has `import type { PrismaClient } from "@prisma/client";` at the top of the file (line 1) — no import changes needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/credit-cards.test.ts`
Expected: PASS (all tests in the file, including `createCreditCard`/`updateCreditCard`/`listCreditCards`, which are unaffected).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors (the credit-card action layer at `src/actions/credit-card.actions.ts` calls `makeCreditCardPayment(tx, ...)` where `tx` is a Prisma interactive-transaction client — it structurally satisfies `MakePaymentPrisma`, no changes needed there).

```bash
git add src/lib/credit-cards.ts src/lib/credit-cards.test.ts
git commit -m "fix(credit-cards): make a payment a real two-sided ledger entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Ledger data layer

**Files:**
- Create: `src/lib/ledger.ts`
- Test: `src/lib/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ledger.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { listLedgerRows } from "@/lib/ledger";

function makeFakePrisma(accounts: any[], transactionsByAccountId: Record<string, any[]>) {
  return {
    account: { findMany: vi.fn().mockResolvedValue(accounts) },
    transaction: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { accountId: string } }) =>
        Promise.resolve(transactionsByAccountId[where.accountId] ?? []),
      ),
    },
  } as any;
}

const RANGE = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) };

describe("listLedgerRows", () => {
  it("scopes accounts by userId and the given purpose", async () => {
    const prisma = makeFakePrisma([], {});

    await listLedgerRows(prisma, "user-1", "SAVINGS", RANGE);

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", purpose: "SAVINGS" },
    });
  });

  it("computes a chronological running balance per account, returned newest first", async () => {
    const prisma = makeFakePrisma(
      [{ id: "acc-1", name: "Everyday Checking", openingBalance: 1000 }],
      {
        "acc-1": [
          {
            id: "txn-1",
            date: new Date(2026, 8, 1),
            amount: -200,
            description: "Groceries",
            category: { name: "Groceries" },
          },
          { id: "txn-2", date: new Date(2026, 8, 5), amount: 500, description: "Salary", category: null },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows).toEqual([
      {
        id: "txn-2",
        date: new Date(2026, 8, 5),
        accountId: "acc-1",
        accountName: "Everyday Checking",
        description: "Salary",
        categoryName: null,
        amount: 500,
        balance: 1300,
      },
      {
        id: "txn-1",
        date: new Date(2026, 8, 1),
        accountId: "acc-1",
        accountName: "Everyday Checking",
        description: "Groceries",
        categoryName: "Groceries",
        amount: -200,
        balance: 800,
      },
    ]);
  });

  it("carries forward balance from transactions before the range start, without including them as rows", async () => {
    const prisma = makeFakePrisma(
      [{ id: "acc-1", name: "Everyday Checking", openingBalance: 1000 }],
      {
        "acc-1": [
          { id: "txn-old", date: new Date(2026, 7, 15), amount: -100, description: "Old expense", category: null },
          { id: "txn-in-range", date: new Date(2026, 8, 5), amount: 200, description: "Income", category: null },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("txn-in-range");
    expect(rows[0].balance).toBe(1100); // 1000 - 100 + 200
  });

  it("combines multiple accounts in the same purpose group, sorted by date across accounts (newest first)", async () => {
    const prisma = makeFakePrisma(
      [
        { id: "acc-1", name: "Checking", openingBalance: 0 },
        { id: "acc-2", name: "Wallet", openingBalance: 0 },
      ],
      {
        "acc-1": [{ id: "txn-1", date: new Date(2026, 8, 10), amount: -100, description: "A", category: null }],
        "acc-2": [{ id: "txn-2", date: new Date(2026, 8, 12), amount: -50, description: "B", category: null }],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows.map((r) => r.id)).toEqual(["txn-2", "txn-1"]);
  });

  it("returns an empty array when there are no accounts of that purpose", async () => {
    const prisma = makeFakePrisma([], {});

    const rows = await listLedgerRows(prisma, "user-1", "RESTRICTED", RANGE);

    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/ledger.test.ts`
Expected: FAIL with "Cannot find module '@/lib/ledger'" (the file doesn't exist yet).

- [ ] **Step 3: Implement `listLedgerRows`**

Create `src/lib/ledger.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { AccountPurpose } from "@/lib/constants/financial";

export type LedgerRow = {
  id: string;
  date: Date;
  accountId: string;
  accountName: string;
  description: string;
  categoryName: string | null;
  amount: number; // minor units, signed
  balance: number; // minor units — that account's running balance as of this row
};

export type LedgerRange = { start: Date; end: Date };

type LedgerPrisma = Pick<PrismaClient, "account" | "transaction">;

// One purpose group's worth of transactions across every account with that
// purpose, newest first, each row carrying its own account's balance as of
// that date. Balance is walked forward chronologically per account
// (starting from openingBalance, folding in every transaction on that
// account in date order — including ones before `range.start`, so a row's
// balance is always the account's true balance at that point, not reset at
// the range boundary) and only rows falling inside `range` are returned.
export async function listLedgerRows(
  prisma: LedgerPrisma,
  userId: string,
  purpose: AccountPurpose,
  range: LedgerRange,
): Promise<LedgerRow[]> {
  const accounts = await prisma.account.findMany({ where: { userId, purpose } });

  const rowsPerAccount = await Promise.all(
    accounts.map(async (account: { id: string; name: string; openingBalance: number }) => {
      const transactions = await prisma.transaction.findMany({
        where: { accountId: account.id },
        orderBy: { date: "asc" },
        include: { category: true },
      });

      let balance = account.openingBalance;
      const rows: LedgerRow[] = [];
      for (const txn of transactions as {
        id: string;
        date: Date;
        amount: number;
        description: string;
        category: { name: string } | null;
      }[]) {
        balance += txn.amount;
        if (txn.date >= range.start && txn.date <= range.end) {
          rows.push({
            id: txn.id,
            date: txn.date,
            accountId: account.id,
            accountName: account.name,
            description: txn.description,
            categoryName: txn.category?.name ?? null,
            amount: txn.amount,
            balance,
          });
        }
      }
      return rows;
    }),
  );

  return rowsPerAccount
    .flat()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .reverse();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/ledger.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/ledger.ts src/lib/ledger.test.ts
git commit -m "feat(ledger): add listLedgerRows data layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Ledger table components

**Files:**
- Create: `src/components/ledger/ledger-table.tsx`
- Create: `src/components/ledger/loan-summary-table.tsx`
- Create: `src/components/ledger/ledger-range-picker.tsx`

No tests in this task — these are presentational components rendering data already covered by Task 2's tests; verified visually in Task 5.

- [ ] **Step 1: Create the shared transaction table component**

Create `src/components/ledger/ledger-table.tsx`:

```tsx
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import type { LedgerRow } from "@/lib/ledger";

export function LedgerTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: LedgerRow[];
  currency: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No transactions in this range.</p>
      ) : (
        <>
          {/* Desktop: real table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2">{row.date.toLocaleDateString()}</td>
                    <td className="p-2">{row.accountName}</td>
                    <td className="p-2">{row.description}</td>
                    <td className="p-2">{row.categoryName ?? "—"}</td>
                    <td className={`p-2 ${row.amount < 0 ? "text-destructive" : ""}`}>
                      {formatMoney(row.amount, currency)}
                    </td>
                    <td className="p-2">{formatMoney(row.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <Card key={row.id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{row.description}</p>
                  <span className={row.amount < 0 ? "text-destructive" : ""}>
                    {formatMoney(row.amount, currency)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.date.toLocaleDateString()} · {row.accountName}
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">Balance: {formatMoney(row.balance, currency)}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the loan summary table**

Create `src/components/ledger/loan-summary-table.tsx`:

```tsx
import { formatMoney } from "@/lib/money";
import { computeLoanTermMonths } from "@/lib/loan-term";
import { Card } from "@/components/ui/card";

const LOAN_CURRENCY = "PHP";

type LoanRow = {
  id: string;
  name: string;
  monthlyPayment: number;
  remainingBalance: number;
  interestRate: number;
  startDate: Date;
  endDate: Date | null;
  dueDay: number | null;
};

export function LoanSummaryTable({ loans }: { loans: LoanRow[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Debt (Loans)</h2>
      {loans.length === 0 ? (
        <p className="text-muted-foreground">No loans.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2">Name</th>
                  <th className="p-2">Remaining balance</th>
                  <th className="p-2">Monthly payment</th>
                  <th className="p-2">Interest rate</th>
                  <th className="p-2">Term</th>
                  <th className="p-2">Due day</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} className="border-t border-border">
                    <td className="p-2">{loan.name}</td>
                    <td className="p-2">{formatMoney(loan.remainingBalance, LOAN_CURRENCY)}</td>
                    <td className="p-2">{formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}</td>
                    <td className="p-2">{loan.interestRate}%</td>
                    <td className="p-2">
                      {loan.endDate ? `${computeLoanTermMonths(loan.startDate, loan.endDate)} mo` : "—"}
                    </td>
                    <td className="p-2">{loan.dueDay ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {loans.map((loan) => (
              <Card key={loan.id} className="p-3">
                <p className="font-medium">{loan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(loan.remainingBalance, LOAN_CURRENCY)} remaining ·{" "}
                  {formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}/mo · {loan.interestRate}% APR
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the date-range picker**

Create `src/components/ledger/ledger-range-picker.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function LedgerRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/ledger?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ledger-from" className="text-sm">
          From
        </label>
        <input
          id="ledger-from"
          type="date"
          defaultValue={from}
          onChange={(e) => updateParam("from", e.target.value)}
          className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ledger-to" className="text-sm">
          To
        </label>
        <input
          id="ledger-to"
          type="date"
          defaultValue={to}
          onChange={(e) => updateParam("to", e.target.value)}
          className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors (these components aren't wired into a page yet, but should still typecheck standalone).

```bash
git add src/components/ledger/
git commit -m "feat(ledger): add table, loan-summary, and range-picker components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The Ledger page and nav link

**Files:**
- Create: `src/app/(app)/ledger/page.tsx`
- Modify: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Add the nav link**

In `src/components/nav/nav-links.ts`, add `Table` to the lucide-react import list (it currently imports `Home, ArrowLeftRight, PiggyBank, Receipt, Wallet, CreditCard, BarChart3, Settings, CalendarRange, ShoppingCart, CalendarDays, History` — add `Table` to that list), then add a new entry to `planLinks` right after the Reports entry:

```typescript
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/ledger", label: "Ledger", icon: Table },
```

- [ ] **Step 2: Create the page**

Create `src/app/(app)/ledger/page.tsx`:

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listLedgerRows } from "@/lib/ledger";
import { listLoans } from "@/lib/loans";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { LoanSummaryTable } from "@/components/ledger/loan-summary-table";
import { LedgerRangePicker } from "@/components/ledger/ledger-range-picker";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;

  const now = new Date();
  const defaultPeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const start = params.from ? new Date(params.from) : defaultPeriod.startDate;
  const end = params.to ? new Date(params.to) : defaultPeriod.endDate;

  const [disposable, credit, restricted, savings, loans] = await Promise.all([
    listLedgerRows(prisma, user.id, "DISPOSABLE", { start, end }),
    listLedgerRows(prisma, user.id, "CREDIT", { start, end }),
    listLedgerRows(prisma, user.id, "RESTRICTED", { start, end }),
    listLedgerRows(prisma, user.id, "SAVINGS", { start, end }),
    listLoans(prisma, user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ledger</h1>

      <LedgerRangePicker from={start.toISOString().slice(0, 10)} to={end.toISOString().slice(0, 10)} />

      <LedgerTable title="Disposable" rows={disposable} currency={user.currency} />
      <LedgerTable title="Credit" rows={credit} currency={user.currency} />
      <LedgerTable title="Restricted" rows={restricted} currency={user.currency} />
      <LedgerTable title="Savings" rows={savings} currency={user.currency} />
      <LoanSummaryTable loans={loans} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/ledger/page.tsx src/components/nav/nav-links.ts
git commit -m "feat(ledger): add the Ledger page and nav link

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification — and STOP before deploying

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new/updated ones from Tasks 1 and 2.

- [ ] **Step 2: Typecheck, lint, and build**

Run in order: `npx tsc --noEmit`, `npx eslint src/lib/credit-cards.ts src/lib/ledger.ts src/components/ledger/ src/app/\(app\)/ledger/page.tsx src/components/nav/nav-links.ts`, `npx next build`
Expected: all clean.

- [ ] **Step 3: Manual verification in the local dev server**

Start the dev server (`WS_NO_BUFFER_UTIL=1 WS_NO_UTF_8_VALIDATE=1 npx next dev --webpack`, per this project's Neon/websocket requirement — see `docs/ARCHITECTURE.md`) and, using the demo account or a throwaway test account:

1. Create or use an existing credit card with a purchase already on it (so it shows a balance owed).
2. Make a payment toward that card from a Disposable or Savings account (Loans & Cards page → "Make a payment").
3. Confirm the card's balance dropped by the payment amount on: the Accounts page, the Loans & Cards page, and the new `/ledger` page's Credit table.
4. On `/ledger`, confirm: the Credit table shows both the purchase and the payment as separate rows (payment described as "Payment from {account name}"); all five tables render; the date-range picker defaults to the current cycle and updates the tables when changed; rows are newest-first with a sensible running balance.
5. Clean up any test data created (throwaway account/transactions), and if the demo account was used, run `npm run db:seed-demo` afterward.

- [ ] **Step 4: STOP — show the user, do not deploy yet**

Per the design spec's explicit rollout instruction: do **not** push to production after this task. Show the user the result (e.g. screenshots of `/ledger`, or walk them through it live) and wait for their explicit approval before deploying. This is a deliberate exception to this codebase's usual "verify then ship" pattern for this session.
