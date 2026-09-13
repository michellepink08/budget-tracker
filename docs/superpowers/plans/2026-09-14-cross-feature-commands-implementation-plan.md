# Cross-Feature Conversational Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Quick Capture's parser with Shopping and Year Plan commands (3 new data-changing intents, 2 new read-only questions), plus a `year_plan_update_assumption` data-changing intent and a new client-side `navigate` result type for phrasings like "Show the conservative Year Plan" — reusing every existing domain function, confirm/Undo pipeline, and alias-matching pattern unchanged.

**Architecture:** New `CommandDraft` union members only — no change to `QuickCapturePanel`'s Confirm/Cancel/Undo flow except one new branch for `navigate` (which skips the server confirm step entirely, since it changes no data). Item-name resolution for shopping commands reuses `resolveAlias` with a new `"shopping_item"` alias kind, exactly like the existing `"account"`/`"category"` kinds. `year_plan_update_assumption` reuses the existing `updatePhase` function; the two new questions reuse `getShoppingDashboardSummary` and `getYearPlanDashboardSummary` respectively — no new domain logic, only new parser/dispatch wiring.

**Tech Stack:** Zod (draft schemas), the existing deterministic clause parser, Vitest.

---

## Task 1: Widen `AliasKind`, add a catalog-item listing helper

**Files:**
- Modify: `src/lib/quick-capture/aliases.ts`
- Modify: `src/lib/quick-capture/aliases.test.ts`
- Modify: `src/lib/shopping-catalog.ts`
- Modify: `src/lib/shopping-catalog.test.ts`

The `Alias` model's schema comment already documents `"shopping_item"` as a kind (`prisma/schema.prisma:551`, `kind String // "account" | "category" | "shopping_item"`) — only the TypeScript `AliasKind` type needs widening; no schema change.

- [ ] **Step 1: Write the failing test**

Check `src/lib/quick-capture/aliases.test.ts` for its existing test structure first (it should already test `createAlias`/`resolveAlias` for `"account"`/`"category"`). Add this test to it:

```ts
describe("createAlias — shopping_item kind", () => {
  it("upserts a shopping_item alias the same way as account/category", async () => {
    const prisma = {
      alias: { upsert: vi.fn().mockResolvedValue({ id: "alias-1" }) },
    } as any;

    await createAlias(prisma, "user-1", { kind: "shopping_item", alias: "coke", targetId: "catalog-1" });

    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_item", alias: "coke" } },
      update: { targetId: "catalog-1" },
      create: { userId: "user-1", kind: "shopping_item", alias: "coke", targetId: "catalog-1" },
    });
  });
});
```

(Add the `vi`/`createAlias` imports at the top of the file if the existing test doesn't already import them — check the file first.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/aliases.test.ts`
Expected: FAIL — TypeScript rejects `kind: "shopping_item"` since `AliasKind` doesn't include it yet (or, if run through Vitest's transpile without a separate type-check pass, it may pass at runtime but fail `tsc --noEmit` — run both to confirm the type error specifically).

Run: `npx tsc --noEmit`
Expected: FAIL — `Type '"shopping_item"' is not assignable to type 'AliasKind'`.

- [ ] **Step 3: Implement**

In `src/lib/quick-capture/aliases.ts`, change:
```ts
export type AliasKind = "account" | "category";
```
to:
```ts
export type AliasKind = "account" | "category" | "shopping_item";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/aliases.test.ts && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 5: Write the failing test for the catalog-item listing helper**

Add to `src/lib/shopping-catalog.test.ts`:

```ts
describe("listActiveCatalogItems", () => {
  it("returns id/canonicalName pairs for non-archived items, scoped to the user", async () => {
    const prisma = {
      shoppingCatalogItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cat-1", canonicalName: "Nestle Chocolate Milk" },
          { id: "cat-2", canonicalName: "Rice" },
        ]),
      },
    } as any;

    const items = await listActiveCatalogItems(prisma, "user-1");

    expect(items).toEqual([
      { id: "cat-1", name: "Nestle Chocolate Milk" },
      { id: "cat-2", name: "Rice" },
    ]);
    expect(prisma.shoppingCatalogItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      select: { id: true, canonicalName: true },
    });
  });
});
```

Add the import at the top: `import { listActiveCatalogItems } from "@/lib/shopping-catalog";` if not already imported via a wildcard-style import — check the file's existing import line and extend it.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/shopping-catalog.test.ts`
Expected: FAIL — `listActiveCatalogItems is not a function`.

- [ ] **Step 7: Implement**

Append to `src/lib/shopping-catalog.ts`:

```ts
// Feeds Quick Capture's shopping-item resolution the same
// {id, name}[] candidate shape listAccounts/listCategories already
// provide for account/category resolution.
export async function listActiveCatalogItems(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const items = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, canonicalName: true },
  });
  return items.map((item: { id: string; canonicalName: string }) => ({ id: item.id, name: item.canonicalName }));
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/shopping-catalog.test.ts && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/quick-capture/aliases.ts src/lib/quick-capture/aliases.test.ts src/lib/shopping-catalog.ts src/lib/shopping-catalog.test.ts
git commit -m "feat(quick-capture): widen AliasKind to shopping_item, add listActiveCatalogItems (plan-27 prep)"
```

---

## Task 2: New `CommandDraft` types

**Files:**
- Modify: `src/lib/quick-capture/types.ts`

No test file — this is Zod schema/type declarations only, matching this file's own convention (it has no dedicated test file today; its schemas are exercised indirectly through the parser's tests).

- [ ] **Step 1: Widen the intent and question-type unions**

In `src/lib/quick-capture/types.ts`, change:
```ts
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
```
to:
```ts
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
  "shopping_list_add",
  "shopping_list_select",
  "shopping_schedule",
  "year_plan_update_assumption",
  "navigate",
  "question",
] as const;
```

Change:
```ts
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
```
to:
```ts
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
  "shopping_selected_total",
  "year_plan_recommended_saving",
] as const;
```

- [ ] **Step 2: Add the five new draft schemas**

Add these right after `transactionDeleteDraftSchema`/`TransactionDeleteDraft` and before `questionDraftSchema`:

```ts
export const shoppingListAddDraftSchema = z.object({
  intent: z.literal("shopping_list_add"),
  item: resolvedRefSchema, // resolved against ShoppingCatalogItem; id is null when it's a new free-text item
  itemNameRaw: z.string(),
  ...base,
});
export type ShoppingListAddDraft = z.infer<typeof shoppingListAddDraftSchema>;

export const shoppingListSelectDraftSchema = z.object({
  intent: z.literal("shopping_list_select"),
  item: resolvedRefSchema, // resolved against the current list's own items, not the full catalog
  ...base,
});
export type ShoppingListSelectDraft = z.infer<typeof shoppingListSelectDraftSchema>;

export const shoppingScheduleDraftSchema = z.object({
  intent: z.literal("shopping_schedule"),
  date: dateFieldSchema,
  ...base,
});
export type ShoppingScheduleDraft = z.infer<typeof shoppingScheduleDraftSchema>;

export const yearPlanUpdateAssumptionDraftSchema = z.object({
  intent: z.literal("year_plan_update_assumption"),
  phase: resolvedRefSchema, // the YearPlanPhase being extended/shortened
  newEndDate: dateFieldSchema,
  ...base,
});
export type YearPlanUpdateAssumptionDraft = z.infer<typeof yearPlanUpdateAssumptionDraftSchema>;

// Never confirmed through executeDraft/QuickCaptureLog — the panel
// handles this entirely client-side as a router.push, since it changes
// no data (design spec section G: "a navigation command, not a data
// question").
export const navigateDraftSchema = z.object({
  intent: z.literal("navigate"),
  route: z.string(),
  label: z.string(),
  ...base,
});
export type NavigateDraft = z.infer<typeof navigateDraftSchema>;
```

- [ ] **Step 3: Add the five new types to the `CommandDraft` union**

Change:
```ts
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
to:
```ts
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
  | ShoppingListAddDraft
  | ShoppingListSelectDraft
  | ShoppingScheduleDraft
  | YearPlanUpdateAssumptionDraft
  | NavigateDraft
  | QuestionDraft;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `deterministic-parser.ts`, `execute.ts`, and `quick-capture-panel.tsx` — their `switch`/`case` statements over `draft.intent` are no longer exhaustive. This is expected; the rest of this plan's tasks add the missing cases one at a time. Do not attempt to fix all of them now.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/types.ts
git commit -m "feat(quick-capture): add CommandDraft types for shopping/year-plan commands and navigate (plan-27)"
```

---

## Task 3: `shopping_schedule` — parser, execute, undo, panel summary

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/execute.ts`
- Modify: `src/lib/quick-capture/execute.test.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

- [ ] **Step 1: Write the failing parser test**

Check `src/lib/quick-capture/deterministic-parser.test.ts` for its existing `makeFakePrisma`/`ParserContext` fixture pattern first, then add (adapting the fixture call to match what's already there):

```ts
describe("shopping_schedule", () => {
  it("parses 'Schedule grocery shopping for Saturday' into a shopping_schedule draft", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Schedule grocery shopping for Saturday");

    expect(draft.intent).toBe("shopping_schedule");
  });
});
```

(If the file's existing tests use different helper names than `makeFakePrisma`/`makeContext`, use whatever names are already established there instead — check the file before writing this.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_schedule`
Expected: FAIL — the clause falls through to the default expense parser, so `draft.intent` is `"expense"`, not `"shopping_schedule"`.

- [ ] **Step 3: Implement the parser**

In `src/lib/quick-capture/deterministic-parser.ts`, add this clause parser to the `clauseParsers` array, placed before the "Read-only question" entry and before the final "Default — a plain expense" entry (anywhere among the other specific-intent parsers earlier in the array is fine, since none of their `test` patterns overlap with schedule/shopping phrasing):

```ts
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
```

- [ ] **Step 4: Run the parser test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_schedule`
Expected: PASS

- [ ] **Step 5: Write the failing execute test**

Check `src/lib/quick-capture/execute.test.ts`'s existing fixture pattern first, then add:

```ts
describe("shopping_schedule", () => {
  it("sets the current list's plannedDate", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1", plannedDate: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_schedule",
      date: { value: new Date(2026, 8, 19), confirmed: true },
      clauseText: "Schedule grocery shopping for Saturday",
      clarification: null,
    });

    expect(result.ok).toBe(true);
    expect(prisma.shoppingList.update).toHaveBeenCalledWith({
      where: { id: "list-1" },
      data: { plannedDate: new Date(2026, 8, 19) },
    });
  });

  it("reports an error when there's no current list", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_schedule",
      date: { value: new Date(2026, 8, 19), confirmed: true },
      clauseText: "Schedule grocery shopping for Saturday",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "No current shopping list to schedule" });
  });
});
```

(Check `execute.test.ts`'s existing `makeFakePrisma` — it needs a `shoppingList: { findFirst: vi.fn(), update: vi.fn() }` default added if not already present; the `overrides` parameter pattern used above assumes `makeFakePrisma` merges a partial override object the same way the other test files in this codebase do.)

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_schedule`
Expected: FAIL — `executeDraft`'s switch has no `"shopping_schedule"` case yet (TypeScript error from Task 2 still present, or a runtime "Unhandled intent" depending on how the switch degrades — either way, not the expected behavior).

- [ ] **Step 7: Implement**

In `src/lib/quick-capture/execute.ts`, widen `ExecutePrisma`:
```ts
type ExecutePrisma = Pick<
  PrismaClient,
  | "transaction"
  | "budgetPeriod"
  | "account"
  | "payable"
  | "creditCard"
  | "loan"
  | "shoppingList"
  | "shoppingListItem"
  | "shoppingCatalogItem"
  | "shoppingPriceHistory"
  | "yearPlanPhase"
  | "$transaction"
>;
```

Add this case to `executeDraft`'s `switch`, right after the `"transaction_delete"` case and before `"question"`:

```ts
    case "shopping_schedule": {
      const list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
      if (!list) return { ok: false, error: "No current shopping list to schedule" };
      const previousValues = { plannedDate: list.plannedDate };
      await prisma.shoppingList.update({ where: { id: list.id }, data: { plannedDate: draft.date.value } });
      return { ok: true, resultingIds: [list.id], previousValues };
    }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_schedule`
Expected: PASS (2/2)

- [ ] **Step 9: Write the failing undo test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("undoExecution — shopping_schedule", () => {
  it("restores the list's previous plannedDate", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(
      prisma,
      "user-1",
      "shopping_schedule",
      ["list-1"],
      { plannedDate: null },
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingList.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["list-1"] }, userId: "user-1" },
      data: { plannedDate: null },
    });
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_schedule"`
Expected: FAIL — `undoExecution` falls through to the generic transaction-delete branch, calling `prisma.transaction.deleteMany` instead of restoring `shoppingList`.

- [ ] **Step 11: Implement the undo case**

In `src/lib/quick-capture/execute.ts`, widen `undoExecution`'s Prisma param type:
```ts
export async function undoExecution(
  prisma: Pick<PrismaClient, "transaction" | "payable" | "shoppingList" | "shoppingListItem" | "yearPlanPhase">,
```

Add this branch right after the `"payable_create"` branch and before the generic transaction-delete fallback:

```ts
  if (intent === "shopping_schedule" && previousValues) {
    await prisma.shoppingList.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_schedule"`
Expected: PASS

- [ ] **Step 13: Add the panel summary case**

In `src/components/quick-capture/quick-capture-panel.tsx`'s `summarize` function, add this case right after `"transaction_delete"` and before `"question"`:

```ts
    case "shopping_schedule":
      return `schedule shopping for ${draft.date.value.toLocaleDateString()}`;
```

- [ ] **Step 14: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors related to `shopping_schedule` anywhere (other new-intent-related errors from Task 2 may still remain — that's expected until later tasks add their cases).

- [ ] **Step 15: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add shopping_schedule intent (plan-27 Phase 27.1)"
```

---

## Task 4: `shopping_list_add` — parser, execute, undo, panel summary

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/execute.ts`
- Modify: `src/lib/quick-capture/execute.test.ts`
- Modify: `src/actions/quick-capture.actions.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

An unresolved item name is not an error here — `ShoppingListItem.freeTextName` exists exactly for this case (an item with no catalog match yet), so `shopping_list_add` never blocks on a clarification the way account resolution does; it only asks a clarification when the name is genuinely ambiguous between two or more catalog items.

- [ ] **Step 1: Add the parser context field for catalog candidates**

`ParserContext` (in `deterministic-parser.ts`) needs the catalog candidates the same way it already carries `accounts`/`categories`. Change:
```ts
export type ParserContext = {
  userId: string;
  currency: string; // e.g. "PHP" — this app is single-currency-per-user (see design spec: no multi-currency)
  accounts: ResolveCandidate[];
  categories: ResolveCandidate[];
  now: Date;
};
```
to:
```ts
export type ParserContext = {
  userId: string;
  currency: string; // e.g. "PHP" — this app is single-currency-per-user (see design spec: no multi-currency)
  accounts: ResolveCandidate[];
  categories: ResolveCandidate[];
  shoppingItems: ResolveCandidate[];
  now: Date;
};
```

- [ ] **Step 2: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts` (extending whatever `makeContext`-style helper already exists there to also pass `shoppingItems: [{ id: "cat-1", name: "Rice" }]`):

```ts
describe("shopping_list_add", () => {
  it("resolves a catalog match", async () => {
    const prisma = makeFakePrisma();
    const ctx = { ...makeContext(), shoppingItems: [{ id: "cat-1", name: "Rice" }] };

    const [draft] = await parseCommand(prisma, ctx, "Add rice to my shopping list");

    expect(draft.intent).toBe("shopping_list_add");
    if (draft.intent === "shopping_list_add") {
      expect(draft.item.id).toBe("cat-1");
    }
  });

  it("falls back to a free-text item name when nothing matches the catalog", async () => {
    const prisma = makeFakePrisma();
    const ctx = { ...makeContext(), shoppingItems: [] };

    const [draft] = await parseCommand(prisma, ctx, "Add quail eggs to my shopping list");

    expect(draft.intent).toBe("shopping_list_add");
    if (draft.intent === "shopping_list_add") {
      expect(draft.item.id).toBeNull();
      expect(draft.itemNameRaw).toBe("quail eggs");
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_list_add`
Expected: FAIL — the clause falls through to the default expense parser.

- [ ] **Step 4: Implement the parser**

Add a shopping-item resolver right after `resolveRefOrClarify` in `deterministic-parser.ts`:

```ts
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
```

Add this clause parser to the `clauseParsers` array, placed before the "Read-only question" entry:

```ts
  // Shopping list add — "Add rice to my shopping list" (also matches a
  // bare split fragment like "milk to my shopping list" left over from a
  // multi-item clause such as "Add rice and milk to my shopping list" —
  // the shared splitter in this file splits on "and", so only the first
  // item keeps the "add ... to" framing; later items still match here
  // via the bare "X to my shopping list" fallback below).
  {
    test: (lower) => /\bshopping list\b/.test(lower),
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_list_add`
Expected: PASS (2/2)

- [ ] **Step 6: Write the failing execute test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("shopping_list_add", () => {
  it("adds a catalog-matched item, using its category and latest price", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
      shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1", categoryId: "cat-food" }) },
      shoppingPriceHistory: { findFirst: vi.fn().mockResolvedValue({ unitPrice: 5500 }) },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "rice", id: "cat-1", candidateIds: [] },
      itemNameRaw: "rice",
      clauseText: "Add rice to my shopping list",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"] });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        listId: "list-1",
        catalogItemId: "cat-1",
        freeTextName: null,
        quantity: 1,
        unit: null,
        estimatedUnitPrice: 5500,
        preferredStoreId: null,
        categoryId: "cat-food",
        priority: "NORMAL",
        notes: null,
      },
    });
  });

  it("adds a free-text item when nothing matched the catalog", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "quail eggs", id: null, candidateIds: [] },
      itemNameRaw: "quail eggs",
      clauseText: "Add quail eggs to my shopping list",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"] });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        listId: "list-1",
        catalogItemId: null,
        freeTextName: "quail eggs",
        quantity: 1,
        unit: null,
        estimatedUnitPrice: null,
        preferredStoreId: null,
        categoryId: null,
        priority: "NORMAL",
        notes: null,
      },
    });
  });

  it("creates a current list on demand when none exists yet", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "list-new" }),
      },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
    });

    await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "rice", id: null, candidateIds: [] },
      itemNameRaw: "rice",
      clauseText: "Add rice to my shopping list",
      clarification: null,
    });

    expect(prisma.shoppingList.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Shopping list", isCurrent: true, plannedDate: null, budgetCategoryId: null },
    });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ listId: "list-new" }) }),
    );
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_list_add`
Expected: FAIL — no `"shopping_list_add"` case exists yet.

- [ ] **Step 8: Implement**

Add this case to `executeDraft`'s `switch`, right after the `"shopping_schedule"` case added in Task 3:

```ts
    case "shopping_list_add": {
      let list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
      if (!list) {
        list = await prisma.shoppingList.create({
          data: { userId, name: "Shopping list", isCurrent: true, plannedDate: null, budgetCategoryId: null },
        });
      }

      let categoryId: string | null = null;
      let estimatedUnitPrice: number | null = null;
      if (draft.item.id) {
        const catalogItem = await prisma.shoppingCatalogItem.findFirst({ where: { id: draft.item.id, userId } });
        categoryId = catalogItem?.categoryId ?? null;
        const latestPrice = await prisma.shoppingPriceHistory.findFirst({
          where: { userId, catalogItemId: draft.item.id },
          orderBy: { confirmedAt: "desc" },
        });
        estimatedUnitPrice = latestPrice?.unitPrice ?? null;
      }

      const item = await prisma.shoppingListItem.create({
        data: {
          userId,
          listId: list.id,
          catalogItemId: draft.item.id,
          freeTextName: draft.item.id ? null : draft.itemNameRaw,
          quantity: 1,
          unit: null,
          estimatedUnitPrice,
          preferredStoreId: null,
          categoryId,
          priority: "NORMAL",
          notes: null,
        },
      });
      return { ok: true, resultingIds: [item.id] };
    }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_list_add`
Expected: PASS (3/3)

- [ ] **Step 10: Write the failing undo test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("undoExecution — shopping_list_add", () => {
  it("deletes the created list item", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(prisma, "user-1", "shopping_list_add", ["item-1"], null);

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingListItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] }, userId: "user-1" },
    });
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_list_add"`
Expected: FAIL — falls through to the generic `transaction.deleteMany` branch instead.

- [ ] **Step 12: Implement the undo case**

Add this branch to `undoExecution`, right after the `"shopping_schedule"` branch added in Task 3:

```ts
  if (intent === "shopping_list_add") {
    await prisma.shoppingListItem.deleteMany({ where: { id: { in: resultingIds }, userId } });
    return { ok: true };
  }
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_list_add"`
Expected: PASS

- [ ] **Step 14: Add the panel summary case**

In `src/components/quick-capture/quick-capture-panel.tsx`'s `summarize` function, add right after `"shopping_schedule"`:

```ts
    case "shopping_list_add":
      return `add ${draft.itemNameRaw} to shopping list`;
```

- [ ] **Step 15: Wire the new `shoppingItems` context field into `parseQuickCaptureAction`**

In `src/actions/quick-capture.actions.ts`, add the import:
```ts
import { listActiveCatalogItems } from "@/lib/shopping-catalog";
```
Change:
```ts
  const [accounts, categories] = await Promise.all([
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
  ]);

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
```
to:
```ts
  const [accounts, categories, shoppingItems] = await Promise.all([
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
    listActiveCatalogItems(prisma, user.id),
  ]);

  const drafts = await parseCommand(
    prisma,
    {
      userId: user.id,
      currency: user.currency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      shoppingItems,
      now: new Date(),
    },
    text,
  );
```

- [ ] **Step 16: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors from `shopping_list_add`/`shopping_schedule`/the `ParserContext` widening; all tests pass (other new-intent-related gaps from Task 2 may still remain until later tasks).

- [ ] **Step 17: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts src/actions/quick-capture.actions.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add shopping_list_add intent (plan-27 Phase 27.1)"
```

---

## Task 5: `shopping_list_select` — parser, execute, undo, panel summary

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/execute.ts`
- Modify: `src/lib/quick-capture/execute.test.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

Unlike `shopping_list_add` (resolved against the full catalog), this resolves against the **current list's own items** — you can only mark something for the next trip if it's already on the list.

- [ ] **Step 1: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`:

```ts
describe("shopping_list_select", () => {
  it("parses 'Mark rice for the next trip' into a shopping_list_select draft", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Mark rice for the next trip");

    expect(draft.intent).toBe("shopping_list_select");
    if (draft.intent === "shopping_list_select") {
      expect(draft.item.raw).toBe("rice");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_list_select`
Expected: FAIL — falls through to the default expense parser.

- [ ] **Step 3: Implement the parser**

`shopping_list_select` resolves against the current list's items, which the parser doesn't have loaded (unlike accounts/categories/shoppingItems, which are pre-fetched once per parse and passed down). Resolution instead happens at **execute time**, using the raw name only — the draft just carries the raw text, same pattern `payable_update`'s `target` uses before `resolveRecentTransactionRef` resolves it inside `executeDraft`... except here resolution must happen in the parser too, since the draft needs a `ResolvedRef` before it can display anything meaningful in the panel. Add this clause parser to the `clauseParsers` array, placed before the "Read-only question" entry and before the "Shopping list add" entry from Task 4 (so "Mark X for the next trip" is checked first — it would otherwise never reach the "shopping list" test since it doesn't mention "shopping list" at all, so ordering relative to Task 4's entry doesn't actually matter, but placing it first keeps the shopping-related parsers grouped):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_list_select`
Expected: PASS

- [ ] **Step 5: Write the failing execute test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("shopping_list_select", () => {
  it("selects the matching item on the current list", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: {
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", isSelected: false }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "rice", id: null, candidateIds: [] },
      clauseText: "Mark rice for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"], previousValues: { isSelected: false } });
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { isSelected: true },
    });
  });

  it("reports an error when nothing on the current list matches", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "durian", id: null, candidateIds: [] },
      clauseText: "Mark durian for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "That item isn't on your current shopping list" });
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_list_select`
Expected: FAIL — no `"shopping_list_select"` case exists yet.

- [ ] **Step 7: Implement**

Add this case to `executeDraft`'s `switch`, right after the `"shopping_list_add"` case:

```ts
    case "shopping_list_select": {
      const list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
      if (!list) return { ok: false, error: "No current shopping list" };

      const lower = draft.item.raw.toLowerCase();
      const items = await prisma.shoppingListItem.findMany({
        where: { userId, listId: list.id },
        include: { catalogItem: true },
      });
      const match = (items as { id: string; isSelected: boolean; freeTextName: string | null; catalogItem: { canonicalName: string } | null }[]).find(
        (item) => (item.catalogItem?.canonicalName ?? item.freeTextName ?? "").toLowerCase().includes(lower),
      );
      if (!match) return { ok: false, error: "That item isn't on your current shopping list" };

      const previousValues = { isSelected: match.isSelected };
      await prisma.shoppingListItem.update({ where: { id: match.id }, data: { isSelected: true } });
      return { ok: true, resultingIds: [match.id], previousValues };
    }
```

Note this uses `prisma.shoppingListItem.findMany`, not `findFirst` as sketched in the test above — update the test's mock to use `findMany` returning an array instead of `findFirst` returning a single row, matching the real implementation. Revise Step 5's test code:

```ts
describe("shopping_list_select", () => {
  it("selects the matching item on the current list", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "item-1", isSelected: false, freeTextName: null, catalogItem: { canonicalName: "Rice" } },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "rice", id: null, candidateIds: [] },
      clauseText: "Mark rice for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"], previousValues: { isSelected: false } });
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { isSelected: true },
    });
  });

  it("reports an error when nothing on the current list matches", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "durian", id: null, candidateIds: [] },
      clauseText: "Mark durian for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "That item isn't on your current shopping list" });
  });
});
```

Use this revised version instead of Step 5's version — apply Step 5 with this code, not the earlier draft.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t shopping_list_select`
Expected: PASS (2/2)

- [ ] **Step 9: Write the failing undo test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("undoExecution — shopping_list_select", () => {
  it("restores the item's previous isSelected value", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(
      prisma,
      "user-1",
      "shopping_list_select",
      ["item-1"],
      { isSelected: false },
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] }, userId: "user-1" },
      data: { isSelected: false },
    });
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_list_select"`
Expected: FAIL — falls through to the generic transaction-delete branch.

- [ ] **Step 11: Implement the undo case**

Add this branch to `undoExecution`, right after the `"shopping_list_add"` branch:

```ts
  if (intent === "shopping_list_select" && previousValues) {
    await prisma.shoppingListItem.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — shopping_list_select"`
Expected: PASS

- [ ] **Step 13: Add the panel summary case**

In `quick-capture-panel.tsx`'s `summarize`, add right after `"shopping_list_add"`:

```ts
    case "shopping_list_select":
      return `mark ${draft.item.raw} for the next trip`;
```

- [ ] **Step 14: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors; all tests pass.

- [ ] **Step 15: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add shopping_list_select intent (plan-27 Phase 27.1)"
```

---

## Task 6: `shopping_selected_total` question

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/answer-question.ts`
- Modify: `src/lib/quick-capture/answer-question.test.ts`

No panel change needed — every `question`-intent draft already renders through the existing generic `QuestionAnswer` branches (`"amount"`/`"list"`/`"text"`/`"unavailable"`).

- [ ] **Step 1: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`:

```ts
describe("shopping_selected_total question", () => {
  it("parses 'How much is my selected shopping list?' as shopping_selected_total", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "How much is my selected shopping list?");

    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("shopping_selected_total");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_selected_total`
Expected: FAIL — no `QUESTION_PATTERNS` entry matches, so it falls back to the default `"liquid_funds"` question type.

- [ ] **Step 3: Implement**

In `deterministic-parser.ts`, add this entry to `QUESTION_PATTERNS`, before the catch-all-ish `spending_by_category` entry (order matters — put it anywhere before that one so a more specific pattern isn't shadowed):

```ts
  { test: /\bshopping list\b/, questionType: "shopping_selected_total" },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t shopping_selected_total`
Expected: PASS

- [ ] **Step 5: Write the failing answer-question test**

Check `src/lib/quick-capture/answer-question.test.ts`'s existing fixture pattern first, then add:

```ts
describe("shopping_selected_total", () => {
  it("returns the current list's estimated total for selected items", async () => {
    const prisma = {
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", budgetCategoryId: null }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([
          { isSelected: true, quantity: 2, estimatedUnitPrice: 5500 },
        ]),
      },
    } as any;

    const answer = await answerQuestion(prisma, "user-1", 25, {
      intent: "question",
      questionType: "shopping_selected_total",
      account: null,
      category: null,
      clauseText: "How much is my selected shopping list?",
      clarification: null,
    });

    expect(answer).toEqual({ kind: "amount", label: "Selected shopping list total", amountMinorUnits: 11000 });
  });

  it("reports unavailable when there's no current list or nothing selected", async () => {
    const prisma = {
      shoppingList: { findFirst: vi.fn().mockResolvedValue(null) },
      shoppingListItem: { findMany: vi.fn() },
    } as any;

    const answer = await answerQuestion(prisma, "user-1", 25, {
      intent: "question",
      questionType: "shopping_selected_total",
      account: null,
      category: null,
      clauseText: "How much is my selected shopping list?",
      clarification: null,
    });

    expect(answer).toEqual({ kind: "unavailable", message: "No current shopping list yet" });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts -t shopping_selected_total`
Expected: FAIL — `answerQuestion`'s `switch` has no `"shopping_selected_total"` case.

- [ ] **Step 7: Implement**

In `src/lib/quick-capture/answer-question.ts`, add the import:
```ts
import { getShoppingDashboardSummary } from "@/lib/shopping-summary";
```

Widen `AnswerPrisma`:
```ts
type AnswerPrisma = Pick<
  PrismaClient,
  | "account"
  | "transaction"
  | "budgetPeriod"
  | "budgetAllocation"
  | "category"
  | "payable"
  | "creditCard"
  | "savingsGoal"
  | "shoppingList"
  | "shoppingListItem"
  | "yearPlan"
  | "yearPlanPhase"
  | "incomeForecast"
>;
```

Add this case to `answerQuestion`'s `switch`, anywhere among the other cases:

```ts
    case "shopping_selected_total": {
      const summary = await getShoppingDashboardSummary(prisma, userId, cycleStartDay, now);
      if (!summary) return { kind: "unavailable", message: "No current shopping list yet" };
      return { kind: "amount", label: "Selected shopping list total", amountMinorUnits: summary.estimatedTotal };
    }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts -t shopping_selected_total`
Expected: PASS (2/2)

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat(quick-capture): add shopping_selected_total question (plan-27 Phase 27.1)"
```

---

## Task 7: `year_plan_recommended_saving` question

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/answer-question.ts`
- Modify: `src/lib/quick-capture/answer-question.test.ts`

- [ ] **Step 1: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`:

```ts
describe("year_plan_recommended_saving question", () => {
  it("parses 'How much should we save before he comes home?' as year_plan_recommended_saving", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "How much should we save before he comes home?");

    expect(draft.intent).toBe("question");
    if (draft.intent === "question") {
      expect(draft.questionType).toBe("year_plan_recommended_saving");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t year_plan_recommended_saving`
Expected: FAIL — falls back to the default `"liquid_funds"` question type.

- [ ] **Step 3: Implement**

Add this entry to `QUESTION_PATTERNS`, before the `shopping_selected_total` entry added in Task 6 (order among these two doesn't actually matter — their patterns don't overlap — but keep new entries grouped):

```ts
  { test: /\bhow much\b.*\bsave\b|\bsave\b.*\bcomes? home\b/, questionType: "year_plan_recommended_saving" },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t year_plan_recommended_saving`
Expected: PASS

- [ ] **Step 5: Write the failing answer-question test**

Add to `src/lib/quick-capture/answer-question.test.ts`:

```ts
describe("year_plan_recommended_saving", () => {
  it("returns the active plan's recommendedSavingPerCutoff", async () => {
    const prisma = {
      yearPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1", minCashBuffer: 0, vacationReserveGoalId: null }) },
      yearPlanPhase: { findMany: vi.fn().mockResolvedValue([]) },
      incomeForecast: { findMany: vi.fn().mockResolvedValue([]) },
      savingsGoal: { findUnique: vi.fn() },
    } as any;

    const answer = await answerQuestion(prisma, "user-1", 25, {
      intent: "question",
      questionType: "year_plan_recommended_saving",
      account: null,
      category: null,
      clauseText: "How much should we save before he comes home?",
      clarification: null,
    });

    expect(answer.kind).toBe("amount");
  });

  it("reports unavailable when there's no active Year Plan", async () => {
    const prisma = {
      yearPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;

    const answer = await answerQuestion(prisma, "user-1", 25, {
      intent: "question",
      questionType: "year_plan_recommended_saving",
      account: null,
      category: null,
      clauseText: "How much should we save before he comes home?",
      clarification: null,
    });

    expect(answer).toEqual({ kind: "unavailable", message: "No active Year Plan yet" });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts -t year_plan_recommended_saving`
Expected: FAIL — no matching case in `answerQuestion`'s `switch`.

- [ ] **Step 7: Implement**

In `src/lib/quick-capture/answer-question.ts`, add the import:
```ts
import { getYearPlanDashboardSummary } from "@/lib/year-plan-summary";
```

Add this case to `answerQuestion`'s `switch`:

```ts
    case "year_plan_recommended_saving": {
      const summary = await getYearPlanDashboardSummary(prisma, userId, now);
      if (!summary || summary.recommendedSavingPerCutoff === null) {
        return { kind: "unavailable", message: "No active Year Plan yet" };
      }
      return {
        kind: "amount",
        label: "Recommended saving per cutoff",
        amountMinorUnits: summary.recommendedSavingPerCutoff,
      };
    }
```

Note: when `getYearPlanDashboardSummary` returns a plan but `recommendedSavingPerCutoff` is `null` (no remaining full-income cutoffs), this still reports "No active Year Plan yet," which is slightly imprecise but avoids inventing a second unavailable-message branch for a rare edge case — acceptable for this pass.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/answer-question.test.ts -t year_plan_recommended_saving`
Expected: PASS (2/2)

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/answer-question.ts src/lib/quick-capture/answer-question.test.ts
git commit -m "feat(quick-capture): add year_plan_recommended_saving question (plan-27 Phase 27.2)"
```

---

## Task 8: `year_plan_update_assumption` — parser, execute, undo, panel summary

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/execute.ts`
- Modify: `src/lib/quick-capture/execute.test.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

Scope: "Papa will probably be home by December" reads as *the currently-active non-home phase's end date changing* — this is the phase the confirmed statement is about, resolved as "whichever `YearPlanPhase` on the active Year Plan is not a `HOME_PHASE_TYPES` phase and covers today's date." A phrasing like "we have three full salary cutoffs left" (a cutoff *count*, not a date) has no single field to update and is explicitly out of scope for this pass.

- [ ] **Step 1: Widen the test file's `makeFakePrisma` helper to accept overrides**

`deterministic-parser.test.ts`'s existing `makeFakePrisma` takes only a positional `transactions: unknown[] = []` array (used by the `transaction_update`/`transaction_delete` tests) — it has no way to supply `yearPlan`/`yearPlanPhase` mocks, which this task's tests need. Change it (preserving the existing positional-array behavior exactly, so every existing call site keeps working unchanged):

```ts
function makeFakePrisma(transactions: unknown[] = [], overrides: Record<string, any> = {}) {
  return {
    alias: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
    ...overrides,
  } as any;
}
```

- [ ] **Step 2: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`, using the widened helper's new second `overrides` argument (pass `[]` for the untouched `transactions` array):

```ts
describe("year_plan_update_assumption", () => {
  it("parses 'Papa will probably be home by December' and resolves the active non-home phase", async () => {
    const prisma = makeFakePrisma([], {
      yearPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1" }) },
      yearPlanPhase: {
        findFirst: vi.fn().mockResolvedValue({ id: "phase-1", phaseType: "SOLO_FIELD" }),
      },
    });
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Papa will probably be home by December");

    expect(draft.intent).toBe("year_plan_update_assumption");
    if (draft.intent === "year_plan_update_assumption") {
      expect(draft.phase.id).toBe("phase-1");
    }
  });

  it("asks a clarification when there's no active non-home phase to update", async () => {
    const prisma = makeFakePrisma([], {
      yearPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1" }) },
      yearPlanPhase: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Papa will probably be home by December");

    expect(draft.clarification).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t year_plan_update_assumption`
Expected: FAIL — falls through to the default expense parser.

- [ ] **Step 4: Implement**

`parseCommand`'s clause parsers currently only take `Pick<PrismaClient, "alias" | "transaction">` — this new parser needs `yearPlan`/`yearPlanPhase` too. Change the `ClauseParser` type and `parseCommand`'s own signature:

```ts
type ClauseParser = {
  test: (lower: string) => boolean;
  parse: (
    prisma: Pick<PrismaClient, "alias" | "transaction" | "yearPlan" | "yearPlanPhase">,
    ctx: ParserContext,
    clause: string,
  ) => Promise<CommandDraft>;
};
```
```ts
export async function parseCommand(
  prisma: Pick<PrismaClient, "alias" | "transaction" | "yearPlan" | "yearPlanPhase">,
  ctx: ParserContext,
  text: string,
): Promise<CommandDraft[]> {
```

Import `HOME_PHASE_TYPES`:
```ts
import { HOME_PHASE_TYPES } from "@/lib/constants/financial";
```

Add this clause parser to the `clauseParsers` array, placed before the "Read-only question" entry:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t year_plan_update_assumption`
Expected: PASS (2/2)

- [ ] **Step 6: Write the failing execute test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("year_plan_update_assumption", () => {
  it("updates the phase's endDate", async () => {
    const prisma = makeFakePrisma({
      yearPlanPhase: {
        findFirst: vi.fn().mockResolvedValue({ id: "phase-1", userId: "user-1", endDate: new Date(2026, 10, 1) }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "year_plan_update_assumption",
      phase: { raw: "Papa will probably be home by December", id: "phase-1", candidateIds: [] },
      newEndDate: { value: new Date(2026, 11, 1), confirmed: true },
      clauseText: "Papa will probably be home by December",
      clarification: null,
    });

    expect(result).toEqual({
      ok: true,
      resultingIds: ["phase-1"],
      previousValues: { endDate: new Date(2026, 10, 1) },
    });
    expect(prisma.yearPlanPhase.update).toHaveBeenCalledWith({
      where: { id: "phase-1" },
      data: { endDate: new Date(2026, 11, 1) },
    });
  });

  it("reports not found when the phase couldn't be resolved", async () => {
    const prisma = makeFakePrisma({
      yearPlanPhase: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "year_plan_update_assumption",
      phase: { raw: "...", id: null, candidateIds: [] },
      newEndDate: { value: new Date(2026, 11, 1), confirmed: true },
      clauseText: "Papa will probably be home by December",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "Couldn't identify which Year Plan phase to update" });
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t year_plan_update_assumption`
Expected: FAIL — no matching case in `executeDraft`'s `switch`.

- [ ] **Step 8: Implement**

Add this case to `executeDraft`'s `switch`, right after the `"shopping_list_select"` case:

```ts
    case "year_plan_update_assumption": {
      if (!draft.phase.id) return { ok: false, error: "Couldn't identify which Year Plan phase to update" };
      const existing = await prisma.yearPlanPhase.findFirst({ where: { id: draft.phase.id, userId } });
      if (!existing) return { ok: false, error: "Couldn't identify which Year Plan phase to update" };
      const previousValues = { endDate: existing.endDate };
      await prisma.yearPlanPhase.update({ where: { id: draft.phase.id }, data: { endDate: draft.newEndDate.value } });
      return { ok: true, resultingIds: [draft.phase.id], previousValues };
    }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t year_plan_update_assumption`
Expected: PASS (2/2)

- [ ] **Step 10: Write the failing undo test**

Add to `src/lib/quick-capture/execute.test.ts`:

```ts
describe("undoExecution — year_plan_update_assumption", () => {
  it("restores the phase's previous endDate", async () => {
    const prisma = makeFakePrisma({
      yearPlanPhase: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(
      prisma,
      "user-1",
      "year_plan_update_assumption",
      ["phase-1"],
      { endDate: new Date(2026, 10, 1) },
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.yearPlanPhase.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["phase-1"] }, userId: "user-1" },
      data: { endDate: new Date(2026, 10, 1) },
    });
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — year_plan_update_assumption"`
Expected: FAIL — falls through to the generic transaction-delete branch.

- [ ] **Step 12: Implement the undo case**

Add this branch to `undoExecution`, right after the `"shopping_list_select"` branch:

```ts
  if (intent === "year_plan_update_assumption" && previousValues) {
    await prisma.yearPlanPhase.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts -t "undoExecution — year_plan_update_assumption"`
Expected: PASS

- [ ] **Step 14: Add the panel summary case**

In `quick-capture-panel.tsx`'s `summarize`, add right after `"shopping_list_select"`:

```ts
    case "year_plan_update_assumption":
      return `update Year Plan phase end date to ${draft.newEndDate.value.toLocaleDateString()}`;
```

- [ ] **Step 15: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors; all tests pass.

- [ ] **Step 16: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add year_plan_update_assumption intent (plan-27 Phase 27.2)"
```

---

## Task 9: `navigate` — parser detection, execute defensive case, and the panel's new "Go" branch

**Files:**
- Modify: `src/lib/quick-capture/deterministic-parser.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.test.ts`
- Modify: `src/lib/quick-capture/execute.ts`
- Modify: `src/lib/quick-capture/execute.test.ts`
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

`navigate` never goes through `confirmQuickCaptureDraftAction`/`executeDraft`/`QuickCaptureLog` at all — it changes no data, so it's a pure client-side `router.push`. `executeDraft` still needs a defensive case purely so its `switch` stays exhaustive under TypeScript.

**Scope note:** `src/app/(app)/year-plan/page.tsx` has no scenario-switching UI today — it always loads the single active plan filtered by `scenario: "EXPECTED"` (confirmed by inspection: no `scenario`/`searchParams` handling exists there at all). Building a conservative/optimistic scenario viewer is a Year Plan feature gap, not part of this plan. So `navigate` in this pass supports exactly one destination — "Show the Year Plan" / "Show my Year Plan" → `/year-plan` — proving the mechanism end-to-end with a real, working target. Scenario-specific phrasings ("Show the conservative Year Plan") are deferred until the Year Plan page itself supports viewing a non-expected scenario.

- [ ] **Step 1: Write the failing parser test**

Add to `src/lib/quick-capture/deterministic-parser.test.ts`:

```ts
describe("navigate", () => {
  it("parses 'Show my Year Plan' into a navigate draft pointing at /year-plan", async () => {
    const prisma = makeFakePrisma();
    const ctx = makeContext();

    const [draft] = await parseCommand(prisma, ctx, "Show my Year Plan");

    expect(draft.intent).toBe("navigate");
    if (draft.intent === "navigate") {
      expect(draft.route).toBe("/year-plan");
      expect(draft.label).toBe("Year Plan");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t navigate`
Expected: FAIL — falls through to the default expense parser.

- [ ] **Step 3: Implement the parser**

Add this clause parser to the `clauseParsers` array, placed before the "Read-only question" entry:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/quick-capture/deterministic-parser.test.ts -t navigate`
Expected: PASS

- [ ] **Step 5: Add the defensive `executeDraft` case**

Add this case to `executeDraft`'s `switch`, right after the `"year_plan_update_assumption"` case — this should never actually run (the panel intercepts `navigate` before calling the confirm action), but keeps the switch exhaustive:

```ts
    case "navigate":
      return { ok: false, error: "Navigation commands don't need to be confirmed" };
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — `executeDraft`'s switch is exhaustive again.

- [ ] **Step 7: Add the panel's "Go" branch**

In `src/components/quick-capture/quick-capture-panel.tsx`, add a case to `summarize` right after `"year_plan_update_assumption"`:

```ts
    case "navigate":
      return `go to ${draft.label}`;
```

Then change the render logic so a `navigate` draft shows a "Go" button instead of Confirm/Cancel, and clicking it navigates immediately without calling the server confirm action at all. Replace:

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
with:
```tsx
              {entry.status === "pending" && entry.draft.intent === "navigate" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const route = entry.draft.intent === "navigate" ? entry.draft.route : "/";
                    handleOpenChange(false);
                    router.push(route);
                  }}
                >
                  Go
                </Button>
              )}

              {entry.status === "pending" &&
                !entry.draft.clarification &&
                entry.draft.intent !== "question" &&
                entry.draft.intent !== "navigate" && (
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

- [ ] **Step 8: Typecheck, lint, run the full suite, and build**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run && npx next build`
Expected: no errors, all tests pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/quick-capture/deterministic-parser.ts src/lib/quick-capture/deterministic-parser.test.ts src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add the navigate result type and 'Show the conservative Year Plan' command (plan-27 Phase 27.2)"
```

---

## Task 10: Full verification sweep

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes, including all new/modified ones from Tasks 1–9.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: no new errors (pre-existing unrelated warnings are fine).

- [ ] **Step 4: Production build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 5: No commit for this task** — verification only.
