"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createTransferAction } from "@/actions/transaction.actions";
import { acknowledgeRolloverAction } from "@/actions/budget.actions";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { RotateCcw } from "lucide-react";

type AccountOption = { id: string; name: string; currency: string };

type TransferFormValues = { amount: number; sourceAccountId: string; destinationAccountId: string };

export function RolloverBanner({
  periodId,
  disposableTotal,
  currency,
  sourceAccounts,
  destinationAccounts,
}: {
  periodId: string;
  disposableTotal: number;
  currency: string;
  sourceAccounts: AccountOption[];
  destinationAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [acknowledging, setAcknowledging] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<TransferFormValues>({
    defaultValues: {
      amount: 0,
      sourceAccountId: sourceAccounts[0]?.id ?? "",
      destinationAccountId: destinationAccounts[0]?.id ?? "",
    },
  });

  async function onTransfer(values: TransferFormValues) {
    const formData = new FormData();
    formData.set("amount", String(values.amount));
    formData.set("date", new Date().toISOString().slice(0, 10));
    formData.set("sourceAccountId", values.sourceAccountId);
    formData.set("destinationAccountId", values.destinationAccountId);
    formData.set("description", "Rollover to savings");

    const result = await createTransferAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Moved to savings");
    reset({ amount: 0, sourceAccountId: values.sourceAccountId, destinationAccountId: values.destinationAccountId });
    router.refresh();
  }

  async function onAcknowledge() {
    setAcknowledging(true);
    const result = await acknowledgeRolloverAction(periodId);
    setAcknowledging(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rollover recorded");
    router.refresh();
  }

  return (
    <Card variant="info" className="border-dashed p-4">
      <div className="mb-2 flex items-center gap-2">
        <IconBadge icon={RotateCcw} tone="info" size="sm" />
        <p className="font-medium">
          New cutoff started — {formatMoney(disposableTotal, currency)} across your disposable accounts
          carries over as Rollover.
        </p>
      </div>

      {sourceAccounts.length > 0 && destinationAccounts.length > 0 && (
        <form onSubmit={handleSubmit(onTransfer)} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-amount">Move to savings (optional)</Label>
            <Input
              id="rollover-amount"
              type="number"
              step="0.01"
              min="0.01"
              className="w-32"
              {...register("amount", { valueAsNumber: true })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-source">From</Label>
            <select
              id="rollover-source"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm"
              {...register("sourceAccountId")}
            >
              {sourceAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-destination">To</Label>
            <select
              id="rollover-destination"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm"
              {...register("destinationAccountId")}
            >
              {destinationAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? "Moving..." : "Move"}
          </Button>
        </form>
      )}

      <div className="mt-3">
        <Button onClick={onAcknowledge} disabled={acknowledging}>
          {acknowledging ? "Recording..." : "Got it"}
        </Button>
      </div>
    </Card>
  );
}
