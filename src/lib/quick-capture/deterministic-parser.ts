import type { PrismaClient } from "@prisma/client";
import { parseAmountMajorUnits } from "@/lib/quick-capture/parse-amount";
import { parseRelativeOrExplicitDate, type DateParseResult } from "@/lib/quick-capture/parse-date";
import { resolveAlias, type ResolveCandidate, type ResolveResult } from "@/lib/quick-capture/aliases";
import { resolveRecentTransactionRef } from "@/lib/quick-capture/record-refs";
import { toMinorUnits } from "@/lib/money";
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";
import type { CommandDraft, ResolvedRef, DateField, QuestionType } from "@/lib/quick-capture/types";

export type ParserContext = {
  userId: string;
  currency: string; // e.g. "PHP" — this app is single-currency-per-user (see design spec: no multi-currency)
  accounts: ResolveCandidate[];
  categories: ResolveCandidate[];
  shoppingItems: ResolveCandidate[];
  now: Date;
};

function toDateField(result: DateParseResult): DateField {
  return { value: result.value, confirmed: result.confirmed };
}

async function resolveRefOrClarify(
  prisma: Pick<PrismaClient, "alias">,
  ctx: ParserContext,
  kind: "account" | "category",
  raw: string,
): Promise<{ ref: ResolvedRef; clarification: CommandDraft["clarification"] }> {
  const candidates = kind === "account" ? ctx.accounts : ctx.categories;
  const result: ResolveResult = await resolveAlias(prisma, ctx.userId, kind, raw, candidates);

  if (result.status === "resolved") {
    return { ref: { raw, id: result.id, candidateIds: [] }, clarification: null };
  }
  if (result.status === "ambiguous") {
    const names = result.candidateIds
      .map((id) => candidates.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    return {
      ref: { raw, id: null, candidateIds: result.candidateIds },
      clarification: {
        field: kind,
        question: `Which ${kind === "account" ? "account" : "category"} did you mean: ${names.join(", ")}?`,
        options: names,
      },
    };
  }
  // unresolved — for a category this is a soft fallback (uncategorized is
  // allowed); for an account this still needs a follow-up question since
  // every money movement needs a real account.
  if (kind === "category") {
    return { ref: { raw, id: null, candidateIds: [] }, clarification: null };
  }
  return {
    ref: { raw, id: null, candidateIds: [] },
    clarification: {
      field: "account",
      question: `Which account did you use for "${raw}"?`,
    },
  };
}

// Unlike resolveRefOrClarify, an unresolved shopping item is never an
// error — ShoppingListItem.freeTextName exists exactly for "no catalog
// match yet." Only a genuine ambiguity between two or more catalog items
// asks a clarification.
async function resolveShoppingItemOrClarify(
  prisma: Pick<PrismaClient, "alias">,
  ctx: ParserContext,
  raw: string,
): Promise<{ ref: ResolvedRef; clarification: CommandDraft["clarification"] }> {
  const result: ResolveResult = await resolveAlias(prisma, ctx.userId, "shopping_item", raw, ctx.shoppingItems);

  if (result.status === "resolved") {
    return { ref: { raw, id: result.id, candidateIds: [] }, clarification: null };
  }
  if (result.status === "ambiguous") {
    const names = result.candidateIds
      .map((id) => ctx.shoppingItems.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    return {
      ref: { raw, id: null, candidateIds: result.candidateIds },
      clarification: {
        field: "item",
        question: `Which item did you mean: ${names.join(", ")}?`,
        options: names,
      },
    };
  }
  return { ref: { raw, id: null, candidateIds: [] }, clarification: null };
}

function detectCutoffOverride(text: string): "previous" | "current" | "next" | null {
  const lower = text.toLowerCase();
  if (/\b(previous|last)\s+cutoff\b/.test(lower)) return "previous";
  if (/\bnext\s+cutoff\b/.test(lower)) return "next";
  if (/\bcurrent\s+cutoff\b/.test(lower)) return "current";
  return null;
}

// Generic, question-only extraction: does any known account/category
// name appear as a substring of the clause? Prefers the longest match
// (so "BPI Savings" wins over a shorter false-positive). Unlike
// resolveRefOrClarify, this never blocks on a clarification — a
// read-only question always falls back to a sensible default instead
// of asking a follow-up, since nothing is being written.
function findMentionedRef(clause: string, candidates: ResolveCandidate[]): ResolvedRef | null {
  const lower = clause.toLowerCase();
  const matches = candidates.filter((c) => lower.includes(c.name.toLowerCase()));
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) => (b.name.length > a.name.length ? b : a));
  return { raw: best.name, id: best.id, candidateIds: [] };
}

// Splits a multi-command input like "Paid 180 food cash, 213 medicine
// cash and 703 food GCash" into independent clauses. Deliberately
// simple: split on commas and the word "and" that aren't inside a
// number (so "1,000" is never split).
export function splitClauses(text: string): string[] {
  return text
    .split(/,(?!\d)|\band\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

type ClauseParser = {
  test: (lower: string) => boolean;
  parse: (
    prisma: Pick<PrismaClient, "alias" | "transaction" | "yearPlan" | "yearPlanPhase">,
    ctx: ParserContext,
    clause: string,
  ) => Promise<CommandDraft>;
};

const QUESTION_PATTERNS: { test: RegExp; questionType: QuestionType }[] = [
  { test: /\bsafe to spend\b/, questionType: "safe_to_spend" },
  { test: /\bliquid funds\b/, questionType: "liquid_funds" },
  { test: /\bhow much .*(cash|left)\b/, questionType: "account_balance" },
  { test: /\bpay this week\b/, questionType: "due_this_week" },
  { test: /\bnext due\b/, questionType: "next_due" },
  { test: /\bupcoming\b.*\b(pay|bill)/, questionType: "upcoming_payables" },
  { test: /\btransfer\b.*\bother accounts\b/, questionType: "transfers_required" },
  { test: /\bcredit card\b.*\bdue\b/, questionType: "credit_card_due" },
  { test: /\bcredit card\b.*\bbalance\b/, questionType: "credit_card_balance" },
  { test: /\b(restricted|dedicated)\b.*\bfunds?\b/, questionType: "restricted_fund_balance" },
  { test: /\benough\b.*\bcover\b|\bcover\b.*\benough\b/, questionType: "restricted_fund_coverage" },
  { test: /\bspen(d|t|ding)\b.*\b(this cutoff|current cutoff)\b/, questionType: "spending_current_cutoff" },
  { test: /\bspen(d|t|ding)\b.*\b(last cutoff|previous cutoff)\b/, questionType: "spending_previous_cutoff" },
  { test: /\bshopping list\b/, questionType: "shopping_selected_total" },
  { test: /\bhow much\b.*\bsave\b|\bsave\b.*\bcomes? home\b/, questionType: "year_plan_recommended_saving" },
  { test: /\bspen(d|t|ding)\b.*\bon\b/, questionType: "spending_by_category" },
  { test: /\bexpected income\b/, questionType: "expected_income" },
];

const clauseParsers: ClauseParser[] = [
  // Reconciliation — "My [account] balance is X" / "[account] is at X"
  {
    test: (lower) => /\bbalance is\b/.test(lower) || /\bcurrent balance\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw = clause.replace(/\bmy\b|\bcurrent\b|\bbalance is\b.*/gi, "").trim();
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      return {
        intent: "reconciliation",
        account: ref,
        actualBalanceMinorUnits: toMinorUnits(amount, ctx.currency),
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        clauseText: clause,
        clarification,
      };
    },
  },
  // Transfer — "Transferred X from A to B"
  {
    test: (lower) => /\btransferred\b|\bmoved\b/.test(lower) && /\bfrom\b.*\bto\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const match = clause.match(/from\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i);
      const sourceRaw = match?.[1]?.trim() ?? "";
      const destRaw = match?.[2]?.trim() ?? "";
      const [source, destination] = await Promise.all([
        resolveRefOrClarify(prisma, ctx, "account", sourceRaw),
        resolveRefOrClarify(prisma, ctx, "account", destRaw),
      ]);
      return {
        intent: "transfer",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        feeMinorUnits: 0,
        sourceAccount: source.ref,
        destinationAccount: destination.ref,
        description: "Transfer",
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        cutoffOverride: detectCutoffOverride(clause),
        clauseText: clause,
        clarification: source.clarification ?? destination.clarification,
      };
    },
  },
  // Refund — "Refunded X to A"
  {
    test: (lower) => /\brefund(ed)?\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw = clause.match(/\bto\s+(.+?)(?:\.|$)/i)?.[1]?.trim() ?? "";
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      return {
        intent: "refund",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        account: ref,
        category: null,
        description: "Refund",
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        cutoffOverride: detectCutoffOverride(clause),
        clauseText: clause,
        clarification,
      };
    },
  },
  // Income — "Received X from Person in A"
  {
    test: (lower) => /\breceived\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw = clause.match(/\bin\s+(.+?)(?:\.|$)/i)?.[1]?.trim() ?? "";
      const fromMatch = clause.match(/\bfrom\s+(.+?)(?:\s+in\b|$)/i);
      const description = fromMatch ? `Received from ${fromMatch[1].trim()}` : "Income";
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      return {
        intent: "income",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        account: ref,
        category: null,
        description,
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        cutoffOverride: detectCutoffOverride(clause),
        clauseText: clause,
        clarification,
      };
    },
  },
  // Money borrowed by another person — "[Person] borrowed X from my A"
  {
    test: (lower) => /\bborrowed\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const personMatch = clause.match(/^(.+?)\s+borrowed\b/i);
      const personName = personMatch?.[1]?.trim() ?? "Someone";
      const accountRaw =
        clause.match(/\bfrom\s+(?:my\s+)?(.+?)(?:\s+(?:last|on|yesterday|today).*)?$/i)?.[1]?.trim() ?? "";
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      return {
        intent: "person_borrowed",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        account: ref,
        personName,
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        clauseText: clause,
        clarification,
      };
    },
  },
  // Payable creation — "[Name] is X due [date]" or "Add X [name] to the [cutoff] cutoff"
  {
    test: (lower) => /\bdue\b/.test(lower) || /\badd\b.*\bcutoff\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const dueMatch = clause.match(/\bdue\s+(.+?)(?:\.|$)/i);
      const dueDate = dueMatch
        ? toDateField(parseRelativeOrExplicitDate(dueMatch[1], ctx.now, "future"))
        : { value: ctx.now, confirmed: false };
      const nameMatch = clause.match(/^(?:add\s+[\d.,]+\s+)?(.+?)(?:\s+is\s+|\s+bill\b|\s+due\b)/i);
      const name = (nameMatch?.[1] ?? clause).trim();
      const cutoffSignal = detectCutoffOverride(clause);
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", name);
      return {
        intent: "payable_create",
        name,
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        dueDate,
        statementDate: null,
        account: ref,
        category: null,
        notes: null,
        cutoff: cutoffSignal === "next" ? "next" : cutoffSignal === "current" ? "current" : null,
        clauseText: clause,
        clarification,
      };
    },
  },
  // Transaction update — "Change the last X transaction to Y"
  {
    test: (lower) => /\bchange\b.*\btransaction\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause.split(/\bto\b/i).pop() ?? clause);
      const categoryRaw = clause.match(/last\s+(.+?)\s+transaction/i)?.[1]?.trim() ?? null;
      let categoryId: string | undefined;
      if (categoryRaw) {
        const categoryResolution = await resolveAlias(prisma, ctx.userId, "category", categoryRaw, ctx.categories);
        if (categoryResolution.status === "resolved") categoryId = categoryResolution.id;
      }
      const refResult = await resolveRecentTransactionRef(prisma, ctx.userId, categoryId ? { categoryId } : {});
      const target: ResolvedRef =
        refResult.status === "resolved"
          ? { raw: clause, id: refResult.id, candidateIds: [] }
          : refResult.status === "ambiguous"
            ? { raw: clause, id: null, candidateIds: refResult.candidateIds }
            : { raw: clause, id: null, candidateIds: [] };
      return {
        intent: "transaction_update",
        target,
        amountMinorUnits: amount !== null ? toMinorUnits(amount, ctx.currency) : null,
        date: null,
        description: null,
        clauseText: clause,
        clarification:
          refResult.status === "ambiguous"
            ? { field: "target", question: "Which transaction did you mean? There's more than one recent match." }
            : refResult.status === "unresolved"
              ? { field: "target", question: "I couldn't find a matching recent transaction." }
              : null,
      };
    },
  },
  // Transaction deletion — "Delete/Remove the [word] transaction..."
  {
    test: (lower) => /\b(delete|remove)\b.*\btransaction\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const keywordMatch = clause.match(/\b(?:delete|remove)\s+the\s+(.+?)\s+transaction/i);
      const search = keywordMatch?.[1]?.trim();
      const refResult = await resolveRecentTransactionRef(prisma, ctx.userId, search ? { search } : {});
      const target: ResolvedRef =
        refResult.status === "resolved"
          ? { raw: clause, id: refResult.id, candidateIds: [] }
          : refResult.status === "ambiguous"
            ? { raw: clause, id: null, candidateIds: refResult.candidateIds }
            : { raw: clause, id: null, candidateIds: [] };
      return {
        intent: "transaction_delete",
        target,
        clauseText: clause,
        clarification:
          refResult.status === "ambiguous"
            ? { field: "target", question: "Which transaction did you mean? There's more than one recent match." }
            : refResult.status === "unresolved"
              ? { field: "target", question: "I couldn't find a matching recent transaction." }
              : null,
      };
    },
  },
  // Navigation — "Show my Year Plan" / "Show the Year Plan". Never
  // confirmed through executeDraft — the panel handles this as a
  // client-side route push. Scenario-specific phrasings ("Show the
  // conservative Year Plan") are deferred until the Year Plan page itself
  // supports viewing a non-expected scenario — it has no such UI today.
  {
    test: (lower) => /\bshow\b.*\byear plan\b/.test(lower),
    parse: async (_prisma, _ctx, clause) => {
      return {
        intent: "navigate",
        route: "/year-plan",
        label: "Year Plan",
        clauseText: clause,
        clarification: null,
      };
    },
  },
  // Year Plan assumption update — "Papa will probably be home by
  // December". Resolves to whichever phase on the active plan is not a
  // HOME_PHASE_TYPES phase and covers today — the one the statement is
  // implicitly about. A phrasing like "we have three full salary cutoffs
  // left" (a count, not a date) has no single field to update and is out
  // of scope for this pass.
  {
    test: (lower) => /\b(will be home|home by|coming home)\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const dateMatch = clause.match(/\b(?:by|before)\s+(.+?)(?:\.|$)/i);
      const newEndDate = toDateField(
        parseRelativeOrExplicitDate(dateMatch?.[1] ?? clause, ctx.now, "future"),
      );

      const plan = await prisma.yearPlan.findFirst({ where: { userId: ctx.userId, scenario: "EXPECTED" } });
      const phase = plan
        ? await prisma.yearPlanPhase.findFirst({
            where: {
              yearPlanId: plan.id,
              phaseType: { notIn: HOME_PHASE_TYPES as unknown as string[] },
              startDate: { lte: ctx.now },
              endDate: { gte: ctx.now },
            },
          })
        : null;

      return {
        intent: "year_plan_update_assumption",
        phase: phase
          ? { raw: clause, id: phase.id, candidateIds: [] }
          : { raw: clause, id: null, candidateIds: [] },
        newEndDate,
        clauseText: clause,
        clarification: phase
          ? null
          : { field: "phase", question: "I couldn't find an active Year Plan phase to update." },
      };
    },
  },
  // Shopping list item selection — "Mark rice and chicken for the next
  // trip". Resolution against the CURRENT list's own items (not the full
  // catalog) can't happen here — the parser only has the full catalog
  // candidate list, not the current list's contents — so this carries the
  // raw name through unresolved; executeDraft resolves it against the
  // current list at confirm time and reports "item not found on your
  // current list" there if it doesn't match.
  {
    test: (lower) => /\bmark\b/.test(lower) && /\b(next trip|shopping list)\b/.test(lower),
    parse: async (_prisma, _ctx, clause) => {
      const nameMatch = clause.match(/\bmark\s+(.+?)\s+for\b/i);
      const itemNameRaw = (nameMatch?.[1] ?? clause).trim();
      return {
        intent: "shopping_list_select",
        item: { raw: itemNameRaw, id: null, candidateIds: [] },
        clauseText: clause,
        clarification: null,
      };
    },
  },
  // Shopping list add — "Add rice to my shopping list" (also matches a
  // bare split fragment like "milk to my shopping list" left over from a
  // multi-item clause such as "Add rice and milk to my shopping list" —
  // the shared splitter in this file splits on "and", so only the first
  // item keeps the "add ... to" framing; later items still match here
  // via the bare "X to my shopping list" fallback below).
  {
    // Excludes a question-phrased clause ("How much is my shopping
    // list?") — that falls through to the read-only question parser
    // below instead, which checks for a trailing "?" first.
    test: (lower) => /\bshopping list\b/.test(lower) && !lower.trim().endsWith("?"),
    parse: async (prisma, ctx, clause) => {
      const nameMatch = clause.match(/^(?:add\s+)?(.+?)\s+to\s+(?:my\s+)?shopping list/i);
      const itemNameRaw = (nameMatch?.[1] ?? clause).trim();
      const { ref, clarification } = await resolveShoppingItemOrClarify(prisma, ctx, itemNameRaw);
      return {
        intent: "shopping_list_add",
        item: ref,
        itemNameRaw,
        clauseText: clause,
        clarification,
      };
    },
  },
  // Shopping schedule — "Schedule grocery shopping for Saturday" / "Move
  // the shopping schedule to Sunday"
  {
    test: (lower) => /\bschedule\b/.test(lower) && /\b(shopping|grocery)\b/.test(lower),
    parse: async (_prisma, ctx, clause) => {
      const dateMatch = clause.match(/\b(?:for|to)\s+(.+?)(?:\.|$)/i);
      const date = toDateField(parseRelativeOrExplicitDate(dateMatch?.[1] ?? clause, ctx.now, "future"));
      return {
        intent: "shopping_schedule",
        date,
        clauseText: clause,
        clarification: null,
      };
    },
  },
  // Read-only question — anything ending in "?" that didn't match a
  // write-intent above.
  {
    test: (lower) => lower.trim().endsWith("?"),
    parse: async (_prisma, ctx, clause) => {
      const matched = QUESTION_PATTERNS.find((p) => p.test.test(clause.toLowerCase()));
      return {
        intent: "question",
        questionType: matched?.questionType ?? "liquid_funds",
        account: findMentionedRef(clause, ctx.accounts),
        category: findMentionedRef(clause, ctx.categories),
        clauseText: clause,
        clarification: null,
      };
    },
  },
  // Credit-card charge — mentions "credit card" explicitly with a
  // spending verb (e.g. the account name itself is "... Credit Card").
  {
    test: (lower) => /\b(paid|spent|bought)\b/.test(lower) && /\bcredit card\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw = clause.match(/\b(?:using|with|on)\s+(.+?)(?:\.|$)/i)?.[1]?.trim() ?? clause;
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      const description = clause.replace(/\b(paid|spent|bought)\b/i, "").trim();
      return {
        intent: "credit_card_charge",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        account: ref,
        category: null,
        description,
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        cutoffOverride: detectCutoffOverride(clause),
        clauseText: clause,
        clarification,
      };
    },
  },
  // Default — a plain expense: "Paid/Spent/Bought X for Y using/with/in Z"
  {
    test: () => true,
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw =
        clause.match(/\b(?:using|with|in)\s+(.+?)(?:\.|$)/i)?.[1]?.trim() ?? clause.match(/\bcash\b/i)?.[0] ?? "";
      const categoryRaw = clause.match(/\bfor\s+(.+?)(?:\s+(?:using|with|in)\b|$)/i)?.[1]?.trim() ?? null;
      const { ref: accountRef, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      let categoryRef: ResolvedRef | null = null;
      if (categoryRaw) {
        const categoryResolution = await resolveRefOrClarify(prisma, ctx, "category", categoryRaw);
        // A category that truly has no match at all (not even ambiguous)
        // silently falls back to uncategorized — no clarification needed,
        // per the "unknown category fallback" requirement. An ambiguous
        // or resolved match still carries through as a real ref.
        categoryRef =
          categoryResolution.ref.id !== null || categoryResolution.ref.candidateIds.length > 0
            ? categoryResolution.ref
            : null;
      }
      return {
        intent: "expense",
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        account: accountRef,
        category: categoryRef,
        description: categoryRaw ?? clause,
        date: toDateField(parseRelativeOrExplicitDate(clause, ctx.now)),
        cutoffOverride: detectCutoffOverride(clause),
        clauseText: clause,
        clarification,
      };
    },
  },
];

export async function parseCommand(
  prisma: Pick<PrismaClient, "alias" | "transaction" | "yearPlan" | "yearPlanPhase">,
  ctx: ParserContext,
  text: string,
): Promise<CommandDraft[]> {
  const clauses = splitClauses(text);
  const drafts: CommandDraft[] = [];
  for (const clause of clauses) {
    const lower = clause.toLowerCase();
    const matcher = clauseParsers.find((p) => p.test(lower))!;
    drafts.push(await matcher.parse(prisma, ctx, clause));
  }
  return drafts;
}
