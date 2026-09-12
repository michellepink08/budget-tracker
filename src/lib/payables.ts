import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type PayableInput = {
  name: string;
  amount: number; // minor units, non-negative magnitude
  dueDate: Date;
  accountId: string;
  categoryId?: string;
};

export type PayableMutationResult = { ok: true } | { ok: false; error: string };

export async function createPayable(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  input: PayableInput,
) {
  return prisma.payable.create({ data: { userId, ...input } });
}

export async function updatePayable(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  payableId: string,
  input: Partial<PayableInput>,
): Promise<PayableMutationResult> {
  // Scoped to PENDING — a paid payable's history shouldn't be edited out
  // from under its already-created transaction.
  const result = await prisma.payable.updateMany({
    where: { id: payableId, userId, status: "PENDING" },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Payable not found" };
  }
  return { ok: true };
}

export async function listPayables(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  options: { includePaid?: boolean } = {},
) {
  return prisma.payable.findMany({
    where: {
      userId,
      ...(options.includePaid ? {} : { status: "PENDING" }),
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function listDuePayables(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  asOf: Date,
) {
  return prisma.payable.findMany({
    where: { userId, status: "PENDING", dueDate: { lte: asOf } },
    orderBy: { dueDate: "asc" },
  });
}

export type MarkPaidOverrides = { amount?: number; date?: Date };

export async function markPayablePaid(
  prisma: Pick<PrismaClient, "payable" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  payableId: string,
  overrides: MarkPaidOverrides,
): Promise<PayableMutationResult> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, userId, status: "PENDING" },
  });
  if (!payable) {
    return { ok: false, error: "Payable not found" };
  }

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: overrides.amount ?? payable.amount,
    date: overrides.date ?? new Date(),
    accountId: payable.accountId,
    categoryId: payable.categoryId ?? undefined,
    description: payable.name,
  });

  await prisma.payable.update({
    where: { id: payableId },
    data: { status: "PAID", paidTransactionId: transaction.id },
  });

  return { ok: true };
}
