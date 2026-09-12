"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markPayablePaidAction } from "@/actions/payable.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DuePayable = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  account: { name: string; currency: string };
};

export function DuePayablesBanner({ payables }: { payables: DuePayable[] }) {
  const router = useRouter();

  if (payables.length === 0) {
    return null;
  }

  async function handleMarkPaid(payableId: string, formData: FormData) {
    const result = await markPayablePaidAction(payableId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked paid");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">Due this week</h2>
      {payables.map((payable) => (
        <form
          key={payable.id}
          action={(formData) => handleMarkPaid(payable.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">{payable.name}</p>
            <p className="text-sm text-muted-foreground">
              {payable.account.name} · due {payable.dueDate.toLocaleDateString()}
            </p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(payable.amount, payable.account.currency)}
            className="w-28"
          />
          <Input
            name="date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-40"
          />
          <Button type="submit" size="sm">
            Mark paid
          </Button>
        </form>
      ))}
    </div>
  );
}
