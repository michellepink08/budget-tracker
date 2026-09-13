import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import type { YearPlanCutoffRow } from "@/lib/year-plan-reserve";

const STATUS_ICON: Record<YearPlanCutoffRow["status"], string> = { ok: "🟢", near: "🟡", below: "🔴" };

export function CutoffTable({ rows, currency }: { rows: YearPlanCutoffRow[]; currency: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground">No cutoffs yet — add phases and income forecasts to see a projection.</p>
    );
  }

  return (
    <>
      {/* Desktop: grouped table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Cutoff</th>
              <th className="p-2">Income</th>
              <th className="p-2">Expenses</th>
              <th className="p-2">Reserve</th>
              <th className="p-2">Closing balance</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cutoffLabel} className="border-t border-border">
                <td className="p-2">{row.cutoffLabel}</td>
                <td className="p-2">{formatMoney(row.reliableIncome, currency)}</td>
                <td className="p-2">{formatMoney(row.expenses, currency)}</td>
                <td className={`p-2 ${row.reserveDelta < 0 ? "text-danger" : ""}`}>
                  {row.reserveDelta >= 0 ? "+" : ""}
                  {formatMoney(row.reserveDelta, currency)}
                </td>
                <td className="p-2">{formatMoney(row.closingBalance, currency)}</td>
                <td className="p-2">{STATUS_ICON[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <Card key={row.cutoffLabel} className="p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{row.cutoffLabel}</p>
              <span>{STATUS_ICON[row.status]}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Income {formatMoney(row.reliableIncome, currency)} · Expenses {formatMoney(row.expenses, currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              Reserve {row.reserveDelta >= 0 ? "+" : ""}
              {formatMoney(row.reserveDelta, currency)}
            </p>
            <p className="text-sm font-medium">Closing: {formatMoney(row.closingBalance, currency)}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
