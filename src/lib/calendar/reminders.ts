import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type ReminderMutationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  input: { label: string; date: Date; amount: number | null },
) {
  return prisma.customReminder.create({ data: { userId, state: "UPCOMING", ...input } });
}

async function assertOwnedReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<boolean> {
  const reminder = await prisma.customReminder.findFirst({ where: { id: reminderId, userId } });
  return reminder !== null;
}

// The one function here that touches a balance — every other function in
// this module (create/skip/linkTransaction/delete) only ever writes
// CustomReminder rows.
export async function markPaid(
  prisma: Pick<PrismaClient, "customReminder" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  reminderId: string,
  input: { accountId: string; categoryId: string | undefined },
): Promise<ReminderMutationResult> {
  const reminder = await prisma.customReminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) return { ok: false, error: "Reminder not found" };

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: reminder.amount ?? 0,
    date: new Date(),
    accountId: input.accountId,
    categoryId: input.categoryId,
    description: reminder.label,
  });

  await prisma.customReminder.update({
    where: { id: reminderId },
    data: { linkedTransactionId: transaction.id, state: "PAID" },
  });
  return { ok: true, id: reminderId };
}

export async function skip(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<ReminderMutationResult> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.update({ where: { id: reminderId }, data: { state: "SKIPPED" } });
  return { ok: true, id: reminderId };
}

// For a reminder whose payment already happened as an ordinary transaction
// elsewhere — links it without creating a second transaction.
export async function linkTransaction(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
  transactionId: string,
): Promise<ReminderMutationResult> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.update({
    where: { id: reminderId },
    data: { linkedTransactionId: transactionId, state: "PAID" },
  });
  return { ok: true, id: reminderId };
}

export async function deleteReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.delete({ where: { id: reminderId } });
  return { ok: true };
}
