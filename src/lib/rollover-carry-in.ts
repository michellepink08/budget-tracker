import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual } from "@/lib/category-actual";
import { computeRolloverAmount } from "@/lib/rollover";
import type { RolloverMode } from "@/lib/constants/financial";

export async function resolveRolloverCarryIn(
  prisma: Pick<PrismaClient, "budgetPeriod" | "budgetAllocation" | "transaction">,
  userId: string,
  categoryId: string,
  currentPeriodStartDate: Date,
): Promise<number> {
  const previousPeriod = await prisma.budgetPeriod.findFirst({
    where: { userId, startDate: { lt: currentPeriodStartDate } },
    orderBy: { startDate: "desc" },
  });
  if (!previousPeriod) {
    return 0;
  }

  const previousAllocation = await prisma.budgetAllocation.findUnique({
    where: { budgetPeriodId_categoryId: { budgetPeriodId: previousPeriod.id, categoryId } },
  });
  if (!previousAllocation) {
    return 0;
  }

  const actual = await computeCategoryActual(prisma, previousPeriod.id, categoryId);
  const effectivePlanned = previousAllocation.plannedAmount + previousAllocation.rolloverAmount;

  return computeRolloverAmount(previousAllocation.rolloverMode as RolloverMode, effectivePlanned, actual);
}
