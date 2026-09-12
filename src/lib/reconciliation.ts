import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";

export type ReconciliationPreview = {
  calculatedBalance: number;
  actualBalance: number;
  difference: number; // actualBalance - calculatedBalance; the signed adjustment amount
};

export async function previewReconciliation(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  accountId: string,
  actualBalance: number,
): Promise<ReconciliationPreview> {
  const calculatedBalance = await computeAccountBalance(prisma, accountId);
  return {
    calculatedBalance,
    actualBalance,
    difference: actualBalance - calculatedBalance,
  };
}

export type ReconciliationResult =
  | { ok: true; alreadyBalanced: boolean; transactionId?: string }
  | { ok: false; error: string };

// Never silently overwrites a balance (design spec's "Account-balance
// rules"): the only thing this writes, and only once the difference is
// confirmed to be non-zero, is a normal BALANCE_ADJUSTMENT transaction row
// — that row is the audit trail, so no separate reconciliation-history
// model is needed.
export async function applyReconciliation(
  prisma: Pick<PrismaClient, "account" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  accountId: string,
  actualBalance: number,
): Promise<ReconciliationResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const { difference } = await previewReconciliation(prisma, accountId, actualBalance);
  if (difference === 0) {
    return { ok: true, alreadyBalanced: true };
  }

  const date = new Date();
  const period = await resolveBudgetPeriodForDate(prisma, userId, date, cycleStartDay);

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      date,
      type: "BALANCE_ADJUSTMENT",
      amount: difference,
      accountId,
      budgetPeriodId: period.id,
      description: "Balance adjustment",
    },
  });

  return { ok: true, alreadyBalanced: false, transactionId: transaction.id };
}
