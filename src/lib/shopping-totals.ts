// A pure computation — every input is already a plain value/array by the
// time this is called, same "trivially testable, no Prisma" pattern as
// computeSafeToSpend / year-plan-reserve.ts.
export function computeEstimatedTotals(params: {
  items: { isSelected: boolean; quantity: number; estimatedUnitPrice: number | null }[];
  allowance: number | null;
}): { estimatedTotal: number; hasMissingPrice: boolean; overBudget: boolean | null } {
  const selected = params.items.filter((item) => item.isSelected);
  const hasMissingPrice = selected.some((item) => item.estimatedUnitPrice === null);
  const estimatedTotal = selected
    .filter((item) => item.estimatedUnitPrice !== null)
    .reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice as number), 0);
  const overBudget = params.allowance === null ? null : estimatedTotal > params.allowance;
  return { estimatedTotal, hasMissingPrice, overBudget };
}
