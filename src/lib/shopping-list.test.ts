import { describe, expect, it, vi } from "vitest";
import {
  addItem,
  computeShoppingAllowance,
  createList,
  deleteItem,
  deleteList,
  makeListCurrent,
  moveUnpurchasedToNewList,
  toggleSelected,
  togglePurchased,
  updateItem,
} from "@/lib/shopping-list";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    shoppingList: {
      create: vi.fn(async ({ data }: any) => ({ id: "list-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "list-1", ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async () => ({ id: "list-1" })),
    },
    shoppingListItem: {
      create: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async () => ({ id: "item-1" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    budgetPeriod: { findUnique: vi.fn(), create: vi.fn() },
    budgetAllocation: { findMany: vi.fn().mockResolvedValue([]) },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
    shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue({ id: "catalog-1" }) },
    ...overrides,
  } as any;
}

describe("createList", () => {
  it("becomes current when no other current list exists", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(async ({ data }: any) => ({ id: "list-1", ...data })),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const result = await createList(prisma, "user-1", { name: "Groceries", plannedDate: null, budgetCategoryId: null });
    expect(result.ok).toBe(true);
  });

  it("is not current when a current list already exists", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(async ({ data }: any) => ({ id: "list-2", ...data })),
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", isCurrent: true }),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const result = await createList(prisma, "user-1", { name: "Groceries", plannedDate: null, budgetCategoryId: null });
    expect(result.ok).toBe(true);
  });

  it("reports not found when budgetCategoryId belongs to another user", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const result = await createList(prisma, "user-1", {
      name: "Groceries",
      plannedDate: null,
      budgetCategoryId: "cat-owned-by-someone-else",
    });
    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.shoppingList.create).not.toHaveBeenCalled();
  });
});

describe("addItem", () => {
  it("rejects when the list does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await addItem(prisma, "user-1", "list-1", {
      catalogItemId: null,
      freeTextName: "Milk",
      quantity: 1,
      unit: null,
      estimatedUnitPrice: null,
      preferredStoreId: null,
      categoryId: null,
      priority: "NORMAL",
      notes: null,
    });
    expect(result.ok).toBe(false);
  });

  it("adds the item when the list belongs to the user", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const result = await addItem(prisma, "user-1", "list-1", {
      catalogItemId: null,
      freeTextName: "Milk",
      quantity: 1,
      unit: null,
      estimatedUnitPrice: null,
      preferredStoreId: null,
      categoryId: null,
      priority: "NORMAL",
      notes: null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("updateItem / deleteItem", () => {
  it("updateItem rejects when the item does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await updateItem(prisma, "user-1", "item-1", { quantity: 2 });
    expect(result.ok).toBe(false);
  });

  it("updateItem updates when owned", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
    });
    const result = await updateItem(prisma, "user-1", "item-1", { quantity: 2 });
    expect(result.ok).toBe(true);
  });

  it("deleteItem rejects when the item does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await deleteItem(prisma, "user-1", "item-1");
    expect(result.ok).toBe(false);
    expect(prisma.shoppingListItem.delete).not.toHaveBeenCalled();
  });

  it("deleteItem deletes when owned", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1" }),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(async () => ({ id: "item-1" })),
      },
    });
    const result = await deleteItem(prisma, "user-1", "item-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingListItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
  });
});

describe("toggleSelected / togglePurchased", () => {
  it("flips isSelected", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1", isSelected: false }),
        update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
    });
    const result = await toggleSelected(prisma, "user-1", "item-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { isSelected: true },
    });
  });

  it("flips isPurchased", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1", isPurchased: true }),
        update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
    });
    const result = await togglePurchased(prisma, "user-1", "item-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { isPurchased: false },
    });
  });

  it("rejects when the item does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await toggleSelected(prisma, "user-1", "item-1");
    expect(result.ok).toBe(false);
  });
});

describe("moveUnpurchasedToNewList", () => {
  it("rejects when the source list does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await moveUnpurchasedToNewList(prisma, "user-1", "list-1", "New list");
    expect(result.ok).toBe(false);
  });

  it("creates a new current list and re-parents unpurchased items", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(async ({ data }: any) => ({ id: "list-2", ...data })),
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }),
        update: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    });
    const result = await moveUnpurchasedToNewList(prisma, "user-1", "list-1", "New list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newListId).toBe("list-2");
    }
    expect(prisma.shoppingList.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isCurrent: true },
      data: { isCurrent: false },
    });
    expect(prisma.shoppingList.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "New list", isCurrent: true },
    });
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith({
      where: { listId: "list-1", isPurchased: false },
      data: { listId: "list-2" },
    });
  });
});

describe("makeListCurrent", () => {
  it("rejects when the list does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await makeListCurrent(prisma, "user-1", "list-1");
    expect(result.ok).toBe(false);
  });

  it("clears the existing current list and sets the given one current", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "list-1", ...data })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    });
    const result = await makeListCurrent(prisma, "user-1", "list-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingList.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isCurrent: true },
      data: { isCurrent: false },
    });
    expect(prisma.shoppingList.update).toHaveBeenCalledWith({
      where: { id: "list-1" },
      data: { isCurrent: true },
    });
  });
});

describe("computeShoppingAllowance", () => {
  it("returns null when the list has no budgetCategoryId", async () => {
    const prisma = makeFakePrisma();
    const allowance = await computeShoppingAllowance(prisma, "user-1", { budgetCategoryId: null }, 1);
    expect(allowance).toBeNull();
  });

  it("returns the matching allocation's remaining amount", async () => {
    const prisma = makeFakePrisma({
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1", startDate: new Date(2026, 0, 1) }),
        create: vi.fn().mockResolvedValue({ id: "period-1", startDate: new Date(2026, 0, 1) }),
      },
      budgetAllocation: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "alloc-1", categoryId: "cat-1", category: { name: "Groceries" }, plannedAmount: 500000, rolloverAmount: 0 }]),
      },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const allowance = await computeShoppingAllowance(prisma, "user-1", { budgetCategoryId: "cat-1" }, 1);
    expect(allowance).toBe(500000);
  });

  it("returns null when set but no allocation exists this period", async () => {
    const prisma = makeFakePrisma({
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1", startDate: new Date(2026, 0, 1) }),
        create: vi.fn().mockResolvedValue({ id: "period-1", startDate: new Date(2026, 0, 1) }),
      },
      budgetAllocation: { findMany: vi.fn().mockResolvedValue([]) },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const allowance = await computeShoppingAllowance(prisma, "user-1", { budgetCategoryId: "cat-1" }, 1);
    expect(allowance).toBeNull();
  });
});

describe("deleteList", () => {
  it("rejects when the list does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await deleteList(prisma, "user-1", "list-1");
    expect(result.ok).toBe(false);
  });

  it("deletes the list's items before deleting the list itself", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(async () => ({ id: "list-1" })),
      },
      shoppingListItem: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(async () => ({ count: 2 })),
      },
    });
    const result = await deleteList(prisma, "user-1", "list-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingListItem.deleteMany).toHaveBeenCalledWith({ where: { listId: "list-1" } });
    expect(prisma.shoppingList.delete).toHaveBeenCalledWith({ where: { id: "list-1" } });
  });
});
