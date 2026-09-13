import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

export type RestrictedFundGroup = {
  accountId: string;
  accountName: string;
  balance: number;
  obligationTotal: number;
  nextPayable: { name: string; amount: number; dueDate: Date } | null;
  projectedBalance: number;
};

type RestrictedFundsPrisma = Pick<PrismaClient, "account" | "transaction" | "payable">;

function dedupePendingPayables(
  payables: { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[],
) {
  const standalone = payables.filter((p) => p.recurringPayableId === null);
  const byRule = new Map<string, typeof payables>();
  for (const p of payables) {
    if (p.recurringPayableId === null) continue;
    const existing = byRule.get(p.recurringPayableId) ?? [];
    existing.push(p);
    byRule.set(p.recurringPayableId, existing);
  }
  const earliestPerRule = [...byRule.values()].map((group) =>
    group.reduce((earliest, p) => (p.dueDate < earliest.dueDate ? p : earliest)),
  );
  return [...standalone, ...earliestPerRule].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export async function listRestrictedFundGroups(
  prisma: RestrictedFundsPrisma,
  userId: string,
): Promise<RestrictedFundGroup[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      purpose: "RESTRICTED",
    },
  });

  return Promise.all(
    accounts.map(async (account: { id: string; name: string }) => {
      const [balance, payables] = await Promise.all([
        computeAccountBalance(prisma, account.id),
        prisma.payable.findMany({ where: { accountId: account.id, status: "PENDING" } }),
      ]);

      const kept = dedupePendingPayables(
        payables as { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[],
      );
      const obligationTotal = kept.reduce((sum, p) => sum + p.amount, 0);
      const nextPayable = kept[0] ? { name: kept[0].name, amount: kept[0].amount, dueDate: kept[0].dueDate } : null;

      return {
        accountId: account.id,
        accountName: account.name,
        balance,
        obligationTotal,
        nextPayable,
        projectedBalance: balance - obligationTotal,
      };
    }),
  );
}
