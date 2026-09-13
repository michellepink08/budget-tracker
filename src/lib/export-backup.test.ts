import { describe, expect, it, vi } from "vitest";
import { buildFullBackup } from "@/lib/export-backup";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const empty = { findMany: vi.fn().mockResolvedValue([]) };
  return {
    transaction: empty,
    yearPlan: empty,
    yearPlanPhase: empty,
    incomeForecast: empty,
    shoppingCatalogItem: empty,
    shoppingList: empty,
    shoppingListItem: empty,
    shoppingPriceHistory: empty,
    receipt: empty,
    receiptLine: empty,
    receiptImage: empty,
    customReminder: empty,
    ...overrides,
  } as any;
}

describe("buildFullBackup", () => {
  it("queries every included model scoped to the user, and returns one key per model", async () => {
    const prisma = makeFakePrisma();

    const backup = await buildFullBackup(prisma, "user-1");

    expect(Object.keys(backup).sort()).toEqual(
      [
        "transactions",
        "yearPlans",
        "yearPlanPhases",
        "incomeForecasts",
        "shoppingCatalogItems",
        "shoppingLists",
        "shoppingListItems",
        "shoppingPriceHistory",
        "receipts",
        "receiptLines",
        "receiptImages",
        "customReminders",
      ].sort(),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.receiptImage.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("includes a receipt image's objectKey but the shape has no field for image bytes", async () => {
    const prisma = makeFakePrisma({
      receiptImage: {
        findMany: vi.fn().mockResolvedValue([{ id: "img-1", receiptId: "receipt-1", objectKey: "receipts/a.jpg" }]),
      },
    });

    const backup = await buildFullBackup(prisma, "user-1");

    expect(backup.receiptImages).toEqual([{ id: "img-1", receiptId: "receipt-1", objectKey: "receipts/a.jpg" }]);
  });

  it("preserves relationships as raw ids (does not resolve a transaction's accountId to a name)", async () => {
    const prisma = makeFakePrisma({
      transaction: {
        findMany: vi.fn().mockResolvedValue([{ id: "txn-1", accountId: "acc-1", categoryId: "cat-1", amount: -500 }]),
      },
    });

    const backup = await buildFullBackup(prisma, "user-1");

    expect(backup.transactions).toEqual([{ id: "txn-1", accountId: "acc-1", categoryId: "cat-1", amount: -500 }]);
  });
});
