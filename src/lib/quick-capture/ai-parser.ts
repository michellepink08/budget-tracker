import type { PrismaClient } from "@prisma/client";
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { resolveRefOrClarify, type ParserContext } from "@/lib/quick-capture/deterministic-parser";
import { parseRelativeOrExplicitDate } from "@/lib/quick-capture/parse-date";
import { toMinorUnits } from "@/lib/money";
import type { CommandDraft, ResolvedRef } from "@/lib/quick-capture/types";

const RECOGNIZED_INTENTS = ["expense", "income", "refund", "credit_card_charge"] as const;
type RecognizedIntent = (typeof RECOGNIZED_INTENTS)[number];

type ExtractedFields = {
  intent: RecognizedIntent;
  amountMajorUnits: number;
  accountRaw: string;
  categoryRaw: string | null;
  description: string;
};

async function extractFields(text: string): Promise<ExtractedFields | null> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    tools: [
      {
        name: "record_transaction",
        description: "Record the single transaction described in the user's freeform text.",
        input_schema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              enum: [...RECOGNIZED_INTENTS, "unrecognized"],
              description:
                "\"unrecognized\" if this text isn't describing exactly one expense, income, refund, or credit card charge.",
            },
            amountMajorUnits: { type: "number", description: "The amount, in major currency units (e.g. 40.50)." },
            accountRaw: {
              type: "string",
              description: "The account or payment method mentioned, verbatim (e.g. \"cash\", \"BPI\"), or \"\".",
            },
            categoryRaw: { type: "string", description: "The spending category mentioned, verbatim, or \"\"." },
            description: { type: "string", description: "A short description of the transaction." },
          },
          required: ["intent", "amountMajorUnits", "accountRaw", "categoryRaw", "description"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_transaction" },
    messages: [
      {
        role: "user",
        content: `Extract the transaction details from this text: "${text}"`,
      },
    ],
  });

  const toolUse = response.content.find((block): block is ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return null;

  const input = toolUse.input as Partial<Record<keyof ExtractedFields, unknown>> & { intent?: unknown };
  if (!RECOGNIZED_INTENTS.includes(input.intent as RecognizedIntent)) return null;
  if (typeof input.amountMajorUnits !== "number" || !(input.amountMajorUnits > 0)) return null;

  return {
    intent: input.intent as RecognizedIntent,
    amountMajorUnits: input.amountMajorUnits,
    accountRaw: typeof input.accountRaw === "string" ? input.accountRaw : "",
    categoryRaw: typeof input.categoryRaw === "string" && input.categoryRaw ? input.categoryRaw : null,
    description: typeof input.description === "string" && input.description ? input.description : text,
  };
}

// A second-opinion parse for text the deterministic parser (parseCommand)
// handled only via its generic catch-all clause — offered as an explicit
// "try with AI" alternative in the quick-capture UI, not a silent
// replacement, since the deterministic parser never actually fails (its
// last clause matches everything). Scoped to the same four expense-like
// intents that catch-all clause covers, since freeform phrasing most often
// trips up exactly those. Reuses the deterministic parser's own
// resolveRefOrClarify for account/category resolution, so an AI-produced
// draft is held to the exact same "real id or ask for clarification" rule
// as every other draft — the AI only replaces the regex extraction step.
export async function aiParseQuickCapture(
  prisma: Pick<PrismaClient, "alias">,
  ctx: ParserContext,
  text: string,
): Promise<CommandDraft | null> {
  const fields = await extractFields(text);
  if (!fields) return null;

  const { ref: account, clarification: accountClarification } = await resolveRefOrClarify(
    prisma,
    ctx,
    "account",
    fields.accountRaw,
  );

  let category: ResolvedRef | null = null;
  if (fields.categoryRaw) {
    const categoryResolution = await resolveRefOrClarify(prisma, ctx, "category", fields.categoryRaw);
    category =
      categoryResolution.ref.id !== null || categoryResolution.ref.candidateIds.length > 0
        ? categoryResolution.ref
        : null;
  }

  return {
    intent: fields.intent,
    amountMinorUnits: toMinorUnits(fields.amountMajorUnits, ctx.currency),
    account,
    category,
    description: fields.description,
    date: parseRelativeOrExplicitDate(text, ctx.now),
    cutoffOverride: null,
    clauseText: text,
    clarification: accountClarification,
  };
}
