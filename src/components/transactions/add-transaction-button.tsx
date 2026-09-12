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
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1" />}>
        <Plus className="h-4 w-4" />
        Add
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
