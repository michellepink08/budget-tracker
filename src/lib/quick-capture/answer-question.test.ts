import { describe, expect, it, vi } from "vitest";
import { answerQuestion } from "@/lib/quick-capture/answer-question";
import type { QuestionDraft } from "@/lib/quick-capture/types";

function question(overrides: Partial<QuestionDraft>): QuestionDraft {
  return {
    intent: "question",
    questionType: "liquid_funds",
    account: null,
    category: null,
    clauseText: "x",
    clarification: null,
    ...overrides,
  };
}

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    account: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 100000 }),
    },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    category: { findMany: vi.fn().mockResolvedValue([]) },
    payable: { findMany: vi.fn().mockResolvedValue([]) },
    creditCard: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    savingsGoal: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

describe("answerQuestion", () => {
  it("answers liquid_funds", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 50000 }),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "liquid_funds" }));
    expect(result).toEqual({ kind: "amount", label: "Liquid funds", amountMinorUnits: 50000 });
  });

  it("answers account_balance for a resolved account", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(
      prisma,
      "user-1",
      1,
      question({ questionType: "account_balance", account: { raw: "BPI Savings", id: "acc-1", candidateIds: [] } }),
    );
    expect(result).toEqual({ kind: "amount", label: "BPI Savings", amountMinorUnits: 100000 });
  });

  it("falls back to liquid funds for account_balance with no resolved account", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 75000 }),
      },
    });
    const result = await answerQuestion(
      prisma,
      "user-1",
      1,
      question({ questionType: "account_balance", account: null }),
    );
    expect(result).toEqual({ kind: "amount", label: "Total money you have", amountMinorUnits: 75000 });
  });

  it("answers next_due with the earliest payable", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ name: "Electric bill", amount: 250000, dueDate: new Date(2026, 8, 20) }]),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "next_due" }));
    expect(result.kind).toBe("text");
    if (result.kind === "text") expect(result.text).toContain("Electric bill");
  });

  it("answers next_due with 'Nothing due' when there are no payables", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "next_due" }));
    expect(result).toEqual({ kind: "text", label: "Next due", text: "Nothing due" });
  });

  it("answers transfers_required with 'no transfer needed' when none is recommended", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "transfers_required" }));
    expect(result).toEqual({ kind: "text", label: "Transfers required", text: "No transfer needed right now" });
  });

  it("answers credit_card_due using the user's only credit card when none is named", async () => {
    const prisma = makeFakePrisma({
      creditCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{ accountId: "acc-cc", paymentDueDay: 5 }]),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "credit_card_due" }));
    expect(result).toEqual({ kind: "text", label: "Credit card due date", text: "Due on the 5th of each month" });
  });

  it("reports unavailable for credit_card_balance when there's more than one card and none named", async () => {
    const prisma = makeFakePrisma({
      creditCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{ accountId: "acc-cc1" }, { accountId: "acc-cc2" }]),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "credit_card_balance" }));
    expect(result.kind).toBe("unavailable");
  });

  it("answers safe_to_spend using disposable total, remaining budget, and upcoming obligations", async () => {
    const prisma = makeFakePrisma({
      account: {
        // Two different queries share this one mock (computeDisposableTotal's
        // purpose:"DISPOSABLE" and listRestrictedFundGroups's purpose:"RESTRICTED")
        // — branch on the filter shape so each gets the right accounts back.
        findMany: vi.fn((args: { where: { purpose?: unknown } }) =>
          Promise.resolve(args.where.purpose === "RESTRICTED" ? [] : [{ id: "acc-1" }]),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 100000 }),
      },
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1", endDate: new Date(2026, 8, 30) }),
        create: vi.fn(),
      },
      budgetAllocation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            {
              id: "alloc-1",
              categoryId: "cat-1",
              category: { name: "Food" },
              plannedAmount: 20000,
              rolloverAmount: 0,
              rolloverMode: "RESET",
            },
          ]),
      },
      payable: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ accountId: "acc-1", amount: 15000, dueDate: new Date(2026, 8, 20) }]),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "safe_to_spend" }));
    expect(result.kind).toBe("amount");
    if (result.kind === "amount") {
      expect(result.label).toBe("Safe to spend");
      // disposableTotal 100000 - obligations 15000 - totalRemaining (20000 planned - 0 actual)
      // - requiredTransfers 0 (no primary funding account) - confirmedReserves 0 (no goals) = 65000
      expect(result.amountMinorUnits).toBe(65000);
    }
  });

  it("subtracts a required funding transfer from safe_to_spend when one is recommended", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn((args: { where: { purpose?: unknown } }) => {
          if (args.where.purpose === "RESTRICTED") return Promise.resolve([]);
          if (args.where.purpose === "DISPOSABLE") return Promise.resolve([{ id: "acc-1" }]);
          // getRecommendedFundingTransfer's otherAccounts query: purpose: { in: [...] }
          return Promise.resolve([{ id: "acc-source", purpose: "SAVINGS" }]);
        }),
        // The primary funding account, distinct from "acc-1" above.
        findFirst: vi.fn().mockResolvedValue({ id: "acc-fund", isPrimaryFundingAccount: true }),
        findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
          Promise.resolve(
            {
              "acc-1": { id: "acc-1", openingBalance: 100000 },
              "acc-fund": { id: "acc-fund", openingBalance: 5000 },
              "acc-source": { id: "acc-source", openingBalance: 50000 },
            }[args.where.id],
          ),
        ),
      },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1", endDate: new Date(2026, 8, 30) }),
        create: vi.fn(),
      },
      budgetAllocation: { findMany: vi.fn().mockResolvedValue([]) },
      payable: {
        // getRecommendedFundingTransfer queries by accountId: fundingAccount.id
        // (the shortfall calc); listDuePayables queries by userId/dueDate only
        // (computeSafeToSpend's own obligations term) — branch so the funding
        // account's payable only feeds the shortfall, not double-counted as
        // an obligation too.
        findMany: vi.fn((args: { where: { accountId?: string } }) =>
          Promise.resolve(
            args.where.accountId === "acc-fund"
              ? [{ accountId: "acc-fund", amount: 15000, dueDate: new Date(2026, 8, 20) }]
              : [],
          ),
        ),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "safe_to_spend" }));
    expect(result.kind).toBe("amount");
    if (result.kind === "amount") {
      // disposableTotal 100000, requiredTransfers = min(shortfall 10000, source balance 50000) = 10000
      expect(result.amountMinorUnits).toBe(90000);
    }
  });

  it("answers restricted_fund_balance for a resolved account regardless of restriction status", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(
      prisma,
      "user-1",
      1,
      question({
        questionType: "restricted_fund_balance",
        account: { raw: "Emergency Fund", id: "acc-1", candidateIds: [] },
      }),
    );
    expect(result).toEqual({ kind: "amount", label: "Emergency Fund", amountMinorUnits: 100000 });
  });

  it("sums all restricted funds for restricted_fund_balance with no named account", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: "acc-1", name: "Emergency Fund" },
          { id: "acc-2", name: "Vacation Fund" },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
          Promise.resolve({ id: args.where.id, openingBalance: args.where.id === "acc-1" ? 50000 : 30000 }),
        ),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "restricted_fund_balance" }));
    expect(result).toEqual({ kind: "amount", label: "Restricted funds total", amountMinorUnits: 80000 });
  });

  it("returns zero for restricted_fund_balance when there are no restricted funds", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "restricted_fund_balance" }));
    expect(result).toEqual({ kind: "amount", label: "Restricted funds total", amountMinorUnits: 0 });
  });

  it("answers restricted_fund_coverage when the named fund covers its obligations", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([{ id: "acc-1", name: "Emergency Fund" }]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 50000 }),
      },
      payable: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "p1", name: "Insurance", amount: 23652, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
          ]),
      },
    });
    const result = await answerQuestion(
      prisma,
      "user-1",
      1,
      question({
        questionType: "restricted_fund_coverage",
        account: { raw: "Emergency Fund", id: "acc-1", candidateIds: [] },
      }),
    );
    expect(result).toEqual({
      kind: "text",
      label: "Restricted fund coverage",
      text: "Yes — 500.00 covers 236.52 in upcoming obligations (263.48 left over).",
    });
  });

  it("answers restricted_fund_coverage when the named fund falls short", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([{ id: "acc-1", name: "Emergency Fund" }]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 10000 }),
      },
      payable: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "p1", name: "Big bill", amount: 30000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
          ]),
      },
    });
    const result = await answerQuestion(
      prisma,
      "user-1",
      1,
      question({
        questionType: "restricted_fund_coverage",
        account: { raw: "Emergency Fund", id: "acc-1", candidateIds: [] },
      }),
    );
    expect(result).toEqual({
      kind: "text",
      label: "Restricted fund coverage",
      text: "No — 100.00 is short of the 300.00 upcoming obligations by 200.00.",
    });
  });

  it("auto-picks the sole restricted fund for restricted_fund_coverage when none is named", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([{ id: "acc-1", name: "Emergency Fund" }]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 50000 }),
      },
      payable: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "restricted_fund_coverage" }));
    expect(result).toEqual({
      kind: "text",
      label: "Restricted fund coverage",
      text: "Yes — 500.00 covers 0.00 in upcoming obligations (500.00 left over).",
    });
  });

  it("asks which fund for restricted_fund_coverage when multiple exist and none is named", async () => {
    const prisma = makeFakePrisma({
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: "acc-1", name: "Emergency Fund" },
          { id: "acc-2", name: "Vacation Fund" },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 50000 }),
      },
    });
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "restricted_fund_coverage" }));
    expect(result).toEqual({ kind: "unavailable", message: "Which fund did you mean?" });
  });

  it("reports no restricted funds set up for restricted_fund_coverage when there are none", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "restricted_fund_coverage" }));
    expect(result).toEqual({ kind: "unavailable", message: "You don't have any restricted funds set up." });
  });
});

describe("shopping_selected_total", () => {
  it("returns the current list's estimated total for selected items", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", budgetCategoryId: null }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([
          { isSelected: true, quantity: 2, estimatedUnitPrice: 5500 },
        ]),
      },
    });

    const answer = await answerQuestion(prisma, "user-1", 25, question({ questionType: "shopping_selected_total" }));

    expect(answer).toEqual({ kind: "amount", label: "Selected shopping list total", amountMinorUnits: 11000 });
  });

  it("reports unavailable when there's no current list or nothing selected", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue(null) },
      shoppingListItem: { findMany: vi.fn() },
    });

    const answer = await answerQuestion(prisma, "user-1", 25, question({ questionType: "shopping_selected_total" }));

    expect(answer).toEqual({ kind: "unavailable", message: "No current shopping list yet" });
  });
});
