# Plan 3B.1: Loans & Credit Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first sub-plan of Plan 3B — `Loan` and `CreditCard` schema, and a new "Loans & Cards" page listing both with a "make a payment" flow for each, reusing the existing transaction machinery unchanged.

**Architecture:** Two independent, differently-shaped models, chosen to fit how debt is already tracked in this app rather than inventing a parallel balance system:

- **`Loan`** is a debt tracked on its own — it does **not** link to an `Account`. `remainingBalance` is the one piece of state this plan stores rather than computes (everywhere else in the app, balances are computed from transactions — see the design spec's "Account-balance rules" — but a loan's payoff schedule isn't itself expressed as ledger rows anywhere, so there's nothing to compute it from). Making a payment does two things: logs a normal `LOAN_PAYMENT` transaction against whichever of the user's accounts the money left (unchanged single-row behavior from Plan 2A — this plan does **not** touch `src/lib/transaction-rules.ts` or `src/lib/transfers.ts`), and decrements `Loan.remainingBalance` by the same amount, clamped at zero.
- **`CreditCard`** is metadata attached one-to-one to an existing `Account` of type `CREDIT_CARD` (`accountId` is `@unique`). The account's own balance already reflects purchases and payments via `computeAccountBalance` (Plan 2A) — `CreditCard` only adds the fields an `Account` doesn't have (credit limit, statement/due days, interest rate). A card's "make a payment" convenience logs a normal `CREDIT_CARD_PAYMENT` transaction against the paying account, same as today's existing transaction type — no new balance math, no stored card balance.

**Documented simplification (flagging rather than silently deciding):** an alternative design would make loan/credit-card payments two *linked* rows (like a transfer) so the debt account's own balance visibly decreases when paid — mirroring how transfers work. This plan does not do that: it keeps the existing single-row `LOAN_PAYMENT`/`CREDIT_CARD_PAYMENT` behavior from Plan 2A unchanged (so nothing already shipped or seeded changes meaning), and gives `Loan` its own explicit `remainingBalance` field instead. If you want the linked-row version later, that's a `transaction-rules.ts`/`transfers.ts` change, not part of this plan.

**Tech Stack:** Same as prior plans. No new dependencies.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Core differentiators" #6, "Navigation / Pages"); `src/lib/transactions.ts` (`createExpenseLikeTransaction`, reused unchanged); `src/lib/accounts.ts` (`listAccounts`, reused to find `CREDIT_CARD`-type accounts for the card-linking dropdown).

**Environment reminder:** update `prisma/schema.prisma` **and** `prisma/schema.sql` together, apply with `npm run db:push` (this machine can't run `prisma db push`/`migrate` directly).

**Scope boundary — explicitly NOT in this plan:** installment purchases/schedules (Plan 3B.2); dashboard/reports (Plan 3B.3); moving Categories/Recurring into Settings or finishing the nav to match the spec's final order, i.e. adding "Reports" (Plan 3B.4 — this plan only adds the "Loans & Cards" link); no amortization engine (`interestRate` is display-only, not used in any calculation).

---

### Task 1: Add `Loan` and `CreditCard` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add relation fields**

`User` — add:

```prisma
  loans       Loan[]
  creditCards CreditCard[]
```

`Account` — add:

```prisma
  creditCard CreditCard?
```

- [ ] **Step 2: Append the new models**

```prisma
model Loan {
  id               String    @id @default(cuid())
  userId           String
  name             String
  principal        Int       // minor units
  interestRate     Float     // annual %, display-only
  monthlyPayment   Int       // minor units
  remainingBalance Int       // minor units — decremented by makeLoanPayment, clamped at 0
  startDate        DateTime
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])
}

model CreditCard {
  id            String   @id @default(cuid())
  userId        String
  accountId     String   @unique
  creditLimit   Int      // minor units
  statementDay  Int      // 1-31
  paymentDueDay Int      // 1-31
  interestRate  Float    // annual %, display-only
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user    User    @relation(fields: [userId], references: [id])
  account Account @relation(fields: [accountId], references: [id])
}
```

- [ ] **Step 3: Add the matching tables to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "Loan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "principal" INTEGER NOT NULL,
  "interestRate" REAL NOT NULL,
  "monthlyPayment" INTEGER NOT NULL,
  "remainingBalance" INTEGER NOT NULL,
  "startDate" DATETIME NOT NULL,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "Loan_userId_idx" ON "Loan" ("userId");

CREATE TABLE IF NOT EXISTS "CreditCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL UNIQUE,
  "creditLimit" INTEGER NOT NULL,
  "statementDay" INTEGER NOT NULL,
  "paymentDueDay" INTEGER NOT NULL,
  "interestRate" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id")
);
CREATE INDEX IF NOT EXISTS "CreditCard_userId_idx" ON "CreditCard" ("userId");
```

- [ ] **Step 4: Apply the schema**

```bash
npm run db:push
```

Expected: `Loan` and `CreditCard` tables created, no errors.

- [ ] **Step 5: Regenerate the Prisma client and verify compile**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Loan and CreditCard models"
```

---

### Task 2: Domain — `src/lib/loans.ts`

**Files:**
- Create: `src/lib/loans.ts`
- Test: `src/lib/loans.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/loans.test.ts
import { describe, expect, it, vi } from "vitest";
import { archiveLoan, createLoan, listLoans, makeLoanPayment, updateLoan } from "@/lib/loans";

const SAMPLE_LOAN = {
  id: "loan-1",
  userId: "user-1",
  name: "Car loan",
  principal: 50000000,
  interestRate: 5.5,
  monthlyPayment: 1500000,
  remainingBalance: 3000000,
  startDate: new Date(2025, 0, 1),
  archivedAt: null,
};

function makeFakePrisma(loan: unknown = SAMPLE_LOAN) {
  return {
    loan: {
      create: vi.fn().mockResolvedValue({ id: "loan-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(loan),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
  } as any;
}

describe("createLoan", () => {
  it("creates a loan scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Car loan",
      principal: 50000000,
      interestRate: 5.5,
      monthlyPayment: 1500000,
      remainingBalance: 3000000,
      startDate: new Date(2025, 0, 1),
    };

    await createLoan(prisma, "user-1", input);

    expect(prisma.loan.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateLoan", () => {
  it("updates only when the loan belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.loan.updateMany).toHaveBeenCalledWith({
      where: { id: "loan-1", userId: "user-1" },
      data: { monthlyPayment: 1600000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.loan.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
  });
});

describe("archiveLoan", () => {
  it("sets archivedAt for a loan belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveLoan(prisma, "user-1", "loan-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.loan.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "loan-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listLoans", () => {
  it("scopes to the user and excludes archived loans by default", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived loans when asked", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1", { includeArchived: true });

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("makeLoanPayment", () => {
  it("creates a LOAN_PAYMENT transaction and decrements remainingBalance", async () => {
    const prisma = makeFakePrisma();

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("LOAN_PAYMENT");
    expect(txnArgs.amount).toBe(-1500000);
    expect(txnArgs.accountId).toBe("acc-1");

    expect(prisma.loan.update).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { remainingBalance: 1500000 },
    });
  });

  it("clamps remainingBalance at zero instead of going negative", async () => {
    const prisma = makeFakePrisma();

    await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 5000000, // more than the 3000000 remaining
      date: new Date(2026, 8, 12),
    });

    expect(prisma.loan.update).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { remainingBalance: 0 },
    });
  });

  it("reports not found for a loan the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/loans.test.ts
```

Expected: FAIL — `src/lib/loans.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/loans.ts
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LoanInput = {
  name: string;
  principal: number; // minor units
  interestRate: number; // annual %, display-only
  monthlyPayment: number; // minor units
  remainingBalance: number; // minor units
  startDate: Date;
};

export type LoanMutationResult = { ok: true } | { ok: false; error: string };

export async function createLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  input: LoanInput,
) {
  return prisma.loan.create({ data: { userId, ...input } });
}

export async function updateLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
  input: Partial<LoanInput>,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function archiveLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function listLoans(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.loan.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export type LoanPaymentInput = { accountId: string; amount: number; date: Date };

export async function makeLoanPayment(
  prisma: Pick<PrismaClient, "loan" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  loanId: string,
  input: LoanPaymentInput,
): Promise<LoanMutationResult> {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) {
    return { ok: false, error: "Loan not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "LOAN_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    description: `Loan payment: ${loan.name}`,
  });

  const remainingBalance = Math.max(0, loan.remainingBalance - input.amount);
  await prisma.loan.update({ where: { id: loanId }, data: { remainingBalance } });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/loans.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add loans domain functions"
```

---

### Task 3: Domain — `src/lib/credit-cards.ts`

**Files:**
- Create: `src/lib/credit-cards.ts`
- Test: `src/lib/credit-cards.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/credit-cards.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createCreditCard,
  listCreditCards,
  makeCreditCardPayment,
  updateCreditCard,
} from "@/lib/credit-cards";

const SAMPLE_CARD = {
  id: "card-1",
  userId: "user-1",
  accountId: "acc-cc",
  creditLimit: 10000000,
  statementDay: 15,
  paymentDueDay: 5,
  interestRate: 24,
};

function makeFakePrisma(card: unknown = SAMPLE_CARD) {
  return {
    creditCard: {
      create: vi.fn().mockResolvedValue({ id: "card-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(card),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
  } as any;
}

describe("createCreditCard", () => {
  it("creates a card scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      accountId: "acc-cc",
      creditLimit: 10000000,
      statementDay: 15,
      paymentDueDay: 5,
      interestRate: 24,
    };

    await createCreditCard(prisma, "user-1", input);

    expect(prisma.creditCard.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateCreditCard", () => {
  it("updates only when the card belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateCreditCard(prisma, "user-1", "card-1", { creditLimit: 12000000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.creditCard.updateMany).toHaveBeenCalledWith({
      where: { id: "card-1", userId: "user-1" },
      data: { creditLimit: 12000000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.creditCard.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateCreditCard(prisma, "user-1", "card-1", { creditLimit: 12000000 });

    expect(result).toEqual({ ok: false, error: "Credit card not found" });
  });
});

describe("listCreditCards", () => {
  it("scopes to the user", async () => {
    const prisma = makeFakePrisma();

    await listCreditCards(prisma, "user-1");

    expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });
});

describe("makeCreditCardPayment", () => {
  it("creates a CREDIT_CARD_PAYMENT transaction against the paying account", async () => {
    const prisma = makeFakePrisma();

    const result = await makeCreditCardPayment(prisma, "user-1", 25, "card-1", {
      accountId: "acc-checking",
      amount: 300000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("CREDIT_CARD_PAYMENT");
    expect(txnArgs.amount).toBe(-300000);
    expect(txnArgs.accountId).toBe("acc-checking");
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

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/credit-cards.test.ts
```

Expected: FAIL — `src/lib/credit-cards.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/credit-cards.ts
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type CreditCardInput = {
  accountId: string;
  creditLimit: number; // minor units
  statementDay: number; // 1-31
  paymentDueDay: number; // 1-31
  interestRate: number; // annual %, display-only
};

export type CreditCardMutationResult = { ok: true } | { ok: false; error: string };

export async function createCreditCard(
  prisma: Pick<PrismaClient, "creditCard">,
  userId: string,
  input: CreditCardInput,
) {
  return prisma.creditCard.create({ data: { userId, ...input } });
}

export async function updateCreditCard(
  prisma: Pick<PrismaClient, "creditCard">,
  userId: string,
  creditCardId: string,
  input: Partial<CreditCardInput>,
): Promise<CreditCardMutationResult> {
  const result = await prisma.creditCard.updateMany({
    where: { id: creditCardId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Credit card not found" };
  }
  return { ok: true };
}

export async function listCreditCards(prisma: Pick<PrismaClient, "creditCard">, userId: string) {
  return prisma.creditCard.findMany({ where: { userId } });
}

export type CreditCardPaymentInput = { accountId: string; amount: number; date: Date };

// No stored balance to update — the card's Account already reflects
// purchases and payments via computeAccountBalance (Plan 2A). This just
// logs the normal CREDIT_CARD_PAYMENT transaction against the paying
// account, exactly as that transaction type already works.
export async function makeCreditCardPayment(
  prisma: Pick<PrismaClient, "creditCard" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  creditCardId: string,
  input: CreditCardPaymentInput,
): Promise<CreditCardMutationResult> {
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } });
  if (!card) {
    return { ok: false, error: "Credit card not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "CREDIT_CARD_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    description: "Credit card payment",
  });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/credit-cards.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add credit cards domain functions"
```

---

### Task 4: Validation schemas

**Files:**
- Create: `src/lib/validations/loan.ts`, `src/lib/validations/credit-card.ts`
- Test: `src/lib/validations/loan.test.ts`, `src/lib/validations/credit-card.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/loan.test.ts
import { describe, expect, it } from "vitest";
import { loanSchema } from "@/lib/validations/loan";

describe("loanSchema", () => {
  it("accepts a valid loan", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative principal", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 0,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative remaining balance", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: -1,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative interest rate", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 500000,
      interestRate: -1,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
```

```typescript
// src/lib/validations/credit-card.test.ts
import { describe, expect, it } from "vitest";
import { creditCardSchema } from "@/lib/validations/credit-card";

describe("creditCardSchema", () => {
  it("accepts a valid credit card", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 15,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative credit limit", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 0,
      statementDay: 15,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a statementDay outside 1-31", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 32,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a paymentDueDay outside 1-31", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 15,
      paymentDueDay: 0,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/loan.test.ts src/lib/validations/credit-card.test.ts
```

Expected: FAIL — neither schema file exists yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/validations/loan.ts
import { z } from "zod";

export const loanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  principal: z.number().positive("Principal must be greater than zero"), // major units
  interestRate: z.number().min(0, "Interest rate can't be negative"),
  monthlyPayment: z.number().positive("Monthly payment must be greater than zero"), // major units
  remainingBalance: z.number().min(0, "Remaining balance can't be negative"), // major units
  startDate: z.date(),
});
```

```typescript
// src/lib/validations/credit-card.ts
import { z } from "zod";

export const creditCardSchema = z.object({
  accountId: z.string().min(1),
  creditLimit: z.number().positive("Credit limit must be greater than zero"), // major units
  statementDay: z.number().int().min(1).max(31),
  paymentDueDay: z.number().int().min(1).max(31),
  interestRate: z.number().min(0, "Interest rate can't be negative"),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/loan.test.ts src/lib/validations/credit-card.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add loan and credit card validation schemas"
```

---

### Task 5: Server actions

**Files:**
- Create: `src/actions/loan.actions.ts`, `src/actions/credit-card.actions.ts`

- [ ] **Step 1: Implement `src/actions/loan.actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loanSchema } from "@/lib/validations/loan";
import { archiveLoan, createLoan, makeLoanPayment, updateLoan } from "@/lib/loans";
import { toMinorUnits } from "@/lib/money";

export type LoanActionResult = { ok: true } | { ok: false; error: string };

const LOAN_CURRENCY = "PHP"; // loans aren't linked to an Account, so there's no per-loan currency yet

function parseLoanForm(formData: FormData) {
  return loanSchema.safeParse({
    name: formData.get("name"),
    principal: Number(formData.get("principal")),
    interestRate: Number(formData.get("interestRate")),
    monthlyPayment: Number(formData.get("monthlyPayment")),
    remainingBalance: Number(formData.get("remainingBalance")),
    startDate: new Date(String(formData.get("startDate"))),
  });
}

export async function createLoanAction(formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  await createLoan(prisma, session.user.id, {
    ...parsed.data,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    remainingBalance: toMinorUnits(parsed.data.remainingBalance, LOAN_CURRENCY),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function updateLoanAction(loanId: string, formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  const result = await updateLoan(prisma, session.user.id, loanId, {
    ...parsed.data,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    remainingBalance: toMinorUnits(parsed.data.remainingBalance, LOAN_CURRENCY),
  });

  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function archiveLoanAction(loanId: string): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveLoan(prisma, session.user.id, loanId);
  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function makeLoanPaymentAction(
  loanId: string,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await makeLoanPayment(prisma, user.id, user.cycleStartDay, loanId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
```

- [ ] **Step 2: Implement `src/actions/credit-card.actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { creditCardSchema } from "@/lib/validations/credit-card";
import { createCreditCard, makeCreditCardPayment, updateCreditCard } from "@/lib/credit-cards";
import { toMinorUnits } from "@/lib/money";

export type CreditCardActionResult = { ok: true } | { ok: false; error: string };

function parseCreditCardForm(formData: FormData) {
  return creditCardSchema.safeParse({
    accountId: formData.get("accountId"),
    creditLimit: Number(formData.get("creditLimit")),
    statementDay: Number(formData.get("statementDay")),
    paymentDueDay: Number(formData.get("paymentDueDay")),
    interestRate: Number(formData.get("interestRate")),
  });
}

export async function createCreditCardAction(formData: FormData): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCreditCardForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the credit card details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createCreditCard(prisma, session.user.id, {
    ...parsed.data,
    creditLimit: toMinorUnits(parsed.data.creditLimit, account.currency),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function updateCreditCardAction(
  creditCardId: string,
  formData: FormData,
): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCreditCardForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the credit card details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  const result = await updateCreditCard(prisma, session.user.id, creditCardId, {
    ...parsed.data,
    creditLimit: toMinorUnits(parsed.data.creditLimit, account.currency),
  });

  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function makeCreditCardPaymentAction(
  creditCardId: string,
  formData: FormData,
): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await makeCreditCardPayment(prisma, user.id, user.cycleStartDay, creditCardId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add server actions for loans and credit cards"
```

---

### Task 6: Loans & Cards UI — loans

**Files:**
- Create: `src/components/loans-cards/loan-form-dialog.tsx`, `src/components/loans-cards/loan-payment-dialog.tsx`, `src/components/loans-cards/loan-list.tsx`

- [ ] **Step 1: Implement `src/components/loans-cards/loan-form-dialog.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createLoanAction, updateLoanAction } from "@/actions/loan.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type FormValues = {
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: string;
};

type ExistingLoan = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: Date;
};

const LOAN_CURRENCY = "PHP";

export function LoanFormDialog({ existing }: { existing?: ExistingLoan }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          principal: toMajorUnits(existing.principal, LOAN_CURRENCY),
          interestRate: existing.interestRate,
          monthlyPayment: toMajorUnits(existing.monthlyPayment, LOAN_CURRENCY),
          remainingBalance: toMajorUnits(existing.remainingBalance, LOAN_CURRENCY),
          startDate: existing.startDate.toISOString().slice(0, 10),
        }
      : {
          name: "",
          principal: 0,
          interestRate: 0,
          monthlyPayment: 0,
          remainingBalance: 0,
          startDate: new Date().toISOString().slice(0, 10),
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("principal", String(values.principal));
    formData.set("interestRate", String(values.interestRate));
    formData.set("monthlyPayment", String(values.monthlyPayment));
    formData.set("remainingBalance", String(values.remainingBalance));
    formData.set("startDate", values.startDate);

    const result = existing
      ? await updateLoanAction(existing.id, formData)
      : await createLoanAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Loan updated" : "Loan added");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add loan"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit loan" : "Add loan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="principal">Original principal</Label>
            <Input
              id="principal"
              type="number"
              step="0.01"
              {...register("principal", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remainingBalance">Remaining balance</Label>
            <Input
              id="remainingBalance"
              type="number"
              step="0.01"
              {...register("remainingBalance", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyPayment">Monthly payment</Label>
            <Input
              id="monthlyPayment"
              type="number"
              step="0.01"
              {...register("monthlyPayment", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interestRate">Interest rate (annual %)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              {...register("interestRate", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `src/components/loans-cards/loan-payment-dialog.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { makeLoanPaymentAction } from "@/actions/loan.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AccountOption = { id: string; name: string; currency: string };

type FormValues = { accountId: string; amount: number; date: string };

export function LoanPaymentDialog({
  loanId,
  defaultAmount,
  accounts,
}: {
  loanId: string;
  defaultAmount: number; // minor units
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      accountId: accounts[0]?.id ?? "",
      amount: toMajorUnits(defaultAmount, accounts[0]?.currency ?? "PHP"),
      date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("amount", String(values.amount));
    formData.set("date", values.date);

    const result = await makeLoanPaymentAction(loanId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Make a payment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a loan payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("accountId")}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Implement `src/components/loans-cards/loan-list.tsx`**

```typescript
import { formatMoney } from "@/lib/money";
import { LoanFormDialog } from "@/components/loans-cards/loan-form-dialog";
import { LoanPaymentDialog } from "@/components/loans-cards/loan-payment-dialog";
import { archiveLoanAction } from "@/actions/loan.actions";
import { Button } from "@/components/ui/button";

const LOAN_CURRENCY = "PHP";

type LoanRow = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: Date;
};

export function LoanList({
  loans,
  payingAccounts,
}: {
  loans: LoanRow[];
  payingAccounts: { id: string; name: string; currency: string }[];
}) {
  if (loans.length === 0) {
    return <p className="text-muted-foreground">No loans yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {loans.map((loan) => (
        <div key={loan.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">{loan.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(loan.remainingBalance, LOAN_CURRENCY)} remaining of{" "}
              {formatMoney(loan.principal, LOAN_CURRENCY)} · {formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}
              /mo · {loan.interestRate}% APR
            </p>
          </div>
          <div className="flex gap-2">
            <LoanPaymentDialog
              loanId={loan.id}
              defaultAmount={loan.monthlyPayment}
              accounts={payingAccounts}
            />
            <LoanFormDialog existing={loan} />
            <form
              action={async () => {
                "use server";
                await archiveLoanAction(loan.id);
              }}
            >
              <Button type="submit" variant="ghost">
                Archive
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add loan form dialog, payment dialog, and loan list"
```

---

### Task 7: Loans & Cards UI — credit cards, the page, and the nav link

**Files:**
- Create: `src/components/loans-cards/credit-card-form-dialog.tsx`, `src/components/loans-cards/credit-card-payment-dialog.tsx`, `src/components/loans-cards/credit-card-list.tsx`, `src/app/(app)/loans-cards/page.tsx`
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Implement `src/components/loans-cards/credit-card-form-dialog.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCreditCardAction, updateCreditCardAction } from "@/actions/credit-card.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AccountOption = { id: string; name: string; currency: string };

type FormValues = {
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
};

type ExistingCard = {
  id: string;
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
};

export function CreditCardFormDialog({
  linkableAccounts,
  existing,
}: {
  linkableAccounts: AccountOption[];
  existing?: ExistingCard;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          accountId: existing.accountId,
          creditLimit: toMajorUnits(
            existing.creditLimit,
            linkableAccounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          statementDay: existing.statementDay,
          paymentDueDay: existing.paymentDueDay,
          interestRate: existing.interestRate,
        }
      : {
          accountId: linkableAccounts[0]?.id ?? "",
          creditLimit: 0,
          statementDay: 1,
          paymentDueDay: 1,
          interestRate: 0,
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("creditLimit", String(values.creditLimit));
    formData.set("statementDay", String(values.statementDay));
    formData.set("paymentDueDay", String(values.paymentDueDay));
    formData.set("interestRate", String(values.interestRate));

    const result = existing
      ? await updateCreditCardAction(existing.id, formData)
      : await createCreditCardAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Card updated" : "Card added");
    setOpen(false);
  }

  const noLinkableAccounts = !existing && linkableAccounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={noLinkableAccounts} />}>
        {existing ? "Edit" : "Add credit card"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit credit card" : "Add credit card"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Account</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              disabled={!!existing}
              {...register("accountId")}
            >
              {linkableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creditLimit">Credit limit</Label>
            <Input
              id="creditLimit"
              type="number"
              step="0.01"
              {...register("creditLimit", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statementDay">Statement day (1-31)</Label>
            <Input
              id="statementDay"
              type="number"
              min="1"
              max="31"
              {...register("statementDay", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentDueDay">Payment due day (1-31)</Label>
            <Input
              id="paymentDueDay"
              type="number"
              min="1"
              max="31"
              {...register("paymentDueDay", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interestRate">Interest rate (annual %)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              {...register("interestRate", { valueAsNumber: true })}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `src/components/loans-cards/credit-card-payment-dialog.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { makeCreditCardPaymentAction } from "@/actions/credit-card.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AccountOption = { id: string; name: string; currency: string };

type FormValues = { accountId: string; amount: number; date: string };

export function CreditCardPaymentDialog({
  creditCardId,
  payingAccounts,
}: {
  creditCardId: string;
  payingAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      accountId: payingAccounts[0]?.id ?? "",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("amount", String(values.amount));
    formData.set("date", values.date);

    const result = await makeCreditCardPaymentAction(creditCardId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Make a payment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a credit card payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("accountId")}
            >
              {payingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Implement `src/components/loans-cards/credit-card-list.tsx`**

```typescript
import { formatMoney } from "@/lib/money";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardPaymentDialog } from "@/components/loans-cards/credit-card-payment-dialog";

type CreditCardRow = {
  id: string;
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
  account: { name: string; currency: string; balance: number };
};

export function CreditCardList({
  cards,
  linkableAccounts,
  payingAccounts,
}: {
  cards: CreditCardRow[];
  linkableAccounts: { id: string; name: string; currency: string }[];
  payingAccounts: { id: string; name: string; currency: string }[];
}) {
  if (cards.length === 0) {
    return <p className="text-muted-foreground">No credit cards yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <div key={card.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">{card.account.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(card.account.balance, card.account.currency)} of{" "}
              {formatMoney(card.creditLimit, card.account.currency)} limit · statement day{" "}
              {card.statementDay} · due day {card.paymentDueDay} · {card.interestRate}% APR
            </p>
          </div>
          <div className="flex gap-2">
            <CreditCardPaymentDialog creditCardId={card.id} payingAccounts={payingAccounts} />
            <CreditCardFormDialog linkableAccounts={linkableAccounts} existing={card} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/app/(app)/loans-cards/page.tsx`**

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listLoans } from "@/lib/loans";
import { listCreditCards } from "@/lib/credit-cards";
import { computeAccountBalance } from "@/lib/account-balance";
import { LoanFormDialog } from "@/components/loans-cards/loan-form-dialog";
import { LoanList } from "@/components/loans-cards/loan-list";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardList } from "@/components/loans-cards/credit-card-list";

const DEBT_ACCOUNT_TYPES = ["CREDIT_CARD", "LOAN"];

export default async function LoansCardsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, loans, creditCards] = await Promise.all([
    listAccounts(prisma, userId),
    listLoans(prisma, userId),
    listCreditCards(prisma, userId),
  ]);

  const payingAccounts = accounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.accountType));

  const linkedAccountIds = new Set(creditCards.map((c) => c.accountId));
  const linkableAccounts = accounts.filter(
    (a) => a.accountType === "CREDIT_CARD" && !linkedAccountIds.has(a.id),
  );

  const cardsWithAccount = await Promise.all(
    creditCards.map(async (card) => {
      const account = accounts.find((a) => a.id === card.accountId)!;
      return {
        ...card,
        account: {
          name: account.name,
          currency: account.currency,
          balance: await computeAccountBalance(prisma, account.id),
        },
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Loans & Cards</h1>
        <div className="flex gap-2">
          <LoanFormDialog />
          <CreditCardFormDialog linkableAccounts={linkableAccounts} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Loans</h2>
        <LoanList loans={loans} payingAccounts={payingAccounts} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Credit cards</h2>
        <CreditCardList
          cards={cardsWithAccount}
          linkableAccounts={linkableAccounts}
          payingAccounts={payingAccounts}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the nav link**

In `src/components/nav/top-nav.tsx`, add `{ href: "/loans-cards", label: "Loans & Cards" }` to the `links` array, after `"Bills"` and before `"Recurring"`:

```typescript
const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bills", label: "Bills" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 6: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Loans & Cards page with credit card management"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 154 plus this plan's new tests — 9 loans + 6 credit-cards + 8 validation = 23 new tests, 177 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- Loans & Cards page loads with empty states for both loans and credit cards.
- Add a loan (principal, remaining balance less than principal, monthly payment, interest rate) — confirm it lists with the right remaining/principal/monthly/APR line.
- Make a payment on it for less than the remaining balance — confirm `remainingBalance` decreased by exactly the payment amount, and a `LOAN_PAYMENT` transaction appears on the Transactions page against the chosen paying account.
- Make a payment larger than the remaining balance — confirm it clamps at ₱0.00 rather than going negative.
- Add a credit card linked to the seeded `Everyday Rewards Card` account (`CREDIT_CARD` type) — confirm the "Account" dropdown only offers unlinked `CREDIT_CARD`-type accounts, and confirm it disappears from that dropdown once linked (add a second `CREDIT_CARD` account first if the demo data only seeds one, so the "no linkable accounts left" disabled state can also be checked).
- Confirm the credit card list shows the account's real computed balance against the entered credit limit.
- Make a credit card payment — confirm a `CREDIT_CARD_PAYMENT` transaction appears on the Transactions page against the chosen paying account (and, per this plan's documented simplification, confirm the card's own displayed balance does *not* change from that payment alone — only from `EXPENSE`/`CREDIT_CARD_PAYMENT` rows posted directly against the card's own account).
- Archive a loan — confirm it disappears from the list.
- Confirm "Loans & Cards" appears in the top nav in the right place.
- Clean up any test data created during this walkthrough (delete test loans/credit cards and their transactions) the same way prior plans' verification steps have.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
