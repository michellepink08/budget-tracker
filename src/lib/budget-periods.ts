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

export type CreateBudgetPeriodResult = { ok: true; id: string } | { ok: false; error: string };

export async function createBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  input: BudgetPeriodInput,
): Promise<CreateBudgetPeriodResult> {
  const existing = await prisma.budgetPeriod.findUnique({
    where: { userId_startDate: { userId, startDate: input.startDate } },
  });
  if (existing) return { ok: false, error: "A period already starts on that date" };

  const period = await prisma.budgetPeriod.create({ data: { userId, ...input } });
  return { ok: true, id: period.id };
}
