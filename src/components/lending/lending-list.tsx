import { formatMoney } from "@/lib/money";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { RecordRepaymentDialog } from "@/components/lending/record-repayment-dialog";
import { MarkReturnedButton } from "@/components/lending/mark-returned-button";
import { ArchiveLendingButton } from "@/components/lending/archive-lending-button";
import { Card } from "@/components/ui/card";

const LENDING_CURRENCY = "PHP";

type LendingRow = {
  id: string;
  borrowerName: string;
  kind: string;
  amount: number | null;
  outstanding: number | null;
  itemDescription: string | null;
  itemValue: number | null;
  returned: boolean;
  accountId: string | null;
  date: Date;
};

export function LendingList({
  lendings,
  accounts,
}: {
  lendings: LendingRow[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  if (lendings.length === 0) {
    return <p className="text-muted-foreground">No lending recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {lendings.map((lending) => (
        <Card key={lending.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{lending.borrowerName}</p>
            {lending.kind === "CASH" ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(lending.outstanding ?? 0, LENDING_CURRENCY)} outstanding of{" "}
                {formatMoney(lending.amount ?? 0, LENDING_CURRENCY)} · lent {lending.date.toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {lending.itemDescription}
                {lending.itemValue ? ` (~${formatMoney(lending.itemValue, LENDING_CURRENCY)})` : ""} ·{" "}
                {lending.returned ? "Returned" : "Not returned"} · lent {lending.date.toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {lending.kind === "CASH" && <RecordRepaymentDialog lendingId={lending.id} accounts={accounts} />}
            {lending.kind === "ITEM" && !lending.returned && <MarkReturnedButton lendingId={lending.id} />}
            <LendingFormDialog
              accounts={accounts}
              existing={{
                id: lending.id,
                borrowerName: lending.borrowerName,
                kind: lending.kind,
                amount: lending.amount,
                accountId: lending.accountId,
                itemDescription: lending.itemDescription,
                itemValue: lending.itemValue,
                date: lending.date,
              }}
            />
            <ArchiveLendingButton lendingId={lending.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
