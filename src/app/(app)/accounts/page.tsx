import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountList } from "@/components/accounts/account-list";

export default async function AccountsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const accounts = await listAccounts(prisma, userId);
  const withBalances = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      balance: await computeAccountBalance(prisma, account.id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <AccountFormDialog />
      </div>
      <AccountList accounts={withBalances} />
    </div>
  );
}
