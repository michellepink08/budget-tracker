import { describe, expect, it, vi } from "vitest";
import { checkOverspendWarning } from "@/lib/overspend-warning";

vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(9500),
  computeSubcategoryActual: vi.fn().mockResolvedValue(15500),
}));

describe("checkOverspendWarning", () => {
  it("returns null when the transaction has no category at all", async () => {
    const prisma = { budgetAllocation: { findFirst: vi.fn() } } as any;

    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", null, null, "PHP");

    expect(warning).toBeNull();
    expect(prisma.budgetAllocation.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when nothing is budgeted for this category/subcategory", async () => {
    const prisma = { budgetAllocation: { findFirst: vi.fn().mockResolvedValue(null) } } as any;

    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBeNull();
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1", categoryId: "cat-1", subcategoryId: null },
      include: { category: true, subcategory: true },
    });
  });

  it("returns null when the whole-category allocation still has remaining budget", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 10000,
          rolloverAmount: 0,
          category: { name: "Groceries" },
          subcategory: null,
        }),
      },
    } as any;

    // computeCategoryActual is mocked to 9500 — under the 10000 planned
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBeNull();
  });

  it("warns with the category name and overage when a whole-category allocation goes negative", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 9000, // ₱90.00
          rolloverAmount: 0,
          category: { name: "Groceries" },
          subcategory: null,
        }),
      },
    } as any;

    // effectivePlanned 9000 (₱90.00), actual 9500 (₱95.00, mocked) => remaining -500 (₱5.00 over)
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBe("You're ₱5.00 over budget for Groceries this cutoff.");
  });

  it("warns with 'Category — Subcategory' when a subcategory-level allocation goes negative", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 15000, // ₱150.00
          rolloverAmount: 0,
          category: { name: "Home & Groceries" },
          subcategory: { name: "Market / Grocery / Food" },
        }),
      },
    } as any;

    // effectivePlanned 15000 (₱150.00), actual 15500 (₱155.00, mocked) => remaining -500 (₱5.00 over)
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", "sub-1", "PHP");

    expect(warning).toBe("You're ₱5.00 over budget for Home & Groceries — Market / Grocery / Food this cutoff.");
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1", categoryId: "cat-1", subcategoryId: "sub-1" },
      include: { category: true, subcategory: true },
    });
  });
});
