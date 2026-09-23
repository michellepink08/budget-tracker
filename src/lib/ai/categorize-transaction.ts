import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";

export type CategorySuggestionCandidate = { id: string; name: string };

export type CategorySuggestion = { categoryId: string | null; confidence: number };

const NONE = "NONE";

// Suggests the single best-matching category for a transaction from the
// user's own existing categories — never invents a new one. Returns
// { categoryId: null, confidence: 0 } whenever nothing fits well, so
// callers can treat "no suggestion" and "AI unavailable" the same way.
export async function suggestCategory(
  description: string,
  amountMinorUnits: number,
  categories: CategorySuggestionCandidate[],
): Promise<CategorySuggestion> {
  if (categories.length === 0) return { categoryId: null, confidence: 0 };

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 256,
    tools: [
      {
        name: "suggest_category",
        description: "Record the best-matching category id for this transaction.",
        input_schema: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: `One of the given category ids, or the literal string "${NONE}" if nothing fits well.`,
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["categoryId", "confidence"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "suggest_category" },
    messages: [
      {
        role: "user",
        content: [
          `Transaction description: "${description}"`,
          `Amount: ${(amountMinorUnits / 100).toFixed(2)}`,
          "",
          "Available categories:",
          ...categories.map((c) => `- ${c.id}: ${c.name}`),
          "",
          `Pick the single best-matching category id, or "${NONE}" if nothing fits well.`,
        ].join("\n"),
      },
    ],
  });

  const toolUse = response.content.find((block): block is ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return { categoryId: null, confidence: 0 };

  const input = toolUse.input as { categoryId?: unknown; confidence?: unknown };
  const rawId = typeof input.categoryId === "string" ? input.categoryId : NONE;
  const categoryId = rawId !== NONE && categories.some((c) => c.id === rawId) ? rawId : null;
  const confidence = typeof input.confidence === "number" ? input.confidence : 0;

  return { categoryId, confidence: categoryId ? confidence : 0 };
}
