import { formatMoney } from "@/lib/money";
import { computeLoanTermMonths } from "@/lib/loan-term";
import { Card } from "@/components/ui/card";

const LOAN_CURRENCY = "PHP";

type LoanRow = {
  id: string;
  name: string;
  monthlyPayment: number;
  remainingBalance: number;
  interestRate: number;
  startDate: Date;
  endDate: Date | null;
  dueDay: number | null;
};

export function LoanSummaryTable({ loans }: { loans: LoanRow[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Debt (Loans)</h2>
      {loans.length === 0 ? (
        <p className="text-muted-foreground">No loans.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2">Name</th>
                  <th className="p-2">Remaining balance</th>
                  <th className="p-2">Monthly payment</th>
                  <th className="p-2">Interest rate</th>
                  <th className="p-2">Term</th>
                  <th className="p-2">Due day</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} className="border-t border-border">
                    <td className="p-2">{loan.name}</td>
                    <td className="p-2">{formatMoney(loan.remainingBalance, LOAN_CURRENCY)}</td>
                    <td className="p-2">{formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}</td>
                    <td className="p-2">{loan.interestRate}%</td>
                    <td className="p-2">
                      {loan.endDate ? `${computeLoanTermMonths(loan.startDate, loan.endDate)} mo` : "—"}
                    </td>
                    <td className="p-2">{loan.dueDay ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {loans.map((loan) => (
              <Card key={loan.id} className="p-3">
                <p className="font-medium">{loan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(loan.remainingBalance, LOAN_CURRENCY)} remaining ·{" "}
                  {formatMoney(loan.monthlyPayment, LOAN_CURRENCY)}/mo · {loan.interestRate}% APR
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
