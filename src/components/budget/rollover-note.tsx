import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";

// Deliberately never labeled "income" and never folded into any income
// total anywhere it's rendered — see the design doc's "why this can't be
// a real Income transaction" section. Purely a label recorded once per
// cutoff via acknowledgeRollover.
export function RolloverNote({
  amount,
  currency,
  description,
}: {
  amount: number;
  currency: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed p-4">
      <p className="text-sm text-muted-foreground">Rollover</p>
      <p className="text-2xl font-semibold">{formatMoney(amount, currency)}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </Card>
  );
}
