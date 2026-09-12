import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual } from "@/lib/category-actual";

export type CategorySpending = { categoryId: string; categoryName: string; amount: number };

export async function spendingByCategory(
  prisma: Pick<PrismaClient, "category" | "transaction">,
  userId: string,
  budgetPeriodId: string,
): Promise<CategorySpending[]> {
  const categories = await prisma.category.findMany({
    where: { userId, type: "EXPENSE", archivedAt: null },
  });

  const results = await Promise.all(
    categories.map(async (category: { id: string; name: string }) => ({
      categoryId: category.id,
      categoryName: category.name,
      amount: await computeCategoryActual(prisma, budgetPeriodId, category.id),
    })),
  );

  return results.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
}

export type PeriodTotals = { periodId: string; periodName: string; income: number; expense: number };

export async function incomeVsExpenseByPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod" | "transaction">,
  userId: string,
  limit = 6,
): Promise<PeriodTotals[]> {
  const periods = await prisma.budgetPeriod.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    take: limit,
  });

  const results = await Promise.all(
    periods.map(async (period: { id: string; name: string }) => {
      const transactions = await prisma.transaction.findMany({
        where: { budgetPeriodId: period.id },
      });
      const income = transactions
        .filter((t: { type: string }) => t.type === "INCOME")
        .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
      const expense = transactions
        .filter((t: { type: string }) => t.type === "EXPENSE")
        .reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
      return { periodId: period.id, periodName: period.name, income, expense };
    }),
  );

  return results.reverse(); // oldest to newest, for left-to-right chart reading
}
