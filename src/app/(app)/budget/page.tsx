import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCycle, formatCycleRange } from "@/lib/cycle";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listBudgetPeriods } from "@/lib/budget-periods";
import { computeAvailableAllocationOptions, listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listCyclePaymentPlans } from "@/lib/cycle-payment-plans";
import { listCycleIncomePlans } from "@/lib/cycle-income-plans";
import { buildMonthlyObligations } from "@/lib/monthly-obligations";
import { buildMonthlyPlanSummary } from "@/lib/monthly-plan";
import { AllocationList } from "@/components/budget/allocation-list";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import { PeriodPicker } from "@/components/budget/period-picker";
import { CycleIncomePlanTable } from "@/components/budget/cycle-income-plan-table";
import { CopyLastCycleButton } from "@/components/budget/copy-last-cycle-button";
import { MonthlyPlanSummary } from "@/components/budget/monthly-plan-summary";
import { MonthlyObligationsSection } from "@/components/bills/monthly-obligations-section";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";

function dueDateInPeriod(start: Date, end: Date, day: number | null) { if (!day) return null; for (let month = new Date(start.getFullYear(), start.getMonth(), 1); month <= end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) { const candidate = new Date(month.getFullYear(), month.getMonth(), Math.min(day, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate())); if (candidate >= start && candidate <= end) return candidate; } return null; }

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ periodId?: string }> }) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;
  const currentCycle = getCurrentCycle(user.cycleStartDay);
  await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);
  const periods = await listBudgetPeriods(prisma, user.id);
  const period = periods.find((p) => p.id === params.periodId) ?? periods.find((p) => p.startDate.getTime() === currentCycle.start.getTime()) ?? periods[0];
  const [allocations, categories, accounts, payables, loans, installments, cards, paymentPlans, transactions, incomePlans] = await Promise.all([
    listAllocationsWithActuals(prisma, user.id, period.id), prisma.category.findMany({ where: { userId: user.id, archivedAt: null }, include: { subcategories: { where: { archivedAt: null } } }, orderBy: { sortOrder: "asc" } }),
    prisma.account.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } }), prisma.payable.findMany({ where: { userId: user.id, dueDate: { gte: period.startDate, lte: period.endDate } }, include: { account: true } }),
    prisma.loan.findMany({ where: { userId: user.id, archivedAt: null } }), prisma.installmentPayment.findMany({ where: { userId: user.id, dueDate: { gte: period.startDate, lte: period.endDate }, installmentPurchase: { archivedAt: null } }, include: { installmentPurchase: true } }),
    prisma.creditCard.findMany({ where: { userId: user.id }, include: { account: true } }), listCyclePaymentPlans(prisma, user.id, period.id), prisma.transaction.findMany({ where: { userId: user.id, budgetPeriodId: period.id } }), listCycleIncomePlans(prisma, user.id, period.id),
  ]);
  const availableCategories = computeAvailableAllocationOptions(categories.map((c) => ({ id: c.id, name: c.name, subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })) })), allocations.map((a) => ({ categoryId: a.categoryId, subcategoryId: a.subcategoryId })));
  const transactionsById = new Map(transactions.map((item) => [item.id, item]));
  const obligations = buildMonthlyObligations({ currency: user.currency, payables: payables.map((item) => ({ ...item, actual: item.paidTransactionId ? Math.abs(transactionsById.get(item.paidTransactionId)?.amount ?? 0) : 0 })), loans: loans.map((item) => ({ id: item.id, name: item.name, monthlyPayment: item.monthlyPayment, dueDate: dueDateInPeriod(period.startDate, period.endDate, item.dueDay) })), installments: installments.map((item) => ({ id: item.id, name: item.installmentPurchase.name, amount: item.amount, dueDate: item.dueDate, actual: item.paidTransactionId ? Math.abs(transactionsById.get(item.paidTransactionId)?.amount ?? 0) : 0 })), cards: cards.map((item) => ({ id: item.id, name: item.account.name, dueDate: dueDateInPeriod(period.startDate, period.endDate, item.paymentDueDay) })), plans: paymentPlans, transactions });
  const expectedIncome = incomePlans.reduce((sum, row) => sum + row.expectedAmount, 0), actualIncome = incomePlans.reduce((sum, row) => sum + row.actual, 0), plannedSpending = allocations.reduce((sum, row) => sum + row.effectivePlanned, 0), actualSpending = allocations.reduce((sum, row) => sum + row.actual, 0);
  const summary = { expectedIncome, actualIncome, plannedSpending, actualSpending, ...buildMonthlyPlanSummary({ expectedIncome, actualIncome, plannedSpending, actualSpending }) };
  const usedIncomeIds = new Set(incomePlans.map((row) => row.actualTransactionId).filter(Boolean));
  const incomeTransactions = transactions.filter((item) => item.type === "INCOME" && !usedIncomeIds.has(item.id)).map((item) => ({ id: item.id, description: item.description, amount: item.amount, date: item.date }));
  return <div className="flex flex-col gap-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-semibold">Monthly Plan</h1><p className="text-sm text-muted-foreground">{formatCycleRange({ start: period.startDate, end: period.endDate })} · planned vs actual</p></div><div className="flex flex-wrap gap-2"><PeriodPicker periods={periods} activePeriodId={period.id} /><CopyLastCycleButton periodId={period.id} /></div></div>
    <MonthlyPlanSummary currency={user.currency} values={summary} />
    <CycleIncomePlanTable rows={incomePlans} transactions={incomeTransactions} budgetPeriodId={period.id} currency={user.currency} />
    <section className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-muted-foreground">Planned budget vs actual spending</h2><AllocationFormDialog budgetPeriodId={period.id} currency={user.currency} availableCategories={availableCategories} /></div><AllocationList allocations={allocations} budgetPeriodId={period.id} currency={user.currency} availableCategories={availableCategories} /></section>
    <section className="flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium text-muted-foreground">Bills, loans & cards</h2><div className="flex gap-2"><RecurringPayableFormDialog accounts={accounts} categories={categories} /><PayableFormDialog accounts={accounts} categories={categories} /></div></div><MonthlyObligationsSection title="Regular bills" rows={obligations.sections.REGULAR_BILLS} periodId={period.id} /><MonthlyObligationsSection title="Loans & installments" rows={obligations.sections.LOANS_INSTALLMENTS} periodId={period.id} /><MonthlyObligationsSection title="Credit cards" rows={obligations.sections.CREDIT_CARDS} periodId={period.id} /></section>
  </div>;
}
