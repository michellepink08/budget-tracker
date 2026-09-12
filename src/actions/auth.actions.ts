"use server";

import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";
import { DEMO_EMAIL } from "@/lib/config";
import { signupSchema } from "@/lib/validations/auth";
import { createUser, type SignupResult } from "@/lib/signup";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

const DEMO_PASSWORD = "demopassword123"; // the seeded demo account's own password, published throughout this project

export async function viewDemoAction(): Promise<void> {
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
