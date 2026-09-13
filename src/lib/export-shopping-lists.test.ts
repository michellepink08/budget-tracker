import { describe, expect, it, vi } from "vitest";
import { buildShoppingExportRows } from "@/lib/export-shopping-lists";

function makeFakePrisma(items: unknown[]) {
  return {
    shoppingListItem: { findMany: vi.fn().mockResolvedValue(items) },
  } as any;
}

describe("buildShoppingExportRows", () => {
  it("maps each list item into a flat row, joined with its list's name", async () => {
    const prisma = makeFakePrisma([
      {
        freeTextName: null,
        quantity: 2,
        unit: "carton",
        estimatedUnitPrice: 15000,
        priority: "NORMAL",
        isSelected: true,
        isPurchased: false,
        notes: null,
        list: { name: "This week", plannedDate: new Date(2026, 8, 20) },
        catalogItem: { canonicalName: "Nestle Chocolate Milk" },
        store: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        listName: "This week",
        plannedDate: "2026-09-20",
        itemName: "Nestle Chocolate Milk",
        quantity: 2,
        unit: "carton",
        estimatedUnitPriceMajorUnits: 150,
        preferredStore: "SM Supermarket",
        priority: "NORMAL",
        isSelected: true,
        isPurchased: false,
        notes: null,
        currency: "PHP",
      },
    ]);
  });

  it("falls back to freeTextName when no catalog item is linked", async () => {
    const prisma = makeFakePrisma([
      {
        freeTextName: "Random snack",
        quantity: 1,
        unit: null,
        estimatedUnitPrice: null,
        priority: "NORMAL",
        isSelected: false,
        isPurchased: false,
        notes: null,
        list: { name: "This week", plannedDate: null },
        catalogItem: null,
        store: null,
      },
    ]);

    const rows = await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(rows[0].itemName).toBe("Random snack");
    expect(rows[0].estimatedUnitPriceMajorUnits).toBeNull();
    expect(rows[0].plannedDate).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildShoppingExportRows(prisma, "user-1", "PHP");

    expect(prisma.shoppingListItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { list: true, catalogItem: true, store: true },
      orderBy: [{ list: { createdAt: "desc" } }, { sortOrder: "asc" }],
    });
  });
});
