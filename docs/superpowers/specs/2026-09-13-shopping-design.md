# Shopping (Lists, Catalog, Prices) — Design

**Status:** Approved. Scope: Phases 23.1–23.4 of the `plan-23` roadmap (catalog/price schema, list schema + CRUD, the Shopping page, Dashboard/Calendar hookup). Receipt scanning/OCR is explicitly out of scope — that's Plan 24, and this page's "Scan Receipt" sub-view ships as a placeholder pointing at it.

**Depends on:** Nothing from Plans 20–22 structurally, but reuses `Category`, the `Alias` table, `BudgetAllocation`/`listAllocationsWithActuals`, and the app's existing Card/table/dialog UI patterns.

## Decisions made this pass

1. **Aliases reuse the existing `Alias` table** (`kind: "shopping_item"`, `targetId` = a `ShoppingCatalogItem.id`) rather than a plain `String[]` field on the catalog item — consistent with how account/category name-matching already works for Quick Capture, and extends that existing resolution logic instead of introducing a second pattern.
2. **Shopping allowance is a per-list, optional link to a Budget category.** `ShoppingList.budgetCategoryId String?` — when set, the list's "remaining allowance" reads that category's remaining amount (`effectivePlanned − actual`) in the currently active `BudgetPeriod`, via the same shape `listAllocationsWithActuals` already produces. When left unset, the list simply has no allowance/over-budget tracking — this is opt-in per list, not a forced setting.
3. **No visual-mockup round for this pass** — the UI here (checklists, cards, tables) is fully covered by the existing design system and doesn't introduce a genuinely new visual paradigm the way Year Plan's grouped-table-plus-chart did.

## Schema

```prisma
model ShoppingCatalogItem {
  id               String    @id @default(cuid())
  userId           String
  canonicalName    String
  brand            String?
  size             String?
  unit             String?
  categoryId       String?
  defaultQuantity  Float     @default(1)
  preferredStoreId String?
  isFavorite       Boolean   @default(false)
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user      User                   @relation(fields: [userId], references: [id])
  category  Category?              @relation(fields: [categoryId], references: [id])
  store     ShoppingStore?         @relation(fields: [preferredStoreId], references: [id])
  prices    ShoppingPriceHistory[]
  listItems ShoppingListItem[]
}

model ShoppingStore {
  id     String @id @default(cuid())
  userId String
  name   String

  user   User                   @relation(fields: [userId], references: [id])
  items  ShoppingCatalogItem[]
  prices ShoppingPriceHistory[]
}

model ShoppingPriceHistory {
  id            String   @id @default(cuid())
  userId        String
  catalogItemId String
  storeId       String?
  unitPrice     Int      // minor units
  confirmedAt   DateTime @default(now())
  source        String   @default("MANUAL") // MANUAL | RECEIPT (RECEIPT unused until Plan 24)

  user        User                @relation(fields: [userId], references: [id])
  catalogItem ShoppingCatalogItem @relation(fields: [catalogItemId], references: [id])
  store       ShoppingStore?      @relation(fields: [storeId], references: [id])
}
// Append-only — a new confirmed price is always a new row, never an UPDATE
// to an existing one. "Latest price" = most recent row per (catalogItem,
// store), falling back to most recent row for that catalogItem at any
// store when no same-store price exists.

model ShoppingList {
  id              String    @id @default(cuid())
  userId          String
  name            String
  isCurrent       Boolean   @default(false)
  plannedDate     DateTime?
  budgetCategoryId String?  // Decision 2 — optional per-list allowance link
  createdAt       DateTime  @default(now())

  user     User               @relation(fields: [userId], references: [id])
  category Category?          @relation(fields: [budgetCategoryId], references: [id])
  items    ShoppingListItem[]
}

model ShoppingListItem {
  id                 String   @id @default(cuid())
  userId             String
  listId             String
  catalogItemId      String?  // null if a one-off item never added to the catalog
  freeTextName       String?  // used when catalogItemId is null
  quantity           Float
  unit               String?
  estimatedUnitPrice Int?     // minor units, null = missing-price state
  preferredStoreId   String?
  categoryId         String?
  priority           String   @default("NORMAL")
  notes              String?
  isSelected         Boolean  @default(false)
  isPurchased        Boolean  @default(false)
  sortOrder          Int      @default(0)

  user        User                 @relation(fields: [userId], references: [id])
  list        ShoppingList         @relation(fields: [listId], references: [id])
  catalogItem ShoppingCatalogItem? @relation(fields: [catalogItemId], references: [id])
  store       ShoppingStore?       @relation(fields: [preferredStoreId], references: [id])
  category    Category?            @relation(fields: [categoryId], references: [id])
}
```

`estimatedTotal` (the design doc's derived/stored convenience field) is **not** stored — this project's existing pattern for derived money values is to recompute them in a pure function at read time (`computeAccountBalance`, `computeSafeToSpend`, `projectYearPlanCutoffs` all do this), not to cache them on the row. `computeEstimatedTotals` (below) takes the plain item list and does this on every read that needs it.

## Domain functions

**Catalog/prices** (`src/lib/shopping-catalog.ts`):
- `createCatalogItem(prisma, userId, input)` — creates the item; `aliases` (if any were typed on creation) are written as `Alias` rows with `kind: "shopping_item"`, not a field on the item itself.
- `recordPrice(prisma, userId, catalogItemId, input: { storeId, unitPrice, source })` — always an insert, never an update, matching the append-only rule.
- `getLatestPrice(prisma, userId, catalogItemId, storeId?)` — resolution order: most recent row for `(catalogItemId, storeId)` → most recent row for `catalogItemId` at any store → `null`.
- `getPriceHistory(prisma, userId, catalogItemId)` — all rows, most recent first.

**Lists** (`src/lib/shopping-list.ts`):
- `createList`, `addItem`, `updateItem`, `toggleSelected`, `togglePurchased`, `deleteItem` — all `userId`-scoped per the app's ownership-check convention (established in Plan 22's `year-plan.ts`).
- `moveUnpurchasedToNewList(prisma, userId, listId)` — creates a new list, moves every `isPurchased: false` item from the source list into it (re-parented, not duplicated), leaves the source list's purchased items in place as history. The new list becomes `isCurrent: true` and the source list's `isCurrent` is cleared, so "Current List" seamlessly follows the leftover items forward.
- `computeShoppingAllowance(prisma, userId, list)` — when `list.budgetCategoryId` is set, resolves the active `BudgetPeriod`'s allocation for that category and returns its remaining amount; returns `null` when unset (no allowance tracking for that list).

**Pure math** (`src/lib/shopping-totals.ts`, no Prisma dependency — same pattern as `computeSafeToSpend`/`year-plan-reserve.ts`):
```ts
computeEstimatedTotals(items: { isSelected: boolean; quantity: number; estimatedUnitPrice: number | null }[]): {
  estimatedTotal: number;       // sum of quantity × estimatedUnitPrice for isSelected items with a known price
  hasMissingPrice: boolean;     // true if any *selected* item has estimatedUnitPrice === null
  overBudget: boolean | null;   // null when no allowance was supplied; otherwise estimatedTotal > allowance
}
```
An unselected item is excluded from the total because it's unselected. A selected item with no price is excluded from the total *and* sets `hasMissingPrice` — never silently treated as 0, per the design doc's explicit rule, so the total never understates what a trip will actually cost.

## Page (`src/app/(app)/shopping/page.tsx`)

Five sub-views, tab-switched on one page (matching the app's existing single-page-with-sections convention rather than five separate routes):
- **Current List** — the one `ShoppingList` with `isCurrent: true` (created on first use if none exists). Checklist of items with quantity/price/selected/purchased controls, running estimated total, allowance/over-budget banner when a category is linked, Quick Add (from catalog, favorited items surfaced first), "Move unpurchased to new list" action.
- **Saved Lists** — every non-current list, most recent first, each with a "Make current" action.
- **Items & Prices** — catalog management: add/edit a catalog item, see its latest price and price history, record a new price.
- **Purchase History** — a simple reverse-chronological feed of `isPurchased: true` items across all lists (not a separate model — just a filtered query).
- **Scan Receipt** — placeholder card: "Receipt scanning is coming in a future update," no capture UI yet (Plan 24).

**Mobile layout**: Current List gets large checkboxes and a sticky running total, not a shrunk desktop table — matching the roadmap's explicit "distinct compact layout" requirement.

## Dashboard/Calendar hookup

- **"Shopping estimate"** fills Plan 21.4's last deferred Dashboard slot: the current list's `estimatedTotal` (selected items only) and, when a category is linked, its remaining allowance.
- `ShoppingList.plannedDate` exists and is settable from list creation/edit — Plan 25 (Calendar) does the actual cross-feature aggregation; this plan only guarantees the field is there and populated when the user sets it.

## Testing

Every pure/domain function gets a mocked-Prisma or plain-input `.test.ts`, per the project's established convention. Specific cases called out by the roadmap: "recording a second price never mutates the first row" (assert both rows exist, first row's fields unchanged), the three-tier latest-price resolution order, and `computeEstimatedTotals`'s worked example (one priced+selected item, one missing-price+selected item, one unselected item — assert the unselected and missing-price items are excluded from the total for their two different reasons, and that `hasMissingPrice` is `true` only because of the second item).
