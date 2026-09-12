import { DueList } from "@/components/recurring/due-list";
import { RuleFormDialog } from "@/components/recurring/rule-form-dialog";
import { RuleList } from "@/components/recurring/rule-list";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string };

type DueRule = {
  id: string;
  name: string;
  amount: number;
  nextDate: Date;
  account: { name: string; currency: string };
};

type RuleRow = {
  id: string;
  name: string;
  transactionType: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDate: Date;
  accountId: string;
  categoryId: string | null;
  active: boolean;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function RecurringSettings({
  dueRules,
  allRules,
  accounts,
  categories,
}: {
  dueRules: DueRule[];
  allRules: RuleRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <RuleFormDialog accounts={accounts} categories={categories} />
      </div>
      <DueList rules={dueRules} />
      <RuleList rules={allRules} accounts={accounts} categories={categories} />
    </div>
  );
}
