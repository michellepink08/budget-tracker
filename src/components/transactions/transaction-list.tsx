import { formatMoney } from "@/lib/money";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { AuditHistoryLink } from "@/components/audit-log/audit-history-link";
import { Card } from "@/components/ui/card";

type TransactionRow = {
  id: string;
  date: Date;
  type: string;
  amount: number;
  description: string;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function TransactionList({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground">
        No transactions match these filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {transactions.map((txn) => (
        <Card
          key={txn.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">{txn.description}</p>
            <p className="text-sm text-muted-foreground">
              {txn.date.toLocaleDateString()} · {txn.account.name}
              {txn.category ? ` · ${txn.category.name}` : ""} · {txn.type}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={txn.amount < 0 ? "text-destructive" : "text-foreground"}>
              {formatMoney(txn.amount, txn.account.currency)}
            </span>
            <AuditHistoryLink entityType="TRANSACTION" entityId={txn.id} />
            <DeleteTransactionButton transactionId={txn.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
