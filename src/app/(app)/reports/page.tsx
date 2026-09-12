import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { incomeVsExpenseByPeriod, spendingByCategory } from "@/lib/reports";
import { SpendingByCategoryChart } from "@/components/reports/spending-by-category-chart";
import { IncomeVsExpenseChart } from "@/components/reports/income-vs-expense-chart";

export default async function ReportsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);

  const [spending, periodTotals] = await Promise.all([
    spendingByCategory(prisma, user.id, activePeriod.id),
    incomeVsExpenseByPeriod(prisma, user.id, 6),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Reports</h1>

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
