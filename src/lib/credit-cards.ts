import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type CreditCardInput = {
  accountId: string;
  creditLimit: number; // minor units
  statementDay: number; // 1-31
  paymentDueDay: number; // 1-31
  interestRate: number; // annual %, display-only
};

export type CreditCardMutationResult = { ok: true } | { ok: false; error: string };

export async function createCreditCard(
  prisma: Pick<PrismaClient, "creditCard">,
  userId: string,
  input: CreditCardInput,
) {
  return prisma.creditCard.create({ data: { userId, ...input } });
}

export async function updateCreditCard(
  prisma: Pick<PrismaClient, "creditCard">,
  userId: string,
  creditCardId: string,
  input: Partial<CreditCardInput>,
): Promise<CreditCardMutationResult> {
  const result = await prisma.creditCard.updateMany({
    where: { id: creditCardId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Credit card not found" };
  }
  return { ok: true };
}

export async function listCreditCards(prisma: Pick<PrismaClient, "creditCard">, userId: string) {
  return prisma.creditCard.findMany({ where: { userId } });
}

export type CreditCardPaymentInput = { accountId: string; amount: number; date: Date };

export type MakeCreditCardPaymentResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: string };

type MakePaymentPrisma = Pick<
  PrismaClient,
  "creditCard" | "transaction" | "account" | "budgetPeriod" | "$transaction"
>;

// Records a real two-sided ledger entry, mirroring src/lib/transfers.ts's
// createTransfer: an outgoing row on the paying account (unchanged from
// before) plus a new incoming row on the card's own account, linked via
// linkedTransactionId. computeAccountBalance sums by accountId, so the
// card's balance now actually drops by the payment — the same way any
// other movement between two of the user's own accounts already works.
// Nesting prisma.$transaction inside the caller's own $transaction
// (src/actions/credit-card.actions.ts already wraps this call) is the
// same pattern createTransfer already relies on for transfers.
export async function makeCreditCardPayment(
  prisma: MakePaymentPrisma,
  userId: string,
  cycleStartDay: number,
  creditCardId: string,
  input: CreditCardPaymentInput,
): Promise<MakeCreditCardPaymentResult> {
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } });
  if (!card) {
    return { ok: false, error: "Credit card not found" };
  }
  const payingAccount = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });

  return prisma.$transaction(async (tx) => {
    const outgoing = await createExpenseLikeTransaction(tx, userId, cycleStartDay, {
      type: "CREDIT_CARD_PAYMENT",
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      creditCardId: card.id,
      description: "Credit card payment",
    });

    const incoming = await tx.transaction.create({
      data: {
        userId,
        date: input.date,
        type: "CREDIT_CARD_PAYMENT",
        amount: input.amount,
        accountId: card.accountId,
        destinationAccountId: input.accountId,
        budgetPeriodId: outgoing.budgetPeriodId,
        description: `Payment from ${payingAccount.name}`,
        linkedTransactionId: outgoing.id,
      },
    });

    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { linkedTransactionId: incoming.id, destinationAccountId: card.accountId },
    });

    return { ok: true, transactionId: outgoing.id };
  });
}
