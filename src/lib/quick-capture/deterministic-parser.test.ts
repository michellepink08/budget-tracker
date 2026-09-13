import { describe, expect, it, vi } from "vitest";
import { parseCommand, splitClauses, type ParserContext } from "@/lib/quick-capture/deterministic-parser";

const now = new Date(2026, 8, 13);

function makeContext(overrides: Partial<ParserContext> = {}): ParserContext {
  return {
    userId: "user-1",
    currency: "PHP",
    now,
    accounts: [
      { id: "acc-cash", name: "Cash" },
      { id: "acc-bpi", name: "BPI Savings" },
      { id: "acc-gcash", name: "GCash" },
      { id: "acc-maya-cc", name: "Maya Credit Card" },
    ],
    categories: [
      { id: "cat-food", name: "Food" },
      { id: "cat-transport", name: "Transportation" },
      { id: "cat-health", name: "Health" },
    ],
    ...overrides,
  };
}

function makeFakePrisma(transactions: unknown[] = []) {
  return {
    alias: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
  } as any;
}

describe("parseCommand", () => {
  it("parses one simple expense", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 180 for food using cash");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.amountMinorUnits).toBe(18000);
      expect(draft.account.id).toBe("acc-cash");
      expect(draft.category?.id).toBe("cat-food");
    }
  });

  it("parses multiple expenses in one command", async () => {
    const drafts = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 213 for medicine in cash and 703 for food using GCash",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].intent).toBe("expense");
    expect(drafts[1].intent).toBe("expense");
    if (drafts[1].intent === "expense") {
      expect(drafts[1].amountMinorUnits).toBe(70300);
      expect(drafts[1].account.id).toBe("acc-gcash");
    }
  });

  it("parses income", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Received 5,000 from Rei in BPI Savings");
    expect(draft.intent).toBe("income");
    if (draft.intent === "income") {
      expect(draft.amountMinorUnits).toBe(500000);
      expect(draft.account.id).toBe("acc-bpi");
      expect(draft.description).toContain("Rei");
    }
  });

  it("parses a refund", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Refunded 86 to GCash");
    expect(draft.intent).toBe("refund");
    if (draft.intent === "refund") {
      expect(draft.amountMinorUnits).toBe(8600);
      expect(draft.account.id).toBe("acc-gcash");
    }
  });

  it("parses a transfer", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Transferred 1,000 from BPI Savings to GCash");
    expect(draft.intent).toBe("transfer");
    if (draft.intent === "transfer") {
      expect(draft.amountMinorUnits).toBe(100000);
      expect(draft.sourceAccount.id).toBe("acc-bpi");
      expect(draft.destinationAccount.id).toBe("acc-gcash");
      expect(draft.feeMinorUnits).toBe(0);
    }
  });

  it("parses a transfer with a fee mentioned separately as a second clause", async () => {
    const drafts = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Transferred 1,000 from BPI Savings to GCash and paid 15 for food using cash",
    );
    expect(drafts[0].intent).toBe("transfer");
    expect(drafts[1].intent).toBe("expense");
  });

  it("parses a credit-card charge", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 500 groceries using Maya Credit Card",
    );
    expect(draft.intent).toBe("credit_card_charge");
    if (draft.intent === "credit_card_charge") {
      expect(draft.account.id).toBe("acc-maya-cc");
    }
  });

  it("parses a relative date", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Bought fruits for 300 cash yesterday");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.date.value).toEqual(new Date(2026, 8, 12));
      expect(draft.date.confirmed).toBe(true);
    }
  });

  it("recognizes a manual cutoff override", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 180 for food using cash for the previous cutoff",
    );
    if (draft.intent === "expense") {
      expect(draft.cutoffOverride).toBe("previous");
    }
  });

  it("parses a balance reconciliation", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "My current BPI Savings balance is 166,232.27",
    );
    expect(draft.intent).toBe("reconciliation");
    if (draft.intent === "reconciliation") {
      expect(draft.actualBalanceMinorUnits).toBe(16623227);
      expect(draft.account.id).toBe("acc-bpi");
    }
  });

  it("parses a payable with a confirmed due date", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "BPI credit card is 25,389.83 due October 5",
    );
    expect(draft.intent).toBe("payable_create");
    if (draft.intent === "payable_create") {
      expect(draft.amountMinorUnits).toBe(2538983);
      expect(draft.dueDate.confirmed).toBe(true);
    }
  });

  it("parses a payable with an estimated due date", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "EastWest hospital bill is 15,519.14 due around October 5",
    );
    expect(draft.intent).toBe("payable_create");
    if (draft.intent === "payable_create") {
      expect(draft.dueDate.confirmed).toBe(false);
    }
  });

  it("resolves updating a recent transaction", async () => {
    const prisma = makeFakePrisma([{ id: "txn-transport-1" }]);
    const [draft] = await parseCommand(prisma, makeContext(), "Change the last transportation transaction to 250 total");
    expect(draft.intent).toBe("transaction_update");
    if (draft.intent === "transaction_update") {
      expect(draft.target.id).toBe("txn-transport-1");
      expect(draft.amountMinorUnits).toBe(25000);
    }
  });

  it("resolves deleting a recent transaction", async () => {
    const prisma = makeFakePrisma([{ id: "txn-water-1" }]);
    const [draft] = await parseCommand(prisma, makeContext(), "Delete the water transaction I just added");
    expect(draft.intent).toBe("transaction_delete");
    if (draft.intent === "transaction_delete") {
      expect(draft.target.id).toBe("txn-water-1");
    }
  });

  it("asks for clarification when an account reference is ambiguous", async () => {
    const ctx = makeContext({
      accounts: [
        { id: "acc-bpi-savings", name: "BPI Savings" },
        { id: "acc-bpi-checking", name: "BPI Checking" },
      ],
    });
    const [draft] = await parseCommand(makeFakePrisma(), ctx, "Paid 180 for food using BPI");
    expect(draft.clarification).not.toBeNull();
    if (draft.intent === "expense") {
      expect(draft.account.candidateIds).toEqual(["acc-bpi-savings", "acc-bpi-checking"]);
    }
  });

  it("falls back gracefully when the category is unknown", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 180 for spelunking using cash");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.category).toBeNull();
      expect(draft.clarification).toBeNull(); // an unknown category is not blocking, unlike an unknown account
    }
  });

  it("resolves a mentioned account name inside a question", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "How much is in my BPI Savings?");
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.account?.id).toBe("acc-bpi");
    }
  });

  it("leaves account null in a question when nothing matches", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "How much do I have in my wallet?");
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.account).toBeNull();
    }
  });

  it("recognizes a restricted-fund balance question", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "How much is in my restricted funds?");
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("restricted_fund_balance");
    }
  });

  it("recognizes a restricted-fund coverage question and resolves the named fund", async () => {
    const ctx = makeContext({
      accounts: [{ id: "acc-emergency", name: "Emergency Fund" }],
    });
    const [draft] = await parseCommand(
      makeFakePrisma(),
      ctx,
      "Is my Emergency Fund enough to cover my insurance premium?",
    );
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("restricted_fund_coverage");
      expect(draft.account?.id).toBe("acc-emergency");
    }
  });

  it("converts and rounds minor units correctly", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 19.999 for food using cash");
    if (draft.intent === "expense") {
      expect(draft.amountMinorUnits).toBe(2000); // 19.999 * 100 rounds to 2000
    }
  });

  it("scopes reference resolution to the given userId, never trusting anything else", async () => {
    const prisma = makeFakePrisma([{ id: "txn-1" }]);
    await parseCommand(prisma, makeContext({ userId: "user-42" }), "Delete the water transaction I just added");
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-42" }) }),
    );
  });
});

describe("splitClauses", () => {
  it("does not split a thousands-separated number", () => {
    expect(splitClauses("Transferred 1,000 from BPI to GCash")).toEqual([
      "Transferred 1,000 from BPI to GCash",
    ]);
  });

  it("splits on comma and 'and'", () => {
    expect(splitClauses("Paid 180 food cash, 213 medicine cash and 703 food GCash")).toEqual([
      "Paid 180 food cash",
      "213 medicine cash",
      "703 food GCash",
    ]);
  });
});

describe("shopping_schedule", () => {
  it("parses 'Schedule grocery shopping for Saturday' into a shopping_schedule draft", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Schedule grocery shopping for Saturday");

    expect(draft.intent).toBe("shopping_schedule");
  });
});
