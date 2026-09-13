import { describe, expect, it, vi } from "vitest";
import {
  createPayable,
  listDuePayables,
  listPayables,
  markPayablePaid,
  updatePayable,
} from "@/lib/payables";

const SAMPLE_PAYABLE = {
  id: "payable-1",
  userId: "user-1",
  name: "Electric bill",
  amount: 250000,
  dueDate: new Date(2026, 8, 20),
  accountId: "acc-1",
  categoryId: "cat-1",
  status: "PENDING",
  paidTransactionId: null,
  recurringPayableId: null,
};

function makeFakePrisma(payable: unknown = SAMPLE_PAYABLE) {
  const prisma = {
    payable: {
      create: vi.fn().mockResolvedValue({ id: "payable-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(payable),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma as any;
}

describe("createPayable", () => {
  it("creates a payable scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Electric bill",
      amount: 250000,
      dueDate: new Date(2026, 8, 20),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createPayable(prisma, "user-1", input);

    expect(prisma.payable.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("createPayable — dueDateConfirmed and notes", () => {
  it("passes dueDateConfirmed and notes through to the create call", async () => {
    const prisma = { payable: { create: vi.fn().mockResolvedValue({ id: "pay-1" }) } } as any;

    await createPayable(prisma, "user-1", {
      name: "EastWest hospital bill",
      amount: 1551914,
      dueDate: new Date(2026, 9, 5),
      dueDateConfirmed: false,
      accountId: "acc-1",
      notes: "estimated from last month's statement",
    });

    expect(prisma.payable.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "EastWest hospital bill",
        amount: 1551914,
        dueDate: new Date(2026, 9, 5),
        dueDateConfirmed: false,
        accountId: "acc-1",
        notes: "estimated from last month's statement",
      },
    });
  });
});

describe("updatePayable", () => {
  it("updates only a pending payable belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updatePayable(prisma, "user-1", "payable-1", { amount: 300000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.updateMany).toHaveBeenCalledWith({
      where: { id: "payable-1", userId: "user-1", status: "PENDING" },
      data: { amount: 300000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.payable.updateMany.mockResolvedValue({ count: 0 });

    const result = await updatePayable(prisma, "user-1", "payable-1", { amount: 300000 });

    expect(result).toEqual({ ok: false, error: "Payable not found" });
  });
});

describe("listPayables", () => {
  it("scopes to the user and excludes paid payables by default", async () => {
    const prisma = makeFakePrisma();

    await listPayables(prisma, "user-1");

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      orderBy: { dueDate: "asc" },
    });
  });

  it("includes paid payables when asked", async () => {
    const prisma = makeFakePrisma();

    await listPayables(prisma, "user-1", { includePaid: true });

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("listDuePayables", () => {
  it("scopes to the user, pending payables whose dueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDuePayables(prisma, "user-1", asOf);

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING", dueDate: { lte: asOf } },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("markPayablePaid", () => {
  it("creates an expense transaction and marks the payable paid", async () => {
    const prisma = makeFakePrisma();

    const result = await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("EXPENSE");
    expect(txnArgs.amount).toBe(-250000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.description).toBe("Electric bill");

    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PAID", paidTransactionId: "txn-1" },
    });
  });

  it("wraps the PENDING check, the transaction, and the status update in a single $transaction (the actual duplicate-payment guard)", async () => {
    const prisma = makeFakePrisma();
    await markPayablePaid(prisma, "user-1", 25, "payable-1", {});
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("applies an amount/date override instead of the payable's defaults", async () => {
    const prisma = makeFakePrisma();

    await markPayablePaid(prisma, "user-1", 25, "payable-1", {
      amount: 260000,
      date: new Date(2026, 8, 19),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-260000);
    expect(txnArgs.date).toEqual(new Date(2026, 8, 19));
  });

  it("reports not found for a payable the user doesn't own, or already paid", async () => {
    const prisma = makeFakePrisma(null);

    const result = await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(result).toEqual({ ok: false, error: "Payable not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("records an audit entry for the payment", async () => {
    const prisma = makeFakePrisma();

    await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "PAYABLE_PAYMENT",
        entityId: "payable-1",
        action: "CREATE",
        source: "FORM",
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
});
