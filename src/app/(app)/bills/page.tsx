import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";
import { DuePayablesBanner } from "@/components/bills/due-payables-banner";
import { PayableList } from "@/components/bills/payable-list";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";
import { RecurringPayableDueList } from "@/components/bills/recurring-payable-due-list";
import { RecurringPayableList } from "@/components/bills/recurring-payable-list";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";

const DUE_SOON_WINDOW_DAYS = 7;

export default async function BillsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const dueSoonHorizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DUE_SOON_WINDOW_DAYS);

  const [
    duePayables,
    allPayables,
    dueRecurringPayables,
    allRecurringPayables,
    accounts,
    categories,
    recommendation,
  ] = await Promise.all([
    prisma.payable.findMany({
      where: { userId: user.id, status: "PENDING", dueDate: { lte: dueSoonHorizon } },
      orderBy: { dueDate: "asc" },
      include: { account: true },
    }),
    prisma.payable.findMany({
      where: { userId: user.id },
      orderBy: { dueDate: "asc" },
      include: { account: true, category: true },
    }),
    prisma.recurringPayable.findMany({
      where: { userId: user.id, active: true, nextDueDate: { lte: now } },
      orderBy: { nextDueDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringPayable.findMany({
      where: { userId: user.id },
      orderBy: { nextDueDate: "asc" },
      include: { account: true, category: true },
    }),
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
    getRecommendedFundingTransfer(prisma, user.id, now, { lookAheadDays: DUE_SOON_WINDOW_DAYS }),
  ]);

  let recommendationView = null;
  if (recommendation) {
    const fromAccount = accounts.find((a) => a.id === recommendation.fromAccountId);
    const toAccount = accounts.find((a) => a.id === recommendation.toAccountId);
    if (fromAccount && toAccount) {
      recommendationView = {
        fromAccountName: fromAccount.name,
        toAccountName: toAccount.name,
        amount: recommendation.amount,
        currency: toAccount.currency,
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bills</h1>
        <div className="flex gap-2">
          <RecurringPayableFormDialog accounts={accounts} categories={categories} />
          <PayableFormDialog accounts={accounts} categories={categories} />
        </div>
      </div>

      <FundingRecommendationBanner recommendation={recommendationView} />

      <RecurringPayableDueList rules={dueRecurringPayables} />
      <DuePayablesBanner payables={duePayables} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recurring bills</h2>
        <RecurringPayableList rules={allRecurringPayables} accounts={accounts} categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">All bills</h2>
        <PayableList payables={allPayables} accounts={accounts} categories={categories} />
      </div>
    </div>
  );
}
