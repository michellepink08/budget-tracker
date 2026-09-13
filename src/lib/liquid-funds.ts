import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

const LIQUID_PURPOSES = ["DISPOSABLE", "SAVINGS"];

export async function computeLiquidFunds(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      purpose: { in: LIQUID_PURPOSES },
    },
  });

  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );

  return balances.reduce((sum, balance) => sum + balance, 0);
}
