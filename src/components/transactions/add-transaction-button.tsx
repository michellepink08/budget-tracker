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
  collapsed = false,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  variant?: "header" | "tab";
  // When true, renders icon-only with a tooltip — used in the sidebar
  // footer when the sidebar itself is collapsed to icon-only width, so
  // the button never overflows the narrow rail (see the same fix on
  // SignOutButton, plan-38 §8).
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "tab" ? (
            <Button size="icon" className="rounded-full" aria-label="Add transaction" />
          ) : collapsed ? (
            <Button size="icon" variant="ghost" aria-label="Add transaction" title="Add transaction" className="mx-auto" />
          ) : (
            <Button size="sm" className="gap-1" />
          )
        }
      >
        <Plus className="h-4 w-4" />
        {variant === "header" && !collapsed && "Add"}
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
