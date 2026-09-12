"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createPayableAction, updatePayableAction } from "@/actions/payable.actions";
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
  dueDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingPayable = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function PayableFormDialog({
  accounts,
  categories,
  existing,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  existing?: ExistingPayable;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          dueDate: existing.dueDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          amount: 0,
          dueDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("amount", String(values.amount));
    formData.set("dueDate", values.dueDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updatePayableAction(existing.id, formData)
      : await createPayableAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Bill updated" : "Bill added");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add bill"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit bill" : "Add bill"}</DialogTitle>
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
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
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
