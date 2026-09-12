# Quick Capture Parser (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic natural-language command parser — text in, validated `CommandDraft[]` out. No UI, no writes to the database, no confirmation flow yet (that's Phase 2). This phase proves the hardest logic (understanding what a command means) works correctly in isolation, fully unit-tested, before anything is wired to a user-facing panel.

**Architecture:** A new `src/lib/quick-capture/` package: pure-function amount/date parsing, a small new `Alias` table + resolution function (reusing the existing `listAccounts`/`listCategories` as the fallback match target — no hardcoded alias conditionals anywhere), a record-reference resolver for "the last X transaction" style phrases (reusing the existing, already-`userId`-scoped `listTransactions`), Zod-validated draft types for all 14 intents, and a top-level `parseCommand()` that splits multi-clause input and dispatches each clause to a per-intent extractor. Every existing domain function, schema, and layering convention is left untouched — this phase is purely additive.

**Tech Stack:** Zod (already a dependency) for every draft type. No new npm packages.

---

### Task 1: Add the `Alias` table

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Add to `prisma/schema.prisma`, and add `aliases Alias[]` to `User`'s relation list:

```prisma
model Alias {
  id        String   @id @default(cuid())
  userId    String
  kind      String   // "account" | "category"
  alias     String   // normalized (trimmed, lowercased) at write time
  targetId  String   // an Account.id or Category.id, depending on kind
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, kind, alias])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds (schema-only change, no reachable database needed).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Alias model for Quick Capture account/category name matching

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Amount parsing

**Files:**
- Create: `src/lib/quick-capture/parse-amount.ts`
- Test: `src/lib/quick-capture/parse-amount.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/quick-capture/parse-amount.test.ts
import { describe, expect, it } from "vitest";
import { parseAmountMajorUnits } from "@/lib/quick-capture/parse-amount";

describe("parseAmountMajorUnits", () => {
  it("parses a plain integer", () => {
    expect(parseAmountMajorUnits("Paid 180 for food using cash")).toBe(180);
  });

  it("parses a decimal amount", () => {
    expect(parseAmountMajorUnits("My current BPI Savings balance is 166232.27")).toBeCloseTo(166232.27);
  });

  it("parses an amount with thousands separators", () => {
    expect(parseAmountMajorUnits("Transferred 1,000 from BPI to GCash")).toBe(1000);
  });

  it("parses a thousands-separated decimal amount", () => {
    expect(parseAmountMajorUnits("My current BPI Savings balance is 166,232.27")).toBeCloseTo(166232.27);
  });

  it("returns null when no amount-like number is present", () => {
    expect(parseAmountMajorUnits("How much cash do I have left?")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/parse-amount.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quick-capture/parse-amount'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/quick-capture/parse-amount.ts

// First-match heuristic: returns the first number-shaped token in the
// text, treating "," as a thousands separator. This is a known
// limitation of a first deterministic pass — a clause containing a
// digit-form date before its amount (e.g. "9/1 paid 180...") would
// misparse. None of this app's supported command phrasings hit that
// case (dates are always written as words: "yesterday", "last Saturday",
// "August 27"), so it isn't handled here.
const AMOUNT_PATTERN = /\d+(?:,\d{3})*(?:\.\d+)?/;

export function parseAmountMajorUnits(text: string): number | null {
  const match = text.match(AMOUNT_PATTERN);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/parse-amount.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/parse-amount.ts src/lib/quick-capture/parse-amount.test.ts
git commit -m "feat: add Quick Capture amount parsing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Date parsing (relative and explicit)

**Files:**
- Create: `src/lib/quick-capture/parse-date.ts`
- Test: `src/lib/quick-capture/parse-date.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/quick-capture/parse-date.test.ts
import { describe, expect, it } from "vitest";
import { parseRelativeOrExplicitDate } from "@/lib/quick-capture/parse-date";

const now = new Date(2026, 8, 13); // Sunday, September 13, 2026 (matches this project's "today")

describe("parseRelativeOrExplicitDate", () => {
  it("resolves 'today'", () => {
    const result = parseRelativeOrExplicitDate("Paid 180 for food today", now);
    expect(result.value).toEqual(new Date(2026, 8, 13));
    expect(result.confirmed).toBe(true);
  });

  it("resolves 'yesterday'", () => {
    const result = parseRelativeOrExplicitDate("Bought fruits for 300 cash yesterday", now);
    expect(result.value).toEqual(new Date(2026, 8, 12));
    expect(result.confirmed).toBe(true);
  });

  it("resolves 'last Saturday' to the most recent past Saturday", () => {
    const result = parseRelativeOrExplicitDate("paid 100 cash last saturday", now);
    // now is Sunday Sep 13 2026 — the most recent Saturday before it is Sep 12
    expect(result.value).toEqual(new Date(2026, 8, 12));
    expect(result.confirmed).toBe(true);
  });

  it("resolves an explicit month-and-day in the past this year", () => {
    const result = parseRelativeOrExplicitDate("Mama borrowed 500 from my BPI Savings last August 27", now);
    expect(result.value).toEqual(new Date(2026, 7, 27));
    expect(result.confirmed).toBe(true);
  });

  it("(past direction, default) rolls a future-seeming month-day back to last year — correct for a transaction date, which is never in the future", () => {
    const result = parseRelativeOrExplicitDate("paid 100 cash October 5", now);
    expect(result.value).toEqual(new Date(2025, 9, 5));
    expect(result.confirmed).toBe(true);
  });

  it("(future direction) keeps a not-yet-passed month-day in the current year — correct for a due date", () => {
    const result = parseRelativeOrExplicitDate("BPI credit card is 25389.83 due December 5", now, "future");
    expect(result.value).toEqual(new Date(2026, 11, 5));
    expect(result.confirmed).toBe(true);
  });

  it("(future direction) rolls an already-passed month-day forward to next year — correct for a due date", () => {
    const result = parseRelativeOrExplicitDate("due January 5", now, "future");
    expect(result.value).toEqual(new Date(2027, 0, 5));
    expect(result.confirmed).toBe(true);
  });

  it("marks an approximated date as unconfirmed", () => {
    const result = parseRelativeOrExplicitDate("due around October 5", now, "future");
    expect(result.value).toEqual(new Date(2026, 9, 5));
    expect(result.confirmed).toBe(false);
  });

  it("defaults to today, unconfirmed, when no date phrase is present", () => {
    const result = parseRelativeOrExplicitDate("Paid 180 for food using cash", now);
    expect(result.value).toEqual(new Date(2026, 8, 13));
    expect(result.confirmed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/parse-date.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/quick-capture/parse-date.ts

export type DateParseResult = { value: Date; confirmed: boolean };

// "past" resolves a month-day mention to the most recent occurrence that
// isn't in the future (correct for transaction dates — a transaction is
// never dated in the future). "future" resolves to the nearest
// not-yet-passed occurrence (correct for due dates — a payable's due
// date usually hasn't happened yet).
export type DateDirection = "past" | "future";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mostRecentPastWeekday(now: Date, targetDow: number): Date {
  const diff = (now.getDay() - targetDow + 7) % 7 || 7;
  return startOfDay(addDays(now, -diff));
}

function resolveMonthDay(now: Date, monthIndex: number, day: number, direction: DateDirection): Date {
  const today = startOfDay(now);
  const candidate = new Date(now.getFullYear(), monthIndex, day);

  if (direction === "past" && candidate > today) {
    candidate.setFullYear(candidate.getFullYear() - 1);
  } else if (direction === "future" && candidate < today) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }

  return startOfDay(candidate);
}

export function parseRelativeOrExplicitDate(
  text: string,
  now: Date,
  direction: DateDirection = "past",
): DateParseResult {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return { value: startOfDay(now), confirmed: true };
  }
  if (/\byesterday\b/.test(lower)) {
    return { value: startOfDay(addDays(now, -1)), confirmed: true };
  }

  // "last <weekday>" is always a past reference, regardless of direction
  // — none of this app's supported commands phrase a due date that way.
  const weekdayMatch = lower.match(new RegExp(`\\blast\\s+(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const targetDow = WEEKDAYS.indexOf(weekdayMatch[1]);
    return { value: mostRecentPastWeekday(now, targetDow), confirmed: true };
  }

  const monthDayMatch = lower.match(
    new RegExp(`\\b(?:last\\s+)?(${MONTHS.join("|")})\\s+(\\d{1,2})\\b`),
  );
  if (monthDayMatch) {
    const monthIndex = MONTHS.indexOf(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    const approximate = /\b(around|approximately|roughly|about)\b/.test(lower);
    return {
      value: resolveMonthDay(now, monthIndex, day, direction),
      confirmed: !approximate,
    };
  }

  // No date phrase found at all — assume today, but mark it unconfirmed
  // so the confirmation UI (Phase 2) can visibly flag the assumption.
  return { value: startOfDay(now), confirmed: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/parse-date.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/parse-date.ts src/lib/quick-capture/parse-date.test.ts
git commit -m "feat: add Quick Capture relative/explicit date parsing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `CommandDraft` Zod types

**Files:**
- Create: `src/lib/quick-capture/types.ts`
- Test: `src/lib/quick-capture/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/quick-capture/types.test.ts
import { describe, expect, it } from "vitest";
import { expenseLikeDraftSchema, transferDraftSchema } from "@/lib/quick-capture/types";

describe("expenseLikeDraftSchema", () => {
  it("accepts a valid expense draft", () => {
    const result = expenseLikeDraftSchema.safeParse({
      intent: "expense",
      amountMinorUnits: 18000,
      account: { raw: "cash", id: "acc-1", candidateIds: [] },
      category: { raw: "food", id: "cat-1", candidateIds: [] },
      description: "food",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "Paid 180 for food using cash",
      clarification: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive amount", () => {
    const result = expenseLikeDraftSchema.safeParse({
      intent: "expense",
      amountMinorUnits: 0,
      account: { raw: "cash", id: "acc-1", candidateIds: [] },
      category: null,
      description: "food",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("transferDraftSchema", () => {
  it("accepts a valid transfer draft with a zero fee", () => {
    const result = transferDraftSchema.safeParse({
      intent: "transfer",
      amountMinorUnits: 100000,
      feeMinorUnits: 0,
      sourceAccount: { raw: "bpi", id: "acc-1", candidateIds: [] },
      destinationAccount: { raw: "gcash", id: "acc-2", candidateIds: [] },
      description: "Transfer",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "Transferred 1,000 from BPI to GCash",
      clarification: null,
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/quick-capture/types.ts
import { z } from "zod";

export const QUICK_CAPTURE_INTENTS = [
  "expense",
  "income",
  "refund",
  "credit_card_charge",
  "transfer",
  "credit_card_payment",
  "loan_payment",
  "person_borrowed",
  "reconciliation",
  "payable_create",
  "payable_update",
  "transaction_update",
  "transaction_delete",
  "question",
] as const;
export type QuickCaptureIntent = (typeof QUICK_CAPTURE_INTENTS)[number];

export const QUESTION_TYPES = [
  "account_balance",
  "liquid_funds",
  "safe_to_spend",
  "spending_by_category",
  "spending_current_cutoff",
  "spending_previous_cutoff",
  "upcoming_payables",
  "due_this_week",
  "next_due",
  "transfers_required",
  "credit_card_balance",
  "credit_card_due",
  "restricted_fund_balance",
  "restricted_fund_coverage",
  "expected_income",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// A reference to an account/category/existing-record as understood from
// text: resolved to a real id, ambiguous (more than one candidate, needs
// clarification), or unresolved (no match at all).
export const resolvedRefSchema = z.object({
  raw: z.string(),
  id: z.string().nullable(),
  candidateIds: z.array(z.string()).default([]),
});
export type ResolvedRef = z.infer<typeof resolvedRefSchema>;

export const dateFieldSchema = z.object({
  value: z.date(),
  confirmed: z.boolean(),
});
export type DateField = z.infer<typeof dateFieldSchema>;

const clarificationSchema = z
  .object({
    field: z.string(),
    question: z.string(),
    options: z.array(z.string()).optional(),
  })
  .nullable();
export type Clarification = z.infer<typeof clarificationSchema>;

// Every draft carries the exact clause it came from (for the preview
// card and for Undo/audit) and an optional single clarification request
// — never more than one at a time, per the design spec.
const base = {
  clauseText: z.string(),
  clarification: clarificationSchema.default(null),
};

// A raw cutoff signal from the command text, not yet resolved to an
// actual BudgetPeriod id — resolving/creating that period happens at
// confirm-time (Phase 2), reusing createExpenseLikeTransaction's
// existing manual-override support.
const cutoffOverrideSchema = z.enum(["previous", "current", "next"]).nullable();

export const expenseLikeDraftSchema = z.object({
  intent: z.enum(["expense", "income", "refund", "credit_card_charge"]),
  amountMinorUnits: z.number().int().positive(),
  account: resolvedRefSchema,
  category: resolvedRefSchema.nullable(),
  description: z.string(),
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type ExpenseLikeDraft = z.infer<typeof expenseLikeDraftSchema>;

export const transferDraftSchema = z.object({
  intent: z.literal("transfer"),
  amountMinorUnits: z.number().int().positive(),
  feeMinorUnits: z.number().int().nonnegative(),
  sourceAccount: resolvedRefSchema,
  destinationAccount: resolvedRefSchema,
  description: z.string(),
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type TransferDraft = z.infer<typeof transferDraftSchema>;

export const creditCardPaymentDraftSchema = z.object({
  intent: z.literal("credit_card_payment"),
  amountMinorUnits: z.number().int().positive(),
  payingAccount: resolvedRefSchema,
  creditCardAccount: resolvedRefSchema,
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type CreditCardPaymentDraft = z.infer<typeof creditCardPaymentDraftSchema>;

export const loanPaymentDraftSchema = z.object({
  intent: z.literal("loan_payment"),
  amountMinorUnits: z.number().int().positive(),
  payingAccount: resolvedRefSchema,
  loan: resolvedRefSchema,
  date: dateFieldSchema,
  cutoffOverride: cutoffOverrideSchema,
  ...base,
});
export type LoanPaymentDraft = z.infer<typeof loanPaymentDraftSchema>;

export const personBorrowedDraftSchema = z.object({
  intent: z.literal("person_borrowed"),
  amountMinorUnits: z.number().int().positive(),
  account: resolvedRefSchema,
  personName: z.string(),
  date: dateFieldSchema,
  ...base,
});
export type PersonBorrowedDraft = z.infer<typeof personBorrowedDraftSchema>;

export const reconciliationDraftSchema = z.object({
  intent: z.literal("reconciliation"),
  account: resolvedRefSchema,
  actualBalanceMinorUnits: z.number().int(),
  date: dateFieldSchema,
  ...base,
});
export type ReconciliationDraft = z.infer<typeof reconciliationDraftSchema>;

export const payableCreateDraftSchema = z.object({
  intent: z.literal("payable_create"),
  name: z.string(),
  amountMinorUnits: z.number().int().positive(),
  dueDate: dateFieldSchema,
  statementDate: dateFieldSchema.nullable(),
  account: resolvedRefSchema,
  category: resolvedRefSchema.nullable(),
  notes: z.string().nullable(),
  cutoff: z.enum(["current", "next"]).nullable(),
  ...base,
});
export type PayableCreateDraft = z.infer<typeof payableCreateDraftSchema>;

export const payableUpdateDraftSchema = z.object({
  intent: z.literal("payable_update"),
  target: resolvedRefSchema,
  amountMinorUnits: z.number().int().positive().nullable(),
  dueDate: dateFieldSchema.nullable(),
  notes: z.string().nullable(),
  notesRemove: z.boolean().default(false),
  ...base,
});
export type PayableUpdateDraft = z.infer<typeof payableUpdateDraftSchema>;

export const transactionUpdateDraftSchema = z.object({
  intent: z.literal("transaction_update"),
  target: resolvedRefSchema,
  amountMinorUnits: z.number().int().positive().nullable(),
  date: dateFieldSchema.nullable(),
  description: z.string().nullable(),
  ...base,
});
export type TransactionUpdateDraft = z.infer<typeof transactionUpdateDraftSchema>;

export const transactionDeleteDraftSchema = z.object({
  intent: z.literal("transaction_delete"),
  target: resolvedRefSchema,
  ...base,
});
export type TransactionDeleteDraft = z.infer<typeof transactionDeleteDraftSchema>;

export const questionDraftSchema = z.object({
  intent: z.literal("question"),
  questionType: z.enum(QUESTION_TYPES),
  account: resolvedRefSchema.nullable(),
  category: resolvedRefSchema.nullable(),
  ...base,
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export type CommandDraft =
  | ExpenseLikeDraft
  | TransferDraft
  | CreditCardPaymentDraft
  | LoanPaymentDraft
  | PersonBorrowedDraft
  | ReconciliationDraft
  | PayableCreateDraft
  | PayableUpdateDraft
  | TransactionUpdateDraft
  | TransactionDeleteDraft
  | QuestionDraft;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/types.ts src/lib/quick-capture/types.test.ts
git commit -m "feat: add CommandDraft Zod types for all Quick Capture intents

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Alias resolution

**Files:**
- Create: `src/lib/quick-capture/aliases.ts`
- Test: `src/lib/quick-capture/aliases.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/quick-capture/aliases.test.ts
import { describe, expect, it, vi } from "vitest";
import { createAlias, resolveAlias } from "@/lib/quick-capture/aliases";

function makeFakePrisma(aliasRow: unknown = null) {
  return {
    alias: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(aliasRow),
    },
  } as any;
}

describe("createAlias", () => {
  it("upserts a normalized alias row", async () => {
    const prisma = makeFakePrisma();
    await createAlias(prisma, "user-1", { kind: "account", alias: "  BPI  ", targetId: "acc-1" });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "account", alias: "bpi" } },
      update: { targetId: "acc-1" },
      create: { userId: "user-1", kind: "account", alias: "bpi", targetId: "acc-1" },
    });
  });
});

describe("resolveAlias", () => {
  it("resolves via a stored alias row first", async () => {
    const prisma = makeFakePrisma({ targetId: "acc-1" });
    const result = await resolveAlias(prisma, "user-1", "account", "BPI", []);
    expect(result).toEqual({ status: "resolved", id: "acc-1" });
  });

  it("resolves via an exact name match when no alias row exists", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "GCash", [
      { id: "acc-2", name: "GCash" },
    ]);
    expect(result).toEqual({ status: "resolved", id: "acc-2" });
  });

  it("resolves via a unique partial name match", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "bpi", [
      { id: "acc-1", name: "BPI Savings" },
      { id: "acc-2", name: "GCash" },
    ]);
    expect(result).toEqual({ status: "resolved", id: "acc-1" });
  });

  it("reports ambiguous when multiple names partially match", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "bpi", [
      { id: "acc-1", name: "BPI Savings" },
      { id: "acc-2", name: "BPI Checking" },
    ]);
    expect(result).toEqual({ status: "ambiguous", candidateIds: ["acc-1", "acc-2"] });
  });

  it("reports unresolved when nothing matches", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "category", "spelunking", [
      { id: "cat-1", name: "Food" },
    ]);
    expect(result).toEqual({ status: "unresolved" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/aliases.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/quick-capture/aliases.ts
import type { PrismaClient } from "@prisma/client";

export type AliasKind = "account" | "category";

export type AliasInput = { kind: AliasKind; alias: string; targetId: string };

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// Aliases are data-driven, per-user rows — never hardcoded conditionals
// in the parser or UI. This is the one place alias rows are written;
// there's no configuration UI yet (a later phase), but this function is
// what such a UI would call.
export async function createAlias(
  prisma: Pick<PrismaClient, "alias">,
  userId: string,
  input: AliasInput,
) {
  const alias = normalize(input.alias);
  return prisma.alias.upsert({
    where: { userId_kind_alias: { userId, kind: input.kind, alias } },
    update: { targetId: input.targetId },
    create: { userId, kind: input.kind, alias, targetId: input.targetId },
  });
}

export type ResolveCandidate = { id: string; name: string };

export type ResolveResult =
  | { status: "resolved"; id: string }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "unresolved" };

// Resolves a raw piece of text (e.g. "bpi", "transpo") against the
// user's own stored aliases first, then falls back to matching the real
// account/category names directly — so aliases are an optional
// shortcut, never the only way to refer to something that already has a
// perfectly good name.
export async function resolveAlias(
  prisma: Pick<PrismaClient, "alias">,
  userId: string,
  kind: AliasKind,
  raw: string,
  candidates: ResolveCandidate[],
): Promise<ResolveResult> {
  const normalized = normalize(raw);

  const aliasRow = await prisma.alias.findUnique({
    where: { userId_kind_alias: { userId, kind, alias: normalized } },
  });
  if (aliasRow) {
    return { status: "resolved", id: (aliasRow as { targetId: string }).targetId };
  }

  const exact = candidates.filter((c) => normalize(c.name) === normalized);
  if (exact.length === 1) return { status: "resolved", id: exact[0].id };

  const partial = candidates.filter(
    (c) => normalize(c.name).includes(normalized) || normalized.includes(normalize(c.name)),
  );
  if (partial.length === 1) return { status: "resolved", id: partial[0].id };
  if (partial.length > 1) return { status: "ambiguous", candidateIds: partial.map((c) => c.id) };

  return { status: "unresolved" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/aliases.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/aliases.ts src/lib/quick-capture/aliases.test.ts
git commit -m "feat: add Quick Capture alias resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Resolving references to existing transactions

**Files:**
- Create: `src/lib/quick-capture/record-refs.ts`
- Test: `src/lib/quick-capture/record-refs.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/quick-capture/record-refs.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveRecentTransactionRef } from "@/lib/quick-capture/record-refs";

function makeFakePrisma(transactions: unknown[]) {
  return {
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  } as any;
}

describe("resolveRecentTransactionRef", () => {
  it("resolves to the single most recent match for a narrowing filter", async () => {
    const prisma = makeFakePrisma([{ id: "txn-2" }, { id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", { categoryId: "cat-transport" });
    expect(result).toEqual({ status: "resolved", id: "txn-2" });
  });

  it("reports unresolved when nothing matches", async () => {
    const prisma = makeFakePrisma([]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", { search: "water" });
    expect(result).toEqual({ status: "unresolved" });
  });

  it("reports ambiguous when the reference has no narrowing filter and more than one recent transaction exists", async () => {
    const prisma = makeFakePrisma([{ id: "txn-3" }, { id: "txn-2" }, { id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", {});
    expect(result).toEqual({ status: "ambiguous", candidateIds: ["txn-3", "txn-2", "txn-1"] });
  });

  it("resolves a single unnarrowed match without asking for clarification", async () => {
    const prisma = makeFakePrisma([{ id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", {});
    expect(result).toEqual({ status: "resolved", id: "txn-1" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/record-refs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/quick-capture/record-refs.ts
import type { PrismaClient } from "@prisma/client";
import { listTransactions, type TransactionFilters } from "@/lib/transactions";

export type RecordRefResult =
  | { status: "resolved"; id: string }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "unresolved" };

// Resolves phrases like "the last transportation transaction" (a
// category-narrowed reference) or "the water transaction I just added"
// (a description-keyword reference) to one specific Transaction row,
// scoped to the user via the existing (already userId-scoped)
// listTransactions. "Last"/"most recent" only ever means "most recent
// among whatever narrowed the search" — never a bare guess. If the
// reference has no narrowing filter at all (categoryId/search both
// absent) and more than one candidate exists, this reports ambiguous
// rather than silently picking the single most recent transaction of
// any kind — per the design spec's explicit rule against that.
export async function resolveRecentTransactionRef(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
): Promise<RecordRefResult> {
  const candidates = await listTransactions(prisma, userId, filters);

  if (candidates.length === 0) return { status: "unresolved" };

  const hasNarrowingFilter = Boolean(filters.categoryId || filters.search || filters.accountId);
  if (!hasNarrowingFilter && candidates.length > 1) {
    return { status: "ambiguous", candidateIds: candidates.map((c: { id: string }) => c.id) };
  }

  // listTransactions orders by date desc — the first row is the most
  // recent match.
  return { status: "resolved", id: (candidates[0] as { id: string }).id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/record-refs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/record-refs.ts src/lib/quick-capture/record-refs.test.ts
git commit -m "feat: add Quick Capture recent-transaction reference resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: The deterministic parser

This is the core of Phase 1 — it ties Tasks 2–6 together into `parseCommand()`, the single entry point the rest of the app will call.

**Files:**
- Create: `src/lib/quick-capture/deterministic-parser.ts`
- Test: `src/lib/quick-capture/deterministic-parser.test.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/quick-capture/deterministic-parser.ts
import type { PrismaClient } from "@prisma/client";
import { parseAmountMajorUnits } from "@/lib/quick-capture/parse-amount";
import { parseRelativeOrExplicitDate, type DateParseResult } from "@/lib/quick-capture/parse-date";
import { resolveAlias, type ResolveCandidate, type ResolveResult } from "@/lib/quick-capture/aliases";
import { resolveRecentTransactionRef } from "@/lib/quick-capture/record-refs";
import { toMinorUnits } from "@/lib/money";
import type {
  CommandDraft,
  ResolvedRef,
  DateField,
} from "@/lib/quick-capture/types";

export type ParserContext = {
  userId: string;
  currency: string; // e.g. "PHP" — this app is single-currency-per-user (see design spec: no multi-currency)
  accounts: ResolveCandidate[];
  categories: ResolveCandidate[];
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

function detectCutoffOverride(text: string): "previous" | "current" | "next" | null {
  const lower = text.toLowerCase();
  if (/\b(previous|last)\s+cutoff\b/.test(lower)) return "previous";
  if (/\bnext\s+cutoff\b/.test(lower)) return "next";
  if (/\bcurrent\s+cutoff\b/.test(lower)) return "current";
  return null;
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
    prisma: Pick<PrismaClient, "alias" | "transaction">,
    ctx: ParserContext,
    clause: string,
  ) => Promise<CommandDraft>;
};

const QUESTION_PATTERNS: { test: RegExp; questionType: import("@/lib/quick-capture/types").QuestionType }[] = [
  { test: /\bsafe to spend\b/, questionType: "safe_to_spend" },
  { test: /\bliquid funds\b/, questionType: "liquid_funds" },
  { test: /\bhow much .*(cash|left)\b/, questionType: "account_balance" },
  { test: /\bpay this week\b/, questionType: "due_this_week" },
  { test: /\bnext due\b/, questionType: "next_due" },
  { test: /\bupcoming\b.*\b(pay|bill)/, questionType: "upcoming_payables" },
  { test: /\btransfer\b.*\bother accounts\b/, questionType: "transfers_required" },
  { test: /\bcredit card\b.*\bdue\b/, questionType: "credit_card_due" },
  { test: /\bcredit card\b.*\bbalance\b/, questionType: "credit_card_balance" },
  { test: /\bspen(d|t|ding)\b.*\b(this cutoff|current cutoff)\b/, questionType: "spending_current_cutoff" },
  { test: /\bspen(d|t|ding)\b.*\b(last cutoff|previous cutoff)\b/, questionType: "spending_previous_cutoff" },
  { test: /\bspen(d|t|ding)\b.*\bon\b/, questionType: "spending_by_category" },
  { test: /\bexpected income\b/, questionType: "expected_income" },
];

const clauseParsers: ClauseParser[] = [
  // Reconciliation — "My [account] balance is X" / "[account] is at X"
  {
    test: (lower) => /\bbalance is\b/.test(lower) || /\bcurrent balance\b/.test(lower),
    parse: async (prisma, ctx, clause) => {
      const amount = parseAmountMajorUnits(clause) ?? 0;
      const accountRaw = clause.replace(/\bmy\b|\bcurrent\b|\bbalance is\b.*/i, "").trim();
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
      const accountRaw = clause.match(/\bfrom\s+(?:my\s+)?(.+?)(?:\s+(?:last|on|yesterday|today).*)?$/i)?.[1]?.trim() ?? "";
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
      const accountRaw = name;
      const { ref, clarification } = await resolveRefOrClarify(prisma, ctx, "account", accountRaw);
      return {
        intent: "payable_create",
        name,
        amountMinorUnits: toMinorUnits(amount, ctx.currency),
        dueDate,
        statementDate: null,
        account: ref,
        category: null,
        notes: null,
        cutoff: detectCutoffOverride(clause) === "next" ? "next" : detectCutoffOverride(clause) === "current" ? "current" : null,
        clauseText: clause,
        clarification,
      };
    },
  },
  // Transaction update — "Change the last X transaction to Y" / "Remove the [word] note from [target]"
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
  // Read-only question — anything ending in "?" that didn't match a
  // write-intent above.
  {
    test: (lower) => lower.trim().endsWith("?"),
    parse: async (_prisma, ctx, clause) => {
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
  // Credit-card charge — mentions a known credit-card account explicitly
  // by name/alias resolving to one, with a spending verb.
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
      const accountRaw = clause.match(/\b(?:using|with|in)\s+(.+?)(?:\.|$)/i)?.[1]?.trim()
        ?? clause.match(/\bcash\b/i)?.[0]
        ?? "";
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
  prisma: Pick<PrismaClient, "alias" | "transaction">,
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
```

- [ ] **Step 2: Write the required test scenarios**

```typescript
// src/lib/quick-capture/deterministic-parser.test.ts
import { describe, expect, it, vi } from "vitest";
import { parseCommand, splitClauses, type ParserContext } from "@/lib/quick-capture/deterministic-parser";

const now = new Date(2026, 8, 13);

function makeContext(overrides: Partial<ParserContext> = {}): ParserContext {
  return {
    userId: "user-1",
    currency: "PHP",
    now,
    accounts: [
      { id: "acc-cash", name: "Cash" },
      { id: "acc-bpi", name: "BPI Savings" },
      { id: "acc-gcash", name: "GCash" },
      { id: "acc-maya-cc", name: "Maya Credit Card" },
    ],
    categories: [
      { id: "cat-food", name: "Food" },
      { id: "cat-transport", name: "Transportation" },
      { id: "cat-health", name: "Health" },
    ],
    ...overrides,
  };
}

function makeFakePrisma(transactions: unknown[] = []) {
  return {
    alias: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
  } as any;
}

describe("parseCommand", () => {
  it("parses one simple expense", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 180 for food using cash");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.amountMinorUnits).toBe(18000);
      expect(draft.account.id).toBe("acc-cash");
      expect(draft.category?.id).toBe("cat-food");
    }
  });

  it("parses multiple expenses in one command", async () => {
    const drafts = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 213 for medicine in cash and 703 for food using GCash",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].intent).toBe("expense");
    expect(drafts[1].intent).toBe("expense");
    if (drafts[1].intent === "expense") {
      expect(drafts[1].amountMinorUnits).toBe(70300);
      expect(drafts[1].account.id).toBe("acc-gcash");
    }
  });

  it("parses income", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Received 5,000 from Rei in BPI Savings");
    expect(draft.intent).toBe("income");
    if (draft.intent === "income") {
      expect(draft.amountMinorUnits).toBe(500000);
      expect(draft.account.id).toBe("acc-bpi");
      expect(draft.description).toContain("Rei");
    }
  });

  it("parses a refund", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Refunded 86 to GCash");
    expect(draft.intent).toBe("refund");
    if (draft.intent === "refund") {
      expect(draft.amountMinorUnits).toBe(8600);
      expect(draft.account.id).toBe("acc-gcash");
    }
  });

  it("parses a transfer", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Transferred 1,000 from BPI Savings to GCash");
    expect(draft.intent).toBe("transfer");
    if (draft.intent === "transfer") {
      expect(draft.amountMinorUnits).toBe(100000);
      expect(draft.sourceAccount.id).toBe("acc-bpi");
      expect(draft.destinationAccount.id).toBe("acc-gcash");
      expect(draft.feeMinorUnits).toBe(0);
    }
  });

  it("parses a transfer with a fee mentioned separately as a second clause", async () => {
    const drafts = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Transferred 1,000 from BPI Savings to GCash and paid 15 for food using cash",
    );
    expect(drafts[0].intent).toBe("transfer");
    expect(drafts[1].intent).toBe("expense");
  });

  it("parses a credit-card charge", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 500 groceries using Maya Credit Card",
    );
    expect(draft.intent).toBe("credit_card_charge");
    if (draft.intent === "credit_card_charge") {
      expect(draft.account.id).toBe("acc-maya-cc");
    }
  });

  it("parses a relative date", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Bought fruits for 300 cash yesterday");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.date.value).toEqual(new Date(2026, 8, 12));
      expect(draft.date.confirmed).toBe(true);
    }
  });

  it("recognizes a manual cutoff override", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "Paid 180 for food using cash for the previous cutoff",
    );
    if (draft.intent === "expense") {
      expect(draft.cutoffOverride).toBe("previous");
    }
  });

  it("parses a balance reconciliation", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "My current BPI Savings balance is 166,232.27",
    );
    expect(draft.intent).toBe("reconciliation");
    if (draft.intent === "reconciliation") {
      expect(draft.actualBalanceMinorUnits).toBe(16623227);
      expect(draft.account.id).toBe("acc-bpi");
    }
  });

  it("parses a payable with a confirmed due date", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "BPI credit card is 25,389.83 due October 5",
    );
    expect(draft.intent).toBe("payable_create");
    if (draft.intent === "payable_create") {
      expect(draft.amountMinorUnits).toBe(2538983);
      expect(draft.dueDate.confirmed).toBe(true);
    }
  });

  it("parses a payable with an estimated due date", async () => {
    const [draft] = await parseCommand(
      makeFakePrisma(),
      makeContext(),
      "EastWest hospital bill is 15,519.14 due around October 5",
    );
    expect(draft.intent).toBe("payable_create");
    if (draft.intent === "payable_create") {
      expect(draft.dueDate.confirmed).toBe(false);
    }
  });

  it("resolves updating a recent transaction", async () => {
    const prisma = makeFakePrisma([{ id: "txn-transport-1" }]);
    const [draft] = await parseCommand(prisma, makeContext(), "Change the last transportation transaction to 250 total");
    expect(draft.intent).toBe("transaction_update");
    if (draft.intent === "transaction_update") {
      expect(draft.target.id).toBe("txn-transport-1");
      expect(draft.amountMinorUnits).toBe(25000);
    }
  });

  it("resolves deleting a recent transaction", async () => {
    const prisma = makeFakePrisma([{ id: "txn-water-1" }]);
    const [draft] = await parseCommand(prisma, makeContext(), "Delete the water transaction I just added");
    expect(draft.intent).toBe("transaction_delete");
    if (draft.intent === "transaction_delete") {
      expect(draft.target.id).toBe("txn-water-1");
    }
  });

  it("asks for clarification when an account reference is ambiguous", async () => {
    const ctx = makeContext({
      accounts: [
        { id: "acc-bpi-savings", name: "BPI Savings" },
        { id: "acc-bpi-checking", name: "BPI Checking" },
      ],
    });
    const [draft] = await parseCommand(makeFakePrisma(), ctx, "Paid 180 for food using BPI");
    expect(draft.clarification).not.toBeNull();
    if (draft.intent === "expense") {
      expect(draft.account.candidateIds).toEqual(["acc-bpi-savings", "acc-bpi-checking"]);
    }
  });

  it("falls back gracefully when the category is unknown", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 180 for spelunking using cash");
    expect(draft.intent).toBe("expense");
    if (draft.intent === "expense") {
      expect(draft.category).toBeNull();
      expect(draft.clarification).toBeNull(); // an unknown category is not blocking, unlike an unknown account
    }
  });

  it("converts and rounds minor units correctly", async () => {
    const [draft] = await parseCommand(makeFakePrisma(), makeContext(), "Paid 19.999 for food using cash");
    if (draft.intent === "expense") {
      expect(draft.amountMinorUnits).toBe(2000); // 19.999 * 100 rounds to 2000
    }
  });

  it("scopes reference resolution to the given userId, never trusting anything else", async () => {
    const prisma = makeFakePrisma([{ id: "txn-1" }]);
    await parseCommand(prisma, makeContext({ userId: "user-42" }), "Delete the water transaction I just added");
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-42" }) }),
    );
  });
});

describe("splitClauses", () => {
  it("does not split a thousands-separated number", () => {
    expect(splitClauses("Transferred 1,000 from BPI to GCash")).toEqual([
      "Transferred 1,000 from BPI to GCash",
    ]);
  });

  it("splits on comma and 'and'", () => {
    expect(splitClauses("Paid 180 food cash, 213 medicine cash and 703 food GCash")).toEqual([
      "Paid 180 food cash",
      "213 medicine cash",
      "703 food GCash",
    ]);
  });
});
```

- [ ] **Step 3: Run all Quick Capture tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture`
Expected: PASS (all tests across every file in the package, including this task's ~19 scenarios)

If any scenario fails, adjust the relevant clause-parser's regex/extraction logic (not the test) — the test scenarios directly mirror the request's required coverage list and must not be loosened.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts
git commit -m "feat: add the deterministic Quick Capture command parser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm test` — expected PASS, 225 (existing) + this phase's new tests, with zero regressions in any existing file.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors.
Run: `npm run build` — expected clean production build (this phase adds no pages/routes, so the route list should be identical to before).

- [ ] **Step 2: Commit if anything needed fixing**

If any of the above required a fix, commit it now before moving on.

---

### Task 9: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 8; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

There is no user-visible change in this phase (no UI, no new routes) — this step exists only to keep `master`/production in sync with every other merged phase, and to re-run the full test suite against the real deployed build as a sanity check, matching this project's established rhythm.

- [ ] **Step 3: Report to the user**

Summarize: the parser package is built, tested (list the exact test count), and merged. Explicitly note that nothing is user-visible yet — Phase 2 (confirmation UI) is what actually lets someone type a command and see it happen. Ask whether to proceed to Phase 2 now or pause here.
