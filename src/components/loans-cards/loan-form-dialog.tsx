"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createLoanAction, updateLoanAction } from "@/actions/loan.actions";
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

type FormValues = {
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: string;
};

type ExistingLoan = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  startDate: Date;
};

const LOAN_CURRENCY = "PHP";

export function LoanFormDialog({ existing }: { existing?: ExistingLoan }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          principal: toMajorUnits(existing.principal, LOAN_CURRENCY),
          interestRate: existing.interestRate,
          monthlyPayment: toMajorUnits(existing.monthlyPayment, LOAN_CURRENCY),
          remainingBalance: toMajorUnits(existing.remainingBalance, LOAN_CURRENCY),
          startDate: existing.startDate.toISOString().slice(0, 10),
        }
      : {
          name: "",
          principal: 0,
          interestRate: 0,
          monthlyPayment: 0,
          remainingBalance: 0,
          startDate: new Date().toISOString().slice(0, 10),
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("principal", String(values.principal));
    formData.set("interestRate", String(values.interestRate));
    formData.set("monthlyPayment", String(values.monthlyPayment));
    formData.set("remainingBalance", String(values.remainingBalance));
    formData.set("startDate", values.startDate);

    const result = existing
      ? await updateLoanAction(existing.id, formData)
      : await createLoanAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Loan updated" : "Loan added");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add loan"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit loan" : "Add loan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="principal">Original principal</Label>
            <Input
              id="principal"
              type="number"
              step="0.01"
              {...register("principal", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remainingBalance">Remaining balance</Label>
            <Input
              id="remainingBalance"
              type="number"
              step="0.01"
              {...register("remainingBalance", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyPayment">Monthly payment</Label>
            <Input
              id="monthlyPayment"
              type="number"
              step="0.01"
              {...register("monthlyPayment", { valueAsNumber: true })}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
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
