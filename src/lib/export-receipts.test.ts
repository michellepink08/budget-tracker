import { describe, expect, it, vi } from "vitest";
import { buildPurchaseExportRows, RECEIPT_EXPORT_COLUMNS } from "@/lib/export-receipts";

function makeFakePrisma(lines: unknown[]) {
  return {
    receiptLine: { findMany: vi.fn().mockResolvedValue(lines) },
  } as any;
}

describe("buildPurchaseExportRows", () => {
  it("maps each receipt line into a flat row, joined with its receipt's store/date/status", async () => {
    const prisma = makeFakePrisma([
      {
        name: "Milk",
        quantity: 1,
        unitPrice: 15000,
        lineTotal: 15000,
        excluded: false,
        receipt: {
          purchaseDate: new Date(2026, 8, 1),
          status: "CONFIRMED",
          store: { name: "SM Supermarket" },
        },
      },
    ]);

    const rows = await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        purchaseDate: "2026-09-01",
        store: "SM Supermarket",
        status: "CONFIRMED",
        itemName: "Milk",
        quantity: 1,
        unitPriceMajorUnits: 150,
        lineTotalMajorUnits: 150,
        excluded: false,
        currency: "PHP",
      },
    ]);
  });

  it("renders a null purchaseDate/unitPrice as null, not a crash", async () => {
    const prisma = makeFakePrisma([
      {
        name: "Unpriced item",
        quantity: 1,
        unitPrice: null,
        lineTotal: 0,
        excluded: false,
        receipt: { purchaseDate: null, status: "DRAFT", store: null },
      },
    ]);

    const rows = await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(rows[0].purchaseDate).toBeNull();
    expect(rows[0].unitPriceMajorUnits).toBeNull();
    expect(rows[0].store).toBeNull();
  });

  it("scopes to the given user — image bytes/objectKeys are never included (images aren't queried at all)", async () => {
    const prisma = makeFakePrisma([]);

    await buildPurchaseExportRows(prisma, "user-1", "PHP");

    expect(prisma.receiptLine.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { receipt: { include: { store: true } } },
      orderBy: { receipt: { purchaseDate: "desc" } },
    });
  });
});
