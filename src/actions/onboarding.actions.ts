"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboarding } from "@/lib/onboarding";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You must be logged in" };
  }

  const parsed = onboardingSchema.safeParse({
    cycleStartDay: formData.get("cycleStartDay"),
    currency: formData.get("currency"),
    accentColor: formData.get("accentColor"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid cycle start day (1-31), currency, and accent color" };
  }

  await completeOnboarding(prisma, session.user.id, parsed.data);

  return { ok: true };
}
