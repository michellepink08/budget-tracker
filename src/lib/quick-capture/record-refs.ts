import type { PrismaClient } from "@prisma/client";
import { listTransactions, type TransactionFilters } from "@/lib/transactions";

export type RecordRefResult =
  | { status: "resolved"; id: string }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "unresolved" };

// Resolves phrases like "the last transportation transaction" (a
// category-narrowed reference) or "the water transaction I just added"
// (a description-keyword reference) to one specific Transaction row,
// scoped to the user via the existing (already userId-scoped)
// listTransactions. "Last"/"most recent" only ever means "most recent
// among whatever narrowed the search" — never a bare guess. If the
// reference has no narrowing filter at all (categoryId/search/accountId
// all absent) and more than one candidate exists, this reports ambiguous
// rather than silently picking the single most recent transaction of
// any kind — per the design spec's explicit rule against that.
export async function resolveRecentTransactionRef(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
): Promise<RecordRefResult> {
  const candidates = await listTransactions(prisma, userId, filters);

  if (candidates.length === 0) return { status: "unresolved" };

  const hasNarrowingFilter = Boolean(filters.categoryId || filters.search || filters.accountId);
  if (!hasNarrowingFilter && candidates.length > 1) {
    return { status: "ambiguous", candidateIds: candidates.map((c: { id: string }) => c.id) };
  }

  // listTransactions orders by date desc — the first row is the most
  // recent match.
  return { status: "resolved", id: (candidates[0] as { id: string }).id };
}
