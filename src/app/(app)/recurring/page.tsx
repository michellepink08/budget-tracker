import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { DueList } from "@/components/recurring/due-list";
import { RuleFormDialog } from "@/components/recurring/rule-form-dialog";
import { RuleList } from "@/components/recurring/rule-list";

export default async function RecurringPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const [dueRules, allRules, accounts, categories] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId: user.id, active: true, nextDate: { lte: new Date() } },
      orderBy: { nextDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id },
      orderBy: { nextDate: "asc" },
      include: { account: true, category: true },
    }),
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring</h1>
        <RuleFormDialog accounts={accounts} categories={categories} />
      </div>

      <DueList rules={dueRules} />

      <RuleList rules={allRules} accounts={accounts} categories={categories} />
    </div>
  );
}
