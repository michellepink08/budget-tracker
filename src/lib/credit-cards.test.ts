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

    expect(result).toEqual({ ok: true, transactionId: "txn-1" });
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
