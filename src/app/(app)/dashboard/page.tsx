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
import { buildOverdueObligations, startOfDayInTimeZone } from "@/lib/dashboard-overdue";
import {listCycleObligations} from "@/lib/financial-obligation-view";
import {classifyObligation} from "@/lib/financial-obligations";
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
import {formatCycleRange} from "@/lib/cycle";
import {DashboardAccountDetails,DashboardBalanceVisibility} from "@/components/accounts/dashboard-account-details";
import {listCycleIncomePlans} from "@/lib/cycle-income-plans";

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
    loans,
    cards,
    paymentTransactions,
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
    prisma.loan.findMany({ where: { userId: user.id, archivedAt: null } }),
    prisma.creditCard.findMany({ where: { userId: user.id }, include: { account: true } }),
    prisma.transaction.findMany({ where: { userId: user.id, date: { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: now }, OR: [{ loanId: { not: null } }, { creditCardId: { not: null } }] }, select: { loanId: true, creditCardId: true, date: true } }),
  ]);

  const totalPlanned = allocations.reduce((sum, a) => sum + a.effectivePlanned, 0);
  const totalActual = allocations.reduce((sum, a) => sum + a.actual, 0);
  const totalRemaining = totalPlanned - totalActual;
  const [ledger,incomePlans]=await Promise.all([prisma.transaction.findMany({where:{userId:user.id},orderBy:[{date:"desc"},{createdAt:"desc"}]}),listCycleIncomePlans(prisma,user.id,activePeriod.id)]);
  const accountDetails=accounts.map(a=>({...a,balance:a.openingBalance+ledger.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.amount,0),history:ledger.filter(t=>t.accountId===a.id).slice(0,6).map(t=>({id:t.id,description:t.description,date:t.date,amount:t.amount}))}));
  const dailyAllowances = computeDailyAllowances(allocations, activePeriod.endDate, now);
  const startOfToday = startOfDayInTimeZone(now, "Asia/Manila");
  const cycleObligations=await listCycleObligations(prisma,user.id,activePeriod.id,user.currency);
  const overdue = [
    ...duePayables.filter((item) => item.dueDateConfirmed&&item.dueDate < startOfToday).map((item) => ({ id: item.id, sourceType: "PAYABLE", name: item.name, amount: item.amount, dueDate: item.dueDate })),
    ...dueInstallments.filter((item) => item.dueDate < startOfToday).map((item) => ({ id: item.id, sourceType: "INSTALLMENT", name: "Installment payment", amount: item.amount, dueDate: item.dueDate })),
    ...buildOverdueObligations({ today: now, loans, cards: cards.map((item) => ({ id: item.id, name: item.account.name, dueDay: item.paymentDueDay })), transactions: paymentTransactions,obligations:cycleObligations }),
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

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
    unpaidPlannedObligations:cycleObligations.filter(row=>!row.fundingAccountId||!restrictedAccountIds.has(row.fundingAccountId)).reduce((sum,row)=>sum+Math.max(0,row.remaining),0),
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
    ...cycleObligations.filter(item=>classifyObligation({...item,dueDateStatus:item.dueDateStatus??"ESTIMATED"},now)==="UPCOMING").map(item=>({id:item.id,description:item.name+(item.dueDateStatus==="ESTIMATED"?" (estimated)":""),amount:item.remaining,dueDate:item.dueDate!})),
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
  ].filter((item) => item.dueDate >= startOfToday).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="text-xl font-semibold">Your money, at a glance</h1><p className="mt-1 text-sm text-muted-foreground">{formatCycleRange({start:activePeriod.startDate,end:activePeriod.endDate})}</p></div>
      <DashboardBalanceVisibility>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card variant="disposable" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={Wallet} tone="disposable" size="sm" />
            <p className="text-sm text-muted-foreground">Disposable Accounts</p>
          </div>
          <p className="dashboard-balance mt-2 text-2xl font-semibold">{formatMoney(disposableTotal, user.currency)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Safe to spend</p>
          <p className="text-lg font-medium">{formatMoney(safeToSpend, user.currency)}</p>
          <DashboardAccountDetails accounts={accountDetails.filter(a=>a.purpose==="DISPOSABLE")}/>
        </Card>
        <Card variant="savings" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={PiggyBank} tone="savings" size="sm" />
            <p className="text-sm text-muted-foreground">Savings &amp; Reserves</p>
          </div>
          <p className="dashboard-balance mt-2 text-2xl font-semibold">{formatMoney(savingsTotal, user.currency)}</p>
          <DashboardAccountDetails accounts={accountDetails.filter(a=>a.purpose==="SAVINGS")}/>
        </Card>
        <Card variant="restricted" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={Lock} tone="restricted" size="sm" />
            <p className="text-sm text-muted-foreground">Reserved mainly for Tierra Alta</p>
          </div>
          <p className="dashboard-balance mt-2 text-2xl font-semibold">{formatMoney(restrictedTotal, user.currency)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Separate from everyday funds. Transfers and emergency withdrawals remain available.</p>
          <DashboardAccountDetails accounts={accountDetails.filter(a=>a.purpose==="RESTRICTED")}/>
        </Card>
      </div>

      <section className="grid grid-cols-2 gap-4 border-y py-4"><div><p className="text-xs text-muted-foreground">Expected income this cycle</p><p className="mt-1 text-lg font-medium tabular-nums">{formatMoney(incomePlans.reduce((s,r)=>s+r.expectedAmount,0),user.currency)}</p></div><div><p className="text-xs text-muted-foreground">Actual income received</p><p className="mt-1 text-lg font-medium tabular-nums">{formatMoney(incomePlans.reduce((s,r)=>s+r.actual,0),user.currency)}</p></div></section>

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
      {cycleObligations.some(item=>item.dueDateStatus==="UNSET"&&item.remaining>0)&&<section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Needs a due date</h2><div className="flex flex-col gap-2">{cycleObligations.filter(item=>item.dueDateStatus==="UNSET"&&item.remaining>0).map(item=><Card key={item.id} className="flex items-center justify-between p-3"><p className="font-medium">{item.name} · Unconfirmed</p><p>{formatMoney(item.remaining,user.currency)}</p></Card>)}</div></section>}
      {cycleObligations.some(item=>classifyObligation({...item,dueDateStatus:item.dueDateStatus??"ESTIMATED"},now)==="LATER")&&<section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Later this cycle</h2><div className="flex flex-col gap-2">{cycleObligations.filter(item=>classifyObligation({...item,dueDateStatus:item.dueDateStatus??"ESTIMATED"},now)==="LATER").map(item=><Card key={item.id} className="flex items-center justify-between p-3"><p className="font-medium">{item.name}</p><p>{formatMoney(item.remaining,user.currency)} · {item.dueDate?.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})}{item.dueDateStatus==="ESTIMATED"?" (estimated)":""}</p></Card>)}</div></section>}

      {overdue.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-danger">Overdue payments</h2>
          <div className="flex flex-col gap-2">
            {overdue.map((item) => (
              <Card key={`${item.sourceType}-${item.id}`} variant="danger" className="flex items-center justify-between p-3">
                <div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">Due {item.dueDate.toLocaleDateString()}</p></div>
                {item.amount !== null && <p className="font-medium">{formatMoney(item.amount, user.currency)}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

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
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Dedicated reserves</h2>
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
      </DashboardBalanceVisibility>
    </div>
  );
}
