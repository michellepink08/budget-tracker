import { formatMoney } from "@/lib/money";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import type { AllocationWithActual } from "@/lib/budget-allocations";
import { Card } from "@/components/ui/card";

export function AllocationList({
  allocations,
  budgetPeriodId,
  currency,
  availableCategories,
}: {
  allocations: AllocationWithActual[];
  budgetPeriodId: string;
  currency: string;
  availableCategories: { id: string; name: string }[];
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-muted-foreground">
        No budget allocations for this period yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {allocations.map((allocation) => {
        const pct = Math.max(0, Math.min(100, allocation.percentUsed));
        return (
          <Card key={allocation.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{allocation.category.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(allocation.actual, currency)} of{" "}
                  {formatMoney(allocation.effectivePlanned, currency)}
                  {allocation.rolloverAmount !== 0 &&
                    ` (includes ${formatMoney(allocation.rolloverAmount, currency)} rollover)`}
                </p>
              </div>
              <AllocationFormDialog
                budgetPeriodId={budgetPeriodId}
                currency={currency}
                availableCategories={availableCategories}
                existing={allocation}
                existingCategoryName={allocation.category.name}
              />
            </div>
            <div className="mt-2 h-2 rounded-full bg-accent-tint">
              <div
                className={
                  allocation.remaining < 0
                    ? "h-2 rounded-full bg-destructive"
                    : "h-2 rounded-full bg-primary"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {allocation.remaining >= 0
                ? `${formatMoney(allocation.remaining, currency)} remaining`
                : `${formatMoney(-allocation.remaining, currency)} over budget`}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
