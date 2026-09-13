import type { PrismaClient } from "@prisma/client";

export type FullBackup = {
  transactions: unknown[];
  yearPlans: unknown[];
  yearPlanPhases: unknown[];
  incomeForecasts: unknown[];
  shoppingCatalogItems: unknown[];
  shoppingLists: unknown[];
  shoppingListItems: unknown[];
  shoppingPriceHistory: unknown[];
  receipts: unknown[];
  receiptLines: unknown[];
  receiptImages: unknown[];
  customReminders: unknown[];
};

// Every list is the model's raw rows, scoped to the user — every foreign
// key (accountId, categoryId, catalogItemId, receiptId, ...) is left as
// the id it already is, exactly matching how the schema itself relates
// these rows, so the file can in principle be re-imported later.
export async function buildFullBackup(
  prisma: Pick<
    PrismaClient,
    | "transaction"
    | "yearPlan"
    | "yearPlanPhase"
    | "incomeForecast"
    | "shoppingCatalogItem"
    | "shoppingList"
    | "shoppingListItem"
    | "shoppingPriceHistory"
    | "receipt"
    | "receiptLine"
    | "receiptImage"
    | "customReminder"
  >,
  userId: string,
): Promise<FullBackup> {
  const where = { where: { userId } };

  const [
    transactions,
    yearPlans,
    yearPlanPhases,
    incomeForecasts,
    shoppingCatalogItems,
    shoppingLists,
    shoppingListItems,
    shoppingPriceHistory,
    receipts,
    receiptLines,
    receiptImages,
    customReminders,
  ] = await Promise.all([
    prisma.transaction.findMany(where),
    prisma.yearPlan.findMany(where),
    prisma.yearPlanPhase.findMany(where),
    prisma.incomeForecast.findMany(where),
    prisma.shoppingCatalogItem.findMany(where),
    prisma.shoppingList.findMany(where),
    prisma.shoppingListItem.findMany(where),
    prisma.shoppingPriceHistory.findMany(where),
    prisma.receipt.findMany(where),
    prisma.receiptLine.findMany(where),
    prisma.receiptImage.findMany(where),
    prisma.customReminder.findMany(where),
  ]);

  return {
    transactions,
    yearPlans,
    yearPlanPhases,
    incomeForecasts,
    shoppingCatalogItems,
    shoppingLists,
    shoppingListItems,
    shoppingPriceHistory,
    receipts,
    receiptLines,
    receiptImages,
    customReminders,
  };
}
