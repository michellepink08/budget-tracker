import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type InstallmentPurchaseInput = {
  name: string;
  totalAmount: number; // minor units
  numberOfTerms: number;
  accountId: string; // a CREDIT_CARD account
  categoryId?: string;
  startDate: Date;
};

export type InstallmentMutationResult = { ok: true } | { ok: false; error: string };

// Generates the whole schedule up front — an installment purchase's terms
// are fixed at creation time (totalAmount split across numberOfTerms),
// unlike RecurringRule/RecurringPayable which generate one occurrence at a
// time as it comes due. Any remainder from the division lands on the last
// term so the terms always sum to exactly totalAmount.
export async function createInstallmentPurchase(
  prisma: Pick<PrismaClient, "installmentPurchase" | "installmentPayment">,
  userId: string,
  input: InstallmentPurchaseInput,
) {
  const purchase = await prisma.installmentPurchase.create({ data: { userId, ...input } });

  const baseAmount = Math.floor(input.totalAmount / input.numberOfTerms);
  const remainder = input.totalAmount - baseAmount * input.numberOfTerms;

  let dueDate = input.startDate;
  for (let termNumber = 1; termNumber <= input.numberOfTerms; termNumber++) {
    const amount = termNumber === input.numberOfTerms ? baseAmount + remainder : baseAmount;
    await prisma.installmentPayment.create({
      data: {
        userId,
        installmentPurchaseId: purchase.id,
        termNumber,
        amount,
        dueDate,
      },
    });
    dueDate = advanceNextDate(dueDate, "MONTHLY");
  }

  return purchase;
}

export async function archiveInstallmentPurchase(
  prisma: Pick<PrismaClient, "installmentPurchase">,
  userId: string,
  purchaseId: string,
): Promise<InstallmentMutationResult> {
  const result = await prisma.installmentPurchase.updateMany({
    where: { id: purchaseId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Installment purchase not found" };
  }
  return { ok: true };
}

export async function listInstallmentPurchases(
  prisma: Pick<PrismaClient, "installmentPurchase">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.installmentPurchase.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
    include: { payments: true },
  });
}

export async function listDueInstallmentPayments(
  prisma: Pick<PrismaClient, "installmentPayment">,
  userId: string,
  asOf: Date,
) {
  return prisma.installmentPayment.findMany({
    where: { userId, status: "PENDING", dueDate: { lte: asOf } },
    orderBy: { dueDate: "asc" },
  });
}

export type PayInstallmentTermInput = { accountId: string; amount?: number; date?: Date };

export async function payInstallmentTerm(
  prisma: Pick<
    PrismaClient,
    "installmentPurchase" | "installmentPayment" | "transaction" | "budgetPeriod" | "$transaction"
  >,
  userId: string,
  cycleStartDay: number,
  paymentId: string,
  input: PayInstallmentTermInput,
): Promise<InstallmentMutationResult> {
  // Atomic: the PENDING check, the payment transaction, and marking the
  // term PAID all happen together — same duplicate-payment guard shape as
  // markPayablePaid.
  return prisma.$transaction(async (tx) => {
    const payment = await tx.installmentPayment.findFirst({
      where: { id: paymentId, userId, status: "PENDING" },
    });
    if (!payment) {
      return { ok: false, error: "Installment payment not found" };
    }

    const purchase = await tx.installmentPurchase.findFirst({
      where: { id: payment.installmentPurchaseId },
    });

    const transaction = await createExpenseLikeTransaction(tx, userId, cycleStartDay, {
      type: "CREDIT_CARD_PAYMENT",
      amount: input.amount ?? payment.amount,
      date: input.date ?? new Date(),
      accountId: input.accountId,
      description: `Installment: ${purchase!.name} (term ${payment.termNumber} of ${purchase!.numberOfTerms})`,
    });

    await tx.installmentPayment.update({
      where: { id: paymentId },
      data: { status: "PAID", paidTransactionId: transaction.id },
    });

    return { ok: true };
  });
}
