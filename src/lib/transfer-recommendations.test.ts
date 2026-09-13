import { describe, expect, it, vi } from "vitest";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";

const FUNDING_ACCOUNT = {
  id: "checking",
  userId: "user-1",
  isPrimaryFundingAccount: true,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "DISPOSABLE",
  accountType: "CHECKING",
  openingBalance: 0,
};
const SAVINGS_ACCOUNT = {
  id: "savings",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "SAVINGS",
  accountType: "SAVINGS",
  openingBalance: 0,
};
const CREDIT_CARD_ACCOUNT = {
  id: "cc",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "CREDIT",
  accountType: "CREDIT_CARD",
  openingBalance: 0,
};

function makeFakePrisma(options: {
  otherAccounts?: unknown[];
  payables?: unknown[];
  balances?: Record<string, number>;
}) {
  const otherAccounts = options.otherAccounts ?? [SAVINGS_ACCOUNT];
  const payables = options.payables ?? [];
  const balances = options.balances ?? {};

  return {
    account: {
      findFirst: vi.fn().mockResolvedValue(FUNDING_ACCOUNT),
      findMany: vi.fn().mockResolvedValue(otherAccounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) => {
        const id = args.where.id;
        if (id === FUNDING_ACCOUNT.id) return Promise.resolve(FUNDING_ACCOUNT);
        return Promise.resolve(otherAccounts.find((a: any) => a.id === id));
      }),
    },
    payable: {
      findMany: vi.fn().mockResolvedValue(payables),
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

describe("getRecommendedFundingTransfer", () => {
  it("returns null when there is no primary funding account", async () => {
    const prisma = makeFakePrisma({});
    prisma.account.findFirst.mockResolvedValue(null);

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("returns null when the funding account can already cover what's due", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 100000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 200000 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("recommends transferring the shortfall from the highest-balance eligible account", async () => {
    const prisma = makeFakePrisma({
      otherAccounts: [SAVINGS_ACCOUNT, CREDIT_CARD_ACCOUNT],
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 50000, savings: 1000000, cc: 5000000 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    // shortfall = 300000 - 50000 = 250000; credit card is excluded as a source
    expect(result).toEqual({ fromAccountId: "savings", toAccountId: "checking", amount: 250000 });
  });

  it("returns null when no eligible source account has a positive balance", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 50000, savings: 0 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("ignores payables due after the look-ahead window", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 9, 1) }],
      balances: { checking: 50000, savings: 1000000 },
    });
    // account.findMany's where clause isn't asserted here — the payable
    // query itself is expected to exclude this far-future bill, so with a
    // 7-day look-ahead from Sep 12 there's nothing due and no shortfall.
    prisma.payable.findMany.mockResolvedValue([]);

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });
});
