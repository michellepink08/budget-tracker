"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { payInstallmentTermAction } from "@/actions/installment-purchase.actions";
import { toMajorUnits } from "@/lib/money";
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

type AccountOption = { id: string; name: string; currency: string };

type FormValues = { accountId: string; amount: number; date: string };

// Deliberately not restricted to terms that are already "due" by date —
// paying ahead of schedule (or backfilling a term you paid before you
// started tracking it here) is exactly what this is for. Creates a real
// transaction, same as any other payment in this app — the date is
// editable specifically so a past payment can be recorded with its real
// date instead of today's.
export function PayInstallmentTermDialog({
  paymentId,
  termNumber,
  defaultAmount,
  accounts,
}: {
  paymentId: string;
  termNumber: number;
  defaultAmount: number; // minor units
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      accountId: accounts[0]?.id ?? "",
      amount: toMajorUnits(defaultAmount, accounts[0]?.currency ?? "PHP"),
      date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("amount", String(values.amount));
    formData.set("date", values.date);

    const result = await payInstallmentTermAction(paymentId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Term marked paid");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Mark as paid</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark term {termNumber} as paid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paid from account</Label>
            <select
              id="accountId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("accountId")}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date actually paid</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Confirm paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
