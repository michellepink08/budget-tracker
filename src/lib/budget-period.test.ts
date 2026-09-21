import { describe, expect, it, vi } from "vitest";
import { assertOwnedBudgetPeriod, resolveBudgetPeriodForDate } from "@/lib/budget-period";

vi.mock("@/lib/recurring-allocations", () => ({
  materializeRecurringAllocations: vi.fn().mockResolvedValue(undefined),
}));

import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

function makeFakePrisma(existing: unknown = null) {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "period-new" }),
      upsert: vi.fn().mockImplementation(async ({create}) => ({...create,id:create.id})),
    },
  } as any;
}

describe("resolveBudgetPeriodForDate", () => {
  it("reuses a cycle concurrently created by another request without reseeding it",async()=>{
    vi.mocked(materializeRecurringAllocations).mockClear();
    const prisma=makeFakePrisma();
    prisma.budgetPeriod.upsert.mockResolvedValue({id:"concurrent-period"});
    expect(await resolveBudgetPeriodForDate(prisma,"user-1",new Date("2026-09-17"),11)).toEqual({id:"concurrent-period"});
    expect(materializeRecurringAllocations).not.toHaveBeenCalled();
  });
  it("returns the existing period for that cycle if one already exists", async () => {
    const existing = { id: "period-1" };
    const prisma = makeFakePrisma(existing);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toBe(existing);
    expect(prisma.budgetPeriod.create).not.toHaveBeenCalled();
    expect(materializeRecurringAllocations).not.toHaveBeenCalled();
  });

  it("creates a new period matching the cycle when none exists, and materializes recurring allocations for it", async () => {
    const prisma = makeFakePrisma(null);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(prisma.budgetPeriod.upsert).toHaveBeenCalledTimes(1);
    const args = prisma.budgetPeriod.upsert.mock.calls[0][0];
    expect(args.create.userId).toBe("user-1");
    expect(args.create.startDate).toEqual(new Date("2026-09-11"));
    expect(args.create.endDate).toEqual(new Date("2026-10-10"));
    expect(args.create.status).toBe("ACTIVE");
    expect(args.update).toEqual({startDate:new Date("2026-09-11")});
    expect(result.id).toBe(args.create.id);
    expect(materializeRecurringAllocations).toHaveBeenCalledWith(prisma, "user-1", result.id);
  });
});

describe("assertOwnedBudgetPeriod", () => {
  it("returns true when the budget period belongs to the user", async () => {
    const prisma = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) } } as any;
    expect(await assertOwnedBudgetPeriod(prisma, "user-1", "period-1")).toBe(true);
  });

  it("returns false when the budget period belongs to another user", async () => {
    const prisma = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedBudgetPeriod(prisma, "user-1", "period-owned-by-someone-else")).toBe(false);
  });
});
