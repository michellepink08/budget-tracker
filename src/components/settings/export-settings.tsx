"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const EXPORT_KIND_OPTIONS = [
  { value: "transactions", label: "Transactions" },
  { value: "year-plan", label: "Year Plan" },
  { value: "year-plan-phases", label: "Year Plan Phases" },
  { value: "income-forecasts", label: "Income Forecasts" },
  { value: "shopping-catalog", label: "Shopping Catalog" },
  { value: "shopping-lists", label: "Shopping Lists" },
  { value: "price-history", label: "Shopping Price History" },
  { value: "receipts", label: "Receipts" },
  { value: "custom-reminders", label: "Custom Reminders" },
];

export function ExportSettings({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [kind, setKind] = useState("transactions");
  const isTransactions = kind === "transactions";

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action={isTransactions ? "/api/export/transactions" : `/api/export/${kind}`}
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_8px_rgba(114,29,66,0.07),0_1px_2px_rgba(41,29,37,0.05)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-kind" className="text-sm">
              What to export
            </label>
            <select
              id="export-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            >
              {EXPORT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-format" className="text-sm">
              Format
            </label>
            <select
              id="export-format"
              name="format"
              defaultValue="csv"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="json">JSON</option>
            </select>
          </div>

          {isTransactions && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-type" className="text-sm">
                  Type
                </label>
                <select
                  id="export-type"
                  name="type"
                  defaultValue=""
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
              </div>
            </>
          )}
        </div>

        <Button type="submit" className="self-start">
          Export
        </Button>
      </form>

      {/* A plain <a>, not next/link's <Link> — this points at a file-download
          API route, not a page, so client-side routing doesn't apply. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/export/backup"
        className="self-start text-sm text-muted-foreground underline"
      >
        Download a full backup (JSON, every model, relationships preserved)
      </a>
    </div>
  );
}
