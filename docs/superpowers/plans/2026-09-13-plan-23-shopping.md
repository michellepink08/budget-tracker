# Plan 23 — Shopping Lists, Catalog & Prices (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section E (catalog/list/price schema only — receipt scanning is Plan 24). **Depends on:** nothing new from Plans 20–22 (can proceed in parallel), but reuses `Category`, `Alias`-style matching, and `Transaction` linkage patterns already shipped.

**Status:** Awaiting approval. Entirely new.

## Phase 23.1 — Catalog + price history schema

- `ShoppingCatalogItem`, `ShoppingStore`, `ShoppingPriceHistory` models (design doc section E), migration.
- `createCatalogItem`/`recordPrice` (append-only — never an `UPDATE` to a price row) / `getLatestPrice(catalogItemId, storeId?)` / `getPriceHistory` domain functions.
- Tests: an explicit "recording a second price never mutates the first row" test, "latest price" resolution order (same store → any store → null).

## Phase 23.2 — Shopping list schema + CRUD

- `ShoppingList`, `ShoppingListItem` models, migration.
- `createList`/`addItem`/`updateItem`/`toggleSelected`/`togglePurchased`/`moveUnpurchasedToNewList` domain functions.
- `computeEstimatedTotals` (pure function: selected-only sum, missing-price flag, over-budget flag against a plain `shoppingAllowance` input) — same "pure, trivially testable" pattern as `computeSafeToSpend`.
- Tests built from the design doc's fictional example numbers (a list with one priced item, one missing-price item, one unselected item — assert the unselected and missing-price items are excluded from the total for their respective, different reasons).

## Phase 23.3 — Shopping page

- New primary nav item, `src/app/(app)/shopping/page.tsx`, with the five sub-views (Current List, Saved Lists, Items & Prices, Purchase History, Scan Receipt — this phase builds everything except Scan Receipt's actual capture flow, which is Plan 24; a placeholder/empty state is fine here).
- Mobile shopping mode (large checkboxes, running total) as a distinct compact layout, not a cramped version of the desktop table.
- Quick Add, Favorites, Buy Again, "move unpurchased forward" actions wired to the Phase 23.2 functions.

## Phase 23.4 — Dashboard + Calendar hookup

- "Shopping estimate" compact Dashboard section (Plan 21.4's deferred slot): selected-items total for the current/next list.
- `ShoppingList.plannedDate` surfaced to the Calendar's aggregation function (Plan 25) — this plan only needs to make sure the field exists and is populated; Plan 25 does the aggregation.

## Open questions before Phase 23.1 starts

1. `shoppingAllowance` — a single flat number the user sets, or should it read from an existing Budget category (e.g. a "Groceries" allocation)? The request doesn't specify; the design doc assumed a plain standalone number for simplicity, but linking it to the existing Budget system may be more useful and worth a quick confirm before committing to either shape.
2. Whether `ShoppingCatalogItem.aliases` (a plain string array) is sufficient, or whether shopping items should genuinely share the existing `Alias` table (kind `"shopping_item"`) for consistency with how accounts/categories already resolve name variants via Quick Capture — leaning toward reusing `Alias` for consistency, flagged for confirmation since it changes the schema in section E slightly.
