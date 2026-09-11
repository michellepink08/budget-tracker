import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";

export type SignupResult = { ok: true } | { ok: false; error: string };

export async function createUser(
  prisma: Pick<PrismaClient, "user">,
  email: string,
  password: string,
): Promise<SignupResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "Email already in use" };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { email, passwordHash } });

  return { ok: true };
}
