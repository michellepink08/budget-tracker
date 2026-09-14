"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createInstallmentPurchaseAction } from "@/actions/installment-purchase.actions";
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
  totalAmount: number;
  numberOfTerms: number;
  accountId: string;
  categoryId: string;
  startDate: string;
};

export function InstallmentPurchaseFormDialog({
  creditCardAccounts,
  categories,
}: {
  creditCardAccounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      totalAmount: 0,
      numberOfTerms: 6,
      accountId: creditCardAccounts[0]?.id ?? "",
      categoryId: "",
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("totalAmount", String(values.totalAmount));
    formData.set("numberOfTerms", String(values.numberOfTerms));
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);
    formData.set("startDate", values.startDate);

    const result = await createInstallmentPurchaseAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Installment purchase added");
    setOpen(false);
    router.refresh();
  }

  const noCreditCardAccounts = creditCardAccounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={noCreditCardAccounts} />}>
        Add installment purchase
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add installment purchase</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalAmount">Total amount</Label>
            <Input
              id="totalAmount"
              type="number"
              step="0.01"
              {...register("totalAmount", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="numberOfTerms">Number of terms (months)</Label>
            <Input
              id="numberOfTerms"
              type="number"
              min="2"
              max="60"
              {...register("numberOfTerms", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Credit card</Label>
            <select
              id="accountId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("accountId")}
            >
              {creditCardAccounts.map((a) => (
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">First term due date</Label>
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
