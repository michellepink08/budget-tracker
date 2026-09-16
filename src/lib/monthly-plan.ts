export function buildMonthlyPlanSummary(input: { expectedIncome: number; actualIncome: number; plannedSpending: number; actualSpending: number }) {
  return {
    incomeDifference: input.actualIncome - input.expectedIncome,
    spendingDifference: input.actualSpending - input.plannedSpending,
    unallocated: input.expectedIncome - input.plannedSpending,
  };
}
