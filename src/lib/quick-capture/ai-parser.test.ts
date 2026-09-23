import { describe, expect, it, vi } from "vitest";
import { aiParseQuickCapture } from "@/lib/quick-capture/ai-parser";
import type { ParserContext } from "@/lib/quick-capture/deterministic-parser";

const createMock = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-sonnet-5",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

const now = new Date(2026, 8, 13);

function makeContext(overrides: Partial<ParserContext> = {}): ParserContext {
  return {
    userId: "user-1",
    currency: "PHP",
    now,
    accounts: [
      { id: "acc-cash", name: "Cash" },
      { id: "acc-bpi", name: "BPI Savings" },
    ],
    categories: [{ id: "cat-food", name: "Food" }],
    shoppingItems: [],
    ...overrides,
  };
}

function makeFakePrisma() {
  return { alias: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
}

function toolResponse(input: unknown) {
  return { content: [{ type: "tool_use", id: "t1", name: "record_transaction", input }] };
}

describe("aiParseQuickCapture", () => {
  it("builds an expense draft from a freeform sentence", async () => {
    createMock.mockResolvedValueOnce(
      toolResponse({
        intent: "expense",
        amountMajorUnits: 180,
        accountRaw: "Cash",
        categoryRaw: "Food",
        description: "Lunch",
      }),
    );

    const draft = await aiParseQuickCapture(
      makeFakePrisma(),
      makeContext(),
      "grabbed lunch for 180 bucks, paid cash",
    );

    expect(draft?.intent).toBe("expense");
    if (draft?.intent === "expense") {
      expect(draft.amountMinorUnits).toBe(18000);
      expect(draft.account.id).toBe("acc-cash");
      expect(draft.category?.id).toBe("cat-food");
      expect(draft.description).toBe("Lunch");
    }
  });

  it("returns null when the model can't extract a valid amount", async () => {
    createMock.mockResolvedValueOnce(
      toolResponse({ intent: "expense", amountMajorUnits: 0, accountRaw: "", categoryRaw: "", description: "" }),
    );

    const draft = await aiParseQuickCapture(makeFakePrisma(), makeContext(), "hmm not sure");

    expect(draft).toBeNull();
  });

  it("returns null when the model reports the text as unrecognized", async () => {
    createMock.mockResolvedValueOnce(
      toolResponse({ intent: "unrecognized", amountMajorUnits: 0, accountRaw: "", categoryRaw: "", description: "" }),
    );

    const draft = await aiParseQuickCapture(makeFakePrisma(), makeContext(), "what's the weather like");

    expect(draft).toBeNull();
  });

  it("asks for clarification when the account can't be resolved", async () => {
    createMock.mockResolvedValueOnce(
      toolResponse({
        intent: "expense",
        amountMajorUnits: 50,
        accountRaw: "some unknown wallet",
        categoryRaw: "",
        description: "Something",
      }),
    );

    const draft = await aiParseQuickCapture(makeFakePrisma(), makeContext(), "spent 50 from some unknown wallet");

    expect(draft?.clarification?.field).toBe("account");
  });
});
