"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { upsertSavingsGoalAction } from "@/actions/savings-goal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toMajorUnits } from "@/lib/money";

type FormValues = { targetAmount: string; assignedAmount: number };

export function SavingsGoalFormDialog({
  accountId,
  currency,
  existing,
}: {
  accountId: string;
  currency: string;
  existing: { targetAmount: number | null; assignedAmount: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      targetAmount: existing?.targetAmount != null ? String(toMajorUnits(existing.targetAmount, currency)) : "",
      assignedAmount: existing ? toMajorUnits(existing.assignedAmount, currency) : 0,
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("targetAmount", values.targetAmount);
    formData.set("assignedAmount", String(values.assignedAmount));
    const result = await upsertSavingsGoalAction(accountId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Goal updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        {existing ? "Edit goal" : "Set goal"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Savings goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetAmount">Target amount (leave blank for no target)</Label>
            <Input id="targetAmount" type="number" step="0.01" {...register("targetAmount")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignedAmount">Amount assigned to this goal</Label>
            <Input
              id="assignedAmount"
              type="number"
              step="0.01"
              {...register("assignedAmount", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              The rest of this account&apos;s balance counts as unassigned savings.
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
