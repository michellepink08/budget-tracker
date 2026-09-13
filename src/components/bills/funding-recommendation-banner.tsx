import { ArrowRightLeft } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";

type Recommendation = {
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  currency: string;
  reason: string;
  obligations: { payableId: string; name: string; amount: number }[];
  remainingSourceBalance: number;
};

// Plan-38 §1: a suggested transfer must show source, destination, amount,
// reason, the obligations it funds, and the source account's balance
// afterward — and it never affects any balance itself. This banner is
// read-only; the user still creates the actual transfer via the normal
// transfer flow if they act on it.
export function FundingRecommendationBanner({
  recommendation,
}: {
  recommendation: Recommendation | null;
}) {
  if (!recommendation) return null;

  return (
    <Card variant="info" className="border-dashed p-4 text-sm">
      <p className="mb-1 flex items-center gap-2">
        <IconBadge icon={ArrowRightLeft} tone="info" size="sm" />
        <span className="font-medium">Funding suggestion: </span>
        move {formatMoney(recommendation.amount, recommendation.currency)} from{" "}
        <span className="font-medium">{recommendation.fromAccountName}</span> to{" "}
        <span className="font-medium">{recommendation.toAccountName}</span>.
      </p>
      <p className="mt-1 text-muted-foreground">{recommendation.reason}</p>
      {recommendation.obligations.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          {recommendation.obligations.map((o) => (
            <li key={o.payableId}>
              {o.name} — {formatMoney(o.amount, recommendation.currency)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-muted-foreground">
        {recommendation.fromAccountName} balance after this transfer:{" "}
        {formatMoney(recommendation.remainingSourceBalance, recommendation.currency)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is a suggestion only — no balance changes until you create the transfer yourself.
      </p>
    </Card>
  );
}
