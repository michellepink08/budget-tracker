// A loan's term length in months is derived from startDate/endDate rather
// than stored — this is the one place that math happens, shared by the
// form's live hint and anywhere else the term needs to be displayed.
export function computeLoanTermMonths(startDate: Date, endDate: Date): number {
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  return Math.max(0, months);
}
