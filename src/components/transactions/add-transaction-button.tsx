"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function AddTransactionButton({
  accounts,
  categories,
  variant = "header",
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  variant?: "header" | "tab";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "tab" ? (
            <Button size="icon" className="rounded-full" aria-label="Add transaction" />
          ) : (
            <Button size="sm" className="gap-1" />
          )
        }
      >
        <Plus className="h-4 w-4" />
        {variant === "header" && "Add"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <TransactionForm accounts={accounts} categories={categories} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
