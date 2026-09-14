"use server";

import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";
import { DEMO_EMAIL } from "@/lib/config";
import { signupSchema } from "@/lib/validations/auth";
import { createUser, type SignupResult } from "@/lib/signup";
import { seedDemoData } from "@/lib/demo-seed";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

const DEMO_PASSWORD = "demopassword123"; // the seeded demo account's own password, published throughout this project
const DEMO_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function viewDemoAction(): Promise<void> {
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (demoUser) {
    const staleOrNeverReset =
      !demoUser.demoResetAt || Date.now() - demoUser.demoResetAt.getTime() > DEMO_RESET_INTERVAL_MS;
    if (staleOrNeverReset) {
      await seedDemoData(prisma, demoUser.id, demoUser.cycleStartDay);
      await prisma.user.update({ where: { id: demoUser.id }, data: { demoResetAt: new Date() } });
    }
  }

  await signIn("credentials", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: "/dashboard",
  });
}

export async function signupAction(formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and a password of at least 8 characters" };
  }

  return createUser(prisma, parsed.data.email, parsed.data.password);
}
