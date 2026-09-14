"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addPhaseAction, updatePhaseAction } from "@/actions/year-plan.actions";
import { YEAR_PLAN_PHASE_TYPES } from "@/lib/constants/financial";
import { humanizeEnum } from "@/lib/enum-labels";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type FormValues = {
  phaseType: string;
  startDate: string;
  endDate: string;
  label: string;
  estimatedExpensesPerCutoff: number;
};

type ExistingPhase = {
  id: string;
  phaseType: string;
  startDate: Date;
  endDate: Date;
  label: string | null;
  estimatedExpensesPerCutoff: number;
};

export function PhaseFormDialog({
  yearPlanId,
  currency,
  existing,
}: {
  yearPlanId: string;
  currency: string;
  existing?: ExistingPhase;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          phaseType: existing.phaseType,
          startDate: existing.startDate.toISOString().slice(0, 10),
          endDate: existing.endDate.toISOString().slice(0, 10),
          label: existing.label ?? "",
          estimatedExpensesPerCutoff: toMajorUnits(existing.estimatedExpensesPerCutoff, currency),
        }
      : {
          phaseType: "HOME_SALARY_ONLY",
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          label: "",
          estimatedExpensesPerCutoff: 0,
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("phaseType", values.phaseType);
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);
    formData.set("label", values.label);
    formData.set("estimatedExpensesPerCutoff", String(values.estimatedExpensesPerCutoff));

    const result = existing
      ? await updatePhaseAction(existing.id, currency, formData)
      : await addPhaseAction(yearPlanId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Phase updated" : "Phase added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={existing ? "sm" : undefined} />}>
        {existing ? "Edit" : "Add phase"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit phase" : "Add phase"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phaseType">Phase type</Label>
            <select
              id="phaseType"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("phaseType")}
            >
              {YEAR_PLAN_PHASE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanizeEnum(type)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phaseStartDate">Start date</Label>
            <Input id="phaseStartDate" type="date" {...register("startDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phaseEndDate">End date</Label>
            <Input id="phaseEndDate" type="date" {...register("endDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Label (optional)</Label>
            <Input id="label" placeholder="e.g. Papa onboard" {...register("label")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimatedExpensesPerCutoff">Estimated expenses per cutoff</Label>
            <Input
              id="estimatedExpensesPerCutoff"
              type="number"
              step="0.01"
              {...register("estimatedExpensesPerCutoff", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              One flat estimate covering essentials, payables/debt, and other spending for every cutoff in this
              phase.
            </p>
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
