"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recurringRuleSchema } from "@/lib/validations/recurring";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";
import { toMinorUnits } from "@/lib/money";

export type RecurringActionResult = { ok: true } | { ok: false; error: string };

function parseRecurringForm(formData: FormData) {
  return recurringRuleSchema.safeParse({
    name: formData.get("name"),
    transactionType: formData.get("transactionType"),
    amount: Number(formData.get("amount")),
    frequency: formData.get("frequency"),
    intervalDays: formData.get("intervalDays") ? Number(formData.get("intervalDays")) : undefined,
    nextDate: new Date(String(formData.get("nextDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    subcategoryId: formData.get("subcategoryId") || undefined,
  });
}

export async function createRecurringRuleAction(formData: FormData): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createRecurringRule(prisma, user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateRecurringRuleAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };

  const result = await updateRecurringRule(prisma, session.user.id, ruleId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function toggleRecurringRuleActiveAction(
  ruleId: string,
  active: boolean,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await updateRecurringRule(prisma, session.user.id, ruleId, { active });
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function confirmRecurringOccurrenceAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId: user.id } });
    if (rule) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: rule.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await confirmRecurringOccurrence(prisma, user.id, user.cycleStartDay, ruleId, {
    amount: overrideAmount,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function skipRecurringOccurrenceAction(ruleId: string): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await skipRecurringOccurrence(prisma, session.user.id, ruleId);
  if (result.ok) revalidatePath("/settings");
  return result;
}
