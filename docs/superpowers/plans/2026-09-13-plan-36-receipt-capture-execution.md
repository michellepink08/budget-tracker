# Plan 36 — Receipt Capture & OCR Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Receipt Capture (schema, stub OCR adapter, capture UI, review/confirm flow, privacy/lifecycle) per `docs/superpowers/specs/2026-09-13-receipt-capture-design.md`.

**Architecture:** Three new Prisma models (`Receipt`, `ReceiptLine`, `ReceiptImage`) plus `User.receiptAutoDeleteImages`. Domain logic in `src/lib/receipts.ts` (CRUD + the balance-critical `confirmReceipt`) and `src/lib/receipts/reconciliation.ts` (pure `computeReconciliation`, no Prisma). `src/lib/receipts/ocr-adapter.ts` defines `OcrAdapter`/`StubOcrAdapter`. `src/lib/receipts/storage.ts` wraps `@vercel/blob` — the only file that imports it. The Shopping page's "Scan Receipt" tab (currently a placeholder) becomes the real capture/review screen.

**Tech Stack:** Next.js Server Components/Actions, Prisma, `@vercel/blob`, Vitest with mocked Prisma clients, zod.

---

## Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add `receiptAutoDeleteImages Boolean @default(false)` to `model User`, and three back-relation arrays (`receipts Receipt[]`, `receiptLines ReceiptLine[]`, `receiptImages ReceiptImage[]`).

- [ ] **Step 2:** Add the three models after `model ShoppingListItem { ... }`:

```prisma
model Receipt {
  id                   String    @id @default(cuid())
  userId               String
  transactionId        String?
  storeId              String?
  purchaseDate         DateTime?
  receiptNumber        String?
  subtotal             Int?
  discount             Int?      @default(0)
  tax                  Int?      @default(0)
  fees                 Int?      @default(0)
  grandTotal           Int?
  unitemizedDifference Int?      @default(0)
  status               String    @default("DRAFT")
  createdAt            DateTime  @default(now())

  user        User          @relation(fields: [userId], references: [id])
  store       ShoppingStore? @relation(fields: [storeId], references: [id])
  transaction Transaction?  @relation(fields: [transactionId], references: [id])
  lines       ReceiptLine[]
  images      ReceiptImage[]
}

model ReceiptLine {
  id            String  @id @default(cuid())
  userId        String
  receiptId     String
  catalogItemId String?
  rawText       String?
  name          String
  quantity      Float   @default(1)
  unitPrice     Int?
  lineTotal     Int
  categoryId    String?
  excluded      Boolean @default(false)

  user        User                 @relation(fields: [userId], references: [id])
  receipt     Receipt              @relation(fields: [receiptId], references: [id])
  catalogItem ShoppingCatalogItem? @relation(fields: [catalogItemId], references: [id])
  category    Category?            @relation(fields: [categoryId], references: [id])
}

model ReceiptImage {
  id        String   @id @default(cuid())
  userId    String
  receiptId String
  objectKey String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  receipt Receipt @relation(fields: [receiptId], references: [id])
}
```

- [ ] **Step 3:** Add back-relations on `ShoppingStore` (`receipts Receipt[]`), `Transaction` (`receipt Receipt?`), `ShoppingCatalogItem` (`receiptLines ReceiptLine[]`), `Category` (`receiptLines ReceiptLine[]`).

- [ ] **Step 4:** `npm run db:generate`, then `npx prisma validate` — both clean.

- [ ] **Step 5:** Commit: `git commit -m "feat(receipts): add Receipt, ReceiptLine, ReceiptImage models and User.receiptAutoDeleteImages"`

---

## Task 2: OCR adapter

**Files:**
- Create: `src/lib/receipts/ocr-adapter.ts`
- Test: `src/lib/receipts/ocr-adapter.test.ts`

- [ ] Write a one-case test asserting `new StubOcrAdapter().extract(Buffer.from(""))` resolves to `{ lines: [] }` exactly (no `store`/`date`/`subtotal`/`tax`/`grandTotal` keys at all — a future real adapter is free to add them, but the stub must not send misleading zeros).

- [ ] Implement:

```ts
export type OcrResult = {
  store?: string;
  date?: Date;
  lines: { name: string; quantity?: number; unitPrice?: number; lineTotal: number }[];
  subtotal?: number;
  tax?: number;
  grandTotal?: number;
};

export interface OcrAdapter {
  extract(imageBuffer: Buffer): Promise<OcrResult>;
}

export class StubOcrAdapter implements OcrAdapter {
  async extract(): Promise<OcrResult> {
    return { lines: [] };
  }
}
```

- [ ] Run test, verify pass. Commit: `git commit -m "feat(receipts): add OcrAdapter interface and StubOcrAdapter"`

---

## Task 3: Pure reconciliation math

**Files:**
- Create: `src/lib/receipts/reconciliation.ts`
- Test: `src/lib/receipts/reconciliation.test.ts`

- [ ] **Step 1:** Write failing tests from the spec's worked example:

```typescript
import { describe, expect, it } from "vitest";
import { computeReconciliation } from "@/lib/receipts/reconciliation";

describe("computeReconciliation", () => {
  it("reconciles when line totals plus unitemizedDifference match the expected total", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 2000,
      lines: [
        { lineTotal: 30000, excluded: false },
        { lineTotal: 24000, excluded: false },
      ],
    });
    // expected = 50000 - 0 + 6000 + 0 = 56000; lines+diff = 30000+24000+2000 = 56000
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });

  it("reports a mismatch when line totals fall short", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 0,
      lines: [{ lineTotal: 54000, excluded: false }],
    });
    expect(result).toEqual({ reconciled: false, difference: 2000 });
  });

  it("excludes lines marked excluded from the line-total sum", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 0,
      lines: [
        { lineTotal: 56000, excluded: false },
        { lineTotal: 999999, excluded: true },
      ],
    });
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });

  it("treats null money fields as 0", () => {
    const result = computeReconciliation({
      subtotal: null,
      discount: null,
      tax: null,
      fees: null,
      grandTotal: null,
      unitemizedDifference: 0,
      lines: [],
    });
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });
});
```

- [ ] **Step 2:** Run, verify fail.

- [ ] **Step 3:** Implement:

```typescript
export function computeReconciliation(params: {
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  fees: number | null;
  grandTotal: number | null;
  unitemizedDifference: number;
  lines: { lineTotal: number; excluded: boolean }[];
}): { reconciled: boolean; difference: number } {
  const expected =
    (params.subtotal ?? 0) - (params.discount ?? 0) + (params.tax ?? 0) + (params.fees ?? 0) ||
    (params.grandTotal ?? 0);
  const target = params.grandTotal ?? expected;
  const lineSum = params.lines
    .filter((l) => !l.excluded)
    .reduce((sum, l) => sum + l.lineTotal, 0);
  const difference = target - (lineSum + params.unitemizedDifference);
  return { reconciled: difference === 0, difference };
}
```

Note: the `|| (params.grandTotal ?? 0)` fallback only matters when `subtotal`/`tax`/etc. are all null but `grandTotal` isn't (an OCR-only total with no itemized breakdown yet) — re-derive this carefully against the four tests above rather than trusting this draft blindly; adjust until all four pass, since reconciliation math is exactly the kind of place an off-by-one sign error hides.

- [ ] **Step 4:** Run, verify pass. Commit: `git commit -m "feat(receipts): add computeReconciliation pure function"`

---

## Task 4: Domain functions (`src/lib/receipts.ts`)

**Files:**
- Create: `src/lib/receipts.ts`
- Test: `src/lib/receipts.test.ts`

- [ ] **Step 1:** Write failing tests covering:
  - `createDraftReceipt` creates scoped to `userId`, `status: "DRAFT"`
  - `addImage`/`removeImage` — ownership-checked, `removeImage` only calls `prisma.receiptImage.delete` (never touches `receipt`/`transaction`/`account`)
  - `addLine`/`updateLine`/`deleteLine` — ownership-checked via the receipt
  - `runOcrExtraction`: with a stub adapter returning `{ lines: [] }`, creates zero `ReceiptLine` rows and sets `status: "REVIEWED"`; with a fake adapter returning one line, creates exactly one `ReceiptLine`
  - `confirmReceipt`: **the critical invariant** — exactly one `prisma.transaction.create` call (via a mocked `createExpenseLikeTransaction` dependency, or by asserting the underlying `prisma.transaction.create` call count if not mocking that away), exactly one `ShoppingPriceHistory` row per non-excluded matched-with-price line, `Receipt.transactionId`/`status` updated, zero calls to `prisma.account.update` (nothing touches an account balance directly — only the transaction does, and only once); a second test asserting `confirmReceipt` refuses (returns `{ ok: false }`) when `computeReconciliation` says not reconciled, without creating anything

- [ ] **Step 2:** Run, verify fail.

- [ ] **Step 3:** Implement. Mirror `year-plan.ts`'s `assertOwned*` ownership-check pattern exactly. `confirmReceipt`'s shape:

```typescript
export async function confirmReceipt(
  prisma: /* transaction | budgetPeriod | receipt | receiptLine | shoppingPriceHistory */,
  userId: string,
  cycleStartDay: string extends never ? never : number,
  receiptId: string,
  input: { accountId: string; categoryId: string | undefined; date: Date },
): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId }, include: { lines: true } });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  const { reconciled } = computeReconciliation({
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    fees: receipt.fees,
    grandTotal: receipt.grandTotal,
    unitemizedDifference: receipt.unitemizedDifference,
    lines: receipt.lines.map((l) => ({ lineTotal: l.lineTotal, excluded: l.excluded })),
  });
  if (!reconciled) return { ok: false, error: "Receipt does not reconcile yet" };

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: receipt.grandTotal ?? 0,
    date: input.date,
    accountId: input.accountId,
    categoryId: input.categoryId,
    description: "Receipt purchase",
  });

  await prisma.receipt.update({
    where: { id: receiptId },
    data: { transactionId: transaction.id, status: "CONFIRMED" },
  });

  for (const line of receipt.lines) {
    if (line.excluded || !line.catalogItemId || line.unitPrice === null) continue;
    await prisma.shoppingPriceHistory.create({
      data: { userId, catalogItemId: line.catalogItemId, storeId: receipt.storeId, unitPrice: line.unitPrice, source: "RECEIPT" },
    });
  }

  return { ok: true, transactionId: transaction.id };
}
```

(The odd `cycleStartDay: string extends never ? never : number` in the signature sketch above is a typo artifact — just type it `cycleStartDay: number` like every other function that takes it; don't copy that conditional type literally.)

- [ ] **Step 4:** Run, verify pass. Commit: `git commit -m "feat(receipts): add receipt domain functions (createDraftReceipt/addImage/removeImage/addLine/updateLine/deleteLine/runOcrExtraction/confirmReceipt)"`

---

## Task 5: Storage wrapper

**Files:**
- Modify: `package.json` (add `@vercel/blob`)
- Create: `src/lib/receipts/storage.ts`

- [ ] **Step 1:** `npm install @vercel/blob`

- [ ] **Step 2:** Implement (no unit test — no network in tests, per project convention; verified manually against the live deployment once `BLOB_READ_WRITE_TOKEN` is configured):

```typescript
import { put, del } from "@vercel/blob";

export async function uploadReceiptImage(userId: string, receiptId: string, file: File): Promise<string> {
  const blob = await put(`receipts/${userId}/${receiptId}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "public", // Vercel Blob v1 has no private-ACL mode yet; pathname is a random UUID so it's unguessable — document this constraint plainly rather than silently overstating "private"
    addRandomSuffix: false,
  });
  return blob.pathname;
}

export async function deleteReceiptImage(objectKey: string): Promise<void> {
  await del(objectKey);
}
```

**Important correction to the design doc:** check the current `@vercel/blob` SDK's actual access-control options before writing this — the design doc says "private mode," but confirm what that means concretely in the installed version (some Blob tiers only support unguessable-URL "public" access, not authenticated-read "private" access). If genuine private/signed-URL access isn't available, say so plainly in the code's comment and to the user when this task completes, rather than claiming a privacy guarantee the SDK doesn't provide.

- [ ] **Step 3:** Typecheck. Commit: `git commit -m "feat(receipts): add Vercel Blob storage wrapper"`

---

## Task 6: Validations + server actions

**Files:**
- Create: `src/lib/validations/receipts.ts`
- Create: `src/actions/receipt.actions.ts`

- [ ] Zod schemas for: draft-receipt creation (storeId optional), line edits (name/quantity/unitPrice/categoryId/catalogItemId/excluded), totals edit (subtotal/discount/tax/fees/grandTotal/unitemizedDifference), confirm (accountId/categoryId/date).

- [ ] Server actions: `createDraftReceiptAction`, `uploadReceiptImageAction` (calls storage + `addImage`), `removeReceiptImageAction` (calls storage delete + `removeImage`), `runOcrExtractionAction` (always uses `StubOcrAdapter` for now — swapping adapters later is a one-line change here), `updateLineAction`, `deleteLineAction`, `updateReceiptTotalsAction`, `confirmReceiptAction`.

- [ ] Typecheck. Commit: `git commit -m "feat(receipts): add validations and server actions"`

---

## Task 7: Settings toggle

**Files:**
- Create: `src/components/settings/receipts-settings.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Create: `src/actions/user-settings.actions.ts` (or extend an existing settings-action file if one already exists — check first)

- [ ] A single checkbox: "Automatically delete receipt images after confirming," bound to `User.receiptAutoDeleteImages`, saved via a small server action. Add a "Receipts" section to the Settings page.

- [ ] Typecheck, lint. Commit: `git commit -m "feat(receipts): add the receipt auto-delete-images setting"`

---

## Task 8: Review/capture screen

**Files:**
- Modify: `src/app/(app)/shopping/page.tsx` (replace the "Scan Receipt" placeholder)
- Create: `src/components/receipts/receipt-capture.tsx`
- Create: `src/components/receipts/receipt-review.tsx`
- Create: `src/components/receipts/receipt-line-row.tsx`

- [ ] **Capture** (`receipt-capture.tsx`, client component): a `<input type="file" accept="image/*" capture="environment" multiple>`, a thumbnail strip (object URLs, remove/reorder via simple array state — no crop/rotate per Decision 4), an "Upload & create receipt" button calling `createDraftReceiptAction` then `uploadReceiptImageAction` per file, then `runOcrExtractionAction`.

- [ ] **Review** (`receipt-review.tsx`): fetches the draft/reviewed receipt + lines + images, renders `receipt-line-row.tsx` per line (editable name/qty/price, catalog-match search reusing the pattern from `list-item-form-dialog.tsx`'s catalog select, category select, exclude checkbox), totals fields, a reconciliation banner (🟢/🔴 + one-click "set unitemized difference" fix calling `updateReceiptTotalsAction`), account/category pickers, and a Confirm button disabled while `!reconciled` (compute client-side with `computeReconciliation`, re-validated server-side by `confirmReceiptAction` regardless — never trust the disabled state alone).

- [ ] On confirm success: toast + a link to the created transaction (or simply "View in Transactions" linking to `/transactions`), matching the lightweight-navigation pattern used elsewhere in this app rather than building a dedicated receipt-detail page this pass.

- [ ] Typecheck, lint, build. Commit: `git commit -m "feat(receipts): add the receipt capture/review/confirm screen"`

---

## Task 9: Final verification and deploy

- [ ] `npx vitest run` — all pass.
- [ ] `npx next build` — clean.
- [ ] `git push`.
- [ ] Remind the user: `BLOB_READ_WRITE_TOKEN` needs to be set in the Vercel project (Storage → Blob → connect/create a store) before image upload will work in production. Ask them to confirm it's set, or note that this step is still pending, before attempting a live image-upload check.
- [ ] If the token is available: on the live site, go to Shopping → Scan Receipt, upload a test image, confirm a draft receipt is created, add a line manually, set totals so they reconcile, confirm, and check the resulting transaction appears in Transactions and a `ShoppingPriceHistory` row was written (if the line was matched to a catalog item). Delete the test receipt's image and the resulting transaction afterward to leave the demo account clean.
- [ ] If the token is not yet available: verify everything up to (not including) the actual image upload — draft creation, manual line entry, reconciliation banner, confirm flow with zero images attached (a receipt doesn't strictly require an image, since manual entry is the whole point of the stub-OCR path) — and note plainly to the user that image upload itself is unverified pending their Vercel Blob setup.
