"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addIncomeForecastAction, updateIncomeForecastAction } from "@/actions/year-plan.actions";
import { INCOME_FORECAST_SOURCES, INCOME_FORECAST_STATUSES } from "@/lib/constants/financial";
import { humanizeEnum } from "@/lib/enum-labels";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type PhaseOption = { id: string; label: string | null; phaseType: string };

type FormValues = {
  phaseId: string;
  source: string;
  expectedDate: string;
  expectedAmount: number;
  cutoffLabel: string;
  status: string;
  notes: string;
};

type ExistingForecast = {
  id: string;
  phaseId: string | null;
  source: string;
  expectedDate: Date;
  expectedAmount: number;
  cutoffLabel: string;
  status: string;
  notes: string | null;
};

export function ForecastFormDialog({
  yearPlanId,
  phases,
  currency,
  existing,
}: {
  yearPlanId: string;
  phases: PhaseOption[];
  currency: string;
  existing?: ExistingForecast;
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
          phaseId: existing.phaseId ?? "",
          source: existing.source,
          expectedDate: existing.expectedDate.toISOString().slice(0, 10),
          expectedAmount: toMajorUnits(existing.expectedAmount, currency),
          cutoffLabel: existing.cutoffLabel,
          status: existing.status,
          notes: existing.notes ?? "",
        }
      : {
          phaseId: "",
          source: "MY_SALARY",
          expectedDate: new Date().toISOString().slice(0, 10),
          expectedAmount: 0,
          cutoffLabel: "",
          status: "EXPECTED",
          notes: "",
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("phaseId", values.phaseId);
    formData.set("source", values.source);
    formData.set("expectedDate", values.expectedDate);
    formData.set("expectedAmount", String(values.expectedAmount));
    formData.set("cutoffLabel", values.cutoffLabel);
    formData.set("status", values.status);
    formData.set("notes", values.notes);

    const result = existing
      ? await updateIncomeForecastAction(existing.id, currency, formData)
      : await addIncomeForecastAction(yearPlanId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Forecast updated" : "Forecast added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size={existing ? "sm" : undefined} />}>
        {existing ? "Edit" : "Add income forecast"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit income forecast" : "Add income forecast"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cutoffLabel">Cutoff label</Label>
            <Input id="cutoffLabel" placeholder="e.g. Jan 15-31" {...register("cutoffLabel")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phaseId">Phase (optional)</Label>
            <select
              id="phaseId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("phaseId")}
            >
              <option value="">None</option>
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.label ?? phase.phaseType}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source">Source</Label>
            <select
              id="source"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("source")}
            >
              {INCOME_FORECAST_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {humanizeEnum(source)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expectedDate">Expected date</Label>
            <Input id="expectedDate" type="date" {...register("expectedDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expectedAmount">Expected amount</Label>
            <Input
              id="expectedAmount"
              type="number"
              step="0.01"
              {...register("expectedAmount", { valueAsNumber: true })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("status")}
            >
              {INCOME_FORECAST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
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
