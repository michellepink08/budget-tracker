"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";
import type { YearPlanCutoffRow } from "@/lib/year-plan-reserve";

export function ReserveChart({
  rows,
  minCashBuffer,
  currency,
}: {
  rows: YearPlanCutoffRow[];
  minCashBuffer: number;
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">No cutoffs to project yet.</p>;
  }

  const bufferMajor = toMajorUnits(minCashBuffer, currency);
  const chartData = rows.map((r) => ({
    name: r.cutoffLabel,
    closingBalance: toMajorUnits(r.closingBalance, currency),
    // A second series clipped to only the portion below the buffer, so the
    // shaded fill only appears in the risky stretch (two stacked areas
    // rather than a single conditional fill).
    belowBuffer: Math.min(toMajorUnits(r.closingBalance, currency), bufferMajor),
  }));

  return (
    <div className="h-72 w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            formatter={(value: number) => formatMoney(toMinorUnits(value, currency), currency)}
            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          />
          <ReferenceLine y={bufferMajor} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="belowBuffer"
            stroke="none"
            fill="var(--danger)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="closingBalance"
            stroke="var(--chart-1)"
            fill="none"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
