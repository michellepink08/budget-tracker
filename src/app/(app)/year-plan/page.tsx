import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveYearPlan } from "@/lib/year-plan";
import {
  computeRecommendedSavingPerCutoff,
  computeRemainingReserve,
  computeRequiredReserve,
  projectYearPlanCutoffs,
} from "@/lib/year-plan-reserve";
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";
import { YearPlanFormDialog } from "@/components/year-plan/year-plan-form-dialog";
import { PhaseFormDialog } from "@/components/year-plan/phase-form-dialog";
import { ForecastFormDialog } from "@/components/year-plan/forecast-form-dialog";
import { DeleteYearPlanButton } from "@/components/year-plan/delete-year-plan-button";
import { DeletePhaseButton } from "@/components/year-plan/delete-phase-button";
import { DeleteForecastButton } from "@/components/year-plan/delete-forecast-button";
import { CutoffTable } from "@/components/year-plan/cutoff-table";
import { ReserveChart } from "@/components/year-plan/reserve-chart";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export default async function YearPlanPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const plan = await getActiveYearPlan(prisma, user.id);

  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Year Plan</h1>
          <YearPlanFormDialog currency={user.currency} />
        </div>
        <p className="text-muted-foreground">
          No Year Plan yet. Create one to start forecasting income and the reserve you&apos;ll need for a home
          period.
        </p>
      </div>
    );
  }

  const [phases, forecasts] = await Promise.all([
    prisma.yearPlanPhase.findMany({ where: { yearPlanId: plan.id } }),
    prisma.incomeForecast.findMany({ where: { yearPlanId: plan.id }, orderBy: { expectedDate: "asc" } }),
  ]);

  const goalAssignedAmount = plan.vacationReserveGoalId
    ? ((await prisma.savingsGoal.findUnique({ where: { id: plan.vacationReserveGoalId } }))?.assignedAmount ?? 0)
    : 0;

  const homePhaseIds = new Set(phases.filter((p) => HOME_PHASE_TYPES.includes(p.phaseType as never)).map((p) => p.id));
  // Rows are grouped by cutoffLabel, not 1:1 with `forecasts` — filter by
  // each row's own `phaseId` (not by re-indexing into `forecasts`).
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

  const now = new Date();
  const remainingFullIncomeCutoffs = new Set(
    forecasts
      .filter((f) => {
        const phase = phases.find((p) => p.id === f.phaseId);
        return phase?.phaseType === "FULL_ONBOARD" && f.expectedDate >= now;
      })
      .map((f) => f.cutoffLabel),
  ).size;
  const recommendedSavingPerCutoff = computeRecommendedSavingPerCutoff({
    remainingReserve,
    remainingFullIncomeCutoffs,
  });

  const rows = projectYearPlanCutoffs({
    forecasts,
    phases,
    currentReserveAmount: goalAssignedAmount,
    minCashBuffer: plan.minCashBuffer,
    recommendedSavingPerCutoff,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Year Plan</h1>
        <div className="flex gap-2">
          <PhaseFormDialog yearPlanId={plan.id} currency={user.currency} />
          <ForecastFormDialog yearPlanId={plan.id} phases={phases} currency={user.currency} />
        </div>
      </div>

      <Card variant="info" className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{plan.name}</p>
          <div className="flex gap-2">
            <YearPlanFormDialog
              currency={user.currency}
              existing={{
                id: plan.id,
                name: plan.name,
                startDate: plan.startDate,
                endDate: plan.endDate,
                minCashBuffer: plan.minCashBuffer,
              }}
            />
            <DeleteYearPlanButton yearPlanId={plan.id} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Required reserve</p>
            <p className="text-lg font-medium">{formatMoney(requiredReserve, user.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Remaining to save</p>
            <p className="text-lg font-medium">{formatMoney(remainingReserve, user.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Recommended / cutoff</p>
            <p className="text-lg font-medium">
              {recommendedSavingPerCutoff === null ? "—" : formatMoney(recommendedSavingPerCutoff, user.currency)}
            </p>
          </div>
        </div>
      </Card>

      <CutoffTable rows={rows} currency={user.currency} />
      <ReserveChart rows={rows} minCashBuffer={plan.minCashBuffer} currency={user.currency} />

      {phases.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Phases</h2>
          <div className="flex flex-col gap-2">
            {phases.map((phase) => (
              <Card key={phase.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{phase.label ?? phase.phaseType}</p>
                  <p className="text-sm text-muted-foreground">
                    {phase.phaseType} · {phase.startDate.toLocaleDateString()}–{phase.endDate.toLocaleDateString()} ·{" "}
                    {formatMoney(phase.estimatedExpensesPerCutoff, user.currency)}/cutoff
                  </p>
                </div>
                <div className="flex gap-2">
                  <PhaseFormDialog yearPlanId={plan.id} currency={user.currency} existing={phase} />
                  <DeletePhaseButton phaseId={phase.id} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {forecasts.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Income forecasts</h2>
          <div className="flex flex-col gap-2">
            {forecasts.map((forecast) => (
              <Card key={forecast.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">
                    {forecast.cutoffLabel} · {forecast.source}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(forecast.expectedAmount, user.currency)} · {forecast.expectedDate.toLocaleDateString()} ·{" "}
                    {forecast.status}
                    {forecast.actualTransactionId ? " · Confirmed — received" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ForecastFormDialog yearPlanId={plan.id} phases={phases} currency={user.currency} existing={forecast} />
                  <DeleteForecastButton forecastId={forecast.id} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
