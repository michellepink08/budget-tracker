import { formatMoney } from "@/lib/money";
import { LoanFormDialog } from "@/components/loans-cards/loan-form-dialog";
import { LoanPaymentDialog } from "@/components/loans-cards/loan-payment-dialog";
import { ArchiveLoanButton } from "@/components/loans-cards/archive-loan-button";
import { Card } from "@/components/ui/card";

const LOAN_CURRENCY = "PHP";

type LoanRow = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: Date;
};

export function LoanList({
  loans,
  payingAccounts,
}: {
  loans: LoanRow[];
  payingAccounts: { id: string; name: string; currency: string }[];
}) {
  if (loans.length === 0) {
    return <p className="text-muted-foreground">No loans yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {loans.map((loan) => (
        <Card key={loan.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{loan.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(loan.remainingBalance, LOAN_CURRENCY)} remaining of{" "}
              {formatMoney(loan.principal, LOAN_CURRENCY)} · {formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}
              /mo · {loan.interestRate}% APR
            </p>
          </div>
          <div className="flex gap-2">
            <LoanPaymentDialog
              loanId={loan.id}
              defaultAmount={loan.monthlyPayment}
              accounts={payingAccounts}
            />
            <LoanFormDialog existing={loan} />
            <ArchiveLoanButton loanId={loan.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
