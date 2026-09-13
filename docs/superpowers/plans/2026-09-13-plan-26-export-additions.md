# Plan 26 — Export Additions (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section H. **Depends on:** whichever of Plans 22–25 have shipped by the time this runs (a model with no data yet just exports an empty set — no hard blocker, but there's nothing to export until each feature exists).

**Status:** Awaiting approval.

**Explicitly omitted (already shipped, not touched):** `/api/export/transactions`, `buildTransactionExportRows`, `toCsv`/`toJson`/`toXlsx` in `src/lib/export-format.ts` — reused as-is, not rewritten.

## Phase 26.1 — New row-builders

- `buildYearPlanExportRows` (plan assumptions, phases, forecasts), `buildVacationReserveExportRows`, `buildShoppingExportRows` (lists + items), `buildCatalogExportRows`, `buildPurchaseExportRows` (receipts + lines, `objectKey` only — never image bytes), `buildPriceHistoryExportRows`, `buildCustomReminderExportRows` — each a thin query + map, same shape as `buildTransactionExportRows`.

## Phase 26.2 — Route + Settings UI extension

- Extend `/api/export/transactions`'s pattern with sibling routes (or one parameterized route — decided in this phase's detailed plan) for each new export kind, reusing the existing `toCsv`/`toJson`/`toXlsx` serializers unchanged (they're already generic over row shape).
- Extend the Settings → Export form with a "what to export" selector alongside the existing format/filter controls.

## Phase 26.3 — JSON backup relationship preservation

- A combined "full backup" JSON export (all new models plus transactions) that preserves foreign-key relationships as IDs, matching the schema's own relations — verified by round-tripping a small fixture through export and confirming every reference resolves.
- Explicit test that `ReceiptImage.objectKey` appears in the JSON backup but no image bytes/URLs are ever embedded, and that CSV/XLSX exports never include an image column at all.

## Open questions before Phase 26.1 starts

1. Whether "export additions" ships as one export request per model family (mirroring today's one-format-per-request transaction export) or the combined full-backup JSON (Phase 26.3) is the only way to get the new data out, with per-model CSV/XLSX still one-at-a-time — leaning toward supporting both, confirmed here since it affects the route shape in Phase 26.2.
