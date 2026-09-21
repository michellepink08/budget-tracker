// A pure computation — every input is already a plain value or array by the
// time this is called, so there's no query logic here to get wrong, and it's
// trivially unit-testable without a Prisma mock.
export function computeSafeToSpend(params: {
  disposableTotal: number;
  totalRemaining: number;
  payables: { accountId: string; amount: number; dueDate: Date }[];
  restrictedAccountIds: Set<string>;
  cutoffEnd: Date;
  requiredTransfers: number;
  confirmedReserves: number;
  unpaidPlannedObligations?:number;
}): number {
  const obligations = params.payables
    .filter((p) => !params.restrictedAccountIds.has(p.accountId) && p.dueDate <= params.cutoffEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  return (
    params.disposableTotal -
    obligations -
    params.totalRemaining -
    params.requiredTransfers -
    params.confirmedReserves -
    (params.unpaidPlannedObligations??0)
  );
}
