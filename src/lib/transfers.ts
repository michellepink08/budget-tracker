import type { PrismaClient } from "@prisma/client";

export type CreateTransferInput = {
  userId: string;
  date: Date;
  amount: number; // non-negative magnitude, minor units
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  budgetPeriodId?: string;
};

export type TransferResult = {
  outgoingTransactionId: string;
  incomingTransactionId: string;
};

/**
 * Creates the two linked rows for a transfer between two of the user's
 * own accounts: a negative row on the source account and a positive row
 * on the destination account, sharing linkedTransactionId. The
 * transferred amount never counts as income or spending — a transfer fee
 * (its own TRANSFER_FEE transaction, created like any other outflow) is
 * the only part of a transfer that counts as an expense.
 */
export async function createTransfer(
  prisma: Pick<PrismaClient, "transaction" | "$transaction">,
  input: CreateTransferInput,
): Promise<TransferResult> {
  if (input.amount < 0) {
    throw new Error(`amount must be non-negative, got ${input.amount}`);
  }
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new Error("sourceAccountId and destinationAccountId must differ");
  }

  // All three writes (both sides of the transfer, plus linking them back
  // together) happen in one DB transaction — a failure partway through
  // must never leave one side of the transfer written without the other.
  return prisma.$transaction(async (tx) => {
    const outgoing = await tx.transaction.create({
      data: {
        userId: input.userId,
        date: input.date,
        type: "TRANSFER",
        amount: -input.amount,
        accountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId,
        description: input.description,
        budgetPeriodId: input.budgetPeriodId,
      },
    });

    const incoming = await tx.transaction.create({
      data: {
        userId: input.userId,
        date: input.date,
        type: "TRANSFER",
        amount: input.amount,
        accountId: input.destinationAccountId,
        destinationAccountId: input.sourceAccountId,
        description: input.description,
        budgetPeriodId: input.budgetPeriodId,
        linkedTransactionId: outgoing.id,
      },
    });

    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { linkedTransactionId: incoming.id },
    });

    return { outgoingTransactionId: outgoing.id, incomingTransactionId: incoming.id };
  });
}
