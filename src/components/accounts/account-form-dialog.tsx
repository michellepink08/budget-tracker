"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { accountSchema } from "@/lib/validations/account";
import { createAccountAction, updateAccountAction } from "@/actions/account.actions";
import { ACCOUNT_TYPES, ACCOUNT_PURPOSES } from "@/lib/constants/financial";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toMajorUnits } from "@/lib/money";

type AccountFormValues = z.infer<typeof accountSchema>;

type ExistingAccount = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  purpose: string;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

const PURPOSE_LABELS: Record<string, string> = {
  DISPOSABLE: "Disposable (everyday spending)",
  SAVINGS: "Savings / Reserve",
  RESTRICTED: "Restricted (dedicated obligation)",
  CREDIT: "Credit card",
  DEBT: "Loan / Debt",
};

export function AccountFormDialog({ existing }: { existing?: ExistingAccount }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          accountType: existing.accountType as AccountFormValues["accountType"],
          openingBalance: toMajorUnits(existing.openingBalance, existing.currency),
          currency: existing.currency,
          purpose: existing.purpose as AccountFormValues["purpose"],
          isPrimaryFundingAccount: existing.isPrimaryFundingAccount,
          color: existing.color,
          icon: existing.icon,
        }
      : {
          name: "",
          accountType: "CHECKING",
          openingBalance: 0,
          currency: "PHP",
          purpose: "DISPOSABLE",
          isPrimaryFundingAccount: false,
          color: "blue",
          icon: "landmark",
        },
  });

  const accountType = watch("accountType");
  const purpose = watch("purpose");

  async function onSubmit(values: AccountFormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accountType", values.accountType);
    formData.set("openingBalance", String(values.openingBalance));
    formData.set("currency", values.currency);
    formData.set("purpose", values.purpose);
    formData.set("isPrimaryFundingAccount", String(values.isPrimaryFundingAccount));
    formData.set("color", values.color);
    formData.set("icon", values.icon);

    const result = existing
      ? await updateAccountAction(existing.id, formData)
      : await createAccountAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Account updated" : "Account created");
    setOpen(false);
    if (!existing) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add account"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountType">Type</Label>
            <Select value={accountType} onValueChange={(v) => setValue("accountType", v as AccountFormValues["accountType"])}>
              <SelectTrigger id="accountType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Opening balance</Label>
            <Input
              id="openingBalance"
              type="number"
              step="0.01"
              {...register("openingBalance", { valueAsNumber: true })}
            />
            {errors.openingBalance && (
              <p className="text-sm text-destructive">{errors.openingBalance.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("currency")}
            >
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purpose">Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setValue("purpose", v as AccountFormValues["purpose"])}>
              <SelectTrigger id="purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {purpose === "RESTRICTED"
                ? "Excluded from liquid funds and safe-to-spend — for a dedicated obligation."
                : purpose === "SAVINGS"
                  ? "Counted toward liquid funds, tracked separately as savings/reserves."
                  : purpose === "CREDIT" || purpose === "DEBT"
                    ? "Never counted as spendable funds."
                    : "Everyday spending — included in safe-to-spend."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isPrimaryFundingAccount")} />
            Primary funding account
          </label>

          <input type="hidden" {...register("color")} />
          <input type="hidden" {...register("icon")} />

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
