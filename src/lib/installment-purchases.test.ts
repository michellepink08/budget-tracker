import { describe, expect, it, vi } from "vitest";
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  listDueInstallmentPayments,
  listInstallmentPurchases,
  payInstallmentTerm,
} from "@/lib/installment-purchases";

const SAMPLE_PAYMENT = {
  id: "payment-1",
  userId: "user-1",
  installmentPurchaseId: "purchase-1",
  termNumber: 2,
  amount: 33333,
  dueDate: new Date(2026, 9, 12),
  status: "PENDING",
  paidTransactionId: null,
};

const SAMPLE_PURCHASE = {
  id: "purchase-1",
  userId: "user-1",
  name: "New laptop",
  totalAmount: 100000,
  numberOfTerms: 3,
  accountId: "acc-cc",
};

function makeFakePrisma(options: { payment?: unknown; purchase?: unknown } = {}) {
  const payment = "payment" in options ? options.payment : SAMPLE_PAYMENT;
  const purchase = "purchase" in options ? options.purchase : SAMPLE_PURCHASE;
  const prisma = {
    installmentPurchase: {
      create: vi.fn().mockResolvedValue({ id: "purchase-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(purchase),
      findMany: vi.fn().mockResolvedValue([]),
    },
    installmentPayment: {
      create: vi.fn().mockResolvedValue({ id: "payment-new" }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(payment),
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

describe("createInstallmentPurchase", () => {
  it("creates the purchase and generates one InstallmentPayment per term", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "New laptop",
      totalAmount: 100000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    };

    await createInstallmentPurchase(prisma, "user-1", input);

    expect(prisma.installmentPurchase.create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...input },
    });
    expect(prisma.installmentPayment.create).toHaveBeenCalledTimes(3);
  });

  it("splits totalAmount evenly across terms, with any remainder on the last term", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 100000, // 100000 / 3 = 33333.33...
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const amounts = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.amount);
    expect(amounts).toEqual([33333, 33333, 33334]);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(100000);
  });

  it("sets each term's dueDate one month after the previous term, starting at startDate", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 90000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const dueDates = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.dueDate);
    expect(dueDates).toEqual([
      new Date(2026, 8, 12),
      new Date(2026, 9, 12),
      new Date(2026, 10, 12),
    ]);
  });

  it("numbers terms starting at 1", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 90000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const termNumbers = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.termNumber);
    expect(termNumbers).toEqual([1, 2, 3]);
  });
});

describe("archiveInstallmentPurchase", () => {
  it("sets archivedAt for a purchase belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveInstallmentPurchase(prisma, "user-1", "purchase-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.installmentPurchase.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "purchase-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.installmentPurchase.updateMany.mockResolvedValue({ count: 0 });

    const result = await archiveInstallmentPurchase(prisma, "user-1", "purchase-1");

    expect(result).toEqual({ ok: false, error: "Installment purchase not found" });
  });
});

describe("listInstallmentPurchases", () => {
  it("scopes to the user, excludes archived purchases by default, and includes payments", async () => {
    const prisma = makeFakePrisma();

    await listInstallmentPurchases(prisma, "user-1");

    expect(prisma.installmentPurchase.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { payments: true },
    });
  });
});

describe("listDueInstallmentPayments", () => {
  it("scopes to the user, pending payments whose dueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueInstallmentPayments(prisma, "user-1", asOf);

    expect(prisma.installmentPayment.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING", dueDate: { lte: asOf } },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("payInstallmentTerm", () => {
  it("creates a CREDIT_CARD_PAYMENT transaction and marks the term paid", async () => {
    const prisma = makeFakePrisma();

    const result = await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("CREDIT_CARD_PAYMENT");
    expect(txnArgs.amount).toBe(-33333);
    expect(txnArgs.accountId).toBe("acc-checking");
    expect(txnArgs.description).toBe("Installment: New laptop (term 2 of 3)");

    expect(prisma.installmentPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "PAID", paidTransactionId: "txn-1" },
    });
  });

  it("applies an amount/date override instead of the term's defaults", async () => {
    const prisma = makeFakePrisma();

    await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
      amount: 40000,
      date: new Date(2026, 9, 10),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-40000);
    expect(txnArgs.date).toEqual(new Date(2026, 9, 10));
  });

  it("reports not found for a term the user doesn't own, or already paid", async () => {
    const prisma = makeFakePrisma({ payment: null });

    const result = await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
    });

    expect(result).toEqual({ ok: false, error: "Installment payment not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("records an audit entry for the payment", async () => {
    const prisma = makeFakePrisma();

    await payInstallmentTerm(prisma, "user-1", 25, "payment-1", { accountId: "acc-checking" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "INSTALLMENT_PAYMENT",
        entityId: "payment-1",
        action: "CREATE",
        source: "FORM",
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
});
