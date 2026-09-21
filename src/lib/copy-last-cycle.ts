import type { PrismaClient } from "@prisma/client";

type CopyPrisma = Pick<PrismaClient, "budgetPeriod" | "cycleIncomePlan" | "budgetAllocation" | "cyclePaymentPlan">;

export async function copyLastCyclePlans(prisma: CopyPrisma, userId: string, destinationPeriodId: string) {
  const destination = await prisma.budgetPeriod.findFirst({ where: { id: destinationPeriodId, userId } });
  if (!destination) return { ok: false as const, error: "Budget period not found" };
  const previous = await prisma.budgetPeriod.findFirst({ where: { userId, endDate: { lt: destination.startDate } }, orderBy: { endDate: "desc" } });
  if (!previous) return { ok: false as const, error: "No previous cycle to copy" };
  const shift = previous.startDate && destination.startDate ? destination.startDate.getTime() - previous.startDate.getTime() : 0;
  const shiftDate = (date: Date) => new Date(date.getTime() + shift);

  const [income, allocations, paymentPlans, destinationIncome, destinationPaymentPlans] = await Promise.all([
    prisma.cycleIncomePlan.findMany({ where: { userId, budgetPeriodId: previous.id } }),
    prisma.budgetAllocation.findMany({ where: { userId, budgetPeriodId: previous.id } }),
    prisma.cyclePaymentPlan.findMany({ where: { userId, budgetPeriodId: previous.id } }),
    prisma.cycleIncomePlan.findMany({ where: { userId, budgetPeriodId: destinationPeriodId } }),
    prisma.cyclePaymentPlan.findMany({ where: { userId, budgetPeriodId: destinationPeriodId } }),
  ]);
  const incomeToCopy = income.filter((row) => !destinationIncome.some((existing) => existing.source === row.source));
  const incomeResult = incomeToCopy.length ? await prisma.cycleIncomePlan.createMany({ data: incomeToCopy.map((row) => ({ userId, budgetPeriodId: destinationPeriodId, source: row.source, categoryId:row.categoryId,subcategoryId:row.subcategoryId,expectedAmount: row.expectedAmount, expectedDate: shiftDate(row.expectedDate), notes: row.notes })) }) : { count: 0 };
  let allocationsCopied = 0;
  for (const row of allocations) {
    const existing = await prisma.budgetAllocation.findFirst({ where: { budgetPeriodId: destinationPeriodId, categoryId: row.categoryId, subcategoryId: row.subcategoryId } });
    if (!existing) { await prisma.budgetAllocation.create({ data: { userId, budgetPeriodId: destinationPeriodId, categoryId: row.categoryId, subcategoryId: row.subcategoryId, plannedAmount: row.plannedAmount, rolloverMode: row.rolloverMode, rolloverAmount: 0, showDailyAllowance: row.showDailyAllowance } }); allocationsCopied += 1; }
  }
  let paymentPlansCopied = 0;
  for (const row of paymentPlans) {
    if (destinationPaymentPlans.some((existing) => existing.sourceType === row.sourceType && existing.sourceId === row.sourceId)) continue;
    await prisma.cyclePaymentPlan.upsert({ where: { budgetPeriodId_sourceType_sourceId: { budgetPeriodId: destinationPeriodId, sourceType: row.sourceType, sourceId: row.sourceId } }, create: { userId, budgetPeriodId: destinationPeriodId, sourceType: row.sourceType, sourceId: row.sourceId, expectedAmount: row.expectedAmount, dueDate: row.dueDate ? shiftDate(row.dueDate) : null,dueDateStatus:row.dueDateStatus??(row.dueDate?"ESTIMATED":"UNSET"),fundingAccountId:row.fundingAccountId }, update: {} });
    paymentPlansCopied += 1;
  }
  return { ok: true as const, incomeCopied: incomeResult.count, allocationsCopied, paymentPlansCopied };
}
