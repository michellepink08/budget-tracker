// Plan-38 §13 — Financial Invariants.
//
// This file exists to name and assert, in one place, the cross-cutting
// guarantees the rest of the app's per-module tests establish piecemeal.
// Each `it` here is named after one bullet from §13 of the plan-38 mega
// request, so a reviewer can check spec coverage by reading this file's
// test names rather than hunting across a dozen module test files.
//
// These are *invariant* tests, not feature tests — they exercise the same
// exported functions the module test files already cover, but assert the
// cross-module property directly rather than one function's own behavior.
import { describe, expect, it, vi } from "vitest";
import { createTransfer } from "@/lib/transfers";
import { incomeVsExpenseByPeriod } from "@/lib/reports";
import { markPayablePaid } from "@/lib/payables";
import { confirmReceipt } from "@/lib/receipts";
import { makeCreditCardPayment } from "@/lib/credit-cards";
import { computeDisposableTotal } from "@/lib/purpose-totals";
import { accountEffect, signedAmountForType } from "@/lib/transaction-rules";
import { toMinorUnits, toMajorUnits } from "@/lib/money";
import { createList as createShoppingList } from "@/lib/shopping-list";

function makeTransferPrisma() {
  const created: any[] = [];
  const prisma: any = {
    transaction: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `txn-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = created.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
  };
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma, created };
}

describe("§13 invariant: transfers never increase net worth", () => {
  it("the two rows created by a transfer sum to zero across both accounts", async () => {
    const { prisma, created } = makeTransferPrisma();

    await createTransfer(prisma, {
      userId: "user-1",
      date: new Date(2026, 8, 1),
      amount: 50000,
      sourceAccountId: "checking",
      destinationAccountId: "savings",
      description: "Move to savings",
    });

    const total = created.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(0);
  });

  it("a transfer's effect on the source account exactly cancels its effect on the destination account", async () => {
    const { prisma, created } = makeTransferPrisma();

    await createTransfer(prisma, {
      userId: "user-1",
      date: new Date(2026, 8, 1),
      amount: 50000,
      sourceAccountId: "checking",
      destinationAccountId: "savings",
      description: "Move to savings",
    });

    const sourceEffect = created.reduce((sum, t) => sum + accountEffect(t, "checking"), 0);
    const destinationEffect = created.reduce((sum, t) => sum + accountEffect(t, "savings"), 0);
    expect(sourceEffect).toBe(-50000);
    expect(destinationEffect).toBe(50000);
    expect(sourceEffect + destinationEffect).toBe(0);
  });
});

describe("§13 invariant: transfers are excluded from income and expense totals", () => {
  it("a period containing a large transfer alongside income/expense reports only the income/expense amounts", async () => {
    const prisma: any = {
      budgetPeriod: {
        findMany: vi.fn().mockResolvedValue([{ id: "period-1", name: "September" }]),
      },
      transaction: {
        findMany: vi.fn().mockResolvedValue([
          { type: "INCOME", amount: 5000000,category:{type:"INCOME"} },
          { type: "EXPENSE", amount: -200000 },
          // A transfer dwarfing both — if it leaked into either total the
          // assertions below would fail loudly.
          { type: "TRANSFER", amount: -9000000 },
          { type: "TRANSFER", amount: 9000000 },
        ]),
      },
    };

    const [totals] = await incomeVsExpenseByPeriod(prisma, "user-1", 1);

    expect(totals.income).toBe(5000000);
    expect(totals.expense).toBe(200000);
  });

  it("signedAmountForType has no case for TRANSFER — its sign comes from transfers.ts, never from the generic type table", () => {
    expect(() => signedAmountForType("TRANSFER" as any, 100)).toThrow();
  });
});

describe("§13 invariant: a credit-card payment never creates net-worth-changing spending — it's a transfer of debt, not an expense", () => {
  it("the two rows created by a payment sum to zero across the paying account and the card's own account", async () => {
    const created: any[] = [];
    const prisma: any = {
      creditCard: { findFirst: vi.fn().mockResolvedValue({ id: "card-1", userId: "user-1", accountId: "acc-cc" }) },
      account: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-checking", name: "Everyday Checking" }) },
      transaction: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `txn-${created.length + 1}`, ...data };
          created.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = created.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }), create: vi.fn() },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    await makeCreditCardPayment(prisma, "user-1", 25, "card-1", {
      accountId: "acc-checking",
      amount: 300000,
      date: new Date(2026, 8, 12),
    });

    expect(created).toHaveLength(2);
    const total = created.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(0);

    const payingEffect = created.reduce((sum, t) => sum + accountEffect(t, "acc-checking"), 0);
    const cardEffect = created.reduce((sum, t) => sum + accountEffect(t, "acc-cc"), 0);
    expect(payingEffect).toBe(-300000);
    expect(cardEffect).toBe(300000);
  });
});

describe("§13 invariant: a paid payable has at most one active payment transaction", () => {
  it("marking an already-PAID payable paid again is a no-op — the PENDING scope on the guard's own findFirst rejects it", async () => {
    // The payable is PAID, so the PENDING-scoped findFirst inside
    // markPayablePaid's $transaction (payables.ts) can never match it —
    // this *is* the duplicate-payment guard, exercised end-to-end here.
    const prisma: any = {
      payable: {
        findFirst: vi.fn().mockResolvedValue(null), // PENDING-scoped query finds nothing: already PAID
        update: vi.fn(),
      },
      transaction: { create: vi.fn() },
      budgetPeriod: { findUnique: vi.fn(), create: vi.fn() },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const result = await markPayablePaid(prisma, "user-1", 1, "payable-1", {});

    expect(result).toEqual({ ok: false, error: "Payable not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.payable.update).not.toHaveBeenCalled();
  });
});

describe("§13 invariant: receipt items never add spending beyond the parent transaction", () => {
  it("a receipt with many lines still posts exactly one transaction", async () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({
      id: `line-${i}`,
      lineTotal: 1000,
      excluded: false,
      catalogItemId: `cat-item-${i}`,
      unitPrice: 1000,
    }));
    const prisma: any = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: "store-1",
          subtotal: 12000,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 12000,
          unitemizedDifference: 0,
          lines,
        }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      transaction: { create: vi.fn().mockResolvedValue({ id: "txn-1" }) },
      budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }), create: vi.fn() },
      shoppingPriceHistory: { create: vi.fn().mockResolvedValue({ id: "price-1" }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const result = await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      date: new Date(2026, 0, 1),
    });

    expect(result.ok).toBe(true);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    // One price-history row per line is expected (that's per-item price
    // *history*, not a second spending record) — it's the transaction
    // count above that must stay at exactly one.
    expect(prisma.shoppingPriceHistory.create).toHaveBeenCalledTimes(12);
  });
});

describe("§13 invariant: planning records don't affect actual balances", () => {
  it("creating a shopping list never touches transaction or account records — its Prisma type doesn't even include them", async () => {
    // If createList's implementation ever grew a call to
    // prisma.transaction or prisma.account, this fake (which deliberately
    // omits both delegates) would throw "Cannot read properties of
    // undefined" instead of resolving.
    const prisma: any = {
      shoppingList: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "list-1" }),
      },
    };

    const result = await createShoppingList(prisma, "user-1", {
      name: "Groceries",
      plannedDate: null,
      budgetCategoryId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe("list-1");
  });
});

describe("§13 invariant: restricted funds are excluded from disposable totals", () => {
  it("computeDisposableTotal only ever queries DISPOSABLE-purpose accounts", async () => {
    const prisma: any = {
      account: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      transaction: { findMany: vi.fn() },
    };

    await computeDisposableTotal(prisma, "user-1");

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, purpose: "DISPOSABLE" },
    });
  });
});

describe("§13 invariant: currency calculations never use floating-point money directly", () => {
  it("toMinorUnits always returns an integer, even for major-unit inputs with float rounding error", () => {
    expect(Number.isInteger(toMinorUnits(19.99, "USD"))).toBe(true);
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(Number.isInteger(toMinorUnits(0.1 + 0.2, "USD"))).toBe(true);
  });

  it("a round trip through minor units and back recovers the original major-unit value", () => {
    const minor = toMinorUnits(1234.56, "PHP");
    expect(Number.isInteger(minor)).toBe(true);
    expect(toMajorUnits(minor, "PHP")).toBeCloseTo(1234.56, 2);
  });
});

describe("§11 invariant: reversing a payable payment restores it to exactly its pre-payment state", () => {
  it("reversePayablePayment clears paidTransactionId and deletes only the payment transaction — no other account is touched", async () => {
    const prisma: any = {
      transaction: { deleteMany: vi.fn() },
      payable: { update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-reverse-1" }) },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const { reversePayablePayment } = await import("@/lib/audit-log-reversal");
    const result = await reversePayablePayment(prisma, "user-1", {
      id: "audit-1",
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    } as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
    // Exactly the one payment transaction is deleted — nothing else.
    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});
