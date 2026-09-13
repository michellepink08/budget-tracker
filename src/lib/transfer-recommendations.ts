import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

export type FundingRecommendation = {
  fromAccountId: string;
  toAccountId: string;
  amount: number; // minor units, non-negative
};

const LIQUID_PURPOSES = ["DISPOSABLE", "SAVINGS"];

// A pure computation — no schema, nothing persisted. Surfaced as a
// suggestion on the Bills page; the user still creates the actual
// transfer manually via the existing transfer flow if they act on it.
export async function getRecommendedFundingTransfer(
  prisma: Pick<PrismaClient, "account" | "transaction" | "payable">,
  userId: string,
  asOf: Date,
  options: { lookAheadDays?: number } = {},
): Promise<FundingRecommendation | null> {
  const lookAheadDays = options.lookAheadDays ?? 7;

  const fundingAccount = await prisma.account.findFirst({
    where: { userId, isPrimaryFundingAccount: true, archivedAt: null },
  });
  if (!fundingAccount) return null;

  const horizon = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + lookAheadDays);

  const upcomingPayables = await prisma.payable.findMany({
    where: {
      userId,
      status: "PENDING",
      accountId: fundingAccount.id,
      dueDate: { lte: horizon },
    },
  });
  const upcomingTotal = upcomingPayables.reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0,
  );

  const fundingBalance = await computeAccountBalance(prisma, fundingAccount.id);
  const shortfall = upcomingTotal - fundingBalance;
  if (shortfall <= 0) return null;

  const otherAccounts = await prisma.account.findMany({
    where: {
      userId,
      id: { not: fundingAccount.id },
      archivedAt: null,
      purpose: { in: LIQUID_PURPOSES },
    },
  });

  // Filtered again here (not just in the query's `where`) so this stays
  // correct even against a test double that doesn't implement Prisma's
  // filtering semantics — the DB-level filter above is the fast path.
  const eligibleAccounts = otherAccounts.filter(
    (account: { purpose: string }) => LIQUID_PURPOSES.includes(account.purpose),
  );

  const balances = await Promise.all(
    eligibleAccounts.map(async (account: { id: string }) => ({
      accountId: account.id,
      balance: await computeAccountBalance(prisma, account.id),
    })),
  );

  const bestSource = balances
    .filter((entry) => entry.balance > 0)
    .sort((a, b) => b.balance - a.balance)[0];

  if (!bestSource) return null;

  return {
    fromAccountId: bestSource.accountId,
    toAccountId: fundingAccount.id,
    amount: Math.min(shortfall, bestSource.balance),
  };
}
