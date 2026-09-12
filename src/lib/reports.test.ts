import { describe, expect, it, vi } from "vitest";
import { incomeVsExpenseByPeriod, spendingByCategory } from "@/lib/reports";

describe("spendingByCategory", () => {
  it("returns actual spend per EXPENSE category, sorted highest first, excluding zero/negative", async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cat-groceries", name: "Groceries" },
          { id: "cat-rent", name: "Rent" },
          { id: "cat-unused", name: "Unused" },
        ]),
      },
      transaction: {
        findMany: vi.fn((args: { where: { categoryId: string } }) => {
          const categoryId = args.where.categoryId;
          if (categoryId === "cat-groceries") return Promise.resolve([{ accountId: "a", amount: -3200 }]);
          if (categoryId === "cat-rent") return Promise.resolve([{ accountId: "a", amount: -15000 }]);
          return Promise.resolve([]);
        }),
      },
    } as any;

    const result = await spendingByCategory(prisma, "user-1", "period-1");

    expect(result).toEqual([
      { categoryId: "cat-rent", categoryName: "Rent", amount: 15000 },
      { categoryId: "cat-groceries", categoryName: "Groceries", amount: 3200 },
    ]);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "EXPENSE", archivedAt: null },
    });
  });

  it("returns an empty array when no category has any spending", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([{ id: "cat-1", name: "Unused" }]) },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;

    const result = await spendingByCategory(prisma, "user-1", "period-1");

    expect(result).toEqual([]);
  });
});

describe("incomeVsExpenseByPeriod", () => {
  it("returns income and expense totals per period, oldest to newest", async () => {
    const prisma = {
      budgetPeriod: {
        findMany: vi.fn().mockResolvedValue([
          { id: "period-2", name: "Cycle 2" },
          { id: "period-1", name: "Cycle 1" },
        ]),
      },
      transaction: {
        findMany: vi.fn((args: { where: { budgetPeriodId: string } }) => {
          if (args.where.budgetPeriodId === "period-1") {
            return Promise.resolve([
              { type: "INCOME", amount: 35000 },
              { type: "EXPENSE", amount: -15000 },
            ]);
          }
          return Promise.resolve([
            { type: "INCOME", amount: 40000 },
            { type: "EXPENSE", amount: -20000 },
          ]);
        }),
      },
    } as any;

    const result = await incomeVsExpenseByPeriod(prisma, "user-1", 6);

    expect(result).toEqual([
      { periodId: "period-1", periodName: "Cycle 1", income: 35000, expense: 15000 },
      { periodId: "period-2", periodName: "Cycle 2", income: 40000, expense: 20000 },
    ]);
    expect(prisma.budgetPeriod.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { startDate: "desc" },
      take: 6,
    });
  });

  it("returns an empty array when there are no periods yet", async () => {
    const prisma = {
      budgetPeriod: { findMany: vi.fn().mockResolvedValue([]) },
      transaction: { findMany: vi.fn() },
    } as any;

    const result = await incomeVsExpenseByPeriod(prisma, "user-1", 6);

    expect(result).toEqual([]);
  });
});
