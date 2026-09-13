"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  confirmRecurringPayableOccurrenceAction,
  skipRecurringPayableOccurrenceAction,
} from "@/actions/recurring-payable.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type DueRule = {
  id: string;
  name: string;
  amount: number;
  nextDueDate: Date;
  account: { name: string; currency: string };
};

export function RecurringPayableDueList({ rules }: { rules: DueRule[] }) {
  const router = useRouter();

  if (rules.length === 0) {
    return null;
  }

  async function handleConfirm(ruleId: string, formData: FormData) {
    const result = await confirmRecurringPayableOccurrenceAction(ruleId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Bill added");
    router.refresh();
  }

  async function handleSkip(ruleId: string) {
    const result = await skipRecurringPayableOccurrenceAction(ruleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Skipped");
    router.refresh();
  }

  return (
    <Card variant="warning" className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium">Recurring bills due</h2>
      {rules.map((rule) => (
        <form
          key={rule.id}
          action={(formData) => handleConfirm(rule.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-card p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">{rule.name}</p>
            <p className="text-sm text-muted-foreground">
              {rule.account.name} · due {rule.nextDueDate.toLocaleDateString()}
            </p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(rule.amount, rule.account.currency)}
            className="w-28"
          />
          <Input
            name="dueDate"
            type="date"
            defaultValue={rule.nextDueDate.toISOString().slice(0, 10)}
            className="w-40"
          />
          <Button type="submit" size="sm">
            Confirm
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleSkip(rule.id)}>
            Skip
          </Button>
        </form>
      ))}
    </Card>
  );
}
