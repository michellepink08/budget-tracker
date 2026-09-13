// A pure computation — no Prisma, same "trivially testable" pattern as
// computeSafeToSpend / year-plan-reserve.ts / shopping-totals.ts.
//
// `grandTotal` is trusted over the derived subtotal math whenever it's
// explicitly set (including 0 — a free/returned item is a legitimate
// grand total, so this uses `??`, never `||`, to avoid mistaking 0 for
// "not set").
export function computeReconciliation(params: {
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  fees: number | null;
  grandTotal: number | null;
  unitemizedDifference: number;
  lines: { lineTotal: number; excluded: boolean }[];
}): { reconciled: boolean; difference: number } {
  const derivedFromParts =
    (params.subtotal ?? 0) - (params.discount ?? 0) + (params.tax ?? 0) + (params.fees ?? 0);
  const expected = params.grandTotal ?? derivedFromParts;

  const lineSum = params.lines.filter((l) => !l.excluded).reduce((sum, l) => sum + l.lineTotal, 0);
  const difference = expected - (lineSum + params.unitemizedDifference);

  return { reconciled: difference === 0, difference };
}
