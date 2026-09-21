import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { AccountActivityTable } from "@/components/transactions/account-activity-table";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Card } from "@/components/ui/card";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; search?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;

  const [accounts, categories] = await Promise.all([
    listAccounts(prisma, userId),
    listCategories(prisma, userId),
  ]);

  const allTransactions = await prisma.transaction.findMany({
    where: {
      userId,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { account: true, category: true },
  });
  const matches=allTransactions.filter(t=>(!params.accountId||t.accountId===params.accountId)&&(!params.search||t.description.toLowerCase().includes(params.search.toLowerCase())));
  const visibleIds=new Set(matches.flatMap(t=>[t.id,...(t.linkedTransactionId?[t.linkedTransactionId]:[])]));
  const transactions=allTransactions.filter(t=>visibleIds.has(t.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
      </div>

      <details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Add transaction manually</summary><Card className="mt-4 border-0 p-0">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Add transaction</h2>
        <TransactionForm accounts={accounts} categories={categories} />
      </Card></details>

      <TransactionFilters accounts={accounts} />
      <AccountActivityTable transactions={transactions} accounts={accounts} categories={categories} />
    </div>
  );
}
