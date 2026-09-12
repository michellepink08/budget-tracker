import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import { createExpenseLikeTransaction } from "@/lib/transactions";
import type { SignableTransactionType } from "@/lib/transaction-rules";
import type { RecurringFrequency } from "@/lib/constants/financial";

export type RecurringRuleInput = {
  name: string;
  transactionType: string;
  amount: number; // minor units, non-negative magnitude
  frequency: string;
  intervalDays?: number;
  nextDate: Date;
  accountId: string;
  categoryId?: string;
  subcategoryId?: string;
};

export type RecurringMutationResult = { ok: true } | { ok: false; error: string };

export async function createRecurringRule(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  input: RecurringRuleInput,
) {
  return prisma.recurringRule.create({ data: { userId, ...input } });
}

export async function updateRecurringRule(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  ruleId: string,
  input: Partial<RecurringRuleInput> & { active?: boolean },
): Promise<RecurringMutationResult> {
  const result = await prisma.recurringRule.updateMany({
    where: { id: ruleId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Recurring rule not found" };
  }
  return { ok: true };
}

export async function listRecurringRules(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  options: { includeInactive?: boolean } = {},
) {
  return prisma.recurringRule.findMany({
    where: {
      userId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    orderBy: { nextDate: "asc" },
  });
}

export async function listDueRecurringRules(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  asOf: Date,
) {
  return prisma.recurringRule.findMany({
    where: { userId, active: true, nextDate: { lte: asOf } },
    orderBy: { nextDate: "asc" },
  });
}

export type ConfirmOverrides = { amount?: number; date?: Date };

export async function confirmRecurringOccurrence(
  prisma: Pick<PrismaClient, "recurringRule" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  ruleId: string,
  overrides: ConfirmOverrides,
): Promise<RecurringMutationResult> {
  const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring rule not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: rule.transactionType as SignableTransactionType,
    amount: overrides.amount ?? rule.amount,
    date: overrides.date ?? rule.nextDate,
    accountId: rule.accountId,
    categoryId: rule.categoryId ?? undefined,
    subcategoryId: rule.subcategoryId ?? undefined,
    description: rule.name,
  });

  const nextDate = advanceNextDate(
    rule.nextDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringRule.update({ where: { id: ruleId }, data: { nextDate } });

  return { ok: true };
}

export async function skipRecurringOccurrence(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  ruleId: string,
): Promise<RecurringMutationResult> {
  const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring rule not found" };
  }

  const nextDate = advanceNextDate(
    rule.nextDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringRule.update({ where: { id: ruleId }, data: { nextDate } });

  return { ok: true };
}
