import type { PrismaClient } from "@prisma/client";

/**
 * Net spend for a category within a budget period, in minor units.
 * Positive = net outflow (money spent). Negative = net inflow (e.g.
 * refunds exceeded spend in that category this period).
 */
export async function computeCategoryActual(
  prisma: Pick<PrismaClient, "transaction">,
  budgetPeriodId: string,
  categoryId: string,
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: { budgetPeriodId, categoryId },
  });
  const net = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  return net === 0 ? 0 : -net; // avoid returning -0

}
