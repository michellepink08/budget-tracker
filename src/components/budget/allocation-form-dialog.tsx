"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createAllocationAction, updateAllocationAction } from "@/actions/budget.actions";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
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

type CategoryOption = { id: string; name: string };

type ExistingAllocation = {
  id: string;
  plannedAmount: number;
  rolloverMode: string;
};

type FormValues = {
  categoryId: string;
  plannedAmount: number;
  rolloverMode: (typeof ROLLOVER_MODES)[number];
};

export function AllocationFormDialog({
  budgetPeriodId,
  currency,
  availableCategories,
  existing,
  existingCategoryName,
}: {
  budgetPeriodId: string;
  currency: string;
  availableCategories: CategoryOption[];
  existing?: ExistingAllocation;
  existingCategoryName?: string;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          categoryId: "",
          plannedAmount: toMajorUnits(existing.plannedAmount, currency),
          rolloverMode: existing.rolloverMode as FormValues["rolloverMode"],
        }
      : { categoryId: availableCategories[0]?.id ?? "", plannedAmount: 0, rolloverMode: "NONE" },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("budgetPeriodId", budgetPeriodId);
    formData.set("categoryId", values.categoryId);
    formData.set("plannedAmount", String(values.plannedAmount));
    formData.set("rolloverMode", values.rolloverMode);

    const result = existing
      ? await updateAllocationAction(existing.id, formData)
      : await createAllocationAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Allocation updated" : "Allocation added");
    setOpen(false);
  }

  const disabled = !existing && availableCategories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={disabled} />}>
        {existing ? "Edit" : "Add allocation"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existingCategoryName}` : "Add allocation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                {...register("categoryId")}
              >
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("rolloverMode")}
            >
              {ROLLOVER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

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
