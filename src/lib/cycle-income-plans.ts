import type { PrismaClient } from "@prisma/client";

type IncomePlanPrisma = Pick<PrismaClient, "budgetPeriod" | "cycleIncomePlan" | "transaction">;
export type CycleIncomePlanInput = { budgetPeriodId: string; source: string; expectedAmount: number; expectedDate: Date; notes?: string | null };
export type IncomePlanResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCycleIncomePlan(prisma: IncomePlanPrisma, userId: string, input: CycleIncomePlanInput): Promise<IncomePlanResult> {
  if (input.expectedAmount < 0) return { ok: false, error: "Expected amount must be zero or more" };
  const period = await prisma.budgetPeriod.findFirst({ where: { id: input.budgetPeriodId, userId } });
  if (!period) return { ok: false, error: "Budget period not found" };
  const row = await prisma.cycleIncomePlan.create({ data: { userId, ...input, notes: input.notes ?? null } });
  return { ok: true, id: row.id };
}

export async function listCycleIncomePlans(prisma: Pick<PrismaClient, "cycleIncomePlan">, userId: string, budgetPeriodId: string) {
  const rows = await prisma.cycleIncomePlan.findMany({ where: { userId, budgetPeriodId }, include: { actualTransaction: true }, orderBy: { expectedDate: "asc" } });
  return rows.map((row) => { const actual = Math.abs(row.actualTransaction?.amount ?? 0); return { ...row, actual, difference: actual - row.expectedAmount }; });
}

export async function updateCycleIncomePlan(prisma: Pick<PrismaClient, "cycleIncomePlan">, userId: string, id: string, input: Partial<Omit<CycleIncomePlanInput, "budgetPeriodId">>) {
  if (input.expectedAmount !== undefined && input.expectedAmount < 0) return { ok: false as const, error: "Expected amount must be zero or more" };
  const result = await prisma.cycleIncomePlan.updateMany({ where: { id, userId }, data: input });
  return result.count ? { ok: true as const } : { ok: false as const, error: "Income plan not found" };
}

export async function deleteCycleIncomePlan(prisma: Pick<PrismaClient, "cycleIncomePlan">, userId: string, id: string) {
  const result = await prisma.cycleIncomePlan.deleteMany({ where: { id, userId } });
  return result.count ? { ok: true as const } : { ok: false as const, error: "Income plan not found" };
}

export async function linkCycleIncomeActual(prisma: Pick<PrismaClient, "cycleIncomePlan" | "transaction">, userId: string, planId: string, transactionId: string) {
  const plan = await prisma.cycleIncomePlan.findFirst({ where: { id: planId, userId }, include: { budgetPeriod: true } });
  if (!plan) return { ok: false as const, error: "Income plan not found" };
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, userId, type: "INCOME", date: { gte: plan.budgetPeriod.startDate, lte: plan.budgetPeriod.endDate } } });
  if (!transaction) return { ok: false as const, error: "Income transaction not found in this cycle" };
  await prisma.cycleIncomePlan.update({ where: { id: planId }, data: { actualTransactionId: transactionId } });
  return { ok: true as const };
}
