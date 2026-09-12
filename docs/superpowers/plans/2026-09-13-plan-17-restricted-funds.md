# Restricted Funds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out restricted/dedicated funds beyond the existing bare on/off flag: a clearer account-form toggle, a dashboard grouping with obligation/projection figures, an Accounts-page tag, and the two previously-stubbed Quick Capture question types (`restricted_fund_balance`, `restricted_fund_coverage`).

**Architecture:** One new domain module, `src/lib/restricted-funds.ts`, computes per-fund obligation/projection data and is the single source both the dashboard and Quick Capture read from. Everything else is either a small reframing of an existing UI control (account form, account list) or wiring into already-existing extension points (`answer-question.ts`'s switch, `deterministic-parser.ts`'s `QUESTION_PATTERNS` array).

**Tech Stack:** TypeScript, Prisma (mocked in tests, as every file in `src/lib` already does), Vitest, existing shadcn/ui form primitives.

---

### Task 1: Export the liquid-funds exclusion list for reuse

**Files:**
- Modify: `src/lib/liquid-funds.ts`

- [ ] **Step 1: Export the constant**

In `src/lib/liquid-funds.ts`, change:

```ts
const EXCLUDED_FROM_LIQUID_FUNDS = ["CREDIT_CARD", "LOAN"];
```

to:

```ts
export const EXCLUDED_FROM_LIQUID_FUNDS = ["CREDIT_CARD", "LOAN"];
```

- [ ] **Step 2: Run the existing test file to confirm nothing broke**

Run: `npx vitest run src/lib/liquid-funds.test.ts`
Expected: PASS (both existing tests, unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/liquid-funds.ts
git commit -m "refactor(liquid-funds): export the account-type exclusion list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `listRestrictedFundGroups` domain module

**Files:**
- Create: `src/lib/restricted-funds.ts`
- Test: `src/lib/restricted-funds.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";

function makeFakePrisma(options: {
  accounts?: { id: string; name: string; openingBalance: number }[];
  payablesByAccount?: Record<string, { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[]>;
} = {}) {
  const accounts = options.accounts ?? [];
  const payablesByAccount = options.payablesByAccount ?? {};

  return {
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve(accounts.find((a) => a.id === args.where.id)),
      ),
    },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    payable: {
      findMany: vi.fn((args: { where: { accountId: string } }) =>
        Promise.resolve(payablesByAccount[args.where.accountId] ?? []),
      ),
    },
  } as any;
}

describe("listRestrictedFundGroups", () => {
  it("returns an empty array when there are no restricted accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });
    const result = await listRestrictedFundGroups(prisma, "user-1");
    expect(result).toEqual([]);
  });

  it("queries only restricted, non-debt accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 0 }] });
    await listRestrictedFundGroups(prisma, "user-1");
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        includeInLiquidFunds: false,
        accountType: { notIn: ["CREDIT_CARD", "LOAN"] },
      },
    });
  });

  it("reports zero obligation and a null nextPayable when there are no pending payables", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 50000 }],
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group).toEqual({
      accountId: "acc-1",
      accountName: "Emergency Fund",
      balance: 50000,
      obligationTotal: 0,
      nextPayable: null,
      projectedBalance: 50000,
    });
  });

  it("sums standalone (non-recurring) payables independently", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 100000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 5), recurringPayableId: null },
          { id: "p2", name: "Property tax", amount: 15000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.obligationTotal).toBe(35000);
    expect(group.nextPayable).toEqual({ name: "Property tax", amount: 15000, dueDate: new Date(2026, 9, 1) });
    expect(group.projectedBalance).toBe(65000);
  });

  it("keeps only the earliest-due payable within a shared recurringPayableId group", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 100000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "old", name: "Insurance", amount: 20000, dueDate: new Date(2026, 8, 1), recurringPayableId: "rule-1" },
          { id: "new", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 1), recurringPayableId: "rule-1" },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.obligationTotal).toBe(20000);
    expect(group.nextPayable?.dueDate).toEqual(new Date(2026, 8, 1));
  });

  it("allows projectedBalance to go negative when obligations exceed the balance", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 10000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Big bill", amount: 30000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.projectedBalance).toBe(-20000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";
import { EXCLUDED_FROM_LIQUID_FUNDS } from "@/lib/liquid-funds";

export type RestrictedFundGroup = {
  accountId: string;
  accountName: string;
  balance: number;
  obligationTotal: number;
  nextPayable: { name: string; amount: number; dueDate: Date } | null;
  projectedBalance: number;
};

type RestrictedFundsPrisma = Pick<PrismaClient, "account" | "transaction" | "payable">;

function dedupePendingPayables(
  payables: { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[],
) {
  const standalone = payables.filter((p) => p.recurringPayableId === null);
  const byRule = new Map<string, typeof payables>();
  for (const p of payables) {
    if (p.recurringPayableId === null) continue;
    const existing = byRule.get(p.recurringPayableId) ?? [];
    existing.push(p);
    byRule.set(p.recurringPayableId, existing);
  }
  const earliestPerRule = [...byRule.values()].map(
    (group) => group.reduce((earliest, p) => (p.dueDate < earliest.dueDate ? p : earliest)),
  );
  return [...standalone, ...earliestPerRule].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export async function listRestrictedFundGroups(
  prisma: RestrictedFundsPrisma,
  userId: string,
): Promise<RestrictedFundGroup[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      includeInLiquidFunds: false,
      accountType: { notIn: EXCLUDED_FROM_LIQUID_FUNDS },
    },
  });

  return Promise.all(
    accounts.map(async (account: { id: string; name: string }) => {
      const [balance, payables] = await Promise.all([
        computeAccountBalance(prisma, account.id),
        prisma.payable.findMany({ where: { accountId: account.id, status: "PENDING" } }),
      ]);

      const kept = dedupePendingPayables(
        payables as { id: string; name: string; amount: number; dueDate: Date; recurringPayableId: string | null }[],
      );
      const obligationTotal = kept.reduce((sum, p) => sum + p.amount, 0);
      const nextPayable = kept[0] ? { name: kept[0].name, amount: kept[0].amount, dueDate: kept[0].dueDate } : null;

      return {
        accountId: account.id,
        accountName: account.name,
        balance,
        obligationTotal,
        nextPayable,
        projectedBalance: balance - obligationTotal,
      };
    }),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/restricted-funds.ts src/lib/restricted-funds.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/restricted-funds.ts src/lib/restricted-funds.test.ts
git commit -m "feat(restricted-funds): add listRestrictedFundGroups domain module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `restricted_fund_balance` / `restricted_fund_coverage` into `answerQuestion`

**Files:**
- Modify: `src/lib/quick-capture/answer-question.ts`
- Modify (test): `src/lib/quick-capture/answer-question.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/quick-capture/answer-question.test.ts` (inside the existing `describe("answerQuestion", ...)` block, alongside the other cases):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts`
Expected: FAIL — the two question types still return the old canned "not available yet" message.

- [ ] **Step 3: Implement**

In `src/lib/quick-capture/answer-question.ts`, add the import:

```ts
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
```

Widen `AnswerPrisma` to also pick `"payable"` (it's already imported via `PrismaClient`, just add to the `Pick`):

```ts
type AnswerPrisma = Pick<
  PrismaClient,
  "account" | "transaction" | "budgetPeriod" | "category" | "payable" | "creditCard"
>;
```

(This type already lists `"payable"` — confirm it's present; if the file has drifted, add it. No other files need this change since `listPayables`/`listDuePayables` already required it.)

Replace the two stub cases:

```ts
    case "safe_to_spend":
      return { kind: "unavailable", message: "Safe-to-spend isn't available yet" };
    case "restricted_fund_balance":
    case "restricted_fund_coverage":
      return { kind: "unavailable", message: "Restricted funds aren't available yet" };
    case "expected_income":
      return { kind: "unavailable", message: "Expected income isn't available yet" };
```

with:

```ts
    case "safe_to_spend":
      return { kind: "unavailable", message: "Safe-to-spend isn't available yet" };

    case "restricted_fund_balance": {
      if (draft.account?.id) {
        const balance = await computeAccountBalance(prisma, draft.account.id);
        return { kind: "amount", label: draft.account.raw, amountMinorUnits: balance };
      }
      const groups = await listRestrictedFundGroups(prisma, userId);
      const total = groups.reduce((sum, g) => sum + g.balance, 0);
      return { kind: "amount", label: "Restricted funds total", amountMinorUnits: total };
    }

    case "restricted_fund_coverage": {
      const groups = await listRestrictedFundGroups(prisma, userId);
      const named = draft.account?.id ? groups.find((g) => g.accountId === draft.account?.id) : undefined;
      const fund = named ?? (groups.length === 1 ? groups[0] : undefined);

      if (!fund) {
        if (groups.length === 0) {
          return { kind: "unavailable", message: "You don't have any restricted funds set up." };
        }
        return { kind: "unavailable", message: "Which fund did you mean?" };
      }

      const balanceMajor = (fund.balance / 100).toFixed(2);
      const obligationMajor = (fund.obligationTotal / 100).toFixed(2);
      const text =
        fund.projectedBalance >= 0
          ? `Yes — ${balanceMajor} covers ${obligationMajor} in upcoming obligations (${(fund.projectedBalance / 100).toFixed(2)} left over).`
          : `No — ${balanceMajor} is short of the ${obligationMajor} upcoming obligations by ${(Math.abs(fund.projectedBalance) / 100).toFixed(2)}.`;

      return { kind: "text", label: "Restricted fund coverage", text };
    }

    case "expected_income":
      return { kind: "unavailable", message: "Expected income isn't available yet" };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts`
Expected: PASS (all existing + 8 new).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat(quick-capture): answer restricted_fund_balance and restricted_fund_coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: New Quick Capture question patterns

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify (test): `src/lib/quick-capture/deterministic-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/quick-capture/deterministic-parser.test.ts` (inside the existing `describe("parseCommand", ...)` block):

```ts
  it("recognizes a restricted-fund balance question", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "How much is in my restricted funds?");
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("restricted_fund_balance");
    }
  });

  it("recognizes a restricted-fund coverage question and resolves the named fund", async () => {
    const ctx = makeContext({
      accounts: [{ id: "acc-emergency", name: "Emergency Fund" }],
    });
    const [draft] = await parseCommand(
      makeFakePrisma(),
      ctx,
      "Is my Emergency Fund enough to cover my insurance premium?",
    );
    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("restricted_fund_coverage");
      expect(draft.account?.id).toBe("acc-emergency");
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts`
Expected: FAIL — both fall back to the default `liquid_funds` questionType (no pattern matches yet).

- [ ] **Step 3: Implement**

In `src/lib/quick-capture/deterministic-parser.ts`, add two entries to `QUESTION_PATTERNS`, before the `spending_by_category` line so nothing in their vocabulary can be shadowed:

```ts
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
  { test: /\bspen(d|t|ding)\b.*\bon\b/, questionType: "spending_by_category" },
  { test: /\bexpected income\b/, questionType: "expected_income" },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts
git commit -m "feat(quick-capture): recognize restricted-fund question phrasings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Reframe the account-form toggle

**Files:**
- Modify: `src/components/accounts/account-form-dialog.tsx`

No test file — presentational only, per this codebase's existing convention (see the plan's Tech Stack note and every prior UI-only phase).

- [ ] **Step 1: Replace the checkbox**

Replace:

```tsx
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("includeInLiquidFunds")} />
            Count toward liquid funds
          </label>
```

with:

```tsx
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!watch("includeInLiquidFunds")}
              onChange={(e) => setValue("includeInLiquidFunds", !e.target.checked)}
            />
            Restricted fund (excluded from liquid funds and safe-to-spend)
          </label>
```

`watch` and `setValue` are already destructured from `useForm()` at the top of this component (used by the `accountType` select) — no new import needed. Since the checkbox is now driven by `checked`/`onChange` instead of `register`, remove `includeInLiquidFunds` from any `register(...)` call if it still appears elsewhere in this file (it doesn't — this was its only use).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/accounts/account-form-dialog.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/accounts/account-form-dialog.tsx
git commit -m "feat(accounts): reframe the liquid-funds checkbox as a restricted-fund toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Restricted tag on the Accounts page

**Files:**
- Modify: `src/components/accounts/account-list.tsx`

- [ ] **Step 1: Add the tag**

Replace:

```tsx
            <p className="font-medium">
              {account.name}
              {account.isPrimaryFundingAccount && (
                <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
              )}
            </p>
```

with:

```tsx
            <p className="font-medium">
              {account.name}
              {account.isPrimaryFundingAccount && (
                <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
              )}
              {!account.includeInLiquidFunds && (
                <span className="ml-2 text-xs text-muted-foreground">(restricted)</span>
              )}
            </p>
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/accounts/account-list.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/accounts/account-list.tsx
git commit -m "feat(accounts): show a (restricted) tag on restricted-fund accounts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Dashboard restricted-funds section

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Fetch the data**

Add the import:

```ts
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
```

Add `listRestrictedFundGroups(prisma, user.id)` as a fourth entry in the existing `Promise.all`, destructuring a fourth variable:

```ts
  const [liquidFunds, allocations, duePayables, dueInstallments, restrictedFunds] = await Promise.all([
    computeLiquidFunds(prisma, user.id),
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listDuePayables(prisma, user.id, horizon),
    listDueInstallmentPayments(prisma, user.id, horizon),
    listRestrictedFundGroups(prisma, user.id),
  ]);
```

- [ ] **Step 2: Render the section**

Insert this new section right after the existing "Upcoming (next 7 days)" `<div>` block (before the closing `</div>` of the page's outer flex container):

```tsx
      {restrictedFunds.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted funds</h2>
          <div className="flex flex-col gap-2">
            {restrictedFunds.map((fund) => (
              <div key={fund.accountId} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{fund.accountName}</p>
                  <p className="font-medium">{formatMoney(fund.balance, user.currency)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {fund.obligationTotal > 0
                    ? `Obligation: ${formatMoney(fund.obligationTotal, user.currency)}${
                        fund.nextPayable
                          ? ` · Next: ${fund.nextPayable.name} — ${formatMoney(fund.nextPayable.amount, user.currency)} due ${fund.nextPayable.dueDate.toLocaleDateString()}`
                          : ""
                      }`
                    : "No upcoming obligations"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Projected after payment: {formatMoney(fund.projectedBalance, user.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/dashboard/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): add a restricted funds section

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (311 existing + 7 + 8 + 2 = 328 new/extended), zero regressions.

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no type errors, no new lint errors (pre-existing React-Compiler informational warnings on the three unrelated form files are fine), successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

Wait for the deployment to go live at `https://budget-tracker-maiava.vercel.app`.

- [ ] **Step 4: Manually verify on the live deployment**

Log in as the demo account (`demo@example.com` / `demopassword123`) and:
- Open an existing account (or create one) and confirm the checkbox now reads "Restricted fund (excluded from liquid funds and safe-to-spend)"; check it, save, and confirm the account disappears from `computeLiquidFunds`'s total on the dashboard's "Liquid funds" card.
- On the Accounts page, confirm that account now shows a `(restricted)` tag.
- On the Dashboard, confirm a new "Restricted funds" section appears with that account's balance; if it has no linked payables, confirm it reads "No upcoming obligations." Create a `Payable` against that account (via the Bills page) and reload — confirm "Obligation: ... · Next: ..." and "Projected after payment: ..." appear with correct figures.
- Open Quick Capture and ask "How much is in my restricted funds?" — confirm it answers with the fund's total. Ask "Is my [account name] enough to cover my bills?" — confirm a sensible yes/no coverage answer. If more than one restricted fund exists, ask the coverage question without naming one and confirm it asks "Which fund did you mean?".

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (counts), build clean, and live verification outcomes; hand off to `finishing-a-development-branch`.
