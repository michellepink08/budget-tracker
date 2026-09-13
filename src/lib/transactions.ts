import type { PrismaClient } from "@prisma/client";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { createTransfer, type TransferResult } from "@/lib/transfers";
import { signedAmountForType, type SignableTransactionType } from "@/lib/transaction-rules";

export type TransactionMutationResult = { ok: true } | { ok: false; error: string };

export type ExpenseLikeInput = {
  type: SignableTransactionType;
  amount: number; // minor units, non-negative magnitude
  date: Date;
  accountId: string;
  categoryId?: string;
  subcategoryId?: string;
  description: string;
  notes?: string;
  budgetPeriodId?: string; // manual override — skips auto-resolution
};

async function resolvePeriodId(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  date: Date,
  cycleStartDay: number,
  manualBudgetPeriodId: string | undefined,
): Promise<string> {
  if (manualBudgetPeriodId) {
    return manualBudgetPeriodId;
  }
  const period = await resolveBudgetPeriodForDate(prisma, userId, date, cycleStartDay);
  return period.id;
}

export async function createExpenseLikeTransaction(
  prisma: Pick<PrismaClient, "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  input: ExpenseLikeInput,
) {
  const budgetPeriodId = await resolvePeriodId(
    prisma,
    userId,
    input.date,
    cycleStartDay,
    input.budgetPeriodId,
  );

  return prisma.transaction.create({
    data: {
      userId,
      date: input.date,
      type: input.type,
      amount: signedAmountForType(input.type, input.amount),
      accountId: input.accountId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      budgetPeriodId,
      description: input.description,
      notes: input.notes,
    },
  });
}

export type TransferInput = {
  amount: number; // minor units, non-negative magnitude
  date: Date;
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  budgetPeriodId?: string;
};

export async function createTransferTransaction(
  prisma: Pick<PrismaClient, "transaction" | "budgetPeriod" | "$transaction">,
  userId: string,
  cycleStartDay: number,
  input: TransferInput,
): Promise<TransferResult> {
  const budgetPeriodId = await resolvePeriodId(
    prisma,
    userId,
    input.date,
    cycleStartDay,
    input.budgetPeriodId,
  );

  return createTransfer(prisma, {
    userId,
    date: input.date,
    amount: input.amount,
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    description: input.description,
    budgetPeriodId,
  });
}

export type TransactionEditableInput = {
  description?: string;
  notes?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  amount?: number; // minor units — the caller is responsible for the correct sign
  date?: Date;
  accountId?: string;
};

export async function updateTransaction(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  transactionId: string,
  input: TransactionEditableInput,
): Promise<TransactionMutationResult> {
  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Transaction not found" };
  }
  return { ok: true };
}

export async function deleteTransaction(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  transactionId: string,
): Promise<TransactionMutationResult> {
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });
  if (!existing) {
    return { ok: false, error: "Transaction not found" };
  }

  const idsToDelete = existing.linkedTransactionId
    ? [existing.id, existing.linkedTransactionId]
    : [existing.id];

  await prisma.transaction.deleteMany({
    where: { id: { in: idsToDelete }, userId },
  });

  return { ok: true };
}

export type TransactionFilters = {
  accountId?: string;
  categoryId?: string;
  type?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export function buildTransactionWhereClause(userId: string, filters: TransactionFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { userId };

  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.search) where.description = { contains: filters.search };
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return where;
}

export async function listTransactions(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
) {
  return prisma.transaction.findMany({
    where: buildTransactionWhereClause(userId, filters),
    orderBy: { date: "desc" },
  });
}
