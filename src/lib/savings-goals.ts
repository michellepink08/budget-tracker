import type { PrismaClient } from "@prisma/client";

export type SavingsGoalMutationResult = { ok: true } | { ok: false; error: string };

type SavingsGoalsPrisma = Pick<PrismaClient, "account" | "savingsGoal">;

export async function getSavingsGoal(prisma: SavingsGoalsPrisma, userId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return null;
  return prisma.savingsGoal.findUnique({ where: { accountId } });
}

export async function upsertSavingsGoal(
  prisma: SavingsGoalsPrisma,
  userId: string,
  accountId: string,
  input: { targetAmount: number | null; assignedAmount: number },
): Promise<SavingsGoalMutationResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return { ok: false, error: "Account not found" };

  await prisma.savingsGoal.upsert({
    where: { accountId },
    create: { userId, accountId, ...input },
    update: input,
  });
  return { ok: true };
}

export function computeSavingsProgress(
  goal: { targetAmount: number | null; assignedAmount: number },
  balance: number,
): { unassignedAmount: number; remainingTarget: number | null; progressPct: number | null } {
  const unassignedAmount = balance - goal.assignedAmount;
  if (goal.targetAmount === null) {
    return { unassignedAmount, remainingTarget: null, progressPct: null };
  }
  const remainingTarget = Math.max(0, goal.targetAmount - goal.assignedAmount);
  const progressPct = Math.min(100, Math.round((goal.assignedAmount / goal.targetAmount) * 100));
  return { unassignedAmount, remainingTarget, progressPct };
}
