# Plan 24 — Receipt Capture, OCR & Financial Integration (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section E (receipt/OCR/storage portion). **Depends on:** Plan 23 (`ShoppingCatalogItem`, `ShoppingPriceHistory` must exist to match/record against).

**Status:** Awaiting approval. Entirely new. **No paid OCR/vision provider is added without your explicit approval** — this plan ships a stub adapter that makes the whole review/confirm flow work with 100% manual entry, and stops there until you say which real provider (if any) to wire in.

## Phase 24.1 — Schema

- `Receipt`, `ReceiptLine`, `ReceiptImage` models (design doc section E), migration.
- `createDraftReceipt`/`addImage`/`removeImage` domain functions.

## Phase 24.2 — OCR adapter interface + stub

- `OcrAdapter` interface, `StubOcrAdapter` (returns an empty extraction — every field starts blank/manual), `src/lib/receipts/ocr-adapter.ts`.
- This phase explicitly does **not** call any external API — confirmed no network dependency, no API key, nothing to approve yet.

## Phase 24.3 — Image capture UI

- Mobile camera capture, existing-image picker, desktop upload, multi-image support (long receipts).
- Preview/crop/rotate/retake/remove/reorder controls, client-side safe compression before upload.
- Upload target: private per-user object storage (Vercel Blob in private mode is the design doc's suggested default — **confirm before this phase starts**, since it may have plan/cost implications outside pure code).

## Phase 24.4 — Receipt review screen

- Per-line correct/match-to-catalog/add-new/categorize/exclude actions.
- Reconciliation check (`subtotal − discount + tax + fees` vs. `grandTotal`, vs. summed line totals) blocking confirm until resolved or an explicit `unitemizedDifference` is set.
- "Confirm" action: creates exactly one `EXPENSE` transaction via the existing `createExpenseLikeTransaction` (never a new transaction-creation path), sets `Receipt.transactionId`, writes `ShoppingPriceHistory` rows for each matched/new catalog item's price (`source: "RECEIPT"`), sets `Receipt.status = "CONFIRMED"`.
- Tests: the "one parent transaction, N price-history rows, zero additional balance-affecting writes" invariant, mirroring the design doc's double-counting safeguard section; a credit-card receipt case asserting liability increases without touching liquid funds (reusing the existing, already-tested credit-card-charge behavior — no new logic to test there, just confirming the receipt path routes into it correctly).

## Phase 24.5 — Privacy & lifecycle

- Receipt-image deletion action (never touches the confirmed `Receipt`/`ReceiptLine`/`Transaction`).
- Optional auto-delete-after-confirm setting.
- Confirm no receipt image or its object-storage URL is ever written to a log, error message, or the demo-seed data.

## Open questions before Phase 24.1 starts

1. Object storage provider/mode (Phase 24.3) — confirm Vercel Blob (private) or specify an alternative.
2. Whether "auto-delete after confirm" defaults on or off (privacy-favoring default would be **on**, but that's a product choice, not a technical one).
3. Any real OCR/vision provider to wire in behind the adapter, and when (can remain a stub indefinitely if you'd rather do all entry manually).
