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
    <form method="get" action="/api/export/transactions" className="flex flex-col gap-3 rounded-lg border p-4">
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

      <button
        type="submit"
        className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/80"
      >
        Export
      </button>
    </form>
  );
}
