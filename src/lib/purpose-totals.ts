import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

async function sumBalancesForPurpose(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
  purpose: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: { userId, archivedAt: null, purpose },
  });
  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );
  return balances.reduce((sum, balance) => sum + balance, 0);
}

export async function computeDisposableTotal(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  return sumBalancesForPurpose(prisma, userId, "DISPOSABLE");
}

export async function computeSavingsTotal(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  return sumBalancesForPurpose(prisma, userId, "SAVINGS");
}

// "Confirmed reserves" per the design doc: a SavingsGoal amount only counts
// here when its account is DISPOSABLE-purpose — a SAVINGS-purpose goal's
// balance was never in disposableTotal to begin with, so counting it again
// here would double-subtract it. The UI never offers assigning a goal to a
// DISPOSABLE account today, so this is normally 0 — that's intentional, not
// a bug (see docs/superpowers/specs/2026-09-13-major-features-design.md section C).
export async function computeConfirmedReserves(
  prisma: Pick<PrismaClient, "savingsGoal">,
  userId: string,
): Promise<number> {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId },
    include: { account: true },
  });
  return goals
    .filter((g: { account: { purpose: string } }) => g.account.purpose === "DISPOSABLE")
    .reduce((sum: number, g: { assignedAmount: number }) => sum + g.assignedAmount, 0);
}
