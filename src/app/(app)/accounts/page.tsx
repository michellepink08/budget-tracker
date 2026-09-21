import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountList } from "@/components/accounts/account-list";

export default async function AccountsPage({searchParams}:{searchParams:Promise<{section?:string}>}) {
  const session = await auth();
  const userId = session!.user.id;
  const params=await searchParams;const savingsOnly=params.section==="savings";

  const [accounts, restrictedFunds, savingsGoals] = await Promise.all([
    listAccounts(prisma, userId),
    listRestrictedFundGroups(prisma, userId),
    prisma.savingsGoal.findMany({ where: { userId } }),
  ]);

  const withBalances = await Promise.all(
    accounts.map(async (account) => {
      const pendingTransactions = await prisma.transaction.findMany({
        where: { userId, accountId: account.id, status: "PENDING" },
      });
      return {
        ...account,
        balance: await computeAccountBalance(prisma, account.id),
        pendingCount: pendingTransactions.length,
        pendingTotal: pendingTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{savingsOnly?"Savings & Reserves":"Accounts"}</h1>
        <AccountFormDialog />
      </div>
      <AccountList accounts={savingsOnly?withBalances.filter(a=>a.purpose==="SAVINGS"):withBalances} restrictedFunds={restrictedFunds} savingsGoals={savingsGoals} />
    </div>
  );
}
