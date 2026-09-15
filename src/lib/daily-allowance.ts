// The daily allowance is deliberately recomputed fresh every time from
// today's actual `remaining` — not stored per-day anywhere. Underspend a
// day and tomorrow's (and every later day's) allowance rises since
// `remaining` didn't shrink as much; overspend and it falls. No separate
// day-by-day bookkeeping is needed.

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysLeftInPeriod(today: Date, periodEnd: Date): number {
  const diffMs = startOfDay(periodEnd).getTime() - startOfDay(today).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(days, 1);
}

export type AllocationForDailyAllowance = {
  id: string;
  category: { name: string };
  subcategoryName: string | null;
  showDailyAllowance: boolean;
  remaining: number;
};

export type DailyAllowanceRow = { id: string; label: string; amount: number };

export function computeDailyAllowances(
  allocations: AllocationForDailyAllowance[],
  periodEnd: Date,
  today: Date = new Date(),
): DailyAllowanceRow[] {
  const days = daysLeftInPeriod(today, periodEnd);
  return allocations
    .filter((a) => a.showDailyAllowance)
    .map((a) => ({
      id: a.id,
      label: a.subcategoryName ? `${a.category.name} — ${a.subcategoryName}` : a.category.name,
      amount: a.remaining / days,
    }));
}
