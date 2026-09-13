# Receipt Alias Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn from the user's first correction of a receipt line's catalog item or a receipt's store, and auto-resolve that same raw text on every later receipt.

**Architecture:** Reuse the existing per-user `Alias` table (already extended for `"shopping_item"` in Plan 27) by adding a `"shopping_store"` kind, and wire "learn on correction" / "recall on creation" hooks into `src/lib/receipts.ts`. A new `Receipt.rawStoreText` column tracks the raw text a store resolution came from, so a later correction knows what to alias.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-receipt-alias-learning-design.md`

---

### Task 1: Move the alias module out of quick-capture

**Files:**
- Create: `src/lib/aliases.ts` (moved from `src/lib/quick-capture/aliases.ts`)
- Create: `src/lib/aliases.test.ts` (moved from `src/lib/quick-capture/aliases.test.ts`)
- Delete: `src/lib/quick-capture/aliases.ts`, `src/lib/quick-capture/aliases.test.ts`
- Modify: `src/lib/quick-capture/deterministic-parser.ts:4`

`aliases.ts` is no longer quick-capture-specific once receipts depends on it too — this moves it to a neutral home before adding the new kind.

- [ ] **Step 1: Move the files with git, preserving history**

```bash
git mv "src/lib/quick-capture/aliases.ts" "src/lib/aliases.ts"
git mv "src/lib/quick-capture/aliases.test.ts" "src/lib/aliases.test.ts"
```

- [ ] **Step 2: Update the moved test file's import**

In `src/lib/aliases.test.ts`, change:

```ts
import { createAlias, resolveAlias } from "@/lib/quick-capture/aliases";
```

to:

```ts
import { createAlias, resolveAlias } from "@/lib/aliases";
```

- [ ] **Step 3: Update the one production import site**

In `src/lib/quick-capture/deterministic-parser.ts:4`, change:

```ts
import { resolveAlias, type ResolveCandidate, type ResolveResult } from "@/lib/quick-capture/aliases";
```

to:

```ts
import { resolveAlias, type ResolveCandidate, type ResolveResult } from "@/lib/aliases";
```

- [ ] **Step 4: Widen `AliasKind` for the store kind that later tasks need**

In `src/lib/aliases.ts`, change:

```ts
export type AliasKind = "account" | "category" | "shopping_item";
```

to:

```ts
export type AliasKind = "account" | "category" | "shopping_item" | "shopping_store";
```

- [ ] **Step 5: Run the full suite to confirm the move didn't break anything**

Run: `npx vitest run`
Expected: all test files pass, including `src/lib/aliases.test.ts` and `src/lib/quick-capture/deterministic-parser.test.ts`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(aliases): move alias module out of quick-capture, add shopping_store kind

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add `Receipt.rawStoreText`

**Files:**
- Modify: `prisma/schema.prisma`

Tracks the raw text (typed today; a future OCR guess tomorrow) that produced the receipt's current store, or that failed to resolve — the input a later correction aliases from.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, in `model Receipt`, change:

```prisma
model Receipt {
  id                   String    @id @default(cuid())
  userId               String
  transactionId        String?
  storeId              String?
  purchaseDate         DateTime?
```

to:

```prisma
model Receipt {
  id                   String    @id @default(cuid())
  userId               String
  transactionId        String?
  storeId              String?
  rawStoreText         String?
  purchaseDate         DateTime?
```

Also update the `Alias.kind` comment in the same file, in `model Alias`, from:

```prisma
  kind      String   // "account" | "category" | "shopping_item"
```

to:

```prisma
  kind      String   // "account" | "category" | "shopping_item" | "shopping_store"
```

- [ ] **Step 2: Push the schema change and regenerate the client**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(receipts): add Receipt.rawStoreText for store alias learning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Learn a `shopping_item` alias when a line's catalog item is set

**Files:**
- Modify: `src/lib/receipts.ts`
- Test: `src/lib/receipts.test.ts`

Whenever `addLine`/`updateLine` is given an explicit `catalogItemId` (i.e. the user picked one, either via "Add a line" or the per-line dropdown), remember `name → catalogItemId` as a `shopping_item` alias.

- [ ] **Step 1: Widen the test fixture to support aliasing**

In `src/lib/receipts.test.ts`, in `makeFakePrisma`'s base object, add:

```ts
    alias: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
```

right after the `auditLog: { create: ... }` line (before the closing `...overrides,`).

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/receipts.test.ts`:

```ts
describe("addLine / updateLine — alias learning", () => {
  it("addLine learns a shopping_item alias when given an explicit catalogItemId", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: "catalog-1",
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_item", alias: "milk" } },
      update: { targetId: "catalog-1" },
      create: { userId: "user-1", kind: "shopping_item", alias: "milk", targetId: "catalog-1" },
    });
  });

  it("addLine does not write an alias when left unmatched", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Random one-off item",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(prisma.alias.upsert).not.toHaveBeenCalled();
  });

  it("updateLine learns a shopping_item alias when the catalog item is set", async () => {
    const prisma = makeFakePrisma({
      receiptLine: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "line-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "line-1", ...data })),
        delete: vi.fn(),
      },
    });
    await updateLine(prisma, "user-1", "line-1", { catalogItemId: "catalog-2", name: "Bread" });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_item", alias: "bread" } },
      update: { targetId: "catalog-2" },
      create: { userId: "user-1", kind: "shopping_item", alias: "bread", targetId: "catalog-2" },
    });
  });
});
```

- [ ] **Step 3: Run to verify the tests fail**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — `prisma.alias.upsert` not called (aliasing not implemented yet)

- [ ] **Step 4: Implement the learn hook**

In `src/lib/receipts.ts`, add the import:

```ts
import { createAlias } from "@/lib/aliases";
```

Change `addLine`'s signature and body from:

```ts
export async function addLine(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine">,
  userId: string,
  receiptId: string,
  input: {
    catalogItemId: string | null;
    rawText: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  },
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }
  const line = await prisma.receiptLine.create({ data: { userId, receiptId, ...input } });
  return { ok: true, id: line.id };
}
```

to:

```ts
export async function addLine(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias">,
  userId: string,
  receiptId: string,
  input: {
    catalogItemId: string | null;
    rawText: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  },
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }
  const line = await prisma.receiptLine.create({ data: { userId, receiptId, ...input } });

  if (input.catalogItemId && input.name.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}
```

Change `updateLine`'s signature and body from:

```ts
export async function updateLine(
  prisma: Pick<PrismaClient, "receiptLine">,
  userId: string,
  lineId: string,
  input: Partial<{
    catalogItemId: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  }>,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedLine(prisma, userId, lineId))) {
    return { ok: false, error: "Line not found" };
  }
  const line = await prisma.receiptLine.update({ where: { id: lineId }, data: input });
  return { ok: true, id: line.id };
}
```

to:

```ts
export async function updateLine(
  prisma: Pick<PrismaClient, "receiptLine" | "alias">,
  userId: string,
  lineId: string,
  input: Partial<{
    catalogItemId: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  }>,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedLine(prisma, userId, lineId))) {
    return { ok: false, error: "Line not found" };
  }
  const line = await prisma.receiptLine.update({ where: { id: lineId }, data: input });

  if (input.catalogItemId && input.name?.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS — all tests including the 3 new ones

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(receipts): learn a shopping_item alias when a line's catalog item is set

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Recall — `addLine` resolves an unmatched line from an existing alias

**Files:**
- Modify: `src/lib/receipts.ts`
- Test: `src/lib/receipts.test.ts`

When a new line is added with no `catalogItemId` (the "Add a line" manual-entry path left at "No catalog match"), try resolving it from an existing alias before leaving it blank.

- [ ] **Step 1: Widen the test fixture further**

In `src/lib/receipts.test.ts`, in `makeFakePrisma`'s base object, add right after the `alias: {...}` block added in Task 3:

```ts
    shoppingCatalogItem: { findMany: vi.fn().mockResolvedValue([]) },
```

- [ ] **Step 2: Write the failing test**

Append to the `"addLine / updateLine — alias learning"` describe block in `src/lib/receipts.test.ts`:

```ts
  it("addLine resolves catalogItemId from an existing alias when left unmatched", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
      alias: { findUnique: vi.fn().mockResolvedValue({ targetId: "catalog-1" }), upsert: vi.fn().mockResolvedValue({}) },
    });
    const result = await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ catalogItemId: "catalog-1" }),
    });
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — `receiptLine.create` called with `catalogItemId: null`, not `"catalog-1"`

- [ ] **Step 4: Implement the recall**

In `src/lib/receipts.ts`, change the import added in Task 3 from:

```ts
import { createAlias } from "@/lib/aliases";
```

to:

```ts
import { createAlias, resolveAlias } from "@/lib/aliases";
import { listActiveCatalogItems } from "@/lib/shopping-catalog";
```

Change `addLine`'s signature and body from:

```ts
export async function addLine(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias">,
  userId: string,
  receiptId: string,
  input: {
    catalogItemId: string | null;
    rawText: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  },
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }
  const line = await prisma.receiptLine.create({ data: { userId, receiptId, ...input } });

  if (input.catalogItemId && input.name.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}
```

to:

```ts
export async function addLine(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem">,
  userId: string,
  receiptId: string,
  input: {
    catalogItemId: string | null;
    rawText: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  },
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }

  let catalogItemId = input.catalogItemId;
  if (!catalogItemId && input.name.trim()) {
    const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
    const resolved = await resolveAlias(prisma, userId, "shopping_item", input.name, activeCatalogItems);
    if (resolved.status === "resolved") catalogItemId = resolved.id;
  }

  const line = await prisma.receiptLine.create({ data: { userId, receiptId, ...input, catalogItemId } });

  if (input.catalogItemId && input.name.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}
```

Note: the learn step still checks `input.catalogItemId` (the original, explicit value), not the possibly-autofilled `catalogItemId` — so an autofilled line doesn't needlessly re-write the same alias it was just resolved from.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(receipts): auto-resolve a new line's catalog item from an existing alias

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Recall — `runOcrExtraction` resolves each extracted line

**Files:**
- Modify: `src/lib/receipts.ts`
- Test: `src/lib/receipts.test.ts`

Same recall as Task 4, applied to OCR-produced lines (currently always created with `catalogItemId: null`).

- [ ] **Step 1: Write the failing test**

Append to the `describe("runOcrExtraction", ...)` block in `src/lib/receipts.test.ts`:

```ts
  it("with an adapter that extracts a line matching an existing alias, auto-fills the catalog item", async () => {
    const fakeAdapter: OcrAdapter = {
      extract: vi.fn(async () => ({ lines: [{ name: "Milk", quantity: 1, unitPrice: 15000, lineTotal: 15000 }] })),
    };
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      alias: { findUnique: vi.fn().mockResolvedValue({ targetId: "catalog-1" }), upsert: vi.fn().mockResolvedValue({}) },
    });
    const result = await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], fakeAdapter);
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ catalogItemId: "catalog-1" }),
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — line created with `catalogItemId: null`

- [ ] **Step 3: Implement the recall in the extraction loop**

In `src/lib/receipts.ts`, change `runOcrExtraction`'s signature and body from:

```ts
export async function runOcrExtraction(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine">,
  userId: string,
  receiptId: string,
  imageBuffers: Buffer[],
  adapter: OcrAdapter,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }

  const updateData: Record<string, unknown> = { status: "REVIEWED" };
  for (const buffer of imageBuffers) {
    const result = await adapter.extract(buffer);
    for (const line of result.lines) {
      await prisma.receiptLine.create({
        data: {
          userId,
          receiptId,
          catalogItemId: null,
          rawText: null,
          name: line.name,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal,
          categoryId: null,
          excluded: false,
        },
      });
    }
    if (result.subtotal !== undefined) updateData.subtotal = result.subtotal;
    if (result.tax !== undefined) updateData.tax = result.tax;
    if (result.grandTotal !== undefined) updateData.grandTotal = result.grandTotal;
  }

  const receipt = await prisma.receipt.update({ where: { id: receiptId }, data: updateData });
  return { ok: true, id: receipt.id };
}
```

to:

```ts
export async function runOcrExtraction(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem">,
  userId: string,
  receiptId: string,
  imageBuffers: Buffer[],
  adapter: OcrAdapter,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }

  const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
  const updateData: Record<string, unknown> = { status: "REVIEWED" };
  for (const buffer of imageBuffers) {
    const result = await adapter.extract(buffer);
    for (const line of result.lines) {
      let catalogItemId: string | null = null;
      if (line.name.trim()) {
        const resolved = await resolveAlias(prisma, userId, "shopping_item", line.name, activeCatalogItems);
        if (resolved.status === "resolved") catalogItemId = resolved.id;
      }
      await prisma.receiptLine.create({
        data: {
          userId,
          receiptId,
          catalogItemId,
          rawText: null,
          name: line.name,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal,
          categoryId: null,
          excluded: false,
        },
      });
    }
    if (result.subtotal !== undefined) updateData.subtotal = result.subtotal;
    if (result.tax !== undefined) updateData.tax = result.tax;
    if (result.grandTotal !== undefined) updateData.grandTotal = result.grandTotal;
  }

  const receipt = await prisma.receipt.update({ where: { id: receiptId }, data: updateData });
  return { ok: true, id: receipt.id };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(receipts): auto-resolve OCR-extracted lines from an existing alias

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `runOcrExtraction` resolves/records the store

**Files:**
- Modify: `src/lib/receipts.ts`
- Test: `src/lib/receipts.test.ts`

If the adapter reports a `store` guess, resolve it via a `shopping_store` alias (never overriding a store the user already set) and always persist the raw text so an unresolved guess still has something for the review screen to learn from.

- [ ] **Step 1: Widen the test fixture once more**

In `src/lib/receipts.test.ts`, in `makeFakePrisma`'s base object, add right after the `shoppingCatalogItem: {...}` line added in Task 4:

```ts
    shoppingStore: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: "store-1", ...data })),
    },
```

- [ ] **Step 2: Write the failing tests**

Append a new describe block to `src/lib/receipts.test.ts`:

```ts
describe("runOcrExtraction — store learning", () => {
  it("auto-resolves the store from an existing shopping_store alias when none is set", async () => {
    const fakeAdapter: OcrAdapter = {
      extract: vi.fn(async () => ({ lines: [], store: "STO ALCPRO MKT" })),
    };
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1", storeId: null }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      alias: { findUnique: vi.fn().mockResolvedValue({ targetId: "store-1" }), upsert: vi.fn().mockResolvedValue({}) },
    });
    const result = await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], fakeAdapter);
    expect(result.ok).toBe(true);
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: expect.objectContaining({ rawStoreText: "STO ALCPRO MKT", storeId: "store-1" }),
    });
  });

  it("never overrides a store the user already set", async () => {
    const fakeAdapter: OcrAdapter = {
      extract: vi.fn(async () => ({ lines: [], store: "SOMETHING ELSE" })),
    };
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1", storeId: "store-existing" }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });
    await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], fakeAdapter);
    const updateCall = (prisma.receipt.update as any).mock.calls[0][0];
    expect(updateCall.data.rawStoreText).toBe("SOMETHING ELSE");
    expect(updateCall.data.storeId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — `rawStoreText`/`storeId` never set in `updateData` today

- [ ] **Step 4: Implement store resolution**

In `src/lib/receipts.ts`, change `runOcrExtraction`'s signature and body from:

```ts
export async function runOcrExtraction(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem">,
  userId: string,
  receiptId: string,
  imageBuffers: Buffer[],
  adapter: OcrAdapter,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }

  const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
  const updateData: Record<string, unknown> = { status: "REVIEWED" };
  for (const buffer of imageBuffers) {
    const result = await adapter.extract(buffer);
    for (const line of result.lines) {
      let catalogItemId: string | null = null;
      if (line.name.trim()) {
        const resolved = await resolveAlias(prisma, userId, "shopping_item", line.name, activeCatalogItems);
        if (resolved.status === "resolved") catalogItemId = resolved.id;
      }
      await prisma.receiptLine.create({
        data: {
          userId,
          receiptId,
          catalogItemId,
          rawText: null,
          name: line.name,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal,
          categoryId: null,
          excluded: false,
        },
      });
    }
    if (result.subtotal !== undefined) updateData.subtotal = result.subtotal;
    if (result.tax !== undefined) updateData.tax = result.tax;
    if (result.grandTotal !== undefined) updateData.grandTotal = result.grandTotal;
  }

  const receipt = await prisma.receipt.update({ where: { id: receiptId }, data: updateData });
  return { ok: true, id: receipt.id };
}
```

to:

```ts
export async function runOcrExtraction(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem" | "shoppingStore">,
  userId: string,
  receiptId: string,
  imageBuffers: Buffer[],
  adapter: OcrAdapter,
): Promise<ReceiptMutationResult> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId } });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
  const updateData: Record<string, unknown> = { status: "REVIEWED" };
  let storeText: string | undefined;

  for (const buffer of imageBuffers) {
    const result = await adapter.extract(buffer);
    for (const line of result.lines) {
      let catalogItemId: string | null = null;
      if (line.name.trim()) {
        const resolved = await resolveAlias(prisma, userId, "shopping_item", line.name, activeCatalogItems);
        if (resolved.status === "resolved") catalogItemId = resolved.id;
      }
      await prisma.receiptLine.create({
        data: {
          userId,
          receiptId,
          catalogItemId,
          rawText: null,
          name: line.name,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal,
          categoryId: null,
          excluded: false,
        },
      });
    }
    if (result.subtotal !== undefined) updateData.subtotal = result.subtotal;
    if (result.tax !== undefined) updateData.tax = result.tax;
    if (result.grandTotal !== undefined) updateData.grandTotal = result.grandTotal;
    // First non-empty store guess wins across multiple images — a later
    // page's OCR pass overwriting an earlier, possibly-better read isn't
    // worth the added complexity here.
    if (storeText === undefined && result.store !== undefined) storeText = result.store;
  }

  if (storeText !== undefined) {
    updateData.rawStoreText = storeText;
    if (!(receipt as { storeId: string | null }).storeId) {
      const stores = await prisma.shoppingStore.findMany({ where: { userId } });
      const resolved = await resolveAlias(
        prisma,
        userId,
        "shopping_store",
        storeText,
        stores.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
      );
      if (resolved.status === "resolved") updateData.storeId = resolved.id;
    }
  }

  const updated = await prisma.receipt.update({ where: { id: receiptId }, data: updateData });
  return { ok: true, id: updated.id };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS — all `runOcrExtraction` tests, old and new

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(receipts): resolve OCR store guesses from an existing alias

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `setReceiptStore` — the correction/learn entry point

**Files:**
- Modify: `src/lib/receipts.ts`
- Modify: `src/lib/validations/receipts.ts`
- Test: `src/lib/receipts.test.ts`

The function the review screen's new Store card will call: resolves/creates the store and, if the receipt has raw store text to learn from, saves the alias.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/receipts.test.ts`:

```ts
describe("setReceiptStore", () => {
  it("resolves/creates the store and learns an alias from the receipt's raw store text", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1", rawStoreText: "STO ALCPRO MKT" }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      shoppingStore: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: any) => ({ id: "store-new", ...data })),
      },
    });
    const result = await setReceiptStore(prisma, "user-1", "receipt-1", "Alfamart");
    expect(result.ok).toBe(true);
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: { storeId: "store-new", rawStoreText: "Alfamart" },
    });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_store", alias: "sto alcpro mkt" } },
      update: { targetId: "store-new" },
      create: { userId: "user-1", kind: "shopping_store", alias: "sto alcpro mkt", targetId: "store-new" },
    });
  });

  it("does not write an alias when the receipt has no raw store text to learn from", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1", rawStoreText: null }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      shoppingStore: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: any) => ({ id: "store-new", ...data })),
      },
    });
    await setReceiptStore(prisma, "user-1", "receipt-1", "Alfamart");
    expect(prisma.alias.upsert).not.toHaveBeenCalled();
  });

  it("rejects when the receipt does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await setReceiptStore(prisma, "user-1", "receipt-1", "Alfamart");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — `setReceiptStore is not defined`

- [ ] **Step 3: Add the `receiptStoreSchema` validation**

In `src/lib/validations/receipts.ts`, append:

```ts
export const receiptStoreSchema = z.object({
  storeName: z.string(),
});
```

- [ ] **Step 4: Implement `setReceiptStore`**

In `src/lib/receipts.ts`, add the import:

```ts
import { getOrCreateStore } from "@/lib/shopping-store";
```

Append the function (after `updateLine`, before `deleteLine` or anywhere else at module scope):

```ts
export async function setReceiptStore(
  prisma: Pick<PrismaClient, "receipt" | "shoppingStore" | "alias">,
  userId: string,
  receiptId: string,
  storeName: string,
): Promise<ReceiptMutationResult> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId } });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  const storeId = await getOrCreateStore(prisma, userId, storeName);
  const rawStoreText = (receipt as { rawStoreText: string | null }).rawStoreText;

  await prisma.receipt.update({
    where: { id: receiptId },
    data: { storeId, rawStoreText: storeName.trim() || null },
  });

  if (storeId && rawStoreText) {
    await createAlias(prisma, userId, { kind: "shopping_store", alias: rawStoreText, targetId: storeId });
  }

  return { ok: true, id: receiptId };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.ts src/lib/validations/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(receipts): add setReceiptStore — the store correction/learn entry point

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Wire store learning into the actions layer

**Files:**
- Modify: `src/lib/receipts.ts` (`createDraftReceipt`)
- Modify: `src/actions/receipt.actions.ts`
- Test: `src/lib/receipts.test.ts`

`createDraftReceipt` needs to persist the initially-typed store name as `rawStoreText`, and a new server action exposes `setReceiptStore` to the review screen.

- [ ] **Step 1: Update the existing `createDraftReceipt` test call site**

In `src/lib/receipts.test.ts`, change:

```ts
    const receipt = await createDraftReceipt(prisma, "user-1", { storeId: null, purchaseDate: null, receiptNumber: null });
```

to:

```ts
    const receipt = await createDraftReceipt(prisma, "user-1", {
      storeId: null,
      purchaseDate: null,
      receiptNumber: null,
      rawStoreText: null,
    });
```

- [ ] **Step 2: Run to verify it fails on the type only (not yet a runtime failure)**

Run: `npx tsc --noEmit`
Expected: FAIL — `rawStoreText` does not exist on the input type yet

- [ ] **Step 3: Widen `createDraftReceipt`'s input type**

In `src/lib/receipts.ts`, change:

```ts
export async function createDraftReceipt(
  prisma: Pick<PrismaClient, "receipt">,
  userId: string,
  input: { storeId: string | null; purchaseDate: Date | null; receiptNumber: string | null },
) {
  return prisma.receipt.create({ data: { userId, status: "DRAFT", ...input } });
}
```

to:

```ts
export async function createDraftReceipt(
  prisma: Pick<PrismaClient, "receipt">,
  userId: string,
  input: {
    storeId: string | null;
    purchaseDate: Date | null;
    receiptNumber: string | null;
    rawStoreText: string | null;
  },
) {
  return prisma.receipt.create({ data: { userId, status: "DRAFT", ...input } });
}
```

- [ ] **Step 4: Run tsc and vitest to confirm both pass**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS

- [ ] **Step 5: Pass `rawStoreText` through at receipt creation**

In `src/actions/receipt.actions.ts`, change:

```ts
  const storeId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const receipt = await createDraftReceipt(prisma, session.user.id, {
    storeId,
    purchaseDate: parsed.data.purchaseDate,
    receiptNumber: parsed.data.receiptNumber,
  });
```

to:

```ts
  const storeId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const receipt = await createDraftReceipt(prisma, session.user.id, {
    storeId,
    purchaseDate: parsed.data.purchaseDate,
    receiptNumber: parsed.data.receiptNumber,
    rawStoreText: parsed.data.storeName,
  });
```

- [ ] **Step 6: Add the new `updateReceiptStoreAction`**

In `src/actions/receipt.actions.ts`, add `receiptStoreSchema` and `setReceiptStore` to the existing imports:

```ts
import {
  confirmReceiptSchema,
  draftReceiptSchema,
  receiptLineSchema,
  receiptStoreSchema,
  receiptTotalsSchema,
} from "@/lib/validations/receipts";
import {
  addImage,
  addLine,
  confirmReceipt,
  createDraftReceipt,
  deleteLine,
  removeImage,
  runOcrExtraction,
  setReceiptStore,
  updateLine,
} from "@/lib/receipts";
```

Then append the action, after `updateReceiptTotalsAction` (or anywhere else in the file at module scope):

```ts
export async function updateReceiptStoreAction(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = receiptStoreSchema.safeParse({ storeName: formData.get("storeName") ?? "" });
  if (!parsed.success) return { ok: false, error: "Please check the store name" };

  const result = await setReceiptStore(prisma, session.user.id, receiptId, parsed.data.storeName);
  if (result.ok) revalidatePath("/shopping");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all test files pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts src/actions/receipt.actions.ts
git commit -m "feat(receipts): wire store alias learning into the actions layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Store correction card on the review screen

**Files:**
- Modify: `src/components/receipts/receipt-review.tsx`

Adds the UI the user actually corrects the store from — the one missing piece needed for the learn hook in Task 7 to ever get called.

- [ ] **Step 1: Add the new props and import**

In `src/components/receipts/receipt-review.tsx`, change the import line:

```ts
import { addLineAction, confirmReceiptAction, updateReceiptTotalsAction } from "@/actions/receipt.actions";
```

to:

```ts
import {
  addLineAction,
  confirmReceiptAction,
  updateReceiptStoreAction,
  updateReceiptTotalsAction,
} from "@/actions/receipt.actions";
```

Change the component signature from:

```tsx
export function ReceiptReview({
  receipt,
  lines,
  currency,
  catalogItems,
  accounts,
  categories,
}: {
  receipt: Receipt;
  lines: Line[];
  currency: string;
  catalogItems: { id: string; canonicalName: string }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
```

to:

```tsx
export function ReceiptReview({
  receipt,
  lines,
  currency,
  catalogItems,
  accounts,
  categories,
  storeName,
  rawStoreText,
}: {
  receipt: Receipt;
  lines: Line[];
  currency: string;
  catalogItems: { id: string; canonicalName: string }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  storeName: string | null;
  rawStoreText: string | null;
}) {
```

- [ ] **Step 2: Add local state and the save handler**

Right after the existing `const [isConfirming, setIsConfirming] = useState(false);` line, add:

```ts
  const [storeNameInput, setStoreNameInput] = useState(storeName ?? "");
  const [isSavingStore, setIsSavingStore] = useState(false);
```

Add the handler function, alongside the other `handle*` functions (e.g. right after `handleAddLine`):

```ts
  async function handleSaveStore() {
    setIsSavingStore(true);
    const formData = new FormData();
    formData.set("storeName", storeNameInput);
    const result = await updateReceiptStoreAction(receipt.id, formData);
    setIsSavingStore(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Store saved");
    router.refresh();
  }
```

- [ ] **Step 3: Render the Store card**

In the returned JSX, right after the opening `<div className="flex flex-col gap-4">` and before the `"Lines"` section (`<div><h3 ...>Lines</h3>`), add:

```tsx
      <Card className="flex flex-col gap-2 p-3">
        <p className="text-sm font-medium text-muted-foreground">Store</p>
        {!storeName && rawStoreText && (
          <p className="text-xs text-warning">Detected: &quot;{rawStoreText}&quot; — pick or type the actual store</p>
        )}
        <div className="flex gap-2">
          <Input
            value={storeNameInput}
            onChange={(e) => setStoreNameInput(e.target.value)}
            placeholder="e.g. SM Supermarket"
          />
          <Button size="sm" onClick={handleSaveStore} disabled={isSavingStore}>
            {isSavingStore ? "Saving..." : "Save"}
          </Button>
        </div>
      </Card>

```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL initially with "storeName/rawStoreText missing" at the one caller in `src/app/(app)/shopping/page.tsx` — expected, fixed in Task 10

- [ ] **Step 5: Commit**

```bash
git add src/components/receipts/receipt-review.tsx
git commit -m "feat(receipts): add a Store correction card to the review screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Wire the store name through the Shopping page

**Files:**
- Modify: `src/app/(app)/shopping/page.tsx`

**Files touched:** `ScanReceiptTab`'s query needs the store relation; its render needs the two new props.

- [ ] **Step 1: Include the store relation**

In `src/app/(app)/shopping/page.tsx`, in `ScanReceiptTab`, change:

```ts
  const activeReceipt = await prisma.receipt.findFirst({
    where: { userId, status: { in: ["DRAFT", "REVIEWED"] } },
    orderBy: { createdAt: "desc" },
  });
```

to:

```ts
  const activeReceipt = await prisma.receipt.findFirst({
    where: { userId, status: { in: ["DRAFT", "REVIEWED"] } },
    orderBy: { createdAt: "desc" },
    include: { store: true },
  });
```

- [ ] **Step 2: Pass the new props**

Change:

```tsx
  return (
    <ReceiptReview
      receipt={activeReceipt}
      lines={lines}
      currency={currency}
      catalogItems={catalogItems.map((c) => ({ id: c.id, canonicalName: c.canonicalName }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      categories={categories}
    />
  );
```

to:

```tsx
  return (
    <ReceiptReview
      receipt={activeReceipt}
      lines={lines}
      currency={currency}
      catalogItems={catalogItems.map((c) => ({ id: c.id, canonicalName: c.canonicalName }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      categories={categories}
      storeName={activeReceipt.store?.name ?? null}
      rawStoreText={activeReceipt.rawStoreText}
    />
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/shopping/page.tsx"
git commit -m "feat(receipts): pass store name/raw text into the receipt review screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: no new errors (the 4 pre-existing unrelated warnings from before this plan are fine)

- [ ] **Step 4: Production build**

Run: `npx next build`
Expected: succeeds

- [ ] **Step 5: No commit for this task — verification only.**
