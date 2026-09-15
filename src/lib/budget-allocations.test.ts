import { describe, expect, it, vi } from "vitest";
import {
  computeAvailableAllocationOptions,
  createAllocation,
  listAllocationsWithActuals,
  updateAllocation,
} from "@/lib/budget-allocations";

vi.mock("@/lib/rollover-carry-in", () => ({
  resolveRolloverCarryIn: vi.fn().mockResolvedValue(1500),
}));
vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(4700),
  computeSubcategoryActual: vi.fn().mockResolvedValue(1200),
}));

describe("createAllocation", () => {
  function basePrisma(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      budgetAllocation: {
        create: vi.fn().mockResolvedValue({ id: "alloc-1" }),
        findFirst: vi.fn().mockResolvedValue(null), // no conflicting allocation by default
      },
      budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ startDate: new Date(2026, 8, 25) }) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
      subcategory: { findFirst: vi.fn().mockResolvedValue({ id: "sub-1", categoryId: "cat-1" }) },
      ...overrides,
    } as any;
  }

  it("creates a whole-category allocation when nothing conflicts", async () => {
    const prisma = basePrisma();

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: true, id: "alloc-1" });
    expect(prisma.budgetAllocation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        subcategoryId: null,
        plannedAmount: 8000,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        rolloverAmount: 1500,
      },
    });
  });

  it("rejects a whole-category allocation when the category already has any allocation this cutoff", async () => {
    const prisma = basePrisma({
      budgetAllocation: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "existing" }),
      },
    });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "This category already has a budget for this cutoff — remove it first to budget by subcategory",
    });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("creates a subcategory allocation when the category has no whole-category allocation", async () => {
    const prisma = basePrisma();

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: true,
    });

    expect(result).toEqual({ ok: true, id: "alloc-1" });
    expect(prisma.budgetAllocation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        plannedAmount: 5000,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        rolloverAmount: 1500,
      },
    });
  });

  it("rejects a subcategory allocation when the category already has a whole-category allocation", async () => {
    const prisma = basePrisma({
      budgetAllocation: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "existing", subcategoryId: null }),
      },
    });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "This category already has a whole-category budget for this cutoff",
    });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the subcategory doesn't belong to the given category", async () => {
    const prisma = basePrisma({ subcategory: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-owned-by-someone-else",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Subcategory not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the budget period belongs to another user", async () => {
    const prisma = basePrisma({ budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Budget period not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the category belongs to another user", async () => {
    const prisma = basePrisma({ category: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });
});

describe("updateAllocation", () => {
  it("updates plannedAmount, rolloverMode, and showDailyAllowance, scoped to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", {
      plannedAmount: 9000,
      rolloverMode: "CARRY_BOTH",
      showDailyAllowance: true,
    });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "alloc-1", userId: "user-1" },
      data: { plannedAmount: 9000, rolloverMode: "CARRY_BOTH", showDailyAllowance: true },
    });
  });

  it("reports not found when no row matched", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", { plannedAmount: 9000 });

    expect(result).toEqual({ ok: false, error: "Allocation not found" });
  });
});

describe("listAllocationsWithActuals", () => {
  it("uses computeCategoryActual for a whole-category row", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        subcategoryId: null,
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        category: { name: "Groceries" },
        subcategory: null,
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1" },
      include: { category: true, subcategory: true },
    });
    expect(rows).toEqual([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        subcategoryId: null,
        category: { name: "Groceries" },
        subcategoryName: null,
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        effectivePlanned: 9500,
        actual: 4700,
        remaining: 4800,
        percentUsed: (4700 / 9500) * 100,
      },
    ]);
  });

  it("uses computeSubcategoryActual for a subcategory-level row", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-2",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        plannedAmount: 15000,
        rolloverAmount: 0,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        category: { name: "Home & Groceries" },
        subcategory: { name: "Market / Grocery / Food" },
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(rows).toEqual([
      {
        id: "alloc-2",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        category: { name: "Home & Groceries" },
        subcategoryName: "Market / Grocery / Food",
        plannedAmount: 15000,
        rolloverAmount: 0,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        effectivePlanned: 15000,
        actual: 1200,
        remaining: 13800,
        percentUsed: (1200 / 15000) * 100,
      },
    ]);
  });
});

describe("computeAvailableAllocationOptions", () => {
  const categories = [
    {
      id: "cat-1",
      name: "Home & Groceries",
      subcategories: [
        { id: "sub-1", name: "Rice" },
        { id: "sub-2", name: "Market / Grocery / Food" },
      ],
    },
    { id: "cat-2", name: "Security", subcategories: [] },
  ];

  it("offers both whole-category and every subcategory when nothing is allocated yet", () => {
    const options = computeAvailableAllocationOptions(categories, []);

    expect(options).toEqual([
      {
        id: "cat-1",
        name: "Home & Groceries",
        canWholeCategory: true,
        availableSubcategories: [
          { id: "sub-1", name: "Rice" },
          { id: "sub-2", name: "Market / Grocery / Food" },
        ],
      },
      { id: "cat-2", name: "Security", canWholeCategory: true, availableSubcategories: [] },
    ]);
  });

  it("drops a category entirely once it has a whole-category allocation", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-2", subcategoryId: null },
    ]);

    expect(options.map((o) => o.id)).toEqual(["cat-1"]);
  });

  it("blocks whole-category and removes the taken subcategory, once one subcategory is allocated", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-1", subcategoryId: "sub-2" },
    ]);

    expect(options.find((o) => o.id === "cat-1")).toEqual({
      id: "cat-1",
      name: "Home & Groceries",
      canWholeCategory: false,
      availableSubcategories: [{ id: "sub-1", name: "Rice" }],
    });
  });

  it("drops a category once every one of its subcategories is allocated", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-1", subcategoryId: "sub-1" },
      { categoryId: "cat-1", subcategoryId: "sub-2" },
    ]);

    expect(options.map((o) => o.id)).toEqual(["cat-2"]);
  });
});
