import { describe, expect, it, vi } from "vitest";
import { buildTransactionExportRows } from "@/lib/export-transactions";

function makeFakePrisma(transactions: unknown[] = []) {
  return {
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
  } as any;
}

describe("buildTransactionExportRows", () => {
  it("queries with the expected where, include, and order", async () => {
    const prisma = makeFakePrisma();
    await buildTransactionExportRows(prisma, "user-1", { accountId: "acc-1" });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", accountId: "acc-1" },
      orderBy: { date: "desc" },
      include: { account: true, destinationAccount: true, category: true },
    });
  });

  it("maps a resolved row to a readable export row", async () => {
    const prisma = makeFakePrisma([
      {
        date: new Date(2026, 8, 13),
        type: "EXPENSE",
        amount: -18000,
        description: "Lunch",
        notes: null,
        account: { name: "Cash", currency: "PHP" },
        destinationAccount: null,
        category: { name: "Food" },
      },
    ]);
    const [row] = await buildTransactionExportRows(prisma, "user-1", {});
    expect(row).toEqual({
      date: "2026-09-13",
      type: "EXPENSE",
      amountMajorUnits: -180,
      currency: "PHP",
      account: "Cash",
      destinationAccount: null,
      category: "Food",
      description: "Lunch",
      notes: null,
    });
  });

  it("resolves a destination account name for a transfer", async () => {
    const prisma = makeFakePrisma([
      {
        date: new Date(2026, 8, 1),
        type: "TRANSFER",
        amount: -100000,
        description: "Transfer",
        notes: null,
        account: { name: "BPI Savings", currency: "PHP" },
        destinationAccount: { name: "GCash" },
        category: null,
      },
    ]);
    const [row] = await buildTransactionExportRows(prisma, "user-1", {});
    expect(row.destinationAccount).toBe("GCash");
    expect(row.category).toBeNull();
  });
});
