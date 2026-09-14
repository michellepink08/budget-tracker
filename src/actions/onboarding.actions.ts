"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { firstAccountSchema, onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboarding, completeOnboardingWithAccount } from "@/lib/onboarding";
import { toMinorUnits } from "@/lib/money";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You must be logged in" };
  }

  const parsed = onboardingSchema.safeParse({
    cycleStartDay: Number(formData.get("cycleStartDay")),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid cycle start day (1-31) and currency" };
  }

  await completeOnboarding(prisma, session.user.id, parsed.data);

  return { ok: true };
}

export async function completeOnboardingWithAccountAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You must be logged in" };
  }

  const parsed = onboardingSchema.safeParse({
    cycleStartDay: Number(formData.get("cycleStartDay")),
    currency: formData.get("currency"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid cycle start day (1-31) and currency" };
  }

  const parsedAccount = firstAccountSchema.safeParse({
    name: formData.get("name"),
    accountType: formData.get("accountType"),
    openingBalance: Number(formData.get("openingBalance")),
  });
  if (!parsedAccount.success) {
    return { ok: false, error: "Please check the account details" };
  }

  await completeOnboardingWithAccount(prisma, session.user.id, parsed.data, {
    ...parsedAccount.data,
    openingBalance: toMinorUnits(parsedAccount.data.openingBalance, parsed.data.currency),
  });

  return { ok: true };
}
