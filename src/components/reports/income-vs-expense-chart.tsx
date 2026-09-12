"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

type PeriodTotals = { periodId: string; periodName: string; income: number; expense: number };

export function IncomeVsExpenseChart({
  data,
  currency,
}: {
  data: PeriodTotals[];
  currency: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground">No budget periods yet.</p>;
  }

  const chartData = data.map((d) => ({
    name: d.periodName,
    income: toMajorUnits(d.income, currency),
    expense: toMajorUnits(d.expense, currency),
  }));

  return (
    <div className="h-72 w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            formatter={(value: number) => formatMoney(toMinorUnits(value, currency), currency)}
            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          />
          <Legend />
          <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
