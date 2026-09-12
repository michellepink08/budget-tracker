"use client";

import { useRouter } from "next/navigation";
import { formatCycleRange } from "@/lib/cycle";

type PeriodOption = { id: string; startDate: Date; endDate: Date };

// activePeriodId must be the page's own resolved period, not re-derived
// here — the page's fallback logic (query param -> current cycle ->
// newest period) doesn't match "first in the list" when no query param is
// set, so guessing independently made the picker's visible selection
// disagree with what was actually being displayed/edited.
export function PeriodPicker({
  periods,
  activePeriodId,
}: {
  periods: PeriodOption[];
  activePeriodId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={activePeriodId}
      onChange={(e) => router.push(`/budget?periodId=${e.target.value}`)}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      {periods.map((period) => (
        <option key={period.id} value={period.id}>
          {formatCycleRange({ start: period.startDate, end: period.endDate })}
        </option>
      ))}
    </select>
  );
}
