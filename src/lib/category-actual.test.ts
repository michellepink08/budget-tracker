import { describe, expect, it, vi } from "vitest";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";

describe("computeCategoryActual", () => {
  it("sums transaction amounts and flips sign (net outflow becomes positive)", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3000 }, { amount: -2000 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(5000);
    expect(findMany).toHaveBeenCalledWith({ where: { budgetPeriodId: "period-1", categoryId: "cat-1" } });
  });
});

describe("computeSubcategoryActual", () => {
  it("sums transaction amounts scoped by subcategoryId, not categoryId", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -1500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeSubcategoryActual(prisma, "period-1", "sub-1");

    expect(actual).toBe(1500);
    expect(findMany).toHaveBeenCalledWith({ where: { budgetPeriodId: "period-1", subcategoryId: "sub-1" } });
  });

  it("returns 0 (not -0) when there are no matching transactions", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeSubcategoryActual(prisma, "period-1", "sub-1");

    expect(Object.is(actual, 0)).toBe(true);
  });
});
