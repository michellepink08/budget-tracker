import { formatMoney } from "@/lib/money";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";
import { Card } from "@/components/ui/card";

type PayableRow = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  accountId: string;
  categoryId: string | null;
  status: string;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function PayableList({
  payables,
  accounts,
  categories,
}: {
  payables: PayableRow[];
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  if (payables.length === 0) {
    return <p className="text-muted-foreground">No bills yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {payables.map((payable) => (
        <Card key={payable.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">
              {payable.name}
              {payable.status === "PAID" && (
                <span className="ml-2 text-xs text-muted-foreground">(paid)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(payable.amount, payable.account.currency)} · {payable.account.name}
              {payable.category ? ` · ${payable.category.name}` : ""} · due{" "}
              {payable.dueDate.toLocaleDateString()}
            </p>
          </div>
          {payable.status === "PENDING" && (
            <PayableFormDialog accounts={accounts} categories={categories} existing={payable} />
          )}
        </Card>
      ))}
    </div>
  );
}
