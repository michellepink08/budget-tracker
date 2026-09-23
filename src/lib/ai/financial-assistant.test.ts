import { describe, expect, it, vi } from "vitest";
import { askFinancialAssistant } from "@/lib/ai/financial-assistant";

const createMock = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-sonnet-5",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

vi.mock("@/lib/budget-period", () => ({
  resolveBudgetPeriodForDate: vi.fn().mockResolvedValue({ id: "period-1" }),
}));

vi.mock("@/lib/reports", () => ({
  spendingByCategory: vi.fn().mockResolvedValue([{ categoryId: "cat-1", categoryName: "Food", amount: 15000 }]),
  incomeVsExpenseByPeriod: vi.fn().mockResolvedValue([{ periodId: "p1", periodName: "Sep 1-15", income: 0, expense: 15000 }]),
}));

vi.mock("@/lib/accounts", () => ({
  listAccounts: vi.fn().mockResolvedValue([{ id: "acc-1", name: "Cash", currency: "PHP" }]),
}));

vi.mock("@/lib/account-balance", () => ({
  computeAccountBalance: vi.fn().mockResolvedValue(50000),
}));

const prisma = {} as any;

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function toolUseResponse(name: string, input: unknown) {
  return { content: [{ type: "tool_use", id: "t1", name, input }] };
}

describe("askFinancialAssistant", () => {
  it("answers directly when no tool is needed", async () => {
    createMock.mockResolvedValueOnce(textResponse("Hi! Ask me about your budget."));

    const reply = await askFinancialAssistant(prisma, "user-1", 25, "PHP", [], "hello");

    expect(reply).toBe("Hi! Ask me about your budget.");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("runs the requested tool and feeds the result back for a final answer", async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse("get_spending_by_category", {}))
      .mockResolvedValueOnce(textResponse("You've spent ₱150.00 on Food this cycle."));

    const reply = await askFinancialAssistant(prisma, "user-1", 25, "PHP", [], "how much on food?");

    expect(reply).toBe("You've spent ₱150.00 on Food this cycle.");
    expect(createMock).toHaveBeenCalledTimes(2);

    const secondCallMessages = createMock.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0].type).toBe("tool_result");
    expect(toolResultMessage.content[0].content).toContain("Food");
  });

  it("stops after the round cap and returns a fallback instead of looping forever", async () => {
    createMock.mockResolvedValue(toolUseResponse("get_account_balances", {}));

    const reply = await askFinancialAssistant(prisma, "user-1", 25, "PHP", [], "keep asking");

    expect(reply).toMatch(/wasn't able to finish/);
    expect(createMock).toHaveBeenCalledTimes(4);
  });
});
