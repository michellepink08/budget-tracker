import type { PrismaClient } from "@prisma/client";
import { createAllocation } from "@/lib/budget-allocations";

// Called once, right when a brand-new BudgetPeriod is created (see
// resolveBudgetPeriodForDate) — creates a BudgetAllocation for every
// active loan and every active, category-linked recurring bill, so the
// Budget page always shows the full picture of what's owed each cutoff
// without needing to add these by hand. Conflicts (the either/or rule
// already enforced by createAllocation) are expected and simply skipped —
// nothing here is user-initiated, so nothing here should ever surface an
// error.
export async function materializeRecurringAllocations(
  prisma: Pick<
    PrismaClient,
    "loan" | "recurringPayable" | "budgetAllocation" | "budgetPeriod" | "category" | "subcategory" | "transaction"
  >,
  userId: string,
  budgetPeriodId: string,
): Promise<void> {
  const [loans, recurringPayables] = await Promise.all([
    prisma.loan.findMany({
      where: { userId, archivedAt: null, categoryId: { not: null }, subcategoryId: { not: null } },
    }),
    prisma.recurringPayable.findMany({ where: { userId, active: true, categoryId: { not: null } } }),
  ]);

  for (const loan of loans as { categoryId: string; subcategoryId: string; monthlyPayment: number }[]) {
    await createAllocation(prisma, userId, {
      budgetPeriodId,
      categoryId: loan.categoryId,
      subcategoryId: loan.subcategoryId,
      plannedAmount: loan.monthlyPayment,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  }

  for (const payable of recurringPayables as { categoryId: string; amount: number }[]) {
    await createAllocation(prisma, userId, {
      budgetPeriodId,
      categoryId: payable.categoryId,
      subcategoryId: null,
      plannedAmount: payable.amount,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  }
}
