import { describe, expect, it, vi } from "vitest";
import { listLedgerRows } from "@/lib/ledger";

function makeFakePrisma(accounts: any[], transactionsByAccountId: Record<string, any[]>) {
  return {
    account: { findMany: vi.fn().mockResolvedValue(accounts) },
    transaction: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { accountId: string } }) =>
        Promise.resolve(transactionsByAccountId[where.accountId] ?? []),
      ),
    },
  } as any;
}

const RANGE = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) };

describe("listLedgerRows", () => {
  it("scopes accounts by userId and the given purpose", async () => {
    const prisma = makeFakePrisma([], {});

    await listLedgerRows(prisma, "user-1", "SAVINGS", RANGE);

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", purpose: "SAVINGS" },
    });
  });

  it("computes a chronological running balance per account, returned newest first", async () => {
    const prisma = makeFakePrisma(
      [{ id: "acc-1", name: "Everyday Checking", openingBalance: 1000 }],
      {
        "acc-1": [
          {
            id: "txn-1",
            date: new Date(2026, 8, 1),
            createdAt: new Date(2026, 8, 1, 9, 0),
            amount: -200,
            description: "Groceries",
            category: { name: "Groceries" },
          },
          {
            id: "txn-2",
            date: new Date(2026, 8, 5),
            createdAt: new Date(2026, 8, 5, 9, 0),
            amount: 500,
            description: "Salary",
            category: null,
          },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows).toEqual([
      {
        id: "txn-2",
        date: new Date(2026, 8, 5),
        createdAt: new Date(2026, 8, 5, 9, 0),
        accountId: "acc-1",
        accountName: "Everyday Checking",
        description: "Salary",
        categoryName: null,
        amount: 500,
        balance: 1300,
      },
      {
        id: "txn-1",
        date: new Date(2026, 8, 1),
        createdAt: new Date(2026, 8, 1, 9, 0),
        accountId: "acc-1",
        accountName: "Everyday Checking",
        description: "Groceries",
        categoryName: "Groceries",
        amount: -200,
        balance: 800,
      },
    ]);
  });

  it("breaks same-date ties by createdAt, newest first — regardless of the order rows come back in", async () => {
    // Deliberately fed in with the later-created row FIRST, to prove the
    // result depends on createdAt rather than on whatever order the DB
    // (or a stable sort with no real tiebreaker) happened to return ties in.
    const prisma = makeFakePrisma(
      [{ id: "acc-1", name: "Everyday Checking", openingBalance: 0 }],
      {
        "acc-1": [
          {
            id: "txn-later",
            date: new Date(2026, 8, 15),
            createdAt: new Date(2026, 8, 15, 14, 0),
            amount: -50,
            description: "Second",
            category: null,
          },
          {
            id: "txn-earlier",
            date: new Date(2026, 8, 15),
            createdAt: new Date(2026, 8, 15, 9, 0),
            amount: -100,
            description: "First",
            category: null,
          },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows.map((r) => r.id)).toEqual(["txn-later", "txn-earlier"]);
  });

  it("carries forward balance from transactions before the range start, without including them as rows", async () => {
    const prisma = makeFakePrisma(
      [{ id: "acc-1", name: "Everyday Checking", openingBalance: 1000 }],
      {
        "acc-1": [
          {
            id: "txn-old",
            date: new Date(2026, 7, 15),
            createdAt: new Date(2026, 7, 15, 9, 0),
            amount: -100,
            description: "Old expense",
            category: null,
          },
          {
            id: "txn-in-range",
            date: new Date(2026, 8, 5),
            createdAt: new Date(2026, 8, 5, 9, 0),
            amount: 200,
            description: "Income",
            category: null,
          },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("txn-in-range");
    expect(rows[0].balance).toBe(1100); // 1000 - 100 + 200
  });

  it("combines multiple accounts in the same purpose group, sorted by date across accounts (newest first)", async () => {
    const prisma = makeFakePrisma(
      [
        { id: "acc-1", name: "Checking", openingBalance: 0 },
        { id: "acc-2", name: "Wallet", openingBalance: 0 },
      ],
      {
        "acc-1": [
          {
            id: "txn-1",
            date: new Date(2026, 8, 10),
            createdAt: new Date(2026, 8, 10, 9, 0),
            amount: -100,
            description: "A",
            category: null,
          },
        ],
        "acc-2": [
          {
            id: "txn-2",
            date: new Date(2026, 8, 12),
            createdAt: new Date(2026, 8, 12, 9, 0),
            amount: -50,
            description: "B",
            category: null,
          },
        ],
      },
    );

    const rows = await listLedgerRows(prisma, "user-1", "DISPOSABLE", RANGE);

    expect(rows.map((r) => r.id)).toEqual(["txn-2", "txn-1"]);
  });

  it("returns an empty array when there are no accounts of that purpose", async () => {
    const prisma = makeFakePrisma([], {});

    const rows = await listLedgerRows(prisma, "user-1", "RESTRICTED", RANGE);

    expect(rows).toEqual([]);
  });
});
