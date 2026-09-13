import { describe, expect, it, vi } from "vitest";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";

function makeFakePrisma(options: {
  accounts?: { id: string; name: string; openingBalance: number }[];
  payablesByAccount?: Record<string, { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[]>;
} = {}) {
  const accounts = options.accounts ?? [];
  const payablesByAccount = options.payablesByAccount ?? {};

  return {
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve(accounts.find((a) => a.id === args.where.id)),
      ),
    },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    payable: {
      findMany: vi.fn((args: { where: { accountId: string } }) =>
        Promise.resolve(payablesByAccount[args.where.accountId] ?? []),
      ),
    },
  } as any;
}

describe("listRestrictedFundGroups", () => {
  it("returns an empty array when there are no restricted accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });
    const result = await listRestrictedFundGroups(prisma, "user-1");
    expect(result).toEqual([]);
  });

  it("queries only restricted, non-debt accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 0 }] });
    await listRestrictedFundGroups(prisma, "user-1");
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        purpose: "RESTRICTED",
      },
    });
  });

  it("reports zero obligation and a null nextPayable when there are no pending payables", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 50000 }],
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group).toEqual({
      accountId: "acc-1",
      accountName: "Emergency Fund",
      balance: 50000,
      obligationTotal: 0,
      nextPayable: null,
      projectedBalance: 50000,
    });
  });

  it("sums standalone (non-recurring) payables independently", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 100000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 5), recurringPayableId: null },
          { id: "p2", name: "Property tax", amount: 15000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.obligationTotal).toBe(35000);
    expect(group.nextPayable).toEqual({ name: "Property tax", amount: 15000, dueDate: new Date(2026, 9, 1) });
    expect(group.projectedBalance).toBe(65000);
  });

  it("keeps only the earliest-due payable within a shared recurringPayableId group", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 100000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "old", name: "Insurance", amount: 20000, dueDate: new Date(2026, 8, 1), recurringPayableId: "rule-1" },
          { id: "new", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 1), recurringPayableId: "rule-1" },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.obligationTotal).toBe(20000);
    expect(group.nextPayable?.dueDate).toEqual(new Date(2026, 8, 1));
  });

  it("allows projectedBalance to go negative when obligations exceed the balance", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 10000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Big bill", amount: 30000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.projectedBalance).toBe(-20000);
  });
});
