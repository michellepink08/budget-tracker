import type { PrismaClient } from "@prisma/client";
import { computeShoppingAllowance } from "@/lib/shopping-list";
import { computeEstimatedTotals } from "@/lib/shopping-totals";

export type ShoppingDashboardSummary = {
  estimatedTotal: number;
  hasMissingPrice: boolean;
  allowance: number | null;
  overBudget: boolean | null;
} | null;

// Shared by the Dashboard's "Shopping estimate" section. Returns null when
// the user has no current list yet — a genuinely opt-in feature area, not
// something every user is assumed to have set up.
export async function getShoppingDashboardSummary(
  prisma: Pick<
    PrismaClient,
    | "shoppingList"
    | "shoppingListItem"
    | "budgetPeriod"
    | "budgetAllocation"
    | "transaction"
    | "loan"
    | "recurringPayable"
    | "category"
    | "subcategory"
  >,
  userId: string,
  cycleStartDay: number,
  asOf: Date = new Date(),
): Promise<ShoppingDashboardSummary> {
  const list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
  if (!list) return null;

  const items = await prisma.shoppingListItem.findMany({ where: { listId: list.id } });
  if (!items.some((item: { isSelected: boolean }) => item.isSelected)) return null;

  const allowance = await computeShoppingAllowance(prisma, userId, list, cycleStartDay, asOf);
  const { estimatedTotal, hasMissingPrice, overBudget } = computeEstimatedTotals({
    items: items.map((item: { isSelected: boolean; quantity: number; estimatedUnitPrice: number | null }) => ({
      isSelected: item.isSelected,
      quantity: item.quantity,
      estimatedUnitPrice: item.estimatedUnitPrice,
    })),
    allowance,
  });

  return { estimatedTotal, hasMissingPrice, allowance, overBudget };
}
