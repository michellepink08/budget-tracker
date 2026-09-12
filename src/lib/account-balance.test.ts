import { describe, expect, it, vi } from "vitest";
import { computeAccountBalance } from "@/lib/account-balance";

function makeFakePrisma(openingBalance: number, transactions: { amount: number }[]) {
  return {
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance }),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions.map((t) => ({ accountId: "acc-1", ...t }))),
    },
  } as any;
}

describe("computeAccountBalance", () => {
  it("sums the opening balance and every transaction row's signed amount", async () => {
    const prisma = makeFakePrisma(10000, [
      { amount: 2000 }, // income
      { amount: -500 }, // expense
      { amount: 1000 }, // incoming transfer
      { amount: -300 }, // transfer fee
    ]);

    const balance = await computeAccountBalance(prisma, "acc-1");

    expect(balance).toBe(10000 + 2000 - 500 + 1000 - 300);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { accountId: "acc-1" } });
  });

  it("returns just the opening balance when there are no transactions", async () => {
    const prisma = makeFakePrisma(5000, []);
    const balance = await computeAccountBalance(prisma, "acc-1");
    expect(balance).toBe(5000);
  });
});
