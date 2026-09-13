import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ReconcileDialog } from "@/components/accounts/reconcile-dialog";
import { SavingsGoalFormDialog } from "@/components/accounts/savings-goal-form-dialog";
import { archiveAccountAction } from "@/actions/account.actions";
import { computeSavingsProgress } from "@/lib/savings-goals";
import type { RestrictedFundGroup } from "@/lib/restricted-funds";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AccountRow = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  includeInLiquidFunds: boolean;
  purpose: string;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
  balance: number;
  pendingCount: number;
  pendingTotal: number;
};

type SavingsGoalRow = { accountId: string; targetAmount: number | null; assignedAmount: number };

function ArchiveForm({ accountId }: { accountId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await archiveAccountAction(accountId);
      }}
    >
      <Button type="submit" variant="ghost">
        Archive
      </Button>
    </form>
  );
}

function AccountRowActions({ account }: { account: AccountRow }) {
  return (
    <div className="flex gap-2">
      <AccountFormDialog existing={account} />
      <ReconcileDialog accountId={account.id} currency={account.currency} />
      <ArchiveForm accountId={account.id} />
    </div>
  );
}

export function AccountList({
  accounts,
  restrictedFunds,
  savingsGoals,
}: {
  accounts: AccountRow[];
  restrictedFunds: RestrictedFundGroup[];
  savingsGoals: SavingsGoalRow[];
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        No accounts yet. Add one to start tracking balances.
      </p>
    );
  }

  const disposable = accounts.filter((a) => a.purpose === "DISPOSABLE");
  const savings = accounts.filter((a) => a.purpose === "SAVINGS");
  const restricted = accounts.filter((a) => a.purpose === "RESTRICTED");
  const creditDebt = accounts.filter((a) => a.purpose === "CREDIT" || a.purpose === "DEBT");

  const restrictedByAccountId = new Map(restrictedFunds.map((g) => [g.accountId, g]));
  const goalByAccountId = new Map(savingsGoals.map((g) => [g.accountId, g]));

  return (
    <div className="flex flex-col gap-8">
      {disposable.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Disposable</h2>
          <div className="flex flex-col gap-3">
            {disposable.map((account) => (
              <Card key={account.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {account.name}
                    {account.isPrimaryFundingAccount && (
                      <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · {formatMoney(account.balance, account.currency)} · Included in Safe to
                    spend
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.pendingCount > 0
                      ? `${account.pendingCount} pending transaction(s) totaling ${formatMoney(account.pendingTotal, account.currency)}`
                      : "No pending activity"}
                    {" · "}
                    <Link href={`/transactions?accountId=${account.id}`} className="underline">
                      Recent activity
                    </Link>
                  </p>
                </div>
                <AccountRowActions account={account} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {savings.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Savings &amp; Reserves</h2>
          <div className="flex flex-col gap-3">
            {savings.map((account) => {
              const goal = goalByAccountId.get(account.id) ?? null;
              const progress = goal ? computeSavingsProgress(goal, account.balance) : null;
              return (
                <Card key={account.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{account.name}</p>
                    <p className="font-medium">{formatMoney(account.balance, account.currency)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · Included in Safe to spend
                  </p>
                  {goal && goal.targetAmount !== null ? (
                    <p className="text-sm text-muted-foreground">
                      Target {formatMoney(goal.targetAmount, account.currency)} · Assigned{" "}
                      {formatMoney(goal.assignedAmount, account.currency)} · Remaining{" "}
                      {formatMoney(progress!.remainingTarget!, account.currency)} · Unassigned{" "}
                      {formatMoney(progress!.unassignedAmount, account.currency)} ({progress!.progressPct}%)
                    </p>
                  ) : goal ? (
                    <p className="text-sm text-muted-foreground">
                      No target set · Assigned {formatMoney(goal.assignedAmount, account.currency)} · Unassigned{" "}
                      {formatMoney(progress!.unassignedAmount, account.currency)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No goal set yet.</p>
                  )}
                  <div className="flex gap-2">
                    <SavingsGoalFormDialog
                      accountId={account.id}
                      currency={account.currency}
                      existing={goal ? { targetAmount: goal.targetAmount, assignedAmount: goal.assignedAmount } : null}
                    />
                    <AccountRowActions account={account} />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {restricted.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted</h2>
          <div className="flex flex-col gap-3">
            {restricted.map((account) => {
              const group = restrictedByAccountId.get(account.id);
              return (
                <Card key={account.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{account.name}</p>
                    <p className="font-medium">{formatMoney(account.balance, account.currency)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · Excluded from liquid funds and Safe to spend
                  </p>
                  {group && (
                    <p className="text-sm text-muted-foreground">
                      {group.obligationTotal > 0
                        ? `Obligation: ${formatMoney(group.obligationTotal, account.currency)}${
                            group.nextPayable
                              ? ` · Next: ${group.nextPayable.name} — ${formatMoney(group.nextPayable.amount, account.currency)} due ${group.nextPayable.dueDate.toLocaleDateString()}`
                              : ""
                          } · Covers ${group.paymentsCovered} payment(s)`
                        : "No upcoming obligations"}
                    </p>
                  )}
                  {group && (
                    <p className="text-sm text-muted-foreground">
                      Projected after payment: {formatMoney(group.projectedBalance, account.currency)}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Link href={`/transactions?accountId=${account.id}`} className="text-sm underline">
                      Deposit &amp; payment history
                    </Link>
                    <AccountRowActions account={account} />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {creditDebt.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Credit &amp; Debt</h2>
          <div className="flex flex-col gap-3">
            {creditDebt.map((account) => (
              <Card key={account.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · {formatMoney(account.balance, account.currency)} · Never counted as
                    spendable funds
                  </p>
                </div>
                <AccountRowActions account={account} />
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
