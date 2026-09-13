import type { PrismaClient } from "@prisma/client";
import { getActiveYearPlan } from "@/lib/year-plan";
import {
  computeRecommendedSavingPerCutoff,
  computeRemainingReserve,
  computeRequiredReserve,
  projectYearPlanCutoffs,
} from "@/lib/year-plan-reserve";
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";

export type YearPlanDashboardSummary = {
  nextForecast: { source: string; expectedAmount: number; expectedDate: Date } | null;
  remainingReserve: number;
  recommendedSavingPerCutoff: number | null;
};

type SummaryPrisma = Pick<PrismaClient, "yearPlan" | "yearPlanPhase" | "incomeForecast" | "savingsGoal">;

// Shared by the Year Plan page and the Dashboard's two compact sections —
// same computation, different callers. Returns null when the user has no
// active Year Plan yet (a genuinely new, opt-in feature area, not
// something every user is assumed to have set up).
export async function getYearPlanDashboardSummary(
  prisma: SummaryPrisma,
  userId: string,
  asOf: Date = new Date(),
): Promise<YearPlanDashboardSummary | null> {
  const plan = await getActiveYearPlan(prisma, userId, asOf);
  if (!plan) return null;

  const [phases, forecasts] = await Promise.all([
    prisma.yearPlanPhase.findMany({ where: { yearPlanId: plan.id } }),
    prisma.incomeForecast.findMany({ where: { yearPlanId: plan.id }, orderBy: { expectedDate: "asc" } }),
  ]);

  const goalAssignedAmount = plan.vacationReserveGoalId
    ? ((await prisma.savingsGoal.findUnique({ where: { id: plan.vacationReserveGoalId } }))?.assignedAmount ?? 0)
    : 0;

  const homePhaseIds = new Set(
    phases.filter((p: { phaseType: string }) => HOME_PHASE_TYPES.includes(p.phaseType as never)).map((p: { id: string }) => p.id),
  );
  const cashFlows = projectYearPlanCutoffs({
    forecasts,
    phases,
    currentReserveAmount: 0,
    minCashBuffer: plan.minCashBuffer,
    recommendedSavingPerCutoff: null,
  })
    .filter((row) => row.phaseId !== null && homePhaseIds.has(row.phaseId))
    .map((r) => r.reserveDelta);

  const requiredReserve = computeRequiredReserve({
    cashFlows,
    currentReserveAmount: 0,
    minCashBuffer: plan.minCashBuffer,
  });
  const remainingReserve = computeRemainingReserve({ requiredReserve, assignedAmount: goalAssignedAmount });

  const remainingFullIncomeCutoffs = new Set(
    forecasts
      .filter((f: { phaseId: string | null; expectedDate: Date }) => {
        const phase = phases.find((p: { id: string }) => p.id === f.phaseId);
        return phase?.phaseType === "FULL_ONBOARD" && f.expectedDate >= asOf;
      })
      .map((f: { cutoffLabel: string }) => f.cutoffLabel),
  ).size;
  const recommendedSavingPerCutoff = computeRecommendedSavingPerCutoff({
    remainingReserve,
    remainingFullIncomeCutoffs,
  });

  const nextForecast =
    forecasts
      .filter((f: { expectedDate: Date }) => f.expectedDate >= asOf)
      .map((f: { source: string; expectedAmount: number; expectedDate: Date }) => f)[0] ?? null;

  return {
    nextForecast: nextForecast
      ? { source: nextForecast.source, expectedAmount: nextForecast.expectedAmount, expectedDate: nextForecast.expectedDate }
      : null,
    remainingReserve,
    recommendedSavingPerCutoff,
  };
}
