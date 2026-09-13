import { formatMoney } from "@/lib/money";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";
import { toggleRecurringPayableActiveAction } from "@/actions/recurring-payable.actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type RuleRow = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDueDate: Date;
  accountId: string;
  categoryId: string | null;
  active: boolean;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function RecurringPayableList({
  rules,
  accounts,
  categories,
}: {
  rules: RuleRow[];
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  if (rules.length === 0) {
    return <p className="text-muted-foreground">No recurring bills yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule) => (
        <Card key={rule.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{rule.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(rule.amount, rule.account.currency)} · {rule.frequency}
              {rule.intervalDays ? ` (every ${rule.intervalDays}d)` : ""} · {rule.account.name}
              {rule.category ? ` · ${rule.category.name}` : ""} · next{" "}
              {rule.nextDueDate.toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <RecurringPayableFormDialog accounts={accounts} categories={categories} existing={rule} />
            <form
              action={async () => {
                "use server";
                await toggleRecurringPayableActiveAction(rule.id, !rule.active);
              }}
            >
              <Button type="submit" variant="ghost">
                {rule.active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}
