# Receipt Alias Learning — Design

**Goal:** Stop asking the user to re-match the same receipt line item or store every time it appears. Learn from their first correction and auto-resolve it on every later receipt.

**Context:** Receipt lines already have a manual "catalog item" dropdown ([receipt-line-row.tsx](../../../src/components/receipts/receipt-line-row.tsx)) that the user re-picks on every single receipt, even for the exact same raw text. Store names are typed once at receipt-creation time with no way to correct them afterward. Both gaps are addressed the same way: reuse the per-user `Alias` table that Plan 27 already extended for shopping items, and add a `"shopping_store"` kind alongside it.

---

## 1. Alias module relocation

`src/lib/quick-capture/aliases.ts` is no longer quick-capture-specific once receipts depends on it too. Move it (and its test) to `src/lib/aliases.ts`, updating the two existing import sites (`src/lib/quick-capture/deterministic-parser.ts`, its own test file). No behavior change — pure move + import-path update.

`AliasKind` widens from `"account" | "category" | "shopping_item"` to also include `"shopping_store"`.

## 2. Catalog item learning (receipt lines)

**Learn:** `addLine` and `updateLine` in `src/lib/receipts.ts`, after writing the line, check: if `catalogItemId` is non-null and `name` is non-empty, call `createAlias(prisma, userId, { kind: "shopping_item", alias: name, targetId: catalogItemId })`. This covers both the "Add a line" manual-entry flow and every edit made through the per-line dropdown in `receipt-line-row.tsx` — no UI change needed, the existing dropdown already produces this signal.

**Recall:** when a line is created with `catalogItemId === null` (both `runOcrExtraction`'s OCR-produced lines and `addLine`'s manual-entry path when the user leaves the dropdown at "No catalog match"), resolve first: call `resolveAlias(prisma, userId, "shopping_item", name, activeCatalogItems)` (candidates from the existing `listActiveCatalogItems(prisma, userId)` in `src/lib/shopping-catalog.ts`). If `status === "resolved"`, use that id as `catalogItemId` instead of `null`. Ambiguous or unresolved candidates are left as `null`, exactly like today — this never blocks or guesses wrong, it only fills in what it's confident about.

## 3. Store learning (per receipt)

Store name has no correction point today: it's typed once at draft-creation (`receipt-capture.tsx` → `createDraftReceiptAction` → `getOrCreateStore`), before any OCR ever runs, and is never revisited.

**New field:** `Receipt.rawStoreText String?` — the raw text (typed today; a future real OCR adapter's `result.store` guess tomorrow) that produced the receipt's current store, or that failed to resolve to one. This is what a later correction aliases *from*.

- `createDraftReceiptAction` sets `rawStoreText` to whatever the user typed (or `null` if left blank), in addition to resolving `storeId` via `getOrCreateStore` as it does today.
- `runOcrExtraction` (in `src/lib/receipts.ts`): if the adapter's `result.store` is present, resolve it via `resolveAlias(prisma, userId, "shopping_store", result.store, existingStores)` (candidates: `prisma.shoppingStore.findMany({ where: { userId } })`, mapped to `{id, name}`). If resolved uniquely **and** the receipt doesn't already have a `storeId` (never override a store the user explicitly set), set `storeId` to the resolved id. Regardless of resolution, always set `rawStoreText = result.store` so the review screen has something to learn from even when nothing resolved. The `StubOcrAdapter` returns no `store`, so this path is inert until a real adapter exists — same "ships now, activates later" shape as the rest of the OCR pipeline.

**New correction UI:** a "Store" card on the review screen (`receipt-review.tsx`), shown alongside the existing Lines/Totals/Confirm cards:
- Shows the current store name (or blank), and — when `storeId` is null but `rawStoreText` is set — a hint: `Detected: "STO ALCPRO MKT" — pick or type the actual store`.
- A text input (same free-text-with-get-or-create pattern as `receipt-capture.tsx`'s store field) + Save button.
- Saving calls a new `setReceiptStore(prisma, userId, receiptId, storeName)` in `src/lib/receipts.ts`: resolves/creates the store via `getOrCreateStore`, updates `receipt.storeId`, and — if `receipt.rawStoreText` is non-null and non-empty — calls `createAlias(prisma, userId, { kind: "shopping_store", alias: rawStoreText, targetId: newStoreId })`. It also updates `rawStoreText` to the newly typed name (so a second correction on the same receipt aliases from the latest text, not a stale one).

New action: `updateReceiptStoreAction(receiptId, formData)` in `src/actions/receipt.actions.ts`, validated by a new `receiptStoreSchema` in `src/lib/validations/receipts.ts` (`{ storeName: z.string() }`, empty string allowed = clear the store). Revalidates `/shopping` like the other receipt actions.

`src/app/(app)/shopping/page.tsx`'s `ScanReceiptTab` needs to `include: { store: true }` on the `activeReceipt` query (or a follow-up `findFirst`) so it can pass `storeName`/`rawStoreText` down to `ReceiptReview`.

## 4. Data flow example

1. Receipt created, store left blank. OCR (or, until a real adapter exists, a manually-typed name) produces raw text `"STO ALCPRO MKT"`. No alias exists yet → review screen shows it unresolved with the "Detected: …" hint.
2. User types/picks "Alfamart" once in the Store card → alias `shopping_store: "sto alcpro mkt" → Alfamart` is saved.
3. Next receipt with that same raw text auto-resolves `storeId` to Alfamart during `runOcrExtraction` — no prompt.
4. Same pattern for a line: raw name `"STO ALCPRO 780"` → user picks catalog item "Beer" once in the line dropdown → alias `shopping_item: "sto alcpro 780" → Beer`. The next receipt with that raw name auto-fills "Beer" as soon as the line is created.

## 5. Non-goals (explicitly out of scope)

- No UI for viewing/editing/deleting learned aliases directly (matches the existing shopping-item/account/category aliases — write-only via natural corrections, no admin screen). A future "manage aliases" settings page is a separate concern.
- No change to the `StubOcrAdapter` itself or to wiring up a real OCR provider — this only makes sure the alias-learning plumbing is in place and correct for when one exists, using the manual-entry paths that already work today as the real trigger.
- No fuzzy/typo-tolerant matching beyond what `resolveAlias` already does (exact alias lookup, then exact-name, then unique-substring match) — consistent with every other alias kind.

## 6. Testing

Standard per-function TDD against the existing mocked-Prisma fixture convention (`makeFakePrisma(overrides)`):
- `aliases.test.ts` (moved to `src/lib/aliases.test.ts`) — no new tests needed beyond the move; `shopping_store` reuses the same generic `createAlias`/`resolveAlias` functions already covered for `shopping_item`.
- `receipts.test.ts` — new cases: `addLine`/`updateLine` write an alias when `catalogItemId` is set; a new line with no `catalogItemId` resolves via an existing alias; `runOcrExtraction` resolves/records `rawStoreText`; `setReceiptStore` creates/updates the alias and store correctly, including the "no `rawStoreText`, nothing to alias" case.
- No e2e/UI test — none exist for the receipts feature today, consistent with the rest of the codebase.
