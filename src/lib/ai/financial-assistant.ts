import type { PrismaClient } from "@prisma/client";
import type { MessageParam, TextBlock, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { spendingByCategory, incomeVsExpenseByPeriod } from "@/lib/reports";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { formatMoney } from "@/lib/money";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type AssistantPrisma = Pick<
  PrismaClient,
  | "category"
  | "transaction"
  | "budgetPeriod"
  | "loan"
  | "recurringPayable"
  | "budgetAllocation"
  | "subcategory"
  | "account"
>;

// Caps how many tool round-trips one reply can take before the assistant
// just answers with whatever it has — bounds both latency and API spend
// per message, since nothing here streams progress back to the user.
const MAX_TOOL_ROUNDS = 4;

const TOOLS: Tool[] = [
  {
    name: "get_spending_by_category",
    description: "Spending by category for the user's current budget cycle.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_income_vs_expense",
    description: "Income vs. expense totals for the user's most recent budget cycles.",
    input_schema: {
      type: "object",
      properties: { cycles: { type: "number", description: "How many recent cycles to return (default 6, max 12)." } },
    },
  },
  {
    name: "get_account_balances",
    description: "Every one of the user's active accounts and its current balance.",
    input_schema: { type: "object", properties: {} },
  },
];

// Every tool here is read-only and scoped to the userId this function
// closes over — the model can pick which tools to call and with what
// arguments, but it can never supply its own userId, so it can't be
// steered (by a crafted question or otherwise) into reading anyone else's
// financial data.
async function runTool(
  prisma: AssistantPrisma,
  userId: string,
  cycleStartDay: number,
  currency: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "get_spending_by_category": {
      const period = await resolveBudgetPeriodForDate(prisma, userId, new Date(), cycleStartDay);
      const rows = await spendingByCategory(prisma, userId, period.id);
      return JSON.stringify(rows.map((r) => ({ category: r.categoryName, amount: formatMoney(r.amount, currency) })));
    }
    case "get_income_vs_expense": {
      const cycles = typeof input.cycles === "number" && input.cycles > 0 ? Math.min(Math.floor(input.cycles), 12) : 6;
      const rows = await incomeVsExpenseByPeriod(prisma, userId, cycles);
      return JSON.stringify(
        rows.map((r) => ({
          period: r.periodName,
          income: formatMoney(r.income, currency),
          expense: formatMoney(r.expense, currency),
        })),
      );
    }
    case "get_account_balances": {
      const accounts = await listAccounts(prisma, userId);
      const balances = await Promise.all(
        accounts.map(async (a: { id: string; name: string; currency: string }) => ({
          name: a.name,
          balance: formatMoney(await computeAccountBalance(prisma, a.id), a.currency),
        })),
      );
      return JSON.stringify(balances);
    }
    default:
      return JSON.stringify({ error: `Unknown tool "${name}"` });
  }
}

const SYSTEM_PROMPT = [
  "You are a financial assistant inside a personal budget tracker app.",
  "Answer questions about the user's own budget using the tools provided — never invent numbers.",
  "Be concise and specific, citing actual figures from tool results.",
  "If a question needs data no tool provides, say so plainly instead of guessing.",
].join(" ");

export async function askFinancialAssistant(
  prisma: AssistantPrisma,
  userId: string,
  cycleStartDay: number,
  currency: string,
  history: ChatMessage[],
  message: string,
): Promise<string> {
  const client = getAnthropicClient();

  const messages: MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    const toolUses = response.content.filter((block): block is ToolUseBlock => block.type === "tool_use");
    if (toolUses.length === 0) {
      const text = response.content
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return text || "I wasn't able to come up with an answer.";
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: await Promise.all(
        toolUses.map(async (toolUse) => ({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: await runTool(
            prisma,
            userId,
            cycleStartDay,
            currency,
            toolUse.name,
            (toolUse.input as Record<string, unknown>) ?? {},
          ),
        })),
      ),
    });
  }

  return "I wasn't able to finish looking that up — try asking again, or more specifically.";
}
