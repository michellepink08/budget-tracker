import { formatMoney } from "@/lib/money";
import { ArchiveInstallmentPurchaseButton } from "@/components/loans-cards/archive-installment-purchase-button";
import { Card } from "@/components/ui/card";

type PurchaseRow = {
  id: string;
  name: string;
  totalAmount: number;
  numberOfTerms: number;
  payments: { status: string; amount: number }[];
  account: { currency: string };
};

export function InstallmentPurchaseList({ purchases }: { purchases: PurchaseRow[] }) {
  if (purchases.length === 0) {
    return <p className="text-muted-foreground">No installment purchases yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {purchases.map((purchase) => {
        const paidCount = purchase.payments.filter((p) => p.status === "PAID").length;
        const remaining = purchase.payments
          .filter((p) => p.status === "PENDING")
          .reduce((sum, p) => sum + p.amount, 0);

        return (
          <Card key={purchase.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{purchase.name}</p>
              <p className="text-sm text-muted-foreground">
                {paidCount} of {purchase.numberOfTerms} terms paid ·{" "}
                {formatMoney(remaining, purchase.account.currency)} remaining of{" "}
                {formatMoney(purchase.totalAmount, purchase.account.currency)}
              </p>
            </div>
            <ArchiveInstallmentPurchaseButton purchaseId={purchase.id} />
          </Card>
        );
      })}
    </div>
  );
}
