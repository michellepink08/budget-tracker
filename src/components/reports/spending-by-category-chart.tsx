"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

type CategorySpending = { categoryId: string; categoryName: string; amount: number };

export function SpendingByCategoryChart({
  data,
  currency,
}: {
  data: CategorySpending[];
  currency: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground">No spending recorded this cycle yet.</p>;
  }

  const chartData = data.map((d) => ({ name: d.categoryName, amount: toMajorUnits(d.amount, currency) }));

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
          <Bar dataKey="amount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
