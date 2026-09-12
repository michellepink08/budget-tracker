"use server";

import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/password-reset";
import { requestPasswordReset, resetPassword } from "@/lib/password-reset";
import { createMailer, sendPasswordResetEmail } from "@/lib/mailer";

export type PasswordResetActionResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<PasswordResetActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  // Only ever proceed to look anything up when the input actually parses —
  // but either way, return { ok: true } below. Never let a caller tell
  // "that email isn't registered" apart from "that wasn't a valid email" or
  // "here's your reset link" — all three look identical from outside.
  if (parsed.success) {
    const result = await requestPasswordReset(prisma, parsed.data.email);
    if (result) {
      const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
      // sendPasswordResetEmail never throws — a failed send is logged and
      // swallowed inside it, so this stays a thin one-line call. See
      // docs/ARCHITECTURE.md for the Gmail SMTP setup this depends on.
      await sendPasswordResetEmail(createMailer(), parsed.data.email, resetUrl);
    }
  }

  return { ok: true };
}

export async function resetPasswordAction(formData: FormData): Promise<PasswordResetActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a password of at least 8 characters" };
  }

  return resetPassword(prisma, parsed.data.token, parsed.data.password);
}
