import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import { recordAudit } from "@/lib/audit-log";
import type { RecurringFrequency } from "@/lib/constants/financial";

export type RecurringPayableInput = {
  name: string;
  amount: number; // minor units
  frequency: string;
  intervalDays?: number;
  nextDueDate: Date;
  accountId: string;
  categoryId?: string;
};

export type RecurringPayableMutationResult = { ok: true } | { ok: false; error: string };

export async function createRecurringPayable(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  input: RecurringPayableInput,
) {
  return prisma.recurringPayable.create({ data: { userId, ...input } });
}

export async function updateRecurringPayable(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  ruleId: string,
  input: Partial<RecurringPayableInput> & { active?: boolean },
): Promise<RecurringPayableMutationResult> {
  const result = await prisma.recurringPayable.updateMany({
    where: { id: ruleId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Recurring payable not found" };
  }
  return { ok: true };
}

export async function listRecurringPayables(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  options: { includeInactive?: boolean } = {},
) {
  return prisma.recurringPayable.findMany({
    where: {
      userId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    orderBy: { nextDueDate: "asc" },
  });
}

export async function listDueRecurringPayables(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  asOf: Date,
) {
  return prisma.recurringPayable.findMany({
    where: { userId, active: true, nextDueDate: { lte: asOf } },
    orderBy: { nextDueDate: "asc" },
  });
}

export type ConfirmPayableOverrides = { amount?: number; dueDate?: Date };

// Unlike RecurringRule's confirm (which posts a Transaction directly), a
// recurring payable's occurrence becomes a new Payable — the bill still
// has to be marked paid separately (src/lib/payables.ts).
export async function confirmRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable" | "payable" | "auditLog" | "$transaction">,
  userId: string,
  ruleId: string,
  overrides: ConfirmPayableOverrides,
): Promise<RecurringPayableMutationResult> {
  // Creating the new Payable and advancing nextDueDate happen atomically —
  // otherwise a failure partway through could create an occurrence without
  // advancing the schedule (letting the same occurrence be confirmed
  // twice) or advance the schedule with no Payable ever created for it.
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringPayable.findFirst({ where: { id: ruleId, userId } });
    if (!rule) {
      return { ok: false, error: "Recurring payable not found" };
    }

    const payable = await tx.payable.create({
      data: {
        userId,
        name: rule.name,
        amount: overrides.amount ?? rule.amount,
        dueDate: overrides.dueDate ?? rule.nextDueDate,
        accountId: rule.accountId,
        categoryId: rule.categoryId ?? undefined,
        recurringPayableId: rule.id,
      },
    });

    const nextDueDate = advanceNextDate(
      rule.nextDueDate,
      rule.frequency as RecurringFrequency,
      rule.intervalDays ?? undefined,
    );
    await tx.recurringPayable.update({ where: { id: ruleId }, data: { nextDueDate } });

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_PAYABLE_OCCURRENCE",
      entityId: ruleId,
      action: "CREATE",
      source: "RECURRING_RULE",
      previousValues: { nextDueDate: rule.nextDueDate },
      newValues: { nextDueDate },
      relatedRecordIds: [payable.id],
    });

    return { ok: true };
  });
}

export async function skipRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  ruleId: string,
): Promise<RecurringPayableMutationResult> {
  const rule = await prisma.recurringPayable.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring payable not found" };
  }

  const nextDueDate = advanceNextDate(
    rule.nextDueDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringPayable.update({ where: { id: ruleId }, data: { nextDueDate } });

  return { ok: true };
}
