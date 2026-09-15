"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createAllocationAction, updateAllocationAction } from "@/actions/budget.actions";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
import { humanizeEnum } from "@/lib/enum-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toMajorUnits } from "@/lib/money";

const WHOLE_CATEGORY = "__whole__";

type AvailableCategoryOption = {
  id: string;
  name: string;
  canWholeCategory: boolean;
  availableSubcategories: { id: string; name: string }[];
};

type ExistingAllocation = {
  id: string;
  plannedAmount: number;
  rolloverMode: string;
  showDailyAllowance: boolean;
};

type FormValues = {
  categoryId: string;
  scope: string; // WHOLE_CATEGORY or a subcategory id
  plannedAmount: number;
  rolloverMode: (typeof ROLLOVER_MODES)[number];
  showDailyAllowance: boolean;
};

export function AllocationFormDialog({
  budgetPeriodId,
  currency,
  availableCategories,
  existing,
  existingLabel,
}: {
  budgetPeriodId: string;
  currency: string;
  availableCategories: AvailableCategoryOption[];
  existing?: ExistingAllocation;
  existingLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          categoryId: "",
          scope: WHOLE_CATEGORY,
          plannedAmount: toMajorUnits(existing.plannedAmount, currency),
          rolloverMode: existing.rolloverMode as FormValues["rolloverMode"],
          showDailyAllowance: existing.showDailyAllowance,
        }
      : {
          categoryId: availableCategories[0]?.id ?? "",
          scope: WHOLE_CATEGORY,
          plannedAmount: 0,
          rolloverMode: "NONE",
          showDailyAllowance: false,
        },
  });

  const selectedCategoryId = watch("categoryId");
  const selectedCategory = useMemo(
    () => availableCategories.find((c) => c.id === selectedCategoryId),
    [availableCategories, selectedCategoryId],
  );

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("budgetPeriodId", budgetPeriodId);
    formData.set("categoryId", values.categoryId);
    if (values.scope !== WHOLE_CATEGORY) formData.set("subcategoryId", values.scope);
    formData.set("plannedAmount", String(values.plannedAmount));
    formData.set("rolloverMode", values.rolloverMode);
    formData.set("showDailyAllowance", String(values.showDailyAllowance));

    const result = existing
      ? await updateAllocationAction(existing.id, formData)
      : await createAllocationAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Allocation updated" : "Allocation added");
    setOpen(false);
    router.refresh();
  }

  const disabled = !existing && availableCategories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={disabled} />}>
        {existing ? "Edit" : "Add allocation"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existingLabel}` : "Add allocation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  {...register("categoryId")}
                >
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="scope">Budget scope</Label>
                <select
                  id="scope"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  {...register("scope")}
                >
                  {selectedCategory?.canWholeCategory && (
                    <option value={WHOLE_CATEGORY}>Whole category</option>
                  )}
                  {selectedCategory?.availableSubcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plannedAmount">Planned amount</Label>
            <Input
              id="plannedAmount"
              type="number"
              step="0.01"
              min="0.01"
              {...register("plannedAmount", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rolloverMode">Rollover</Label>
            <select
              id="rolloverMode"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("rolloverMode")}
            >
              {ROLLOVER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {humanizeEnum(mode)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("showDailyAllowance")} />
            Show daily allowance on Dashboard
          </label>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
