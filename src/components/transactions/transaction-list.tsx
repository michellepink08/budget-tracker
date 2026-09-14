import { formatMoney } from "@/lib/money";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { EditTransactionButton } from "@/components/transactions/edit-transaction-button";
import { AuditHistoryLink } from "@/components/audit-log/audit-history-link";
import { Card } from "@/components/ui/card";

type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

type TransactionRow = {
  id: string;
  date: Date;
  type: string;
  amount: number;
  description: string;
  notes: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function TransactionList({
  transactions,
  categories,
}: {
  transactions: TransactionRow[];
  categories: CategoryOption[];
}) {
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
            <EditTransactionButton
              transactionId={txn.id}
              description={txn.description}
              notes={txn.notes}
              categoryId={txn.categoryId}
              subcategoryId={txn.subcategoryId}
              categories={categories}
            />
            <DeleteTransactionButton transactionId={txn.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
