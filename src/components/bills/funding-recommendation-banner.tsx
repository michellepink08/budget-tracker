import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";

type Recommendation = {
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  currency: string;
};

export function FundingRecommendationBanner({
  recommendation,
}: {
  recommendation: Recommendation | null;
}) {
  if (!recommendation) return null;

  return (
    <Card className="border-dashed p-4 text-sm">
      <span className="font-medium">Funding suggestion: </span>
      move {formatMoney(recommendation.amount, recommendation.currency)} from{" "}
      <span className="font-medium">{recommendation.fromAccountName}</span> to{" "}
      <span className="font-medium">{recommendation.toAccountName}</span> to cover bills due soon.
    </Card>
  );
}
