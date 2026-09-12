import { formatMoney } from "@/lib/money";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ReconcileDialog } from "@/components/accounts/reconcile-dialog";
import { archiveAccountAction } from "@/actions/account.actions";
import { Button } from "@/components/ui/button";

type AccountRow = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
  balance: number;
};

export function AccountList({ accounts }: { accounts: AccountRow[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        No accounts yet. Add one to start tracking balances.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">
              {account.name}
              {account.isPrimaryFundingAccount && (
                <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
              )}
              {!account.includeInLiquidFunds && (
                <span className="ml-2 text-xs text-muted-foreground">(restricted)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {account.accountType} · {formatMoney(account.balance, account.currency)}
            </p>
          </div>
          <div className="flex gap-2">
            <AccountFormDialog existing={account} />
            <ReconcileDialog accountId={account.id} currency={account.currency} />
            <form
              action={async () => {
                "use server";
                await archiveAccountAction(account.id);
              }}
            >
              <Button type="submit" variant="ghost">
                Archive
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
