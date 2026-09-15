import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";

export function MonthlyObligationsSummary({ totals, currency }: { totals: { expected: number; actual: number; remaining: number }; currency: string }) {
  return <Card className="grid gap-3 p-4 sm:grid-cols-3">
    <div><p className="text-sm text-muted-foreground">Expected</p><p className="text-lg font-semibold">{formatMoney(totals.expected, currency)}</p></div>
    <div><p className="text-sm text-muted-foreground">Paid</p><p className="text-lg font-semibold">{formatMoney(totals.actual, currency)}</p></div>
    <div><p className="text-sm text-muted-foreground">Remaining</p><p className="text-lg font-semibold">{formatMoney(totals.remaining, currency)}</p></div>
  </Card>;
}
