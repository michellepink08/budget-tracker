import { formatMoney } from "@/lib/money";
import { ArchiveInstallmentPurchaseButton } from "@/components/loans-cards/archive-installment-purchase-button";
import { PayInstallmentTermDialog } from "@/components/loans-cards/pay-installment-term-dialog";
import { Card } from "@/components/ui/card";

type PaymentRow = { id: string; termNumber: number; amount: number; dueDate: Date; status: string };

type PurchaseRow = {
  id: string;
  name: string;
  totalAmount: number;
  numberOfTerms: number;
  payments: PaymentRow[];
  account: { currency: string };
};

type AccountOption = { id: string; name: string; currency: string };

export function InstallmentPurchaseList({
  purchases,
  payingAccounts,
}: {
  purchases: PurchaseRow[];
  payingAccounts: AccountOption[];
}) {
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
        const sortedPayments = [...purchase.payments].sort((a, b) => a.termNumber - b.termNumber);

        return (
          <Card key={purchase.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{purchase.name}</p>
                <p className="text-sm text-muted-foreground">
                  {paidCount} of {purchase.numberOfTerms} terms paid ·{" "}
                  {formatMoney(remaining, purchase.account.currency)} remaining of{" "}
                  {formatMoney(purchase.totalAmount, purchase.account.currency)}
                </p>
              </div>
              <ArchiveInstallmentPurchaseButton purchaseId={purchase.id} name={purchase.name} unpaidTerms={purchase.payments.filter((p) => p.status === "PENDING").length} />
            </div>

            <div className="flex flex-col gap-1.5">
              {sortedPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between rounded-md bg-accent-tint p-2 text-sm">
                  <span>
                    Term {payment.termNumber} — {formatMoney(payment.amount, purchase.account.currency)} — due{" "}
                    {payment.dueDate.toLocaleDateString()}
                  </span>
                  {payment.status === "PAID" ? (
                    <span className="text-xs font-medium text-success">Paid</span>
                  ) : (
                    <PayInstallmentTermDialog
                      paymentId={payment.id}
                      termNumber={payment.termNumber}
                      defaultAmount={payment.amount}
                      accounts={payingAccounts}
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
