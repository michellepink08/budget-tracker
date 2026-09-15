"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createLoanAction, updateLoanAction } from "@/actions/loan.actions";
import { toMajorUnits } from "@/lib/money";
import { toAnnualInterestRate, type InterestRatePeriod } from "@/lib/interest-rate";
import { computeLoanTermMonths } from "@/lib/loan-term";
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
  openingBalance: number;
  startDate: string;
  endDate: string;
  dueDay: string;
  loanCategory: string;
};

type ExistingLoan = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  openingBalance: number;
  startDate: Date;
  endDate: Date | null;
  dueDay: number | null;
  loanCategoryName: string | null;
};

const LOAN_CURRENCY = "PHP";

export function LoanFormDialog({ existing }: { existing?: ExistingLoan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [interestRatePeriod, setInterestRatePeriod] = useState<InterestRatePeriod>("ANNUAL");
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          principal: toMajorUnits(existing.principal, LOAN_CURRENCY),
          interestRate: existing.interestRate,
          monthlyPayment: toMajorUnits(existing.monthlyPayment, LOAN_CURRENCY),
          openingBalance: toMajorUnits(existing.openingBalance, LOAN_CURRENCY),
          startDate: existing.startDate.toISOString().slice(0, 10),
          endDate: existing.endDate ? existing.endDate.toISOString().slice(0, 10) : "",
          dueDay: existing.dueDay ? String(existing.dueDay) : "",
          loanCategory: existing.loanCategoryName ?? "",
        }
      : {
          name: "",
          principal: 0,
          interestRate: 0,
          monthlyPayment: 0,
          openingBalance: 0,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: "",
          dueDay: "",
          loanCategory: "",
        },
  });

  const enteredInterestRate = watch("interestRate");
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const termMonths =
    startDate && endDate ? computeLoanTermMonths(new Date(startDate), new Date(endDate)) : null;

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("principal", String(values.principal));
    formData.set("interestRate", String(toAnnualInterestRate(values.interestRate, interestRatePeriod)));
    formData.set("monthlyPayment", String(values.monthlyPayment));
    formData.set("openingBalance", String(values.openingBalance));
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);
    formData.set("dueDay", values.dueDay);
    formData.set("loanCategory", values.loanCategory);

    const result = existing
      ? await updateLoanAction(existing.id, formData)
      : await createLoanAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Loan updated" : "Loan added");
    setOpen(false);
    router.refresh();
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
            <Label htmlFor="openingBalance">
              {existing ? "Current remaining balance" : "Remaining balance"}
            </Label>
            <Input
              id="openingBalance"
              type="number"
              step="0.01"
              {...register("openingBalance", { valueAsNumber: true })}
            />
            {existing && (
              <p className="text-xs text-muted-foreground">
                Only used as a starting point — once this loan has a category, its balance updates itself
                from payments categorized to it, same as an account.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loanCategory">Category</Label>
            <Input
              id="loanCategory"
              placeholder="e.g. Shopee Pay Later"
              {...register("loanCategory")}
            />
            <p className="text-xs text-muted-foreground">
              Matches or creates a subcategory under a shared &quot;Loan&quot; category — this is what lets
              a payment automatically update this loan&apos;s balance and show up on the Budget page.
            </p>
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
            <Label htmlFor="interestRate">Interest rate</Label>
            <div className="flex gap-2">
              <Input
                id="interestRate"
                type="number"
                step="0.01"
                className="flex-1"
                {...register("interestRate", { valueAsNumber: true })}
              />
              <div className="flex shrink-0 gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setInterestRatePeriod("ANNUAL")}
                  className={`rounded-md border px-2.5 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${interestRatePeriod === "ANNUAL" ? "bg-secondary" : "hover:bg-muted"}`}
                >
                  % / year
                </button>
                <button
                  type="button"
                  onClick={() => setInterestRatePeriod("MONTHLY")}
                  className={`rounded-md border px-2.5 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${interestRatePeriod === "MONTHLY" ? "bg-secondary" : "hover:bg-muted"}`}
                >
                  % / month
                </button>
              </div>
            </div>
            {interestRatePeriod === "MONTHLY" && Number.isFinite(enteredInterestRate) && (
              <p className="text-xs text-muted-foreground">
                Saved as an annual rate — {toAnnualInterestRate(enteredInterestRate || 0, "MONTHLY")}% / year
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endDate">End date (optional)</Label>
            <Input id="endDate" type="date" {...register("endDate")} />
            {termMonths !== null && (
              <p className="text-xs text-muted-foreground">
                {termMonths > 0 ? `${termMonths}-month term` : "End date must be after the start date"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dueDay">Due day of month (optional)</Label>
            <Input
              id="dueDay"
              type="number"
              min="1"
              max="31"
              placeholder="e.g. 15"
              {...register("dueDay")}
            />
            <p className="text-xs text-muted-foreground">
              Shows this loan&apos;s payment on the Calendar every month{endDate ? ", until the end date" : ""}.
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
