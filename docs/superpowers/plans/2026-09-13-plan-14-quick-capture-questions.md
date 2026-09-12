# Quick Capture Read-Only Questions (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `question`-intent Quick Capture drafts actually answer (11 of 15 question types), reusing existing domain functions, with the answer computed and attached during parsing so the panel can render it immediately — no Confirm step, since nothing is written.

**Architecture:** One new module, `src/lib/quick-capture/answer-question.ts`, dispatches by `questionType` to existing domain functions. The parser gains a small, generic "does a known account/category name appear in this clause" extraction, used only for questions (never blocks on a clarification — a read-only question always has a best-effort fallback instead). The server action computes the answer inline; the panel renders it.

**Tech Stack:** No new dependencies.

---

### Task 1: Extend the question clause-parser to extract an account/category mention

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts`
Expected: FAIL — the current `question` clause parser always sets `account: null`.

- [ ] **Step 3: Add the extraction helper and wire it into the question branch**

In `src/lib/quick-capture/deterministic-parser.ts`, add near the other helpers (after `detectCutoffOverride`):

```typescript
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
```

Find the read-only question clause parser:

```typescript
  {
    test: (lower) => lower.trim().endsWith("?"),
    parse: async (_prisma, _ctx, clause) => {
      const matched = QUESTION_PATTERNS.find((p) => p.test.test(clause.toLowerCase()));
      return {
        intent: "question",
        questionType: matched?.questionType ?? "liquid_funds",
        account: null,
        category: null,
        clauseText: clause,
        clarification: null,
      };
    },
  },
```

Replace with:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts`
Expected: PASS (all existing tests plus the two new ones).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts
git commit -m "feat: extract account/category mentions in Quick Capture questions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `QuestionAnswer` type and the `answerQuestion` dispatcher

**Files:**
- Create: `src/lib/quick-capture/answer-question.ts`
- Test: `src/lib/quick-capture/answer-question.test.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/quick-capture/answer-question.ts
import type { PrismaClient } from "@prisma/client";
import { computeLiquidFunds } from "@/lib/liquid-funds";
import { computeAccountBalance } from "@/lib/account-balance";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { getCycleForDate } from "@/lib/cycle";
import { computeCategoryActual } from "@/lib/category-actual";
import { spendingByCategory } from "@/lib/reports";
import { listPayables, listDuePayables } from "@/lib/payables";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import type { QuestionDraft } from "@/lib/quick-capture/types";

export type QuestionAnswer =
  | { kind: "amount"; label: string; amountMinorUnits: number }
  | { kind: "list"; label: string; items: { label: string; amountMinorUnits: number }[] }
  | { kind: "text"; label: string; text: string }
  | { kind: "unavailable"; message: string };

type AnswerPrisma = Pick<
  PrismaClient,
  "account" | "transaction" | "budgetPeriod" | "category" | "payable" | "creditCard"
>;

async function totalExpenseForPeriod(
  prisma: Pick<PrismaClient, "transaction">,
  budgetPeriodId: string | null,
): Promise<number> {
  if (!budgetPeriodId) return 0;
  const transactions = await prisma.transaction.findMany({
    where: { budgetPeriodId, type: "EXPENSE" },
  });
  return transactions.reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
}

export async function answerQuestion(
  prisma: AnswerPrisma,
  userId: string,
  cycleStartDay: number,
  draft: QuestionDraft,
): Promise<QuestionAnswer> {
  const now = new Date();

  switch (draft.questionType) {
    case "liquid_funds":
      return { kind: "amount", label: "Liquid funds", amountMinorUnits: await computeLiquidFunds(prisma, userId) };

    case "account_balance": {
      if (draft.account?.id) {
        const balance = await computeAccountBalance(prisma, draft.account.id);
        return { kind: "amount", label: draft.account.raw, amountMinorUnits: balance };
      }
      return {
        kind: "amount",
        label: "Total money you have",
        amountMinorUnits: await computeLiquidFunds(prisma, userId),
      };
    }

    case "spending_current_cutoff": {
      const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
      return {
        kind: "amount",
        label: "Spent this cutoff",
        amountMinorUnits: await totalExpenseForPeriod(prisma, period.id),
      };
    }

    case "spending_previous_cutoff": {
      const currentCycle = getCycleForDate(cycleStartDay, now);
      const dayBefore = new Date(
        currentCycle.start.getFullYear(),
        currentCycle.start.getMonth(),
        currentCycle.start.getDate() - 1,
      );
      const previousCycle = getCycleForDate(cycleStartDay, dayBefore);
      const previousPeriod = await prisma.budgetPeriod.findUnique({
        where: { userId_startDate: { userId, startDate: previousCycle.start } },
      });
      return {
        kind: "amount",
        label: "Spent last cutoff",
        amountMinorUnits: await totalExpenseForPeriod(prisma, previousPeriod?.id ?? null),
      };
    }

    case "spending_by_category": {
      if (draft.category?.id) {
        const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
        const amount = await computeCategoryActual(prisma, period.id, draft.category.id);
        return { kind: "amount", label: draft.category.raw, amountMinorUnits: amount };
      }
      const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
      const spending = await spendingByCategory(prisma, userId, period.id);
      return {
        kind: "list",
        label: "Spending by category this cutoff",
        items: spending.map((s) => ({ label: s.categoryName, amountMinorUnits: s.amount })),
      };
    }

    case "upcoming_payables": {
      const payables = await listPayables(prisma, userId);
      return {
        kind: "list",
        label: "Upcoming payables",
        items: payables.map((p: { name: string; amount: number; dueDate: Date }) => ({
          label: `${p.name} — due ${p.dueDate.toLocaleDateString()}`,
          amountMinorUnits: p.amount,
        })),
      };
    }

    case "due_this_week": {
      const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      const payables = await listDuePayables(prisma, userId, horizon);
      return {
        kind: "list",
        label: "Due this week",
        items: payables.map((p: { name: string; amount: number; dueDate: Date }) => ({
          label: `${p.name} — due ${p.dueDate.toLocaleDateString()}`,
          amountMinorUnits: p.amount,
        })),
      };
    }

    case "next_due": {
      const payables = await listPayables(prisma, userId);
      if (payables.length === 0) return { kind: "text", label: "Next due", text: "Nothing due" };
      const next = payables[0] as { name: string; dueDate: Date };
      return { kind: "text", label: "Next due", text: `${next.name} — due ${next.dueDate.toLocaleDateString()}` };
    }

    case "transfers_required": {
      const recommendation = await getRecommendedFundingTransfer(prisma, userId, now);
      if (!recommendation) {
        return { kind: "text", label: "Transfers required", text: "No transfer needed right now" };
      }
      return {
        kind: "amount",
        label: "Recommended transfer",
        amountMinorUnits: recommendation.amount,
      };
    }

    case "credit_card_balance":
    case "credit_card_due": {
      const card = draft.account?.id
        ? await prisma.creditCard.findFirst({ where: { accountId: draft.account.id, userId } })
        : await (async () => {
            const cards = await prisma.creditCard.findMany({ where: { userId } });
            return cards.length === 1 ? cards[0] : null;
          })();

      if (!card) {
        return { kind: "unavailable", message: "Which credit card did you mean?" };
      }

      if (draft.questionType === "credit_card_balance") {
        const balance = await computeAccountBalance(prisma, card.accountId);
        return { kind: "amount", label: "Credit card balance", amountMinorUnits: balance };
      }
      return {
        kind: "text",
        label: "Credit card due date",
        text: `Due on the ${card.paymentDueDay}${card.paymentDueDay === 1 ? "st" : "th"} of each month`,
      };
    }

    case "safe_to_spend":
      return { kind: "unavailable", message: "Safe-to-spend isn't available yet" };
    case "restricted_fund_balance":
    case "restricted_fund_coverage":
      return { kind: "unavailable", message: "Restricted funds aren't available yet" };
    case "expected_income":
      return { kind: "unavailable", message: "Expected income isn't available yet" };
  }
}
```

- [ ] **Step 2: Write the tests**

```typescript
// src/lib/quick-capture/answer-question.test.ts
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
    const result = await answerQuestion(prisma, "user-1", 1, question({ questionType: "account_balance", account: null }));
    expect(result).toEqual({ kind: "amount", label: "Total money you have", amountMinorUnits: 75000 });
  });

  it("answers next_due with the earliest payable", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([{ name: "Electric bill", amount: 250000, dueDate: new Date(2026, 8, 20) }]),
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat: answer 11 of 15 Quick Capture question types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire answers into the parse action and the panel

**Files:**
- Modify: `src/lib/quick-capture/types.ts`
- Modify: `src/actions/quick-capture.actions.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

- [ ] **Step 1: Add `answer` to `QuestionDraft`**

In `src/lib/quick-capture/types.ts`, this schema stays a plain TypeScript field (not Zod-validated — `QuestionAnswer` isn't sent through user input, only ever attached server-side before the draft crosses back to the client, so it doesn't need input validation the way parsed-from-text fields do). Find:

```typescript
export const questionDraftSchema = z.object({
  intent: z.literal("question"),
  questionType: z.enum(QUESTION_TYPES),
  account: resolvedRefSchema.nullable(),
  category: resolvedRefSchema.nullable(),
  ...base,
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
```

Replace with:

```typescript
export const questionDraftSchema = z.object({
  intent: z.literal("question"),
  questionType: z.enum(QUESTION_TYPES),
  account: resolvedRefSchema.nullable(),
  category: resolvedRefSchema.nullable(),
  ...base,
});
export type QuestionDraft = z.infer<typeof questionDraftSchema> & {
  answer?: import("@/lib/quick-capture/answer-question").QuestionAnswer;
};
```

- [ ] **Step 2: Compute the answer in `parseQuickCaptureAction`**

In `src/actions/quick-capture.actions.ts`, add the import:

```typescript
import { answerQuestion } from "@/lib/quick-capture/answer-question";
```

Find:

```typescript
  const drafts = await parseCommand(
    prisma,
    {
      userId: user.id,
      currency: user.currency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      now: new Date(),
    },
    text,
  );

  return { ok: true, drafts };
```

Replace with:

```typescript
  const drafts = await parseCommand(
    prisma,
    {
      userId: user.id,
      currency: user.currency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      now: new Date(),
    },
    text,
  );

  const withAnswers = await Promise.all(
    drafts.map(async (draft) =>
      draft.intent === "question"
        ? { ...draft, answer: await answerQuestion(prisma, user.id, user.cycleStartDay, draft) }
        : draft,
    ),
  );

  return { ok: true, drafts: withAnswers };
```

- [ ] **Step 3: Render the answer in the panel**

In `src/components/quick-capture/quick-capture-panel.tsx`, find the `question` case inside `summarize`:

```typescript
    case "question":
      return "question — answering isn't available yet";
```

Replace with:

```typescript
    case "question": {
      const answer = draft.answer;
      if (!answer) return "question";
      if (answer.kind === "amount") return `${answer.label}: ${(answer.amountMinorUnits / 100).toFixed(2)}`;
      if (answer.kind === "text") return `${answer.label}: ${answer.text}`;
      if (answer.kind === "unavailable") return answer.message;
      return answer.label; // "list" kind — the item breakdown renders separately, see Step 4
      }
```

- [ ] **Step 4: Render a list-kind answer's items, and skip Confirm/Cancel for questions**

Find where preview cards render their action row:

```tsx
              {entry.status === "pending" && !entry.draft.clarification && entry.draft.intent !== "question" && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => handleConfirm(index)}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleCancel(index)}>
                    Cancel
                  </Button>
                </div>
              )}
```

This condition already excludes `question` drafts from Confirm/Cancel — no change needed there. Add a list-item breakdown right after the `<p className="mb-2">{summarize(entry.draft)}</p>` line:

```tsx
              <p className="mb-2">{summarize(entry.draft)}</p>

              {entry.draft.intent === "question" && entry.draft.answer?.kind === "list" && (
                <ul className="mb-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {entry.draft.answer.items.length === 0 && <li>Nothing to show</li>}
                  {entry.draft.answer.items.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{item.label}</span>
                      <span>{(item.amountMinorUnits / 100).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/types.ts src/actions/quick-capture.actions.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat: render Quick Capture question answers in the panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm test` — expected PASS, all existing tests plus this phase's new ones, zero regressions.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors.
Run: `npm run build` — expected clean production build.

- [ ] **Step 2: Commit if anything needed fixing**

If any of the above required a fix, commit it now before moving on.

---

### Task 5: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 4; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Manual verification against the live deployment**

Once Vercel shows the deploy "Ready," on the real production URL, open Quick Capture and try:
1. `How much is in my Everyday Checking?` (or whatever a real account is named) — confirm it answers with that specific account's balance.
2. `How much cash do I have left?` — confirm it falls back to liquid funds rather than erroring (since there's likely no account literally named "Cash").
3. `What do I need to pay this week?` — confirm it shows a list (even if empty).
4. `How much should I transfer to my other accounts?` — confirm it answers "No transfer needed right now" or a real recommendation.
5. Confirm none of these show a Confirm/Cancel button — only the answer.
