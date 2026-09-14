"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createRecurringPayableAction,
  updateRecurringPayableAction,
} from "@/actions/recurring-payable.actions";
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
  amount: number;
  frequency: (typeof RECURRING_FREQUENCIES)[number];
  intervalDays: number;
  nextDueDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingRule = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDueDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function RecurringPayableFormDialog({
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
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          frequency: existing.frequency as FormValues["frequency"],
          intervalDays: existing.intervalDays ?? 1,
          nextDueDate: existing.nextDueDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          amount: 0,
          frequency: "MONTHLY",
          intervalDays: 1,
          nextDueDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  const frequency = watch("frequency");

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("amount", String(values.amount));
    formData.set("frequency", values.frequency);
    if (values.frequency === "CUSTOM") formData.set("intervalDays", String(values.intervalDays));
    formData.set("nextDueDate", values.nextDueDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updateRecurringPayableAction(existing.id, formData)
      : await createRecurringPayableAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Recurring bill updated" : "Recurring bill created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add recurring bill"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit recurring bill" : "Add recurring bill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
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
            <Label htmlFor="nextDueDate">Next due date</Label>
            <Input id="nextDueDate" type="date" {...register("nextDueDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
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
