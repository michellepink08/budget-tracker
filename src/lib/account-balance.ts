import type { PrismaClient } from "@prisma/client";
import { accountEffect } from "@/lib/transaction-rules";

export async function computeAccountBalance(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  accountId: string,
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  const transactions = await prisma.transaction.findMany({ where: { accountId } });

  const net = transactions.reduce((sum, txn) => sum + accountEffect(txn, accountId), 0);

  return account.openingBalance + net;
}
