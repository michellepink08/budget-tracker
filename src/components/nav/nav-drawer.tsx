"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { navLinks, isNavLinkActive } from "@/components/nav/nav-links";
import { APP_NAME } from "@/lib/config";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function NavDrawer({
  open,
  onOpenChange,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Main navigation"
        className="inset-y-0 left-0 top-0 h-full max-h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-[85vw]"
      >
        <DialogTitle className="sr-only">{APP_NAME} navigation</DialogTitle>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = isNavLinkActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => onOpenChange(false)}
                className={
                  (isActive ? "bg-muted font-medium" : "hover:bg-muted") +
                  " flex items-center gap-3 rounded-md px-3 py-2 text-sm"
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-2 flex flex-col gap-2 border-t pt-3">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </DialogContent>
    </Dialog>
  );
}
