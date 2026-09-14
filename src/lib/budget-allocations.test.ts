import { describe, expect, it, vi } from "vitest";
import {
  createAllocation,
  listAllocationsWithActuals,
  updateAllocation,
} from "@/lib/budget-allocations";

vi.mock("@/lib/rollover-carry-in", () => ({
  resolveRolloverCarryIn: vi.fn().mockResolvedValue(1500),
}));
vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(4700),
}));

describe("createAllocation", () => {
  it("resolves the rollover carry-in and creates the allocation", async () => {
    const create = vi.fn().mockResolvedValue({ id: "alloc-1" });
    const prisma = {
      budgetAllocation: { create },
      budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ startDate: new Date(2026, 8, 25) }) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
    } as any;

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
    });

    expect(result).toEqual({ ok: true, id: "alloc-1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        plannedAmount: 8000,
        rolloverMode: "CARRY_UNUSED",
        rolloverAmount: 1500,
      },
    });
  });

  it("reports not found when the budget period belongs to another user", async () => {
    const create = vi.fn();
    const prisma = {
      budgetAllocation: { create },
      budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
    } as any;

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
    });

    expect(result).toEqual({ ok: false, error: "Budget period not found" });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports not found when the category belongs to another user", async () => {
    const create = vi.fn();
    const prisma = {
      budgetAllocation: { create },
      budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ startDate: new Date(2026, 8, 25) }) },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
    });

    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateAllocation", () => {
  it("updates only plannedAmount and rolloverMode, scoped to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", {
      plannedAmount: 9000,
      rolloverMode: "CARRY_BOTH",
    });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "alloc-1", userId: "user-1" },
      data: { plannedAmount: 9000, rolloverMode: "CARRY_BOTH" },
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
  it("attaches actual/effectivePlanned/remaining/percentUsed to each allocation", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        category: { name: "Groceries" },
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1" },
      include: { category: true },
    });
    expect(rows).toEqual([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        category: { name: "Groceries" },
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        effectivePlanned: 9500,
        actual: 4700,
        remaining: 4800,
        percentUsed: (4700 / 9500) * 100,
      },
    ]);
  });
});
