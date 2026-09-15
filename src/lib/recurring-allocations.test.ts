import { describe, expect, it, vi } from "vitest";
import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

vi.mock("@/lib/budget-allocations", () => ({
  createAllocation: vi.fn().mockResolvedValue({ ok: true, id: "alloc-new" }),
}));

import { createAllocation } from "@/lib/budget-allocations";

function makeFakePrisma(loans: unknown[] = [], recurringPayables: unknown[] = []) {
  return {
    loan: { findMany: vi.fn().mockResolvedValue(loans) },
    recurringPayable: { findMany: vi.fn().mockResolvedValue(recurringPayables) },
  } as any;
}

describe("materializeRecurringAllocations", () => {
  it("only queries active, category-linked loans and recurring payables", async () => {
    const prisma = makeFakePrisma();

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, categoryId: { not: null }, subcategoryId: { not: null } },
    });
    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, categoryId: { not: null } },
    });
  });

  it("creates a subcategory-level allocation for every active loan with a category", async () => {
    const prisma = makeFakePrisma([
      { id: "loan-1", categoryId: "cat-loan", subcategoryId: "sub-1", monthlyPayment: 1500000 },
    ]);

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(createAllocation).toHaveBeenCalledWith(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-loan",
      subcategoryId: "sub-1",
      plannedAmount: 1500000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  });

  it("creates a whole-category allocation for every active category-linked recurring payable", async () => {
    const prisma = makeFakePrisma([], [{ id: "rp-1", categoryId: "cat-rent", amount: 1500000 }]);

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(createAllocation).toHaveBeenCalledWith(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-rent",
      subcategoryId: null,
      plannedAmount: 1500000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  });

  it("continues past a conflicting allocation instead of throwing", async () => {
    (createAllocation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: "conflict" });
    const prisma = makeFakePrisma(
      [{ id: "loan-1", categoryId: "cat-loan", subcategoryId: "sub-1", monthlyPayment: 1500000 }],
      [{ id: "rp-1", categoryId: "cat-rent", amount: 1500000 }],
    );

    await expect(materializeRecurringAllocations(prisma, "user-1", "period-1")).resolves.not.toThrow();
    expect(createAllocation).toHaveBeenCalledTimes(2);
  });
});
