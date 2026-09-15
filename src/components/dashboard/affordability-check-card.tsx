"use client";

import { useState } from "react";
import { checkAffordability } from "@/lib/affordability";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AffordabilityCheckCard({ safeToSpend, currency }: { safeToSpend: number; currency: string }) {
  const [amountText, setAmountText] = useState("");

  const amount = Number(amountText);
  const hasValidAmount = amountText.trim() !== "" && !Number.isNaN(amount) && amount > 0;
  const result = hasValidAmount ? checkAffordability(toMinorUnits(amount, currency), safeToSpend) : null;

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm text-muted-foreground">Can I afford this?</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="affordability-amount">Amount</Label>
        <Input
          id="affordability-amount"
          type="number"
          step="0.01"
          min="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.00"
        />
      </div>
      {result && (
        <p className={`mt-3 text-sm font-medium ${result.canAfford ? "text-success" : "text-destructive"}`}>
          {result.canAfford
            ? `Yes — ${formatMoney(result.remainingAfter, currency)} will still be safe to spend after this.`
            : `No — this would put you ${formatMoney(-result.remainingAfter, currency)} over your safe-to-spend.`}
        </p>
      )}
    </Card>
  );
}
