import Link from "next/link";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { APP_NAME } from "@/lib/config";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bills", label: "Bills" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];

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
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5" />
          {APP_NAME}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
