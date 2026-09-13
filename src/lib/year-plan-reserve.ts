import { RELIABLE_INCOME_SOURCES, RELIABLE_INCOME_STATUSES } from "@/lib/constants/financial";

// Pure calculations — every input is a plain value/array by the time this
// is called, same "trivially testable, no Prisma" pattern as computeSafeToSpend.

export function computeHomeCutoffCashFlow(params: { reliableIncome: number; plannedExpenses: number }): number {
  return params.reliableIncome - params.plannedExpenses;
}

export function computeRequiredReserve(params: {
  cashFlows: number[];
  currentReserveAmount: number;
  minCashBuffer: number;
}): number {
  // `worst` tracks only cumulative points *after* an actual home cutoff —
  // the pre-walk starting point never counts as a "shortage" on its own
  // (a plan with no home cutoffs yet, or one that's all positive cash
  // flow, requires nothing extra beyond what's already saved).
  let cumulative = params.currentReserveAmount;
  let worst = Infinity;
  for (const flow of params.cashFlows) {
    cumulative += flow;
    if (cumulative < worst) worst = cumulative;
  }
  if (worst === Infinity) return 0;
  const shortfallBelowBuffer = params.minCashBuffer - worst;
  return shortfallBelowBuffer > 0 ? shortfallBelowBuffer : 0;
}

export function computeRemainingReserve(params: { requiredReserve: number; assignedAmount: number }): number {
  const remaining = params.requiredReserve - params.assignedAmount;
  return remaining > 0 ? remaining : 0;
}

export function computeRecommendedSavingPerCutoff(params: {
  remainingReserve: number;
  remainingFullIncomeCutoffs: number;
}): number | null {
  if (params.remainingFullIncomeCutoffs <= 0) return null;
  return Math.round(params.remainingReserve / params.remainingFullIncomeCutoffs);
}

type ForecastInput = {
  cutoffLabel: string;
  source: string;
  status: string;
  expectedAmount: number;
  phaseId: string | null;
};
type PhaseInput = { id: string; phaseType: string; estimatedExpensesPerCutoff: number };

export type YearPlanCutoffRow = {
  cutoffLabel: string;
  phaseId: string | null;
  reliableIncome: number;
  expenses: number;
  reserveDelta: number;
  closingBalance: number;
  status: "ok" | "near" | "below";
};

function statusFor(closingBalance: number, minCashBuffer: number): "ok" | "near" | "below" {
  if (closingBalance < minCashBuffer) return "below";
  if (closingBalance < minCashBuffer * 1.1) return "near";
  return "ok";
}

// Groups forecasts by cutoffLabel (in first-seen order — callers pass
// forecasts already sorted by expectedDate), sums reliable income per
// cutoff, looks up that cutoff's phase for its flat expense estimate, and
// walks a running closingBalance across all of them. A FULL_ONBOARD cutoff's
// delta is the plan's flat recommendedSavingPerCutoff (a contribution) when
// one is supplied; every other cutoff's delta is its own cash flow.
export function projectYearPlanCutoffs(params: {
  forecasts: ForecastInput[];
  phases: PhaseInput[];
  currentReserveAmount: number;
  minCashBuffer: number;
  recommendedSavingPerCutoff: number | null;
}): YearPlanCutoffRow[] {
  const phaseById = new Map(params.phases.map((p) => [p.id, p]));

  const byCutoff = new Map<string, ForecastInput[]>();
  for (const forecast of params.forecasts) {
    const existing = byCutoff.get(forecast.cutoffLabel) ?? [];
    existing.push(forecast);
    byCutoff.set(forecast.cutoffLabel, existing);
  }

  let cumulative = params.currentReserveAmount;
  const rows: YearPlanCutoffRow[] = [];
  for (const [cutoffLabel, group] of byCutoff) {
    const reliableIncome = group
      .filter(
        (f) =>
          RELIABLE_INCOME_SOURCES.includes(f.source as never) &&
          RELIABLE_INCOME_STATUSES.includes(f.status as never),
      )
      .reduce((sum, f) => sum + f.expectedAmount, 0);

    const phase = group[0].phaseId ? phaseById.get(group[0].phaseId) : undefined;
    const expenses = phase?.estimatedExpensesPerCutoff ?? 0;
    const isFullOnboard = phase?.phaseType === "FULL_ONBOARD";

    const reserveDelta =
      isFullOnboard && params.recommendedSavingPerCutoff !== null
        ? params.recommendedSavingPerCutoff
        : reliableIncome - expenses;

    cumulative += reserveDelta;

    rows.push({
      cutoffLabel,
      phaseId: group[0].phaseId,
      reliableIncome,
      expenses,
      reserveDelta,
      closingBalance: cumulative,
      status: statusFor(cumulative, params.minCashBuffer),
    });
  }
  return rows;
}
