"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createRecurringRuleAction, updateRecurringRuleAction } from "@/actions/recurring.actions";
import { NON_TRANSFER_TYPES } from "@/lib/validations/transaction";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";
import { humanizeEnum } from "@/lib/enum-labels";
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
type CategoryOption = { id: string; name: string };

type FormValues = {
  name: string;
  transactionType: (typeof NON_TRANSFER_TYPES)[number];
  amount: number;
  frequency: (typeof RECURRING_FREQUENCIES)[number];
  intervalDays: number;
  nextDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingRule = {
  id: string;
  name: string;
  transactionType: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function RuleFormDialog({
  accounts,
  categories,
  existing,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  existing?: ExistingRule;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          transactionType: existing.transactionType as FormValues["transactionType"],
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          frequency: existing.frequency as FormValues["frequency"],
          intervalDays: existing.intervalDays ?? 1,
          nextDate: existing.nextDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          transactionType: "EXPENSE",
          amount: 0,
          frequency: "MONTHLY",
          intervalDays: 1,
          nextDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  const frequency = watch("frequency");

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("transactionType", values.transactionType);
    formData.set("amount", String(values.amount));
    formData.set("frequency", values.frequency);
    if (values.frequency === "CUSTOM") formData.set("intervalDays", String(values.intervalDays));
    formData.set("nextDate", values.nextDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updateRecurringRuleAction(existing.id, formData)
      : await createRecurringRuleAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Rule updated" : "Rule created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add recurring rule"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit recurring rule" : "Add recurring rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transactionType">Type</Label>
            <select
              id="transactionType"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("transactionType")}
            >
              {NON_TRANSFER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanizeEnum(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="frequency">Frequency</Label>
            <select
              id="frequency"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("frequency")}
            >
              {RECURRING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {humanizeEnum(f)}
                </option>
              ))}
            </select>
          </div>

          {frequency === "CUSTOM" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intervalDays">Every N days</Label>
              <Input
                id="intervalDays"
                type="number"
                min="1"
                {...register("intervalDays", { valueAsNumber: true })}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextDate">Next due date</Label>
            <Input id="nextDate" type="date" {...register("nextDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Account</Label>
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
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("categoryId")}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
