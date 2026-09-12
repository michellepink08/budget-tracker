import type { PrismaClient } from "@prisma/client";

export async function listBudgetPeriods(prisma: Pick<PrismaClient, "budgetPeriod">, userId: string) {
  return prisma.budgetPeriod.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
  });
}

export type BudgetPeriodInput = {
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
};

export async function createBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  input: BudgetPeriodInput,
) {
  return prisma.budgetPeriod.create({ data: { userId, ...input } });
}
