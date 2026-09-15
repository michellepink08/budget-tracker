import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";
import { formatMoney } from "@/lib/money";

// Looks up the one BudgetAllocation that governs a transaction's own
// category/subcategory (the same either/or rule from the subcategory-
// budgets feature: a transaction is governed by at most one allocation)
// and returns a user-facing warning if that allocation's remaining just
// went negative — or null if there's nothing budgeted here, or it's still
// within budget. Never throws, never blocks a save.
export async function checkOverspendWarning(
  prisma: Pick<PrismaClient, "budgetAllocation" | "transaction">,
  userId: string,
  budgetPeriodId: string,
  categoryId: string | null,
  subcategoryId: string | null,
  currency: string,
): Promise<string | null> {
  if (!categoryId) return null;

  const allocation = await prisma.budgetAllocation.findFirst({
    where: { userId, budgetPeriodId, categoryId, subcategoryId },
    include: { category: true, subcategory: true },
  });
  if (!allocation) return null;

  const actual = subcategoryId
    ? await computeSubcategoryActual(prisma, budgetPeriodId, subcategoryId)
    : await computeCategoryActual(prisma, budgetPeriodId, categoryId);

  const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
  const remaining = effectivePlanned - actual;
  if (remaining >= 0) return null;

  const label = allocation.subcategory
    ? `${allocation.category.name} — ${allocation.subcategory.name}`
    : allocation.category.name;
  return `You're ${formatMoney(-remaining, currency)} over budget for ${label} this cutoff.`;
}
