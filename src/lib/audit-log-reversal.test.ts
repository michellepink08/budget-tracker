import { describe, expect, it, vi } from "vitest";
import {
  reverseTransaction,
  reverseTransfer,
  reversePayablePayment,
  reverseReceiptConfirmation,
  reverseInstallmentPayment,
  reverseCreditCardPayment,
  reverseReconciliation,
  reverseRecurringOccurrence,
  reverseRecurringPayableOccurrence,
  reverseReminderPayment,
} from "@/lib/audit-log-reversal";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: { create: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    payable: { update: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    receipt: { update: vi.fn() },
    shoppingPriceHistory: { deleteMany: vi.fn() },
    installmentPayment: { update: vi.fn() },
    recurringRule: { findFirst: vi.fn(), update: vi.fn() },
    recurringPayable: { findFirst: vi.fn(), update: vi.fn() },
    customReminder: { update: vi.fn() },
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

describe("reverseReceiptConfirmation", () => {
  it("deletes the transaction and every price-history row, and reverts the receipt", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "RECEIPT_CONFIRMATION",
      entityId: "receipt-1",
      action: "CREATE",
      source: "RECEIPT",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1", "price-1", "price-2"],
    };

    const result = await reverseReceiptConfirmation(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.shoppingPriceHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["price-1", "price-2"] }, userId: "user-1" },
    });
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: { status: "REVIEWED", transactionId: null },
    });
  });
});

describe("reverseInstallmentPayment", () => {
  it("deletes the transaction and reverts the installment payment to PENDING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "INSTALLMENT_PAYMENT", entityId: "payment-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reverseInstallmentPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.installmentPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
  });
});

describe("reverseCreditCardPayment", () => {
  it("deletes the transaction", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "CREDIT_CARD_PAYMENT", entityId: "txn-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null, relatedRecordIds: [],
    };

    const result = await reverseCreditCardPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});

describe("reverseReconciliation", () => {
  it("deletes the balance-adjustment transaction", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "RECONCILIATION", entityId: "txn-1",
      action: "CREATE", source: "SYSTEM", previousValuesJson: null, newValuesJson: null, relatedRecordIds: [],
    };

    const result = await reverseReconciliation(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});

describe("reverseRecurringOccurrence", () => {
  const entry = {
    id: "audit-1", userId: "user-1", entityType: "RECURRING_OCCURRENCE", entityId: "rule-1",
    action: "CREATE", source: "RECURRING_RULE",
    previousValuesJson: JSON.stringify({ nextDate: new Date(2026, 8, 25) }),
    newValuesJson: JSON.stringify({ nextDate: new Date(2026, 9, 25) }),
    relatedRecordIds: ["txn-1"],
  };

  it("restores nextDate and deletes the transaction when nothing has advanced since", async () => {
    const prisma = makeFakePrisma({
      recurringRule: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDate: new Date(2026, 9, 25) }), update: vi.fn() },
    });

    const result = await reverseRecurringOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 8, 25) },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });

  it("refuses when nextDate has already moved past this confirm", async () => {
    const prisma = makeFakePrisma({
      recurringRule: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDate: new Date(2026, 10, 25) }), update: vi.fn() },
    });

    const result = await reverseRecurringOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: false, error: "A later occurrence has already been confirmed" });
    expect(prisma.recurringRule.update).not.toHaveBeenCalled();
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe("reverseRecurringPayableOccurrence", () => {
  const entry = {
    id: "audit-1", userId: "user-1", entityType: "RECURRING_PAYABLE_OCCURRENCE", entityId: "rule-1",
    action: "CREATE", source: "RECURRING_RULE",
    previousValuesJson: JSON.stringify({ nextDueDate: new Date(2026, 8, 25) }),
    newValuesJson: JSON.stringify({ nextDueDate: new Date(2026, 9, 25) }),
    relatedRecordIds: ["payable-1"],
  };

  it("restores nextDueDate and deletes the created payable when it's still PENDING", async () => {
    const prisma = makeFakePrisma({
      recurringPayable: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDueDate: new Date(2026, 9, 25) }), update: vi.fn() },
      payable: { findFirst: vi.fn().mockResolvedValue({ id: "payable-1", status: "PENDING" }), deleteMany: vi.fn(), update: vi.fn() },
    });

    const result = await reverseRecurringPayableOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["payable-1"] }, userId: "user-1" } });
    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDueDate: new Date(2026, 8, 25) },
    });
  });

  it("refuses when the created payable has already been paid", async () => {
    const prisma = makeFakePrisma({
      recurringPayable: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDueDate: new Date(2026, 9, 25) }), update: vi.fn() },
      payable: { findFirst: vi.fn().mockResolvedValue({ id: "payable-1", status: "PAID" }), deleteMany: vi.fn(), update: vi.fn() },
    });

    const result = await reverseRecurringPayableOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: false, error: "This bill has already been paid — unpay it first" });
    expect(prisma.payable.deleteMany).not.toHaveBeenCalled();
  });
});

describe("reverseReminderPayment", () => {
  it("deletes the transaction and reverts the reminder to UPCOMING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "REMINDER_PAYMENT", entityId: "reminder-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reverseReminderPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.customReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { state: "UPCOMING", linkedTransactionId: null },
    });
  });
});
