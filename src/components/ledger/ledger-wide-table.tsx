import { formatMoney } from "@/lib/money";
import type { LedgerRow } from "@/lib/ledger";

type AccountColumn = { id: string; name: string; balance: number };

// One column per account in the group (matching the original spreadsheet
// the user tracked this in by hand) instead of one shared "Account"
// column — each row's amount lands under its own account's column, with
// every other account's cell blank, and a Total column repeating that same
// amount (so a transfer between two of the group's own accounts naturally
// shows as two rows, one negative under the source account's column and
// one positive under the destination's, exactly like the outgoing/incoming
// pair already recorded).
export function LedgerWideTable({
  title,
  rows,
  accounts,
  currency,
}: {
  title: string;
  rows: LedgerRow[];
  accounts: AccountColumn[];
  currency: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No transactions in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">Date</th>
                <th className="p-2">Description</th>
                <th className="p-2">Category</th>
                {accounts.map((account) => (
                  <th key={account.id} className="p-2 text-right whitespace-nowrap">
                    <div className={account.balance < 0 ? "text-destructive" : "text-foreground"}>
                      {formatMoney(account.balance, currency)}
                    </div>
                    <div className="text-xs font-normal text-muted-foreground">{account.name}</div>
                  </th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{row.date.toLocaleDateString()}</td>
                  <td className="p-2">{row.description}</td>
                  <td className="p-2">{row.categoryName ?? "—"}</td>
                  {accounts.map((account) => (
                    <td
                      key={account.id}
                      className={`p-2 text-right ${
                        row.accountId === account.id && row.amount < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {row.accountId === account.id ? formatMoney(row.amount, currency) : "—"}
                    </td>
                  ))}
                  <td className={`p-2 text-right font-medium ${row.amount < 0 ? "text-destructive" : ""}`}>
                    {formatMoney(row.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
