import { describe, expect, it, vi } from "vitest";
import { computeConfirmedReserves, computeDisposableTotal, computeSavingsTotal } from "@/lib/purpose-totals";

function makeFakePrisma(options: { accounts?: unknown[]; balances?: Record<string, number> } = {}) {
  const accounts = options.accounts ?? [];
  const balances = options.balances ?? {};
  return {
    account: {
      findMany: vi.fn((args: { where: { purpose: string } }) =>
        Promise.resolve((accounts as any[]).filter((a) => a.purpose === args.where.purpose)),
      ),
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

describe("computeDisposableTotal", () => {
  it("sums balances only for DISPOSABLE-purpose accounts", async () => {
    const accounts = [
      { id: "checking", purpose: "DISPOSABLE", openingBalance: 0 },
      { id: "savings", purpose: "SAVINGS", openingBalance: 0 },
    ];
    const prisma = makeFakePrisma({ accounts, balances: { checking: 50000, savings: 100000 } });

    const total = await computeDisposableTotal(prisma, "user-1");

    expect(total).toBe(50000);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, purpose: "DISPOSABLE" },
    });
  });

  it("returns 0 when there are no DISPOSABLE accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });
    const total = await computeDisposableTotal(prisma, "user-1");
    expect(total).toBe(0);
  });
});

describe("computeSavingsTotal", () => {
  it("sums balances only for SAVINGS-purpose accounts", async () => {
    const accounts = [
      { id: "checking", purpose: "DISPOSABLE", openingBalance: 0 },
      { id: "savings", purpose: "SAVINGS", openingBalance: 0 },
    ];
    const prisma = makeFakePrisma({ accounts, balances: { checking: 50000, savings: 100000 } });

    const total = await computeSavingsTotal(prisma, "user-1");

    expect(total).toBe(100000);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, purpose: "SAVINGS" },
    });
  });

  it("returns 0 when there are no SAVINGS accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });
    const total = await computeSavingsTotal(prisma, "user-1");
    expect(total).toBe(0);
  });
});

describe("computeConfirmedReserves", () => {
  it("sums assignedAmount only for goals on a DISPOSABLE-purpose account", async () => {
    const prisma = {
      savingsGoal: {
        findMany: vi.fn(async () => [
          { assignedAmount: 1000, account: { purpose: "DISPOSABLE" } },
          { assignedAmount: 9000, account: { purpose: "SAVINGS" } },
        ]),
      },
    } as any;

    const total = await computeConfirmedReserves(prisma, "user-1");

    expect(total).toBe(1000);
    expect(prisma.savingsGoal.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { account: true },
    });
  });

  it("returns 0 when there are no goals (the realistic, common case)", async () => {
    const prisma = { savingsGoal: { findMany: vi.fn(async () => []) } } as any;
    const total = await computeConfirmedReserves(prisma, "user-1");
    expect(total).toBe(0);
  });
});
