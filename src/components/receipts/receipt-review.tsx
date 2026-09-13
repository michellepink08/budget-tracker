"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addLineAction, confirmReceiptAction, updateReceiptTotalsAction } from "@/actions/receipt.actions";
import { computeReconciliation } from "@/lib/receipts/reconciliation";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ReceiptLineRow } from "@/components/receipts/receipt-line-row";

type Line = {
  id: string;
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  excluded: boolean;
};

type Receipt = {
  id: string;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  fees: number | null;
  grandTotal: number | null;
  unitemizedDifference: number | null;
};

export function ReceiptReview({
  receipt,
  lines,
  currency,
  catalogItems,
  accounts,
  categories,
}: {
  receipt: Receipt;
  lines: Line[];
  currency: string;
  catalogItems: { id: string; canonicalName: string }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [subtotal, setSubtotal] = useState(receipt.subtotal === null ? "" : String(toMajorUnits(receipt.subtotal, currency)));
  const [discount, setDiscount] = useState(String(toMajorUnits(receipt.discount ?? 0, currency)));
  const [tax, setTax] = useState(String(toMajorUnits(receipt.tax ?? 0, currency)));
  const [fees, setFees] = useState(String(toMajorUnits(receipt.fees ?? 0, currency)));
  const [grandTotal, setGrandTotal] = useState(
    receipt.grandTotal === null ? "" : String(toMajorUnits(receipt.grandTotal, currency)),
  );
  const [unitemizedDifference, setUnitemizedDifference] = useState(
    String(toMajorUnits(receipt.unitemizedDifference ?? 0, currency)),
  );
  const [newLineName, setNewLineName] = useState("");
  const [newLineTotal, setNewLineTotal] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [isSavingTotals, setIsSavingTotals] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const { reconciled, difference } = computeReconciliation({
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    fees: receipt.fees,
    grandTotal: receipt.grandTotal,
    unitemizedDifference: receipt.unitemizedDifference ?? 0,
    lines: lines.map((l) => ({ lineTotal: l.lineTotal, excluded: l.excluded })),
  });

  async function handleSaveTotals() {
    setIsSavingTotals(true);
    const formData = new FormData();
    formData.set("subtotal", subtotal);
    formData.set("discount", discount);
    formData.set("tax", tax);
    formData.set("fees", fees);
    formData.set("grandTotal", grandTotal);
    formData.set("unitemizedDifference", unitemizedDifference);
    const result = await updateReceiptTotalsAction(receipt.id, currency, formData);
    setIsSavingTotals(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Totals saved");
    router.refresh();
  }

  async function handleSetUnitemizedToCloseGap() {
    const currentDiff = toMajorUnits(receipt.unitemizedDifference ?? 0, currency);
    const newDiff = currentDiff + toMajorUnits(difference, currency);
    setUnitemizedDifference(String(newDiff));
    const formData = new FormData();
    formData.set("subtotal", subtotal);
    formData.set("discount", discount);
    formData.set("tax", tax);
    formData.set("fees", fees);
    formData.set("grandTotal", grandTotal);
    formData.set("unitemizedDifference", String(newDiff));
    const result = await updateReceiptTotalsAction(receipt.id, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Unitemized difference set — reconciled");
    router.refresh();
  }

  async function handleAddLine() {
    if (!newLineName || !newLineTotal) {
      toast.error("Name and line total are required");
      return;
    }
    const formData = new FormData();
    formData.set("catalogItemId", "");
    formData.set("name", newLineName);
    formData.set("quantity", "1");
    formData.set("unitPrice", newLineTotal);
    formData.set("lineTotal", newLineTotal);
    formData.set("categoryId", "");
    formData.set("excluded", "false");
    const result = await addLineAction(receipt.id, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewLineName("");
    setNewLineTotal("");
    toast.success("Line added");
    router.refresh();
  }

  async function handleConfirm() {
    setIsConfirming(true);
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("categoryId", categoryId);
    formData.set("date", new Date().toISOString().slice(0, 10));
    const result = await confirmReceiptAction(receipt.id, formData);
    setIsConfirming(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Receipt confirmed — transaction created");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Lines</h3>
        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <ReceiptLineRow key={line.id} line={line} currency={currency} catalogItems={catalogItems} />
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-2 p-3">
        <p className="text-sm font-medium">Add a line</p>
        <div className="flex gap-2">
          <Input placeholder="Name" value={newLineName} onChange={(e) => setNewLineName(e.target.value)} />
          <Input
            type="number"
            step="0.01"
            placeholder="Line total"
            value={newLineTotal}
            onChange={(e) => setNewLineTotal(e.target.value)}
          />
          <Button onClick={handleAddLine}>Add</Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium text-muted-foreground">Totals</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="subtotal">Subtotal</Label>
            <Input id="subtotal" type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="discount">Discount</Label>
            <Input id="discount" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="tax">Tax</Label>
            <Input id="tax" type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fees">Fees</Label>
            <Input id="fees" type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="grandTotal">Grand total</Label>
            <Input id="grandTotal" type="number" step="0.01" value={grandTotal} onChange={(e) => setGrandTotal(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="unitemizedDifference">Unitemized difference</Label>
            <Input
              id="unitemizedDifference"
              type="number"
              step="0.01"
              value={unitemizedDifference}
              onChange={(e) => setUnitemizedDifference(e.target.value)}
            />
          </div>
        </div>
        <Button variant="outline" onClick={handleSaveTotals} disabled={isSavingTotals}>
          {isSavingTotals ? "Saving..." : "Save totals"}
        </Button>

        <div className={`rounded-md p-2 text-sm ${reconciled ? "bg-success-background text-success" : "bg-[color-mix(in_oklch,var(--danger),transparent_85%)] text-danger"}`}>
          {reconciled
            ? "🟢 Reconciled"
            : `🔴 Off by ${formatMoney(Math.abs(difference), currency)}`}
          {!reconciled && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={handleSetUnitemizedToCloseGap}>
              Set unitemized difference to close the gap
            </Button>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium text-muted-foreground">Confirm</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountId">Account</Label>
          <select
            id="accountId"
            className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoryId">Category (optional)</Label>
          <select
            id="categoryId"
            className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleConfirm} disabled={!reconciled || isConfirming || !accountId}>
          {isConfirming ? "Confirming..." : "Confirm receipt"}
        </Button>
        {!reconciled && (
          <p className="text-xs text-muted-foreground">Confirm is disabled until the receipt reconciles.</p>
        )}
      </Card>
    </div>
  );
}
