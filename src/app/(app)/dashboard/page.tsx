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
import { getShoppingDashboardSummary } from "@/lib/shopping-summary";
import { shouldPromptRollover } from "@/lib/cutoff-rollover";
import { computeDailyAllowances } from "@/lib/daily-allowance";
import { Wallet, PiggyBank, Lock } from "lucide-react";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";
import { RolloverBanner } from "@/components/dashboard/rollover-banner";
import { RolloverNote } from "@/components/budget/rollover-note";
import { DailyAllowanceCard } from "@/components/dashboard/daily-allowance-card";
import { AffordabilityCheckCard } from "@/components/dashboard/affordability-check-card";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { formatMoney } from "@/lib/money";
import { humanizeEnum } from "@/lib/enum-labels";

const UPCOMING_WINDOW_DAYS = 7;

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_WINDOW_DAYS);

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);
  const promptRollover = await shouldPromptRollover(prisma, user.id, activePeriod);

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
    shoppingSummary,
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
    getShoppingDashboardSummary(prisma, user.id, user.cycleStartDay, now),
  ]);

  const totalPlanned = allocations.reduce((sum, a) => sum + a.effectivePlanned, 0);
  const totalActual = allocations.reduce((sum, a) => sum + a.actual, 0);
  const totalRemaining = totalPlanned - totalActual;
  const dailyAllowances = computeDailyAllowances(allocations, activePeriod.endDate, now);

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
        reason: recommendation.reason,
        obligations: recommendation.obligations,
        remainingSourceBalance: recommendation.remainingSourceBalance,
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
        <Card variant="disposable" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={Wallet} tone="disposable" size="sm" />
            <p className="text-sm text-muted-foreground">Disposable Accounts</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(disposableTotal, user.currency)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Safe to spend</p>
          <p className="text-lg font-medium">{formatMoney(safeToSpend, user.currency)}</p>
        </Card>
        <Card variant="savings" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={PiggyBank} tone="savings" size="sm" />
            <p className="text-sm text-muted-foreground">Savings &amp; Reserves</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(savingsTotal, user.currency)}</p>
        </Card>
        <Card variant="restricted" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={Lock} tone="restricted" size="sm" />
            <p className="text-sm text-muted-foreground">Restricted Checking</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(restrictedTotal, user.currency)}</p>
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

      {promptRollover && (
        <RolloverBanner
          periodId={activePeriod.id}
          disposableTotal={disposableTotal}
          currency={user.currency}
          sourceAccounts={accounts
            .filter((a) => a.purpose === "DISPOSABLE")
            .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          destinationAccounts={accounts
            .filter((a) => a.purpose === "SAVINGS" || a.purpose === "RESTRICTED")
            .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        />
      )}

      {!promptRollover && activePeriod.rolloverAmount !== null && (
        <RolloverNote amount={activePeriod.rolloverAmount} currency={user.currency} />
      )}

      <FundingRecommendationBanner recommendation={recommendationView} />

      <DailyAllowanceCard rows={dailyAllowances} currency={user.currency} />

      <AffordabilityCheckCard safeToSpend={safeToSpend} currency={user.currency} />

      {yearPlanSummary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card variant="info" className="p-4">
            <p className="text-sm text-muted-foreground">Expected income (forecast)</p>
            {yearPlanSummary.nextForecast ? (
              <>
                <p className="text-2xl font-semibold">
                  {formatMoney(yearPlanSummary.nextForecast.expectedAmount, user.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {humanizeEnum(yearPlanSummary.nextForecast.source)} ·{" "}
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

      {shoppingSummary && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Shopping estimate</p>
          <p className="text-2xl font-semibold">{formatMoney(shoppingSummary.estimatedTotal, user.currency)}</p>
          {shoppingSummary.hasMissingPrice && (
            <p className="text-sm text-warning">Some selected items are missing a price.</p>
          )}
          {shoppingSummary.allowance !== null && (
            <p className={`text-sm ${shoppingSummary.overBudget ? "text-danger" : "text-muted-foreground"}`}>
              {shoppingSummary.overBudget ? "Over allowance" : "Remaining allowance"}:{" "}
              {formatMoney(shoppingSummary.allowance - shoppingSummary.estimatedTotal, user.currency)}
            </p>
          )}
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming (next 7 days)</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing due soon.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((item) => (
              <Card key={item.id} variant="warning" className="flex items-center justify-between p-3">
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
              <Card key={fund.accountId} variant="restricted" className="p-3">
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
