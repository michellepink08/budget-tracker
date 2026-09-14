import type { PrismaClient } from "@prisma/client";

export type YearPlanMutationResult = { ok: true; id: string } | { ok: false; error: string };

type YearPlanPrisma = Pick<PrismaClient, "yearPlan" | "yearPlanPhase" | "incomeForecast">;

export async function createYearPlan(
  prisma: Pick<PrismaClient, "yearPlan" | "savingsGoal">,
  userId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  },
): Promise<YearPlanMutationResult> {
  if (input.vacationReserveGoalId) {
    const goal = await prisma.savingsGoal.findFirst({ where: { id: input.vacationReserveGoalId, userId } });
    if (!goal) return { ok: false, error: "Savings goal not found" };
  }
  const plan = await prisma.yearPlan.create({ data: { userId, ...input } });
  return { ok: true, id: plan.id };
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
  if (input.phaseId) {
    const phase = await prisma.yearPlanPhase.findFirst({ where: { id: input.phaseId, userId, yearPlanId } });
    if (!phase) return { ok: false, error: "Phase not found" };
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

export async function updateYearPlan(
  prisma: Pick<PrismaClient, "yearPlan" | "savingsGoal">,
  userId: string,
  yearPlanId: string,
  input: Partial<{
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  }>,
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  if (input.vacationReserveGoalId) {
    const goal = await prisma.savingsGoal.findFirst({ where: { id: input.vacationReserveGoalId, userId } });
    if (!goal) return { ok: false, error: "Savings goal not found" };
  }
  const plan = await prisma.yearPlan.update({ where: { id: yearPlanId }, data: input });
  return { ok: true, id: plan.id };
}

// Year plans have no cascade delete in the schema (this project never uses
// onDelete: Cascade — every other model is deleted, or not, explicitly by
// its own domain function), so this deletes forecasts and phases first,
// then the plan itself.
export async function deleteYearPlan(
  prisma: YearPlanPrisma,
  userId: string,
  yearPlanId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedPlan(prisma, userId, yearPlanId))) {
    return { ok: false, error: "Year plan not found" };
  }
  await prisma.incomeForecast.deleteMany({ where: { yearPlanId } });
  await prisma.yearPlanPhase.deleteMany({ where: { yearPlanId } });
  await prisma.yearPlan.delete({ where: { id: yearPlanId } });
  return { ok: true };
}

async function assertOwnedPhase(
  prisma: Pick<PrismaClient, "yearPlanPhase">,
  userId: string,
  phaseId: string,
): Promise<boolean> {
  const phase = await prisma.yearPlanPhase.findFirst({ where: { id: phaseId, userId } });
  return phase !== null;
}

export async function updatePhase(
  prisma: YearPlanPrisma,
  userId: string,
  phaseId: string,
  input: Partial<{
    phaseType: string;
    startDate: Date;
    endDate: Date;
    label: string | null;
    estimatedExpensesPerCutoff: number;
  }>,
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedPhase(prisma, userId, phaseId))) {
    return { ok: false, error: "Phase not found" };
  }
  const phase = await prisma.yearPlanPhase.update({ where: { id: phaseId }, data: input });
  return { ok: true, id: phase.id };
}

// Unlinks (rather than blocks on, or cascade-deletes) any forecast still
// pointing at this phase — a forecast is meaningful on its own even
// without a phase (projectYearPlanCutoffs treats phaseId: null as "no
// flat expense estimate, no FULL_ONBOARD saving override"), so deleting a
// phase shouldn't silently delete someone's income forecasts too.
export async function deletePhase(
  prisma: YearPlanPrisma,
  userId: string,
  phaseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedPhase(prisma, userId, phaseId))) {
    return { ok: false, error: "Phase not found" };
  }
  await prisma.incomeForecast.updateMany({ where: { phaseId }, data: { phaseId: null } });
  await prisma.yearPlanPhase.delete({ where: { id: phaseId } });
  return { ok: true };
}

async function assertOwnedForecast(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  forecastId: string,
): Promise<boolean> {
  const forecast = await prisma.incomeForecast.findFirst({ where: { id: forecastId, userId } });
  return forecast !== null;
}

export async function updateIncomeForecast(
  prisma: Pick<PrismaClient, "incomeForecast" | "yearPlanPhase">,
  userId: string,
  forecastId: string,
  input: Partial<{
    phaseId: string | null;
    source: string;
    expectedDate: Date;
    expectedAmount: number;
    cutoffLabel: string;
    status: string;
    notes: string | null;
  }>,
): Promise<YearPlanMutationResult> {
  if (!(await assertOwnedForecast(prisma, userId, forecastId))) {
    return { ok: false, error: "Forecast not found" };
  }
  if (input.phaseId && !(await assertOwnedPhase(prisma, userId, input.phaseId))) {
    return { ok: false, error: "Phase not found" };
  }
  const forecast = await prisma.incomeForecast.update({ where: { id: forecastId }, data: input });
  return { ok: true, id: forecast.id };
}

export async function deleteIncomeForecast(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  forecastId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedForecast(prisma, userId, forecastId))) {
    return { ok: false, error: "Forecast not found" };
  }
  await prisma.incomeForecast.delete({ where: { id: forecastId } });
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
