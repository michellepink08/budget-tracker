import { Button } from "@/components/ui/button";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

export function ExportSettings({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <form
      method="get"
      action="/api/export/transactions"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-format" className="text-sm">
            Format
          </label>
          <select
            id="export-format"
            name="format"
            defaultValue="csv"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-type" className="text-sm">
            Type
          </label>
          <select
            id="export-type"
            name="type"
            defaultValue=""
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All types</option>
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
            <option value="TRANSFER">Transfer</option>
            <option value="REFUND">Refund</option>
            <option value="CREDIT_CARD_PAYMENT">Credit card payment</option>
            <option value="LOAN_PAYMENT">Loan payment</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-account" className="text-sm">
            Account
          </label>
          <select
            id="export-account"
            name="accountId"
            defaultValue=""
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-category" className="text-sm">
            Category
          </label>
          <select
            id="export-category"
            name="categoryId"
            defaultValue=""
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-date-from" className="text-sm">
            From
          </label>
          <input
            id="export-date-from"
            type="date"
            name="dateFrom"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-date-to" className="text-sm">
            To
          </label>
          <input
            id="export-date-to"
            type="date"
            name="dateTo"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
      </div>

      <Button type="submit" className="self-start">
        Export
      </Button>
    </form>
  );
}
