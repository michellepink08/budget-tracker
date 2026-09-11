import type { PrismaClient } from "@prisma/client";

export type OnboardingInput = {
  cycleStartDay: number;
  currency: string;
  accentColor: string;
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
      accentColor: input.accentColor,
      onboardedAt: new Date(),
    },
  });
}
