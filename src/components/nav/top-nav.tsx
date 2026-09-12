"use client";

import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TopNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <header className="border-b bg-[var(--nav-background)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--nav-foreground)]">
          <Wallet className="h-5 w-5" />
          {APP_NAME}
        </div>
        <div className="flex items-center gap-2">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
