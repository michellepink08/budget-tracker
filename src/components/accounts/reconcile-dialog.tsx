"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyReconciliationAction, previewReconciliationAction } from "@/actions/reconciliation.actions";
import { formatMoney } from "@/lib/money";
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

type Preview = { calculatedBalance: number; actualBalance: number; difference: number };

export function ReconcileDialog({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPending, setIsPending] = useState(false);

  function reset() {
    setActualBalanceInput("");
    setPreview(null);
  }

  async function handlePreview() {
    setIsPending(true);
    const result = await previewReconciliationAction(accountId, Number(actualBalanceInput));
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(result);
  }

  async function handleConfirm() {
    setIsPending(true);
    const result = await applyReconciliationAction(accountId, Number(actualBalanceInput));
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.alreadyBalanced ? "Already balanced — nothing to adjust" : "Balance adjusted");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>Reconcile</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile balance</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actualBalance">What does this account actually hold?</Label>
              <Input
                id="actualBalance"
                type="number"
                step="0.01"
                value={actualBalanceInput}
                onChange={(e) => setActualBalanceInput(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={handlePreview} disabled={isPending || actualBalanceInput === ""}>
                Preview
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <p>Calculated: {formatMoney(preview.calculatedBalance, currency)}</p>
              <p>Actual: {formatMoney(preview.actualBalance, currency)}</p>
              <p className="font-medium">
                Difference: {formatMoney(preview.difference, currency)}
                {preview.difference === 0 && " — already balanced"}
              </p>
              {preview.difference !== 0 && (
                <p className="text-muted-foreground">
                  Confirming creates a balance-adjustment transaction closing this gap.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isPending}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
