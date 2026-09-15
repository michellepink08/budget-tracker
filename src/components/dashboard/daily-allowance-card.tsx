import { formatMoney } from "@/lib/money";
import type { DailyAllowanceRow } from "@/lib/daily-allowance";
import { Card } from "@/components/ui/card";

export function DailyAllowanceCard({ rows, currency }: { rows: DailyAllowanceRow[]; currency: string }) {
  if (rows.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm text-muted-foreground">Today&apos;s allowance</p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between text-sm">
            <span>{row.label}</span>
            <span className={row.amount < 0 ? "font-medium text-destructive" : "font-medium"}>
              {formatMoney(row.amount, currency)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
