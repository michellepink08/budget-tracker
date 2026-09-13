"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markReminderPaidSchema, reminderSchema } from "@/lib/validations/calendar";
import { createReminder, deleteReminder, markPaid, skip } from "@/lib/calendar/reminders";
import { toMinorUnits } from "@/lib/money";

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

  const result = await deleteReminder(prisma, session.user.id, reminderId);
  if (result.ok) revalidatePath("/calendar");
  return result;
}
