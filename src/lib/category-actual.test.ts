import { describe, expect, it, vi } from "vitest";
import { computeCategoryActual } from "@/lib/category-actual";

describe("computeCategoryActual", () => {
  it("returns positive net spend for a category with only expenses", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3200 }, { amount: -1500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(4700);
    expect(findMany).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-1", categoryId: "cat-1" },
    });
  });

  it("nets a refund against an expense in the same category", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3200 }, { amount: 500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(2700);
  });

  it("returns a negative actual when inflows exceed outflows", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -1000 }, { amount: 2500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(-1500);
  });

  it("returns 0 when there are no transactions", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(0);
  });
});
