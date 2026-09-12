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

  it("reports unavailable for safe_to_spend", async () => {
    const prisma = makeFakePrisma();
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "safe_to_spend" }));
    expect(result.kind).toBe("unavailable");
  });
});
