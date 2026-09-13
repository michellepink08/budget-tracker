import { describe, expect, it, vi } from "vitest";
import { buildPriceHistoryExportRows } from "@/lib/export-price-history";

function makeFakePrisma(rows: unknown[]) {
  return {
    shoppingPriceHistory: { findMany: vi.fn().mockResolvedValue(rows) },
  } as any;
}

describe("buildPriceHistoryExportRows", () => {
  it("maps each price-history row into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        unitPrice: 15000,
        confirmedAt: new Date(2026, 8, 1),
        source: "RECEIPT",
        catalogItem: { canonicalName: "Nestle Chocolate Milk" },
        store: { name: "SM Supermarket" },
      },
    ]);

    const rows = await buildPriceHistoryExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        itemName: "Nestle Chocolate Milk",
        store: "SM Supermarket",
        unitPriceMajorUnits: 150,
        confirmedAt: "2026-09-01",
        source: "RECEIPT",
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildPriceHistoryExportRows(prisma, "user-1", "PHP");

    expect(prisma.shoppingPriceHistory.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { catalogItem: true, store: true },
      orderBy: { confirmedAt: "desc" },
    });
  });
});
