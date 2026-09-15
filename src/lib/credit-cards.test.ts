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
    expect(outgoingArgs.creditCardId).toBe("card-1");

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
