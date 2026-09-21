"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCreditCardAction, updateCreditCardAction } from "@/actions/credit-card.actions";
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

type FormValues = {
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
  monthlyInterestEstimate:number;
};

type ExistingCard = {
  id: string;
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
  monthlyInterestEstimate?:number;
};

export function CreditCardFormDialog({
  linkableAccounts,
  existing,
}: {
  linkableAccounts: AccountOption[];
  existing?: ExistingCard;
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
          accountId: existing.accountId,
          creditLimit: toMajorUnits(
            existing.creditLimit,
            linkableAccounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          statementDay: existing.statementDay,
          paymentDueDay: existing.paymentDueDay,
          interestRate: existing.interestRate,
          monthlyInterestEstimate:existing.monthlyInterestEstimate??3,
        }
      : {
          accountId: linkableAccounts[0]?.id ?? "",
          creditLimit: 0,
          statementDay: 1,
          paymentDueDay: 1,
          interestRate: 0,
          monthlyInterestEstimate:3,
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("creditLimit", String(values.creditLimit));
    formData.set("statementDay", String(values.statementDay));
    formData.set("paymentDueDay", String(values.paymentDueDay));
    formData.set("interestRate", String(values.interestRate));
    formData.set("monthlyInterestEstimate",String(values.monthlyInterestEstimate));

    const result = existing
      ? await updateCreditCardAction(existing.id, formData)
      : await createCreditCardAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Card updated" : "Card added");
    setOpen(false);
    router.refresh();
  }

  const noLinkableAccounts = !existing && linkableAccounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={noLinkableAccounts} />}>
        {existing ? "Edit" : "Add credit card"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit credit card" : "Add credit card"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Account</Label>
            <select
              id="accountId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              disabled={!!existing}
              {...register("accountId")}
            >
              {linkableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creditLimit">Credit limit</Label>
            <Input
              id="creditLimit"
              type="number"
              step="0.01"
              {...register("creditLimit", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statementDay">Statement day (1-31)</Label>
            <Input
              id="statementDay"
              type="number"
              min="1"
              max="31"
              {...register("statementDay", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentDueDay">Payment due day (1-31)</Label>
            <Input
              id="paymentDueDay"
              type="number"
              min="1"
              max="31"
              {...register("paymentDueDay", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interestRate">Interest rate (annual %)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              {...register("interestRate", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5"><Label htmlFor="monthlyInterestEstimate">Monthly interest estimate (%)</Label><Input id="monthlyInterestEstimate" type="number" min="0" max="100" step="0.01" {...register("monthlyInterestEstimate",{valueAsNumber:true})}/><p className="text-xs text-muted-foreground">Planning only. Actual interest must be recorded after the bank confirms it.</p></div>
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
