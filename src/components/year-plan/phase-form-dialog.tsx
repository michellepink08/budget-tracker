"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addPhaseAction } from "@/actions/year-plan.actions";
import { YEAR_PLAN_PHASE_TYPES } from "@/lib/constants/financial";
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

export function PhaseFormDialog({ yearPlanId, currency }: { yearPlanId: string; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
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

    const result = await addPhaseAction(yearPlanId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Phase added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Add phase</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add phase</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phaseType">Phase type</Label>
            <select
              id="phaseType"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("phaseType")}
            >
              {YEAR_PLAN_PHASE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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
