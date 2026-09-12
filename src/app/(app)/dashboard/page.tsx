import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listDuePayables } from "@/lib/payables";
import { listDueInstallmentPayments } from "@/lib/installment-purchases";
import { computeLiquidFunds } from "@/lib/liquid-funds";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
import { listAccounts } from "@/lib/accounts";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";
import { formatMoney } from "@/lib/money";

const UPCOMING_WINDOW_DAYS = 7;

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_WINDOW_DAYS);

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const [liquidFunds, allocations, duePayables, dueInstallments, restrictedFunds, accounts, cutoffDuePayables, recommendation] =
    await Promise.all([
      computeLiquidFunds(prisma, user.id),
      listAllocationsWithActuals(prisma, user.id, activePeriod.id),
      listDuePayables(prisma, user.id, horizon),
      listDueInstallmentPayments(prisma, user.id, horizon),
      listRestrictedFundGroups(prisma, user.id),
      listAccounts(prisma, user.id),
      listDuePayables(prisma, user.id, activePeriod.endDate),
      getRecommendedFundingTransfer(prisma, user.id, now),
    ]);

  const totalPlanned = allocations.reduce((sum, a) => sum + a.effectivePlanned, 0);
  const totalActual = allocations.reduce((sum, a) => sum + a.actual, 0);
  const totalRemaining = totalPlanned - totalActual;

  const restrictedAccountIds = new Set(restrictedFunds.map((f) => f.accountId));
  const safeToSpend = computeSafeToSpend({
    liquidFunds,
    totalRemaining,
    payables: cutoffDuePayables,
    restrictedAccountIds,
    cutoffEnd: activePeriod.endDate,
  });

  let recommendationView = null;
  if (recommendation) {
    const fromAccount = accounts.find((a) => a.id === recommendation.fromAccountId);
    const toAccount = accounts.find((a) => a.id === recommendation.toAccountId);
    if (fromAccount && toAccount) {
      recommendationView = {
        fromAccountName: fromAccount.name,
        toAccountName: toAccount.name,
        amount: recommendation.amount,
        currency: fromAccount.currency,
      };
    }
  }

  const purchaseIds = [...new Set(dueInstallments.map((p) => p.installmentPurchaseId))];
  const purchases = purchaseIds.length
    ? await prisma.installmentPurchase.findMany({ where: { id: { in: purchaseIds } } })
    : [];

  const upcoming = [
    ...duePayables.map((p) => ({
      id: p.id,
      description: p.name,
      amount: p.amount,
      dueDate: p.dueDate,
    })),
    ...dueInstallments.map((p) => {
      const purchase = purchases.find((pu) => pu.id === p.installmentPurchaseId)!;
      return {
        id: p.id,
        description: `${purchase.name} (term ${p.termNumber} of ${purchase.numberOfTerms})`,
        amount: p.amount,
        dueDate: p.dueDate,
      };
    }),
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Safe to spend</p>
          <p className="text-2xl font-semibold">{formatMoney(safeToSpend, user.currency)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Liquid funds</p>
          <p className="text-2xl font-semibold">{formatMoney(liquidFunds, user.currency)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Budgeted this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalPlanned, user.currency)}</p>
          <p className="text-sm text-muted-foreground">{formatMoney(totalActual, user.currency)} spent</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Remaining this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalRemaining, user.currency)}</p>
        </div>
      </div>

      <FundingRecommendationBanner recommendation={recommendationView} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming (next 7 days)</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing due soon.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <p className="font-medium">{item.description}</p>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{formatMoney(item.amount, user.currency)}</p>
                  <p>{item.dueDate.toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {restrictedFunds.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted funds</h2>
          <div className="flex flex-col gap-2">
            {restrictedFunds.map((fund) => (
              <div key={fund.accountId} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{fund.accountName}</p>
                  <p className="font-medium">{formatMoney(fund.balance, user.currency)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {fund.obligationTotal > 0
                    ? `Obligation: ${formatMoney(fund.obligationTotal, user.currency)}${
                        fund.nextPayable
                          ? ` · Next: ${fund.nextPayable.name} — ${formatMoney(fund.nextPayable.amount, user.currency)} due ${fund.nextPayable.dueDate.toLocaleDateString()}`
                          : ""
                      }`
                    : "No upcoming obligations"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Projected after payment: {formatMoney(fund.projectedBalance, user.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
