import type { PrismaClient } from "@prisma/client";

export type AccountInput = {
  name: string;
  accountType: string;
  openingBalance: number; // minor units
  currency: string;
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

export type AccountMutationResult = { ok: true } | { ok: false; error: string };

export async function createAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  input: AccountInput,
) {
  return prisma.account.create({ data: { userId, ...input } });
}

export async function updateAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
): Promise<AccountMutationResult> {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function archiveAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
): Promise<AccountMutationResult> {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function listAccounts(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.account.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}
