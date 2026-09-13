import { describe, expect, it, vi } from "vitest";
import { buildCatalogExportRows } from "@/lib/export-shopping-catalog";

function makeFakePrisma(items: unknown[]) {
  return {
    shoppingCatalogItem: { findMany: vi.fn().mockResolvedValue(items) },
  } as any;
}

describe("buildCatalogExportRows", () => {
  it("maps each catalog item into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        canonicalName: "Nestle Chocolate Milk",
        brand: "Nestle",
        size: "1L",
        unit: "carton",
        defaultQuantity: 2,
        isFavorite: true,
        category: { name: "Groceries" },
        store: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildCatalogExportRows(prisma, "user-1");

    expect(rows).toEqual([
      {
        canonicalName: "Nestle Chocolate Milk",
        brand: "Nestle",
        size: "1L",
        unit: "carton",
        defaultQuantity: 2,
        isFavorite: true,
        category: "Groceries",
        preferredStore: "SM Supermarket",
      },
    ]);
  });

  it("excludes archived items and scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildCatalogExportRows(prisma, "user-1");

    expect(prisma.shoppingCatalogItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { category: true, store: true },
      orderBy: { canonicalName: "asc" },
    });
  });
});
