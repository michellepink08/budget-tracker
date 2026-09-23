import { describe, expect, it, vi } from "vitest";
import { suggestCategory } from "@/lib/ai/categorize-transaction";

const createMock = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-sonnet-5",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

const CATEGORIES = [
  { id: "cat-1", name: "Groceries" },
  { id: "cat-2", name: "Dining" },
];

function toolResponse(input: unknown) {
  return { content: [{ type: "tool_use", id: "t1", name: "suggest_category", input }] };
}

describe("suggestCategory", () => {
  it("returns null with zero categories, without calling the API", async () => {
    const result = await suggestCategory("SM Supermarket", 45000, []);

    expect(result).toEqual({ categoryId: null, confidence: 0 });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the suggested category when it matches a real candidate", async () => {
    createMock.mockResolvedValueOnce(toolResponse({ categoryId: "cat-1", confidence: 0.9 }));

    const result = await suggestCategory("SM Supermarket", 45000, CATEGORIES);

    expect(result).toEqual({ categoryId: "cat-1", confidence: 0.9 });
  });

  it("treats NONE as no suggestion", async () => {
    createMock.mockResolvedValueOnce(toolResponse({ categoryId: "NONE", confidence: 0.2 }));

    const result = await suggestCategory("Mystery charge", 10000, CATEGORIES);

    expect(result).toEqual({ categoryId: null, confidence: 0 });
  });

  it("ignores a hallucinated category id not in the candidate list", async () => {
    createMock.mockResolvedValueOnce(toolResponse({ categoryId: "cat-does-not-exist", confidence: 0.8 }));

    const result = await suggestCategory("Something", 10000, CATEGORIES);

    expect(result).toEqual({ categoryId: null, confidence: 0 });
  });

  it("returns null when the model returns no tool_use block", async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "unsure" }] });

    const result = await suggestCategory("Something", 10000, CATEGORIES);

    expect(result).toEqual({ categoryId: null, confidence: 0 });
  });
});
