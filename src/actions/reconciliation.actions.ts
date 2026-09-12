"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reconciliationSchema } from "@/lib/validations/reconciliation";
import { applyReconciliation, previewReconciliation } from "@/lib/reconciliation";
import { toMinorUnits } from "@/lib/money";

export type ReconciliationPreviewResult =
  | { ok: true; calculatedBalance: number; actualBalance: number; difference: number }
  | { ok: false; error: string };

export type ReconciliationApplyResult =
  | { ok: true; alreadyBalanced: boolean }
  | { ok: false; error: string };

export async function previewReconciliationAction(
  accountId: string,
  actualBalanceMajor: number,
): Promise<ReconciliationPreviewResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = reconciliationSchema.safeParse({ actualBalance: actualBalanceMajor });
  if (!parsed.success) return { ok: false, error: "Please enter a valid balance" };

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const preview = await previewReconciliation(
    prisma,
    accountId,
    toMinorUnits(parsed.data.actualBalance, account.currency),
  );

  return { ok: true, ...preview };
}

export async function applyReconciliationAction(
  accountId: string,
  actualBalanceMajor: number,
): Promise<ReconciliationApplyResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = reconciliationSchema.safeParse({ actualBalance: actualBalanceMajor });
  if (!parsed.success) return { ok: false, error: "Please enter a valid balance" };

  const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } });
  if (!account) return { ok: false, error: "Account not found" };

  const result = await applyReconciliation(
    prisma,
    user.id,
    user.cycleStartDay,
    accountId,
    toMinorUnits(parsed.data.actualBalance, account.currency),
  );

  if (result.ok) {
    revalidatePath("/accounts");
    revalidatePath("/transactions");
  }
  return result;
}
