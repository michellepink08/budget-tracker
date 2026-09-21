import type { PrismaClient } from "@prisma/client";

type IncomePlanPrisma = Pick<PrismaClient, "budgetPeriod" | "cycleIncomePlan" | "transaction" | "subcategory">;
export type CycleIncomePlanInput = { budgetPeriodId: string; source: string; expectedAmount: number; expectedDate: Date; notes?: string | null; categoryId?: string | null; subcategoryId?: string | null };
export type IncomePlanResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCycleIncomePlan(prisma: IncomePlanPrisma, userId: string, input: CycleIncomePlanInput): Promise<IncomePlanResult> {
  if (input.expectedAmount < 0) return { ok: false, error: "Expected amount must be zero or more" };
  const period = await prisma.budgetPeriod.findFirst({ where: { id: input.budgetPeriodId, userId } });
  if (!period) return { ok: false, error: "Budget period not found" };
  const sources=await prisma.subcategory.findMany({where:{userId,archivedAt:null,category:{type:"INCOME",userId}},include:{category:true}});
  const matching=sources.filter(s=>input.subcategoryId?s.id===input.subcategoryId:s.name.trim().toLowerCase()===input.source.trim().toLowerCase());
  if(matching.length!==1||input.categoryId&&input.categoryId!==matching[0].categoryId)return {ok:false,error:"Choose an existing, unambiguous income source"};
  const row = await prisma.cycleIncomePlan.create({ data: { userId, ...input, categoryId:matching[0].categoryId,subcategoryId:matching[0].id,notes: input.notes ?? null } });
  return { ok: true, id: row.id };
}

export async function listCycleIncomePlans(prisma: Pick<PrismaClient, "cycleIncomePlan" | "transaction">, userId: string, budgetPeriodId: string) {
  const rows = await prisma.cycleIncomePlan.findMany({ where: { userId, budgetPeriodId }, include: { actualTransaction: true,budgetPeriod:true }, orderBy: { expectedDate: "asc" } });
  const period=rows[0]?.budgetPeriod,endExclusive=period?new Date(period.endDate.getTime()+86400000):null;
  const transactions = await prisma.transaction.findMany({ where: { userId, budgetPeriodId, type: "INCOME", category: { type: "INCOME" },...(period?{date:{gte:period.startDate,lt:endExclusive!}}:{}) }, include: { category: true }, orderBy: { date: "asc" } });
  const claimed = new Set<string>();
  return rows.map((row) => {
    const matching = transactions.filter(transaction => transaction.type === "INCOME" && transaction.amount > 0 && transaction.category?.type === "INCOME" && row.categoryId && transaction.categoryId === row.categoryId && row.subcategoryId && transaction.subcategoryId === row.subcategoryId && !claimed.has(transaction.id) && (!period || transaction.date>=period.startDate&&transaction.date<endExclusive!));
    matching.forEach(transaction => claimed.add(transaction.id));
    const actual = matching.reduce((sum, transaction) => sum + transaction.amount, 0);
    return { ...row, actual, difference: actual - row.expectedAmount, actualTransactionIds: matching.map(transaction => transaction.id), actualReceivedDate: matching.length ? matching[matching.length - 1].date : null };
  });
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
  const endExclusive = new Date(plan.budgetPeriod.endDate.getTime() + 86400000);
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, userId, type: "INCOME", category: { type: "INCOME" }, categoryId: plan.categoryId ?? undefined, subcategoryId: plan.subcategoryId ?? undefined, date: { gte: plan.budgetPeriod.startDate, lt: endExclusive } } });
  if (!transaction) return { ok: false as const, error: "Income transaction not found in this cycle" };
  await prisma.cycleIncomePlan.update({ where: { id: planId }, data: { actualTransactionId: transactionId } });
  return { ok: true as const };
}
