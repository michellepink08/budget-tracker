"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createLendingAction, updateLendingAction } from "@/actions/lending.actions";
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
  kind: "CASH" | "ITEM";
  borrowerName: string;
  amount: number;
  accountId: string;
  itemDescription: string;
  itemValue: number;
  date: string;
};

type ExistingLending = {
  id: string;
  borrowerName: string;
  kind: string;
  amount: number | null;
  accountId: string | null;
  itemDescription: string | null;
  itemValue: number | null;
  date: Date;
};

export function LendingFormDialog({
  accounts,
  existing,
}: {
  accounts: AccountOption[];
  existing?: ExistingLending;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"CASH" | "ITEM">((existing?.kind as "CASH" | "ITEM") ?? "CASH");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          kind: existing.kind as "CASH" | "ITEM",
          borrowerName: existing.borrowerName,
          amount: existing.amount ? toMajorUnits(existing.amount, "PHP") : 0,
          accountId: existing.accountId ?? accounts[0]?.id ?? "",
          itemDescription: existing.itemDescription ?? "",
          itemValue: existing.itemValue ? toMajorUnits(existing.itemValue, "PHP") : 0,
          date: existing.date.toISOString().slice(0, 10),
        }
      : {
          kind: "CASH",
          borrowerName: "",
          amount: 0,
          accountId: accounts[0]?.id ?? "",
          itemDescription: "",
          itemValue: 0,
          date: new Date().toISOString().slice(0, 10),
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("borrowerName", values.borrowerName);
    formData.set("date", values.date);
    if (kind === "CASH") {
      formData.set("amount", String(values.amount));
      formData.set("accountId", values.accountId);
    } else {
      formData.set("itemDescription", values.itemDescription);
      formData.set("itemValue", String(values.itemValue));
    }

    const result = existing
      ? await updateLendingAction(existing.id, formData)
      : await createLendingAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Lending updated" : "Lending added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add lending"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit lending" : "Add lending"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setKind("CASH")}
                className={`rounded-md border px-3 py-1 ${kind === "CASH" ? "bg-secondary" : "hover:bg-muted"}`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setKind("ITEM")}
                className={`rounded-md border px-3 py-1 ${kind === "ITEM" ? "bg-secondary" : "hover:bg-muted"}`}
              >
                Item
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrowerName">Borrower</Label>
            <Input id="borrowerName" placeholder="e.g. Bob" {...register("borrowerName")} />
          </div>

          {kind === "CASH" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountId">From account</Label>
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
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemDescription">Item</Label>
                <Input id="itemDescription" placeholder="e.g. Blender" {...register("itemDescription")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemValue">Estimated value (optional)</Label>
                <Input
                  id="itemValue"
                  type="number"
                  step="0.01"
                  {...register("itemValue", { valueAsNumber: true })}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
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
