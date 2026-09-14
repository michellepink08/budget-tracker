import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCycle } from "@/lib/cycle";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listBudgetPeriods } from "@/lib/budget-periods";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listCategories } from "@/lib/categories";
import { formatCycleRange } from "@/lib/cycle";
import { AllocationList } from "@/components/budget/allocation-list";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import { PeriodPicker } from "@/components/budget/period-picker";
import { PeriodFormDialog } from "@/components/budget/period-form-dialog";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;

  // Ensure the current cycle's period exists so it always shows up in the picker.
  const currentCycle = getCurrentCycle(user.cycleStartDay);
  await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);

  const periods = await listBudgetPeriods(prisma, user.id);
  const activePeriod =
    periods.find((p) => p.id === params.periodId) ??
    periods.find((p) => p.startDate.getTime() === currentCycle.start.getTime()) ??
    periods[0];

  const [allocations, categories] = await Promise.all([
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listCategories(prisma, user.id),
  ]);

  const allocatedCategoryIds = new Set(allocations.map((a) => a.categoryId));
  const availableCategories = categories
    .filter((c) => !allocatedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Budget</h1>
          <p className="text-sm text-muted-foreground">
            {formatCycleRange({ start: activePeriod.startDate, end: activePeriod.endDate })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker periods={periods} activePeriodId={activePeriod.id} />
          <PeriodFormDialog />
          <AllocationFormDialog
            budgetPeriodId={activePeriod.id}
            currency={user.currency}
            availableCategories={availableCategories}
          />
        </div>
      </div>

      <AllocationList
        allocations={allocations}
        budgetPeriodId={activePeriod.id}
        currency={user.currency}
        availableCategories={availableCategories}
      />
    </div>
  );
}
