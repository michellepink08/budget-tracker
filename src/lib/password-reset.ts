import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { hashPassword } from "@/lib/password";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type RequestPasswordResetResult = { token: string } | null;

// Returns null for an unregistered email — the caller must not use that to
// tell the requester anything different happened than for a real one
// (account-enumeration mitigation; see src/actions/password-reset.actions.ts).
export async function requestPasswordReset(
  prisma: Pick<PrismaClient, "user" | "passwordResetToken">,
  email: string,
): Promise<RequestPasswordResetResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return { token };
}

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(
  prisma: Pick<PrismaClient, "user" | "passwordResetToken">,
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired" };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return { ok: true };
}
