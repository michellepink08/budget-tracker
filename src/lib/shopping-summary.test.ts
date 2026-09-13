import { describe, expect, it, vi } from "vitest";
import { getShoppingDashboardSummary } from "@/lib/shopping-summary";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    shoppingList: { findFirst: vi.fn().mockResolvedValue(null) },
    shoppingListItem: { findMany: vi.fn().mockResolvedValue([]) },
    budgetPeriod: { findUnique: vi.fn(), create: vi.fn() },
    budgetAllocation: { findMany: vi.fn().mockResolvedValue([]) },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

describe("getShoppingDashboardSummary", () => {
  it("returns null when the user has no current list", async () => {
    const prisma = makeFakePrisma();
    const summary = await getShoppingDashboardSummary(prisma, "user-1", 1);
    expect(summary).toBeNull();
  });

  it("returns null when the current list has no selected items", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", budgetCategoryId: null }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([{ isSelected: false, quantity: 1, estimatedUnitPrice: 5000 }]),
      },
    });
    const summary = await getShoppingDashboardSummary(prisma, "user-1", 1);
    expect(summary).toBeNull();
  });

  it("computes totals for the current list's items", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", budgetCategoryId: null }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([
          { isSelected: true, quantity: 2, estimatedUnitPrice: 5000 },
          { isSelected: false, quantity: 1, estimatedUnitPrice: null },
        ]),
      },
    });
    const summary = await getShoppingDashboardSummary(prisma, "user-1", 1);
    expect(summary).toEqual({ estimatedTotal: 10000, hasMissingPrice: false, allowance: null, overBudget: null });
  });
});
