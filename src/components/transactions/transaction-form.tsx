"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTransactionAction, createTransferAction } from "@/actions/transaction.actions";
import { createLoanAction } from "@/actions/loan.actions";
import { createLendingAction } from "@/actions/lending.actions";
import { humanizeEnum } from "@/lib/enum-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const REGULAR_TYPES = [
  "EXPENSE",
  "INCOME",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
] as const;

type Mode = "TRANSACTION" | "TRANSFER" | "BORROWED" | "LOANED";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TransactionForm({
  accounts,
  categories,
  onSaved,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("TRANSACTION");
  const [type, setType] = useState<(typeof REGULAR_TYPES)[number]>("EXPENSE");
  const [lendingKind, setLendingKind] = useState<"CASH" | "ITEM">("CASH");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    // Kept as its own branch (rather than folded into one shared `result`
    // union below) so `result` in the other branch stays exactly
    // TransactionActionResult — mixing in LoanActionResult (which has no
    // `warning` field at all) made TypeScript unable to narrow
    // `result.warning` cleanly.
    if (mode === "BORROWED") {
      const result = await createLoanAction(formData);
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Loan added");
      router.refresh();
      onSaved?.();
      return;
    }

    if (mode === "LOANED") {
      const result = await createLendingAction(formData);
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lending added");
      router.refresh();
      onSaved?.();
      return;
    }

    const result =
      mode === "TRANSFER" ? await createTransferAction(formData) : await createTransactionAction(formData);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === "TRANSFER" ? "Transfer recorded" : "Transaction added");
    if (mode === "TRANSACTION" && result.warning) toast.warning(result.warning);
    router.refresh();
    onSaved?.();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("TRANSACTION")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "TRANSACTION" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transaction
        </button>
        <button
          type="button"
          onClick={() => setMode("TRANSFER")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "TRANSFER" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transfer
        </button>
        <button
          type="button"
          onClick={() => setMode("BORROWED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "BORROWED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Borrowed
        </button>
        <button
          type="button"
          onClick={() => setMode("LOANED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "LOANED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Loaned
        </button>
      </div>

      {mode === "TRANSACTION" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
          >
            {REGULAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanizeEnum(t)}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "BORROWED" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="principal">Original principal</Label>
            <Input id="principal" name="principal" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Remaining balance</Label>
            <Input id="openingBalance" name="openingBalance" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyPayment">Monthly payment</Label>
            <Input id="monthlyPayment" name="monthlyPayment" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interestRate">Interest rate (% / year)</Label>
            <Input id="interestRate" name="interestRate" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loanCategory">Category</Label>
            <Input id="loanCategory" name="loanCategory" placeholder="e.g. Shopee Pay Later" />
            <p className="text-xs text-muted-foreground">
              Matches or creates a subcategory under a shared &quot;Loan&quot; category.
            </p>
          </div>
        </>
      ) : mode === "LOANED" ? (
        <>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setLendingKind("CASH")}
              className={`rounded-md border px-3 py-1 ${lendingKind === "CASH" ? "bg-secondary" : "hover:bg-muted"}`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setLendingKind("ITEM")}
              className={`rounded-md border px-3 py-1 ${lendingKind === "ITEM" ? "bg-secondary" : "hover:bg-muted"}`}
            >
              Item
            </button>
          </div>
          <input type="hidden" name="kind" value={lendingKind} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrowerName">Borrower</Label>
            <Input id="borrowerName" name="borrowerName" placeholder="e.g. Bob" required />
          </div>

          {lendingKind === "CASH" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lending-amount">Amount</Label>
                <Input id="lending-amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lending-accountId">From account</Label>
                <select
                  id="lending-accountId"
                  name="accountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  required
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
                <Input id="itemDescription" name="itemDescription" placeholder="e.g. Blender" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemValue">Estimated value (optional)</Label>
                <Input id="itemValue" name="itemValue" type="number" step="0.01" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lending-date">Date</Label>
            <Input
              id="lending-date"
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </div>

          {mode === "TRANSFER" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sourceAccountId">From account</Label>
                <select
                  id="sourceAccountId"
                  name="sourceAccountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="destinationAccountId">To account</Label>
                <select
                  id="destinationAccountId"
                  name="destinationAccountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  required
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
                <Label htmlFor="accountId">Account</Label>
                <select
                  id="accountId"
                  name="accountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryName">Category (optional)</Label>
                <Input
                  id="categoryName"
                  name="categoryName"
                  list="category-suggestions"
                  placeholder="Type any word — new ones are created automatically"
                  autoComplete="off"
                />
                <datalist id="category-suggestions">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Matches an existing category by name, or creates a new one — typing the same word again always
                  lands on the same category.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              placeholder={mode === "TRANSFER" ? "Leave blank to use \"Transfer\"" : "Leave blank to use the transaction type"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>
        </>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting
          ? "Saving..."
          : mode === "TRANSFER"
            ? "Record transfer"
            : mode === "BORROWED"
              ? "Add loan"
              : mode === "LOANED"
                ? "Add lending"
                : "Add transaction"}
      </Button>
    </form>
  );
}
