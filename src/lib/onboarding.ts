import type { PrismaClient } from "@prisma/client";

export type OnboardingInput = {
  cycleStartDay: number;
  currency: string;
};

export async function completeOnboarding(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  input: OnboardingInput,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      cycleStartDay: input.cycleStartDay,
      currency: input.currency,
      onboardedAt: new Date(),
    },
  });
}

export type FirstAccountInput = {
  name: string;
  accountType: string;
  openingBalance: number; // minor units
};

// Wraps both writes in one transaction so onboarding is never left
// half-done — a user with onboardedAt set but no account, or an account
// created for a user still mid-onboarding, should never happen.
export async function completeOnboardingWithAccount(
  prisma: Pick<PrismaClient, "user" | "account" | "$transaction">,
  userId: string,
  input: OnboardingInput,
  account: FirstAccountInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        cycleStartDay: input.cycleStartDay,
        currency: input.currency,
        onboardedAt: new Date(),
      },
    });
    await tx.account.create({
      data: {
        userId,
        name: account.name,
        accountType: account.accountType,
        openingBalance: account.openingBalance,
        currency: input.currency,
        purpose: "DISPOSABLE",
        isPrimaryFundingAccount: true,
        color: "blue",
        icon: "landmark",
        includeInLiquidFunds: true, // DISPOSABLE is always liquid — matches accounts.ts's deriveIncludeInLiquidFunds
      },
    });
  });
}
