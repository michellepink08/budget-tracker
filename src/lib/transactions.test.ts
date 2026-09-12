import { describe, expect, it, vi } from "vitest";
import {
  createExpenseLikeTransaction,
  createTransferTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/transactions";

function makeFakePrisma() {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe("createExpenseLikeTransaction", () => {
  it("signs the amount by type and resolves the budget period", async () => {
    const prisma = makeFakePrisma();

    await createExpenseLikeTransaction(prisma, "user-1", 11, {
      type: "EXPENSE",
      amount: 500, // minor units, positive magnitude from the form
      date: new Date(2026, 8, 15),
      accountId: "acc-1",
      description: "Groceries",
    });

    expect(prisma.budgetPeriod.findUnique).toHaveBeenCalled();
    const args = prisma.transaction.create.mock.calls[0][0].data;
    expect(args.userId).toBe("user-1");
    expect(args.type).toBe("EXPENSE");
    expect(args.amount).toBe(-500);
    expect(args.budgetPeriodId).toBe("period-1");
  });

  it("keeps an explicit manual budgetPeriodId instead of auto-resolving", async () => {
    const prisma = makeFakePrisma();

    await createExpenseLikeTransaction(prisma, "user-1", 11, {
      type: "INCOME",
      amount: 5000,
      date: new Date(2026, 8, 15),
      accountId: "acc-1",
      description: "Salary",
      budgetPeriodId: "period-manual",
    });

    expect(prisma.budgetPeriod.findUnique).not.toHaveBeenCalled();
    const args = prisma.transaction.create.mock.calls[0][0].data;
    expect(args.budgetPeriodId).toBe("period-manual");
    expect(args.amount).toBe(5000);
  });
});

describe("createTransferTransaction", () => {
  it("resolves the budget period and delegates to createTransfer", async () => {
    const prisma = makeFakePrisma();

    const result = await createTransferTransaction(prisma, "user-1", 11, {
      amount: 2000,
      date: new Date(2026, 8, 15),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-2",
      description: "Move funds",
    });

    expect(result.outgoingTransactionId).toBeDefined();
    expect(prisma.budgetPeriod.findUnique).toHaveBeenCalled();
  });
});

describe("updateTransaction", () => {
  it("only updates description/notes/category/subcategory, scoped to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateTransaction(prisma, "user-1", "txn-1", {
      description: "Updated",
      notes: "note",
      categoryId: "cat-2",
      subcategoryId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      data: { description: "Updated", notes: "note", categoryId: "cat-2", subcategoryId: null },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateTransaction(prisma, "user-1", "txn-1", { description: "x" });

    expect(result).toEqual({ ok: false, error: "Transaction not found" });
  });
});

describe("deleteTransaction", () => {
  it("deletes a single (non-transfer) row scoped to the user", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      userId: "user-1",
      linkedTransactionId: null,
    });

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1"] }, userId: "user-1" },
    });
  });

  it("deletes both linked rows for a transfer", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      userId: "user-1",
      linkedTransactionId: "txn-2",
    });

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1", "txn-2"] }, userId: "user-1" },
    });
  });

  it("reports not found for a transaction the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue(null);

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: false, error: "Transaction not found" });
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe("listTransactions", () => {
  it("always scopes to the user and applies given filters", async () => {
    const prisma = makeFakePrisma();

    await listTransactions(prisma, "user-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "EXPENSE",
      search: "grocer",
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 30),
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        accountId: "acc-1",
        categoryId: "cat-1",
        type: "EXPENSE",
        description: { contains: "grocer" },
        date: { gte: new Date(2026, 8, 1), lte: new Date(2026, 8, 30) },
      },
      orderBy: { date: "desc" },
    });
  });

  it("scopes to just the user when no filters are given", async () => {
    const prisma = makeFakePrisma();

    await listTransactions(prisma, "user-1", {});

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { date: "desc" },
    });
  });
});
