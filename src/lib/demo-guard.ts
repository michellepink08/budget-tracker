import type { PrismaClient } from "@prisma/client";
import { DEMO_EMAIL } from "@/lib/config";

export type DemoGuardResult = { ok: false; error: string } | null;

// Blocks an action outright for the shared demo account. Call this at the
// top of every archive/delete action and every settings-changing action,
// before doing anything else. A no-op (returns null) for every other user.
export async function assertNotDemo(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email === DEMO_EMAIL) {
    return { ok: false, error: "Not available in the shared demo — sign up for your own account to do this." };
  }
  return null;
}

// Caps how many rows a create action can add for the demo account, so the
// shared dataset can't grow without bound between resets. A no-op for
// every other user — countCurrent() is never even called for them.
export async function assertUnderDemoCap(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  countCurrent: () => Promise<number>,
  cap: number,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email !== DEMO_EMAIL) return null;
  const current = await countCurrent();
  if (current >= cap) {
    return { ok: false, error: `Demo limit reached (${cap} max) — sign up to add more.` };
  }
  return null;
}
