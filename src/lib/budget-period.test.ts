import { describe, expect, it, vi } from "vitest";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";

function makeFakePrisma(existing: unknown = null) {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "period-new" }),
    },
  } as any;
}

describe("resolveBudgetPeriodForDate", () => {
  it("returns the existing period for that cycle if one already exists", async () => {
    const existing = { id: "period-1" };
    const prisma = makeFakePrisma(existing);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toBe(existing);
    expect(prisma.budgetPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a new period matching the cycle when none exists", async () => {
    const prisma = makeFakePrisma(null);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toEqual({ id: "period-new" });
    expect(prisma.budgetPeriod.create).toHaveBeenCalledTimes(1);
    const args = prisma.budgetPeriod.create.mock.calls[0][0];
    expect(args.data.userId).toBe("user-1");
    expect(args.data.startDate).toEqual(new Date(2026, 8, 11));
    expect(args.data.endDate).toEqual(new Date(2026, 9, 10));
    expect(args.data.status).toBe("ACTIVE");
  });
});
