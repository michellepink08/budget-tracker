import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import type { LedgerRow } from "@/lib/ledger";

export function LedgerTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: LedgerRow[];
  currency: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No transactions in this range.</p>
      ) : (
        <>
          {/* Desktop: real table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2">Account</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2">{row.date.toLocaleDateString()}</td>
                    <td className="p-2">{row.accountName}</td>
                    <td className="p-2">{row.description}</td>
                    <td className="p-2">{row.categoryName ?? "—"}</td>
                    <td className={`p-2 ${row.amount < 0 ? "text-destructive" : ""}`}>
                      {formatMoney(row.amount, currency)}
                    </td>
                    <td className="p-2">{formatMoney(row.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <Card key={row.id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{row.description}</p>
                  <span className={row.amount < 0 ? "text-destructive" : ""}>
                    {formatMoney(row.amount, currency)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.date.toLocaleDateString()} · {row.accountName}
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">Balance: {formatMoney(row.balance, currency)}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
