"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatCycleRange } from "@/lib/cycle";

type PeriodOption = { id: string; startDate: Date; endDate: Date };

export function PeriodPicker({ periods }: { periods: PeriodOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      defaultValue={searchParams.get("periodId") ?? periods[0]?.id ?? ""}
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
