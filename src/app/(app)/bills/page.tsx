import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCycle } from "@/lib/cycle";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listBudgetPeriods } from "@/lib/budget-periods";
import { listCyclePaymentPlans } from "@/lib/cycle-payment-plans";
import { buildMonthlyObligations } from "@/lib/monthly-obligations";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";
import { PeriodPicker } from "@/components/budget/period-picker";
import { MonthlyObligationsSummary } from "@/components/bills/monthly-obligations-summary";
import { MonthlyObligationsSection } from "@/components/bills/monthly-obligations-section";
import { DuePayablesBanner } from "@/components/bills/due-payables-banner";

function dueDateInPeriod(start: Date, end: Date, day: number | null) {
  if (!day) return null;
  for (let month = new Date(start.getFullYear(), start.getMonth(), 1); month <= end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    const candidate = new Date(month.getFullYear(), month.getMonth(), Math.min(day, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()));
    if (candidate >= start && candidate <= end) return candidate;
  }
  return null;
}

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ periodId?: string }> }) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;
  await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);
  const periods = await listBudgetPeriods(prisma, user.id);
  const currentCycle = getCurrentCycle(user.cycleStartDay);
  const period = periods.find((item) => item.id === params.periodId) ?? periods.find((item) => item.startDate.getTime() === currentCycle.start.getTime()) ?? periods[0];
  const [accounts, categories, payables, loans, installments, cards, plans, transactions] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } }), prisma.category.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.payable.findMany({ where: { userId: user.id, dueDate: { gte: period.startDate, lte: period.endDate } }, include: { account: true } }), prisma.loan.findMany({ where: { userId: user.id, archivedAt: null } }),
    prisma.installmentPayment.findMany({ where: { userId: user.id, dueDate: { gte: period.startDate, lte: period.endDate }, installmentPurchase: { archivedAt: null } }, include: { installmentPurchase: true } }),
    prisma.creditCard.findMany({ where: { userId: user.id }, include: { account: true } }), listCyclePaymentPlans(prisma, user.id, period.id), prisma.transaction.findMany({ where: { userId: user.id, budgetPeriodId: period.id } }),
  ]);
  const transactionsById = new Map(transactions.map((item) => [item.id, item]));
  const obligations = buildMonthlyObligations({ currency: user.currency,
    payables: payables.map((item) => ({ ...item, actual: item.paidTransactionId ? Math.abs(transactionsById.get(item.paidTransactionId)?.amount ?? 0) : 0 })),
    loans: loans.map((item) => ({ id: item.id, name: item.name, monthlyPayment: item.monthlyPayment, dueDate: dueDateInPeriod(period.startDate, period.endDate, item.dueDay) })),
    installments: installments.map((item) => ({ id: item.id, name: item.installmentPurchase.name, amount: item.amount, dueDate: item.dueDate, actual: item.paidTransactionId ? Math.abs(transactionsById.get(item.paidTransactionId)?.amount ?? 0) : 0 })),
    cards: cards.map((item) => ({ id: item.id, name: item.account.name, dueDate: dueDateInPeriod(period.startDate, period.endDate, item.paymentDueDay) })), plans, transactions,
  });
  const today = new Date();
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);
  const dueThisWeek = payables.filter((item) => item.status === "PENDING" && item.dueDate >= today && item.dueDate <= weekFromNow);
  return <div className="flex flex-col gap-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-semibold">Monthly obligations</h1><p className="text-sm text-muted-foreground">Expected payments and what you have actually paid this cycle.</p></div><div className="flex flex-wrap gap-2"><PeriodPicker periods={periods} activePeriodId={period.id} /><RecurringPayableFormDialog accounts={accounts} categories={categories} /><PayableFormDialog accounts={accounts} categories={categories} /></div></div><MonthlyObligationsSummary totals={obligations.totals} currency={user.currency} /><MonthlyObligationsSection title="Regular bills" rows={obligations.sections.REGULAR_BILLS} periodId={period.id} /><DuePayablesBanner payables={dueThisWeek} /><MonthlyObligationsSection title="Loans & installments" rows={obligations.sections.LOANS_INSTALLMENTS} periodId={period.id} /><MonthlyObligationsSection title="Credit cards" rows={obligations.sections.CREDIT_CARDS} periodId={period.id} /></div>;
}
