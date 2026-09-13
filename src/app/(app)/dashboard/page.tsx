import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listDuePayables } from "@/lib/payables";
import { listDueInstallmentPayments } from "@/lib/installment-purchases";
import { computeConfirmedReserves, computeDisposableTotal, computeSavingsTotal } from "@/lib/purpose-totals";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
import { listAccounts } from "@/lib/accounts";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { getYearPlanDashboardSummary } from "@/lib/year-plan-summary";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

const UPCOMING_WINDOW_DAYS = 7;

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_WINDOW_DAYS);

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const [
    disposableTotal,
    savingsTotal,
    confirmedReserves,
    allocations,
    duePayables,
    dueInstallments,
    restrictedFunds,
    accounts,
    cutoffDuePayables,
    recommendation,
    yearPlanSummary,
  ] = await Promise.all([
    computeDisposableTotal(prisma, user.id),
    computeSavingsTotal(prisma, user.id),
    computeConfirmedReserves(prisma, user.id),
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listDuePayables(prisma, user.id, horizon),
    listDueInstallmentPayments(prisma, user.id, horizon),
    listRestrictedFundGroups(prisma, user.id),
    listAccounts(prisma, user.id),
    listDuePayables(prisma, user.id, activePeriod.endDate),
    getRecommendedFundingTransfer(prisma, user.id, now),
    getYearPlanDashboardSummary(prisma, user.id, now),
  ]);

  const totalPlanned = allocations.reduce((sum, a) => sum + a.effectivePlanned, 0);
  const totalActual = allocations.reduce((sum, a) => sum + a.actual, 0);
  const totalRemaining = totalPlanned - totalActual;

  const restrictedAccountIds = new Set(restrictedFunds.map((f) => f.accountId));
  const restrictedTotal = restrictedFunds.reduce((sum, f) => sum + f.balance, 0);
  const safeToSpend = computeSafeToSpend({
    disposableTotal,
    totalRemaining,
    payables: cutoffDuePayables,
    restrictedAccountIds,
    cutoffEnd: activePeriod.endDate,
    requiredTransfers: recommendation?.amount ?? 0,
    confirmedReserves,
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card variant="highlight" className="p-4">
          <p className="text-sm text-muted-foreground">Disposable Accounts</p>
          <p className="text-2xl font-semibold">{formatMoney(disposableTotal, user.currency)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Safe to spend</p>
          <p className="text-lg font-medium">{formatMoney(safeToSpend, user.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Savings &amp; Reserves</p>
          <p className="text-2xl font-semibold">{formatMoney(savingsTotal, user.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Restricted Checking</p>
          <p className="text-2xl font-semibold">{formatMoney(restrictedTotal, user.currency)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Budgeted this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalPlanned, user.currency)}</p>
          <p className="text-sm text-muted-foreground">{formatMoney(totalActual, user.currency)} spent</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Remaining this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalRemaining, user.currency)}</p>
        </Card>
      </div>

      <FundingRecommendationBanner recommendation={recommendationView} />

      {yearPlanSummary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Expected income</p>
            {yearPlanSummary.nextForecast ? (
              <>
                <p className="text-2xl font-semibold">
                  {formatMoney(yearPlanSummary.nextForecast.expectedAmount, user.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {yearPlanSummary.nextForecast.source} ·{" "}
                  {yearPlanSummary.nextForecast.expectedDate.toLocaleDateString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming forecasts</p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Year Plan reserve</p>
            <p className="text-2xl font-semibold">{formatMoney(yearPlanSummary.remainingReserve, user.currency)}</p>
            <p className="text-sm text-muted-foreground">
              {yearPlanSummary.recommendedSavingPerCutoff === null
                ? "No more full-income cutoffs to save from"
                : `${formatMoney(yearPlanSummary.recommendedSavingPerCutoff, user.currency)} / cutoff recommended`}
            </p>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming (next 7 days)</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing due soon.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((item) => (
              <Card key={item.id} className="flex items-center justify-between p-3">
                <p className="font-medium">{item.description}</p>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{formatMoney(item.amount, user.currency)}</p>
                  <p>{item.dueDate.toLocaleDateString()}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {restrictedFunds.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted funds</h2>
          <div className="flex flex-col gap-2">
            {restrictedFunds.map((fund) => (
              <Card key={fund.accountId} className="p-3">
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
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
