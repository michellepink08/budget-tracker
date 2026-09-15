import { formatMoney } from "@/lib/money";
import { humanizeEnum } from "@/lib/enum-labels";
import { Card } from "@/components/ui/card";

type AccountSummary = { id: string; name: string; accountType: string; balance: number };

export function LedgerAccountsSummary({
  accounts,
  currency,
}: {
  accounts: AccountSummary[];
  currency: string;
}) {
  if (accounts.length === 0) {
    return <p className="text-muted-foreground">No accounts in this group yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {accounts.map((account) => (
        <Card key={account.id} className="flex min-w-[160px] flex-col gap-1 p-3">
          <p className="text-sm text-muted-foreground">
            {account.name} · {humanizeEnum(account.accountType)}
          </p>
          <p className={`font-medium ${account.balance < 0 ? "text-destructive" : ""}`}>
            {formatMoney(account.balance, currency)}
          </p>
        </Card>
      ))}
    </div>
  );
}
