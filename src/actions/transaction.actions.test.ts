import { describe, expect, it, vi } from "vitest";
import { createExpenseLikeTransaction } from "@/lib/transactions";
import { recordAudit } from "@/lib/audit-log";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: {
      create: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: "txn-1", userId: "user-1", linkedTransactionId: null, amount: -5000, type: "EXPENSE", description: "Coffee", notes: null, categoryId: "cat-1", subcategoryId: null }),
      deleteMany: vi.fn(),
      update: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }), create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

// Mirrors createTransactionAction's audit wiring exactly.
async function createTransactionWithAudit(prisma: any, userId: string, cycleStartDay: number, input: any) {
  return prisma.$transaction(async (tx: any) => {
    const transaction = await createExpenseLikeTransaction(tx, userId, cycleStartDay, input);
    await recordAudit(tx, {
      userId,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "CREATE",
      source: "FORM",
      newValues: { rows: [transaction] },
    });
    return transaction;
  });
}

describe("createTransactionAction's audit wiring", () => {
  it("records a TRANSACTION/CREATE audit entry", async () => {
    const prisma = makeFakePrisma();

    await createTransactionWithAudit(prisma, "user-1", 25, {
      type: "EXPENSE",
      amount: 5000,
      date: new Date(2026, 8, 1),
      accountId: "acc-1",
      description: "Coffee",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", entityType: "TRANSACTION", action: "CREATE", source: "FORM" }),
    });
  });
});
