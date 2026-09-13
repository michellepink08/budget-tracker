import type { PrismaClient } from "@prisma/client";

export type YearPlanMutationResult = { ok: true; id: string } | { ok: false; error: string };

type YearPlanPrisma = Pick<PrismaClient, "yearPlan" | "yearPlanPhase" | "incomeForecast">;

export async function createYearPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  },
) {
  return prisma.yearPlan.create({ data: { userId, ...input } });
}

async function assertOwnedPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  yearPlanId: string,
): Promise<boolean> {
  const plan = await prisma.yearPlan.findFirst({ where: { id: yearPlanId, userId } });
  return plan !== null;
}

export async function addPhase(
  prisma: YearPlanPrisma,
  userId: string,
  yearPlanId: string,
  input: {
    phaseType: string;
    startDate: Date;
    endDate: Date;
    label: string | null;
    estimatedExpensesPerCutoff: number;
  },
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  const phase = await prisma.yearPlanPhase.create({ data: { userId, yearPlanId, ...input } });
  return { ok: true, id: phase.id };
}

export async function addIncomeForecast(
  prisma: YearPlanPrisma,
  userId: string,
  yearPlanId: string,
  input: {
    phaseId: string | null;
    source: string;
    expectedDate: Date;
    expectedAmount: number;
    cutoffLabel: string;
    status: string;
    notes: string | null;
  },
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  const forecast = await prisma.incomeForecast.create({ data: { userId, yearPlanId, ...input } });
  return { ok: true, id: forecast.id };
}

// Deliberately touches nothing but the forecast row — see the design doc's
// "double-counting safeguard": a forecast is never added to any balance,
// so linking it to the real transaction that eventually clears must not
// mutate that transaction or any account either. This is the whole point
// of the function; do not "helpfully" sync amounts here.
export async function linkForecastToTransaction(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  forecastId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const forecast = await prisma.incomeForecast.findFirst({ where: { id: forecastId, userId } });
  if (!forecast) return { ok: false, error: "Forecast not found" };
  await prisma.incomeForecast.update({ where: { id: forecastId }, data: { actualTransactionId: transactionId } });
  return { ok: true };
}

export async function getActiveYearPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  asOf: Date = new Date(),
) {
  return prisma.yearPlan.findFirst({
    where: { userId, scenario: "EXPECTED", endDate: { gte: asOf } },
    orderBy: { startDate: "desc" },
  });
}
