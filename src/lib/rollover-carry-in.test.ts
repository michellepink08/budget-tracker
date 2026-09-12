import { describe, expect, it, vi } from "vitest";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";

function makeFakePrisma(previousPeriod: unknown, previousAllocation: unknown, transactions: unknown[]) {
  return {
    budgetPeriod: {
      findFirst: vi.fn().mockResolvedValue(previousPeriod),
    },
    budgetAllocation: {
      findUnique: vi.fn().mockResolvedValue(previousAllocation),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  } as any;
}

describe("resolveRolloverCarryIn", () => {
  it("returns 0 when there is no previous period", async () => {
    const prisma = makeFakePrisma(null, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("returns 0 when the previous period had no allocation for this category", async () => {
    const prisma = makeFakePrisma({ id: "period-prev", startDate: new Date(2026, 7, 25) }, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("computes the carry from the previous period's allocation and actual spend", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 0, rolloverMode: "CARRY_UNUSED" },
      [{ amount: -6000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(4000);
    expect(prisma.budgetPeriod.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", startDate: { lt: new Date(2026, 8, 25) } },
      orderBy: { startDate: "desc" },
    });
    expect(prisma.budgetAllocation.findUnique).toHaveBeenCalledWith({
      where: { budgetPeriodId_categoryId: { budgetPeriodId: "period-prev", categoryId: "cat-1" } },
    });
  });

  it("includes a prior carry-in when computing the previous period's effective planned amount", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 2000, rolloverMode: "CARRY_BOTH" },
      [{ amount: -9000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    // effectivePlanned = 10000 + 2000 = 12000; actual = 9000; unused = 3000
    expect(carry).toBe(3000);
  });
});
