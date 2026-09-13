import { describe, expect, it, vi } from "vitest";
import { computeLiquidFunds } from "@/lib/liquid-funds";

function makeFakePrisma(options: { accounts?: unknown[]; balances?: Record<string, number> } = {}) {
  const accounts = options.accounts ?? [];
  const balances = options.balances ?? {};
  return {
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve((accounts as any[]).find((a) => a.id === args.where.id)),
      ),
    },
    transaction: {
      findMany: vi.fn((args: { where: { accountId: string } }) => {
        const accountId = args.where.accountId;
        const balance = balances[accountId] ?? 0;
        return Promise.resolve(balance === 0 ? [] : [{ accountId, amount: balance }]);
      }),
    },
  } as any;
}

describe("computeLiquidFunds", () => {
  it("queries only eligible accounts and sums their balances", async () => {
    const accounts = [
      {
        id: "checking",
        openingBalance: 0,
      },
      {
        id: "savings",
        openingBalance: 0,
      },
    ];
    const prisma = makeFakePrisma({ accounts, balances: { checking: 50000, savings: 100000 } });

    const total = await computeLiquidFunds(prisma, "user-1");

    expect(total).toBe(150000);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        purpose: { in: ["DISPOSABLE", "SAVINGS"] },
      },
    });
  });

  it("returns 0 when there are no eligible accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });

    const total = await computeLiquidFunds(prisma, "user-1");

    expect(total).toBe(0);
  });
});
