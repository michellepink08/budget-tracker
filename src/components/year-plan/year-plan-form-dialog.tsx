"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createYearPlanAction, updateYearPlanAction } from "@/actions/year-plan.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type FormValues = {
  name: string;
  startDate: string;
  endDate: string;
  minCashBuffer: number;
};

type ExistingYearPlan = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  minCashBuffer: number;
};

// No vacation-reserve-goal picker yet — every plan is created/edited with
// vacationReserveGoalId left as-is. A goal picker is a small enough
// follow-up that it doesn't block shipping the core forecasting tool.
export function YearPlanFormDialog({ currency, existing }: { currency: string; existing?: ExistingYearPlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          startDate: existing.startDate.toISOString().slice(0, 10),
          endDate: existing.endDate.toISOString().slice(0, 10),
          minCashBuffer: toMajorUnits(existing.minCashBuffer, currency),
        }
      : {
          name: "",
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate())
            .toISOString()
            .slice(0, 10),
          minCashBuffer: 0,
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);
    formData.set("minCashBuffer", String(values.minCashBuffer));

    const result = existing
      ? await updateYearPlanAction(existing.id, currency, formData)
      : await createYearPlanAction(currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Year Plan updated" : "Year Plan created");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit plan" : "Create Year Plan"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Year Plan" : "Create Year Plan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. 2026–2027 Onboard Cycle" {...register("name")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" {...register("endDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minCashBuffer">Minimum cash buffer</Label>
            <Input
              id="minCashBuffer"
              type="number"
              step="0.01"
              {...register("minCashBuffer", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              The floor your projected balance should never dip below during the home period.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : existing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
