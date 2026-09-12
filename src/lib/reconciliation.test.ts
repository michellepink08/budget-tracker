import { describe, expect, it, vi } from "vitest";
import { applyReconciliation, previewReconciliation } from "@/lib/reconciliation";

function makeFakePrisma(options: { account?: unknown; transactions?: unknown[] } = {}) {
  const account = options.account ?? { id: "acc-1", userId: "user-1", openingBalance: 500000 };
  const transactions = options.transactions ?? [];
  return {
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(account),
      findFirst: vi.fn().mockResolvedValue(account),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
      create: vi.fn().mockResolvedValue({ id: "txn-adjust" }),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
  } as any;
}

describe("previewReconciliation", () => {
  it("returns the calculated balance, actual balance, and the difference", async () => {
    const prisma = makeFakePrisma({
      transactions: [{ accountId: "acc-1", amount: -100000 }], // balance = 400000
    });

    const preview = await previewReconciliation(prisma, "acc-1", 420000);

    expect(preview).toEqual({
      calculatedBalance: 400000,
      actualBalance: 420000,
      difference: 20000,
    });
  });
});

describe("applyReconciliation", () => {
  it("reports already balanced and writes nothing when there is no difference", async () => {
    const prisma = makeFakePrisma({ transactions: [] }); // balance = 500000

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 500000);

    expect(result).toEqual({ ok: true, alreadyBalanced: true });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("creates a signed BALANCE_ADJUSTMENT transaction closing the gap", async () => {
    const prisma = makeFakePrisma({ transactions: [] }); // balance = 500000

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 480000);

    expect(result).toEqual({ ok: true, alreadyBalanced: false });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("BALANCE_ADJUSTMENT");
    expect(txnArgs.amount).toBe(-20000);
    expect(txnArgs.accountId).toBe("acc-1");
  });

  it("reports not found for an account the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.account.findFirst.mockResolvedValue(null);

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 480000);

    expect(result).toEqual({ ok: false, error: "Account not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
