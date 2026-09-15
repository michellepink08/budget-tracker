import type { PrismaClient } from "@prisma/client";
import type { AccountPurpose } from "@/lib/constants/financial";

export type LedgerRow = {
  id: string;
  date: Date;
  createdAt: Date;
  accountId: string;
  accountName: string;
  description: string;
  categoryName: string | null;
  amount: number; // minor units, signed
  balance: number; // minor units — that account's running balance as of this row
};

export type LedgerRange = { start: Date; end: Date };

type LedgerPrisma = Pick<PrismaClient, "account" | "transaction">;

// One purpose group's worth of transactions across every account with that
// purpose, newest first, each row carrying its own account's balance as of
// that date. Balance is walked forward chronologically per account
// (starting from openingBalance, folding in every transaction on that
// account in date order — including ones before `range.start`, so a row's
// balance is always the account's true balance at that point, not reset at
// the range boundary) and only rows falling inside `range` are returned.
export async function listLedgerRows(
  prisma: LedgerPrisma,
  userId: string,
  purpose: AccountPurpose,
  range: LedgerRange,
): Promise<LedgerRow[]> {
  const accounts = await prisma.account.findMany({ where: { userId, purpose } });

  const rowsPerAccount = await Promise.all(
    accounts.map(async (account: { id: string; name: string; openingBalance: number }) => {
      const transactions = await prisma.transaction.findMany({
        where: { accountId: account.id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: { category: true },
      });

      let balance = account.openingBalance;
      const rows: LedgerRow[] = [];
      for (const txn of transactions as {
        id: string;
        date: Date;
        createdAt: Date;
        amount: number;
        description: string;
        category: { name: string } | null;
      }[]) {
        balance += txn.amount;
        if (txn.date >= range.start && txn.date <= range.end) {
          rows.push({
            id: txn.id,
            date: txn.date,
            createdAt: txn.createdAt,
            accountId: account.id,
            accountName: account.name,
            description: txn.description,
            categoryName: txn.category?.name ?? null,
            amount: txn.amount,
            balance,
          });
        }
      }
      return rows;
    }),
  );

  // Sorted explicitly by (date, createdAt) descending — not left to rely on
  // JS's stable-sort preserving whatever order rows happened to arrive in
  // across different accounts, which isn't meaningful for same-date ties.
  return rowsPerAccount.flat().sort((a, b) => {
    const dateDiff = b.date.getTime() - a.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
