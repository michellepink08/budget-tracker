import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { incomeVsExpenseByPeriod, spendingByCategory } from "@/lib/reports";
import { SpendingByCategoryChart } from "@/components/reports/spending-by-category-chart";
import { IncomeVsExpenseChart } from "@/components/reports/income-vs-expense-chart";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { formatMoney } from "@/lib/money";

export default async function ReportsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);

  const [spending, periodTotals] = await Promise.all([
    spendingByCategory(prisma, user.id, activePeriod.id),
    incomeVsExpenseByPeriod(prisma, user.id, 6),
  ]);

  // Plan-38 §6: income is always blue/indigo, expense is always coral/warm
  // red — applied consistently across charts, legends, tooltips, and
  // summary cards (this row is the summary-card half of that rule).
  const totalIncome = periodTotals.reduce((sum, p) => sum + p.income, 0);
  const totalExpense = periodTotals.reduce((sum, p) => sum + p.expense, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card variant="info" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={ArrowUpCircle} tone="info" size="sm" />
            <p className="text-sm text-muted-foreground">Income (last 6 cycles)</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(totalIncome, user.currency)}</p>
        </Card>
        <Card variant="expense" className="p-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={ArrowDownCircle} tone="expense" size="sm" />
            <p className="text-sm text-muted-foreground">Expense (last 6 cycles)</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(totalExpense, user.currency)}</p>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Spending by category (this cycle)</h2>
        <SpendingByCategoryChart data={spending} currency={user.currency} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Income vs. expense (last 6 cycles)</h2>
        <IncomeVsExpenseChart data={periodTotals} currency={user.currency} />
      </div>
    </div>
  );
}
