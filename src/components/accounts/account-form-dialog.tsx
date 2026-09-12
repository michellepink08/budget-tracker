"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { accountSchema } from "@/lib/validations/account";
import { createAccountAction, updateAccountAction } from "@/actions/account.actions";
import { ACCOUNT_TYPES } from "@/lib/constants/financial";
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
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
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
          includeInLiquidFunds: existing.includeInLiquidFunds,
          isPrimaryFundingAccount: existing.isPrimaryFundingAccount,
          color: existing.color,
          icon: existing.icon,
        }
      : {
          name: "",
          accountType: "CHECKING",
          openingBalance: 0,
          currency: "PHP",
          includeInLiquidFunds: true,
          isPrimaryFundingAccount: false,
          color: "blue",
          icon: "landmark",
        },
  });

  const accountType = watch("accountType");

  async function onSubmit(values: AccountFormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accountType", values.accountType);
    formData.set("openingBalance", String(values.openingBalance));
    formData.set("currency", values.currency);
    formData.set("includeInLiquidFunds", String(values.includeInLiquidFunds));
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
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("currency")}
            >
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!watch("includeInLiquidFunds")}
              onChange={(e) => setValue("includeInLiquidFunds", !e.target.checked)}
            />
            Restricted fund (excluded from liquid funds and safe-to-spend)
          </label>

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
