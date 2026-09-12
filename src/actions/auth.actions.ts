"use server";

import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { signupSchema } from "@/lib/validations/auth";
import { createUser, type SignupResult } from "@/lib/signup";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
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
