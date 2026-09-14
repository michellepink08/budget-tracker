import type { PrismaClient } from "@prisma/client";
import type { AccountPurpose } from "@/lib/constants/financial";

export type AccountInput = {
  name: string;
  accountType: string;
  openingBalance: number; // minor units
  currency: string;
  purpose: AccountPurpose;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

export type AccountMutationResult = { ok: true } | { ok: false; error: string };

const LIQUID_PURPOSES: AccountPurpose[] = ["DISPOSABLE", "SAVINGS"];

function deriveIncludeInLiquidFunds(purpose: AccountPurpose): boolean {
  return LIQUID_PURPOSES.includes(purpose);
}

export async function createAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  input: AccountInput,
) {
  return prisma.account.create({
    data: { userId, ...input, includeInLiquidFunds: deriveIncludeInLiquidFunds(input.purpose) },
  });
}

export async function updateAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
): Promise<AccountMutationResult> {
  const data: Partial<AccountInput> & { includeInLiquidFunds?: boolean } = { ...input };
  if (input.purpose !== undefined) {
    data.includeInLiquidFunds = deriveIncludeInLiquidFunds(input.purpose);
  }
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data,
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

export async function assertOwnedAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
) {
  return prisma.account.findFirst({ where: { id: accountId, userId } });
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
