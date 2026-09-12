import { describe, expect, it, vi } from "vitest";
import { seedDemoData } from "@/lib/demo-seed";

function makeFakePrisma() {
  const deleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  return {
    installmentPayment: { deleteMany: deleteManyMock },
    installmentPurchase: { deleteMany: deleteManyMock },
    payable: { deleteMany: deleteManyMock },
    recurringPayable: { deleteMany: deleteManyMock },
    recurringRule: { deleteMany: deleteManyMock },
    creditCard: { deleteMany: deleteManyMock },
    loan: { deleteMany: deleteManyMock },
    budgetAllocation: { deleteMany: deleteManyMock },
    transaction: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockResolvedValue({ id: "txn-new" }),
      update: vi.fn().mockResolvedValue({}),
    },
    budgetPeriod: {
      deleteMany: deleteManyMock,
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    subcategory: { deleteMany: deleteManyMock },
    category: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cat-${data.name}`, ...data })),
    },
    account: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `acc-${data.name}`, ...data })),
    },
  } as any;
}

describe("seedDemoData", () => {
  it("clears every table scoped to the given user before recreating anything", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    for (const model of [
      "installmentPayment",
      "installmentPurchase",
      "payable",
      "recurringPayable",
      "recurringRule",
      "creditCard",
      "loan",
      "budgetAllocation",
      "transaction",
      "budgetPeriod",
      "subcategory",
      "category",
      "account",
    ] as const) {
      expect((prisma as any)[model].deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    }
  });

  it("creates the three demo accounts and six demo categories", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    expect(prisma.account.create).toHaveBeenCalledTimes(3);
    expect(prisma.category.create).toHaveBeenCalledTimes(6);
  });

  it("creates every transaction through the transaction table (via the cycle-aware domain functions)", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    // 6 plain transactions (salary, rent, groceries, dining, refund, card
    // payment) + 2 linked transfer rows = 8.
    expect(prisma.transaction.create).toHaveBeenCalledTimes(8);
  });
});
