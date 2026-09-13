import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
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

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.search ? { description: { contains: params.search } } : {}),
    },
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Add transaction</h2>
        <TransactionForm accounts={accounts} categories={categories} />
      </Card>

      <TransactionFilters accounts={accounts} />
      <TransactionList transactions={transactions} />
    </div>
  );
}
