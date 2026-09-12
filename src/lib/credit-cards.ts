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

// No stored balance to update — the card's Account already reflects
// purchases and payments via computeAccountBalance (Plan 2A). This just
// logs the normal CREDIT_CARD_PAYMENT transaction against the paying
// account, exactly as that transaction type already works.
export async function makeCreditCardPayment(
  prisma: Pick<PrismaClient, "creditCard" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  creditCardId: string,
  input: CreditCardPaymentInput,
): Promise<CreditCardMutationResult> {
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } });
  if (!card) {
    return { ok: false, error: "Credit card not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "CREDIT_CARD_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    description: "Credit card payment",
  });

  return { ok: true };
}
