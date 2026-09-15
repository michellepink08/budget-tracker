import type { PrismaClient } from "@prisma/client";

export type RolloverPeriod = {
  id: string;
  startDate: Date;
  rolloverAcknowledgedAt: Date | null;
};

// A new user's very first cutoff has nothing to roll over — the prompt
// only ever appears once at least one earlier BudgetPeriod exists.
export async function shouldPromptRollover(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  period: RolloverPeriod,
): Promise<boolean> {
  if (period.rolloverAcknowledgedAt) return false;

  const earlierCount = await prisma.budgetPeriod.count({
    where: { userId, startDate: { lt: period.startDate } },
  });
  return earlierCount > 0;
}

export type AcknowledgeRolloverResult = { ok: true } | { ok: false; error: string };

// `amount` is a snapshot the caller computes (the disposable total at the
// moment of acknowledgment) — this function only records it. It's
// deliberately not computed in here so the historical figure never
// silently drifts if account balances change later, and so this stays
// trivial to test without mocking the whole balance-computation chain.
export async function acknowledgeRollover(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  periodId: string,
  amount: number,
): Promise<AcknowledgeRolloverResult> {
  const result = await prisma.budgetPeriod.updateMany({
    where: { id: periodId, userId },
    data: { rolloverAcknowledgedAt: new Date(), rolloverAmount: amount },
  });
  if (result.count === 0) {
    return { ok: false, error: "Budget period not found" };
  }
  return { ok: true };
}
