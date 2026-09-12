import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

// Credit and loan accounts are never "your money," even if includeInLiquidFunds
// was left on — same hard rule as src/lib/transfer-recommendations.ts, stated
// explicitly in the design spec's "Account-balance rules" section.
const EXCLUDED_FROM_LIQUID_FUNDS = ["CREDIT_CARD", "LOAN"];

export async function computeLiquidFunds(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      includeInLiquidFunds: true,
      accountType: { notIn: EXCLUDED_FROM_LIQUID_FUNDS },
    },
  });

  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );

  return balances.reduce((sum, balance) => sum + balance, 0);
}
