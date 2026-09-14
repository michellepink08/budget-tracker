"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markReminderPaidSchema, reminderSchema } from "@/lib/validations/calendar";
import { createReminder, deleteReminder, markPaid, skip } from "@/lib/calendar/reminders";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";

export type CalendarActionResult = { ok: true } | { ok: false; error: string };

export async function createReminderAction(currency: string, formData: FormData): Promise<CalendarActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawAmount = formData.get("amount");
  const parsed = reminderSchema.safeParse({
    label: formData.get("label"),
    date: formData.get("date"),
    amount: rawAmount ? Number(rawAmount) : null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the reminder details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.customReminder.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  await createReminder(prisma, session.user.id, {
    label: parsed.data.label,
    date: parsed.data.date,
    amount: parsed.data.amount === null ? null : toMinorUnits(parsed.data.amount, currency),
  });
  revalidatePath("/calendar");
  return { ok: true };
}

export async function markReminderPaidAction(reminderId: string, formData: FormData): Promise<CalendarActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = markReminderPaidSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please pick an account" };

  if (!(await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId))) {
    return { ok: false, error: "Account not found" };
  }
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  const result = await markPaid(prisma, session.user.id, user.cycleStartDay, reminderId, {
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId ?? undefined,
  });
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/transactions");
  }
  return result;
}

export async function skipReminderAction(reminderId: string): Promise<CalendarActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await skip(prisma, session.user.id, reminderId);
  if (result.ok) revalidatePath("/calendar");
  return result;
}

export async function deleteReminderAction(reminderId: string): Promise<CalendarActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  const result = await deleteReminder(prisma, session.user.id, reminderId);
  if (result.ok) revalidatePath("/calendar");
  return result;
}
