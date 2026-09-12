import type { PrismaClient } from "@prisma/client";
import { buildTransactionWhereClause, type TransactionFilters } from "@/lib/transactions";
import { toMajorUnits } from "@/lib/money";

// Formats using the Date object's local calendar fields, not toISOString()
// (which converts to UTC first) — a Transaction's `date` is constructed
// elsewhere in this app as a local calendar date, and converting through
// UTC can shift it to the wrong day depending on the server's timezone.
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type TransactionExportRow = {
  date: string;
  type: string;
  amountMajorUnits: number;
  currency: string;
  account: string;
  destinationAccount: string | null;
  category: string | null;
  description: string;
  notes: string | null;
};

export async function buildTransactionExportRows(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
): Promise<TransactionExportRow[]> {
  const transactions = await prisma.transaction.findMany({
    where: buildTransactionWhereClause(userId, filters),
    orderBy: { date: "desc" },
    include: { account: true, destinationAccount: true, category: true },
  });

  return (
    transactions as unknown as {
      date: Date;
      type: string;
      amount: number;
      description: string;
      notes: string | null;
      account: { name: string; currency: string };
      destinationAccount: { name: string } | null;
      category: { name: string } | null;
    }[]
  ).map((t) => ({
    date: formatDateLocal(t.date),
    type: t.type,
    amountMajorUnits: toMajorUnits(t.amount, t.account.currency),
    currency: t.account.currency,
    account: t.account.name,
    destinationAccount: t.destinationAccount?.name ?? null,
    category: t.category?.name ?? null,
    description: t.description,
    notes: t.notes,
  }));
}
