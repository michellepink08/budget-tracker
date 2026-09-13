"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { savingsGoalSchema } from "@/lib/validations/savings-goal";
import { upsertSavingsGoal } from "@/lib/savings-goals";
import { toMinorUnits } from "@/lib/money";

export type SavingsGoalActionResult = { ok: true } | { ok: false; error: string };

export async function upsertSavingsGoalAction(
  accountId: string,
  currency: string,
  formData: FormData,
): Promise<SavingsGoalActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawTarget = formData.get("targetAmount");
  const parsed = savingsGoalSchema.safeParse({
    targetAmount: rawTarget === "" || rawTarget === null ? null : Number(rawTarget),
    assignedAmount: Number(formData.get("assignedAmount")),
  });
  if (!parsed.success) return { ok: false, error: "Please check the goal details" };

  const result = await upsertSavingsGoal(prisma, session.user.id, accountId, {
    targetAmount: parsed.data.targetAmount === null ? null : toMinorUnits(parsed.data.targetAmount, currency),
    assignedAmount: toMinorUnits(parsed.data.assignedAmount, currency),
  });

  if (result.ok) revalidatePath("/accounts");
  return result;
}
