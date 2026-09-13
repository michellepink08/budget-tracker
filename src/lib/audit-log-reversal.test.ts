import { describe, expect, it, vi } from "vitest";
import { reverseTransaction, reverseTransfer, reversePayablePayment } from "@/lib/audit-log-reversal";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: { create: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    payable: { update: vi.fn() },
    auditLog: { create: vi.fn(async ({ data }: any) => ({ id: "audit-reverse-1", ...data })) },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe("reverseTransaction", () => {
  it("CREATE: deletes the transaction and writes a REVERSE entry", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: JSON.stringify({ rows: [{ id: "txn-1" }] }),
      relatedRecordIds: [],
    };

    const result = await reverseTransaction(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: "TRANSACTION", action: "REVERSE", reversalOfId: "audit-1" }),
    });
  });

  it("DELETE: recreates every row from previousValuesJson.rows", async () => {
    const prisma = makeFakePrisma();
    const outgoing = { id: "txn-1", userId: "user-1", amount: -5000 };
    const incoming = { id: "txn-2", userId: "user-1", amount: 5000 };
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "DELETE",
      source: "FORM",
      previousValuesJson: JSON.stringify({ rows: [outgoing, incoming] }),
      newValuesJson: null,
      relatedRecordIds: ["txn-2"],
    };

    const result = await reverseTransaction(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: outgoing });
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: incoming });
  });

  it("UPDATE: restores previousValuesJson onto the row", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "UPDATE",
      source: "FORM",
      previousValuesJson: JSON.stringify({ description: "Old" }),
      newValuesJson: JSON.stringify({ description: "New" }),
      relatedRecordIds: [],
    };

    await reverseTransaction(prisma, "user-1", entry as any);

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: { description: "Old" },
    });
  });
});

describe("reverseTransfer", () => {
  it("deletes both linked rows and writes a REVERSE entry", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSFER",
      entityId: "txn-out",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-in"],
    };

    const result = await reverseTransfer(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-out", "txn-in"] }, userId: "user-1" },
    });
  });
});

describe("reversePayablePayment", () => {
  it("deletes the payment transaction and reverts the payable to PENDING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reversePayablePayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
  });
});
