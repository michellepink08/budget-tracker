# Receipt Capture & OCR — Design

**Status:** Approved. Scope: Phases 24.1–24.5 of the `plan-24` roadmap. No paid OCR/vision provider is added — ships with `StubOcrAdapter` only, per the standing "no paid provider without explicit approval" rule and this pass's confirmation.

**Depends on:** `ShoppingCatalogItem`, `ShoppingPriceHistory` (Plan 23) — receipt lines match against and record into these.

## Decisions made this pass

1. **Object storage: Vercel Blob, private mode.** Requires a Blob store provisioned in the Vercel project dashboard with a `BLOB_READ_WRITE_TOKEN` env var — an account-level step only the user can do. Code is written against `@vercel/blob`'s private-access API regardless of whether that's provisioned yet; uploads simply fail with a clear error until it is.
2. **Auto-delete-after-confirm defaults OFF.** A new `User.receiptAutoDeleteImages Boolean @default(false)` setting, toggleable from Settings. Deleting an image never touches `Receipt`/`ReceiptLine`/the confirmed `Transaction`.
3. **No real OCR provider.** `StubOcrAdapter.extract()` always returns `{ lines: [] }` (and no `store`/`date`/`subtotal`/`tax`/`grandTotal`) — every field starts blank, the review screen is 100% manual entry. Swapping in a real adapter later needs zero changes to the review/confirm flow, since it only depends on the `OcrAdapter` interface.
4. **Image capture UI is scoped down from the roadmap's full list.** A standard multi-file input (`capture="environment"` for the mobile camera prompt) plus a thumbnail strip with remove/reorder — no crop/rotate editor. The stub OCR never reads pixel data, so crop/rotate only serves a human re-checking the image later; retaking a clearer photo covers that need without a custom canvas-based editor. A real editor is a disclosed, deferred follow-up, not a silent cut.

## Schema

```prisma
model Receipt {
  id                   String    @id @default(cuid())
  userId               String
  transactionId        String?              // set once confirmed — the ONE parent transaction
  storeId              String?
  purchaseDate         DateTime?
  receiptNumber        String?
  subtotal             Int?
  discount             Int?      @default(0)
  tax                  Int?      @default(0)
  fees                 Int?      @default(0)
  grandTotal           Int?
  unitemizedDifference Int?      @default(0)
  status               String    @default("DRAFT") // DRAFT | REVIEWED | CONFIRMED
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
  rawText       String?            // reserved for a future real-OCR adapter; StubOcrAdapter never populates this
  name          String
  quantity      Float   @default(1)
  unitPrice     Int?
  lineTotal     Int
  categoryId    String?
  excluded      Boolean @default(false) // "not a purchase line" toggle

  user        User                 @relation(fields: [userId], references: [id])
  receipt     Receipt              @relation(fields: [receiptId], references: [id])
  catalogItem ShoppingCatalogItem? @relation(fields: [catalogItemId], references: [id])
  category    Category?            @relation(fields: [categoryId], references: [id])
}

model ReceiptImage {
  id        String   @id @default(cuid())
  userId    String
  receiptId String
  objectKey String              // pointer into Vercel Blob — never the image bytes themselves
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  receipt Receipt @relation(fields: [receiptId], references: [id])
}
```

`User` gains `receiptAutoDeleteImages Boolean @default(false)`.

## OCR adapter (`src/lib/receipts/ocr-adapter.ts`)

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

No network call, no API key, nothing to approve. The review screen works identically whether an adapter pre-fills nothing (the stub) or pre-fills everything (a future real adapter) — it's the same form either way, just starting from different default values.

## Domain functions

**`src/lib/receipts.ts`:**
- `createDraftReceipt(prisma, userId, input)` — creates a `Receipt` with `status: "DRAFT"`.
- `addImage(prisma, userId, receiptId, objectKey)` / `removeImage(prisma, userId, imageId)` — ownership-checked; `removeImage` only ever touches `ReceiptImage`, per the design doc's isolation rule (ownership-checked the same way as every other domain function this session — never trusting a bare id).
- `addLine`/`updateLine`/`deleteLine` — manage `ReceiptLine` rows on a still-`DRAFT`/`REVIEWED` receipt (never on a `CONFIRMED` one — that would silently change history after the fact).
- `runOcrExtraction(prisma, userId, receiptId, imageBuffers, adapter: OcrAdapter)` — calls `adapter.extract()` per image, creates one `ReceiptLine` per extracted line (all blank-default with the stub), sets `Receipt.status = "REVIEWED"`, and pre-fills `subtotal`/`tax`/`grandTotal`/`storeId` (via `getOrCreateStore`) from whatever the adapter returned (nothing, with the stub).
- `computeReconciliation(receipt, lines)` — pure function: `subtotal − discount + tax + fees` compared against `sum(line.lineTotal for non-excluded lines) + unitemizedDifference`; returns `{ reconciled: boolean, difference: number }`. Blocks confirm when `!reconciled`.
- `confirmReceipt(prisma, userId, receiptId, input: { accountId, categoryId })` — the one function that touches balances:
  1. Re-checks `computeReconciliation` server-side (never trusts client state).
  2. Calls `createExpenseLikeTransaction` exactly once for `receipt.grandTotal` (or the reconciled total), on the given account/category — the same function every other expense already uses.
  3. Sets `Receipt.transactionId` to the new transaction's id, `status: "CONFIRMED"`.
  4. For each non-excluded line with a `catalogItemId` (matched, not one-off) and a `unitPrice`, calls `recordPrice(..., source: "RECEIPT")` — append-only, exactly as Plan 23 already guarantees.
  5. If the user's `receiptAutoDeleteImages` is `true`, deletes every `ReceiptImage` row and its Blob object for this receipt.
  - Tested invariant: exactly one `Transaction` created, N `ShoppingPriceHistory` rows created (N = matched lines with a price), zero other writes that touch a balance.

**`src/lib/receipts/storage.ts`** (Vercel Blob wrapper — the only file that imports `@vercel/blob`, so swapping storage providers later means changing one file):
- `uploadReceiptImage(userId, receiptId, file): Promise<string>` — returns the `objectKey` (the Blob pathname, not its full public URL — private mode means every read goes through a signed/authenticated fetch, not a bare URL).
- `deleteReceiptImage(objectKey): Promise<void>`.
- `getReceiptImageUrl(objectKey): Promise<string>` — a short-lived signed URL for display.

## Reconciliation rule (worked example)

Subtotal ₱500, discount ₱0, tax ₱60, fees ₱0 → expected ₱560. Line totals sum to ₱540, `unitemizedDifference` is 0 → mismatch of ₱20. Confirm is blocked; the user either corrects a line (finds the ₱20 gap) or explicitly sets `unitemizedDifference: 2000` (minor units) to acknowledge "the receipt has ₱20 of stuff I'm not itemizing" — at which point `540 + 20 = 560` reconciles and confirm unblocks.

## Review screen (`src/app/(app)/shopping/page.tsx`'s "Scan Receipt" tab, replacing its placeholder)

- **Capture**: multi-file input (camera-capture attribute on mobile), thumbnail strip with remove/reorder, "Run extraction" button (calls the stub — visibly does nothing yet, which is expected and stated in the UI so it doesn't read as broken).
- **Review**: one row per `ReceiptLine` — name (editable), quantity, unit price, line total, a catalog-match picker (search existing `ShoppingCatalogItem`s or "Add as new catalog item"), category, an "Exclude" toggle ("not a purchase line" — e.g. a payment-method surcharge line that shouldn't count as a spending category).
- **Totals**: subtotal/discount/tax/fees/grand-total fields (manual entry, since the stub never fills them), a live reconciliation banner (🟢 reconciled / 🔴 off by ₱X, with a one-click "set unitemized difference to ₱X" fix), account + category pickers for the transaction `confirmReceipt` will create.
- **Confirm** button disabled until reconciled; on success, navigates to the created transaction's normal spot in Transactions (or shows a success toast with a link — whichever is simpler to wire, decided during implementation) and shows "Confirmed — received" styling consistent with Year Plan's linked-forecast display.

## Privacy & lifecycle

- A manual "Delete image" action per `ReceiptImage`, always available regardless of `Receipt.status`.
- The `receiptAutoDeleteImages` toggle lives in Settings, defaulting off.
- No receipt image, its `objectKey`, or its signed URL is ever written to a server log, an error message, or `scripts/seed-demo-data.mjs`.

## Testing

Pure/domain functions get mocked-Prisma or plain-input `.test.ts`s per the project's convention. Specifically: `computeReconciliation`'s worked example and edge cases (exact match, `unitemizedDifference` closing a gap, excluded lines correctly omitted from the line-total sum), and `confirmReceipt`'s "exactly one transaction, N price-history rows, zero other balance-affecting writes" invariant with a mocked Prisma client asserting call counts. `src/lib/receipts/storage.ts` is not unit-tested against the real Blob API (no network in tests, per project convention) — it's verified manually against the live deployment once `BLOB_READ_WRITE_TOKEN` is configured.
