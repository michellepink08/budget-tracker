# Plan 35 — Shopping Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Shopping (catalog, price history, lists, the Shopping page, Dashboard hookup) per `docs/superpowers/specs/2026-09-13-shopping-design.md`. Receipt/OCR (Plan 24) is out of scope — "Scan Receipt" ships as a placeholder.

**Architecture:** Five new Prisma models (`ShoppingCatalogItem`, `ShoppingStore`, `ShoppingPriceHistory`, `ShoppingList`, `ShoppingListItem`) plus two domain modules (`src/lib/shopping-catalog.ts`, `src/lib/shopping-list.ts`) and one pure-math module (`src/lib/shopping-totals.ts`, no Prisma — same pattern as `year-plan-reserve.ts`). One page with five tab-switched sub-views. Full CRUD (create/edit/delete) is built in from the start this time, per the established pattern from the Year Plan follow-up.

**Tech Stack:** Next.js Server Components/Actions, Prisma, Vitest with mocked Prisma clients, zod, the app's existing `Card`/`Dialog`/`AlertDialog` components.

---

## Task 1: Constants

**Files:**
- Modify: `src/lib/constants/financial.ts`

- [ ] Add:

```typescript
export const SHOPPING_ITEM_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type ShoppingItemPriority = (typeof SHOPPING_ITEM_PRIORITIES)[number];

export const PRICE_SOURCES = ["MANUAL", "RECEIPT"] as const; // RECEIPT unused until Plan 24
export type PriceSource = (typeof PRICE_SOURCES)[number];
```

- [ ] Commit: `git commit -m "feat(shopping): add shopping constant enums"`

---

## Task 2: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the five models**, after `model IncomeForecast { ... }`:

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
  store     ShoppingStore?         @relation(fields: [preferredStoreId], references: [id], name: "CatalogPreferredStore")
  prices    ShoppingPriceHistory[]
  listItems ShoppingListItem[]
}

model ShoppingStore {
  id     String @id @default(cuid())
  userId String
  name   String

  user           User                   @relation(fields: [userId], references: [id])
  catalogItems   ShoppingCatalogItem[]  @relation("CatalogPreferredStore")
  listItems      ShoppingListItem[]     @relation("ListItemPreferredStore")
  prices         ShoppingPriceHistory[]
}

model ShoppingPriceHistory {
  id            String   @id @default(cuid())
  userId        String
  catalogItemId String
  storeId       String?
  unitPrice     Int
  confirmedAt   DateTime @default(now())
  source        String   @default("MANUAL")

  user        User                @relation(fields: [userId], references: [id])
  catalogItem ShoppingCatalogItem @relation(fields: [catalogItemId], references: [id])
  store       ShoppingStore?      @relation(fields: [storeId], references: [id])
}

model ShoppingList {
  id               String    @id @default(cuid())
  userId           String
  name             String
  isCurrent        Boolean   @default(false)
  plannedDate      DateTime?
  budgetCategoryId String?
  createdAt        DateTime  @default(now())

  user     User               @relation(fields: [userId], references: [id])
  category Category?          @relation(fields: [budgetCategoryId], references: [id])
  items    ShoppingListItem[]
}

model ShoppingListItem {
  id                 String   @id @default(cuid())
  userId             String
  listId             String
  catalogItemId      String?
  freeTextName       String?
  quantity           Float
  unit               String?
  estimatedUnitPrice Int?
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
  store       ShoppingStore?       @relation(fields: [preferredStoreId], references: [id], name: "ListItemPreferredStore")
  category    Category?            @relation(fields: [categoryId], references: [id])
}
```

Note the two named relations (`CatalogPreferredStore`, `ListItemPreferredStore`) — `ShoppingStore` is referenced from two different fields on two different models, so each needs an explicit relation name to disambiguate (Prisma requires this whenever more than one relation could exist between the same two models).

- [ ] **Step 2: Add back-relations.** In `model User`, add after `incomeForecasts IncomeForecast[]`:

```prisma
  shoppingCatalogItems ShoppingCatalogItem[]
  shoppingStores       ShoppingStore[]
  shoppingPriceHistory ShoppingPriceHistory[]
  shoppingLists        ShoppingList[]
  shoppingListItems    ShoppingListItem[]
```

In `model Category`, add after `installmentPurchases InstallmentPurchase[]`:

```prisma
  shoppingCatalogItems ShoppingCatalogItem[]
  shoppingLists        ShoppingList[]
  shoppingListItems    ShoppingListItem[]
```

- [ ] **Step 3: Extend the `Alias.kind` comment** (no schema change — `kind` is already a plain `String`, just document the new value):

```prisma
  kind      String   // "account" | "category" | "shopping_item"
```

- [ ] **Step 4: Regenerate the Prisma Client**

Run: `npm run db:generate`
Expected: clean

- [ ] **Step 5: Validate**

Run: `npx prisma validate`
Expected: "The schema ... is valid"

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(shopping): add ShoppingCatalogItem, ShoppingStore, ShoppingPriceHistory, ShoppingList, ShoppingListItem models"
```

---

## Task 3: Catalog + price domain functions (`src/lib/shopping-catalog.ts`)

**Files:**
- Create: `src/lib/shopping-catalog.ts`
- Test: `src/lib/shopping-catalog.test.ts`

- [ ] **Step 1: Write failing tests** covering:
  - `createCatalogItem` creates the item scoped to `userId`, and writes an `Alias` row (`kind: "shopping_item"`) for each alias string passed in (assert `prisma.alias.create` called once per alias, normalized lowercase/trimmed to match the existing `Alias` convention — check `src/lib/aliases.ts` or wherever existing alias-writing logic lives first and mirror its normalization exactly)
  - `recordPrice` always inserts (never calls `.update`) — assert `prisma.shoppingPriceHistory.update` is never even referenced/called
  - `getLatestPrice`: same-store price found → returned; no same-store price but an any-store price exists → that one returned; no prices at all → `null`
  - `updateCatalogItem`/`deleteCatalogItem` — ownership-checked (mirror `year-plan.ts`'s `assertOwned*` pattern)
  - `getPriceHistory` returns rows ordered most-recent-first

- [ ] **Step 2: Run tests, verify they fail** (module not found)

- [ ] **Step 3: Implement.** Check `src/lib/aliases.ts` (or equivalent) for the exact normalization the existing alias-writing code uses before writing this — do not invent a second normalization rule.

```typescript
import type { PrismaClient } from "@prisma/client";

export type ShoppingMutationResult = { ok: true; id: string } | { ok: false; error: string };

type CatalogPrisma = Pick<PrismaClient, "shoppingCatalogItem" | "alias">;

export async function createCatalogItem(
  prisma: CatalogPrisma,
  userId: string,
  input: {
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    aliases: string[];
  },
) {
  const { aliases, ...itemInput } = input;
  const item = await prisma.shoppingCatalogItem.create({ data: { userId, ...itemInput } });
  for (const alias of aliases) {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) continue;
    await prisma.alias.create({
      data: { userId, kind: "shopping_item", alias: normalized, targetId: item.id },
    });
  }
  return item;
}

async function assertOwnedCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
): Promise<boolean> {
  const item = await prisma.shoppingCatalogItem.findFirst({ where: { id: catalogItemId, userId } });
  return item !== null;
}

export async function updateCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
  input: Partial<{
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    isFavorite: boolean;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const item = await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: input });
  return { ok: true, id: item.id };
}

// Archive, not hard-delete — matches the app's Account/Category convention
// (archivedAt) rather than the Year Plan's hard-delete convention, since a
// catalog item is referenced by historical price rows and past list items
// that should keep displaying correctly.
export async function archiveCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: { archivedAt: new Date() } });
  return { ok: true };
}

export async function recordPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
  input: { storeId: string | null; unitPrice: number; source: string },
) {
  return prisma.shoppingPriceHistory.create({ data: { userId, catalogItemId, ...input } });
}

export async function getLatestPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
  storeId?: string,
) {
  if (storeId) {
    const sameStore = await prisma.shoppingPriceHistory.findFirst({
      where: { userId, catalogItemId, storeId },
      orderBy: { confirmedAt: "desc" },
    });
    if (sameStore) return sameStore;
  }
  return prisma.shoppingPriceHistory.findFirst({
    where: { userId, catalogItemId },
    orderBy: { confirmedAt: "desc" },
  });
}

export async function getPriceHistory(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
) {
  return prisma.shoppingPriceHistory.findMany({
    where: { userId, catalogItemId },
    orderBy: { confirmedAt: "desc" },
  });
}
```

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/lib/shopping-catalog.ts src/lib/shopping-catalog.test.ts
git commit -m "feat(shopping): add catalog/price domain functions"
```

---

## Task 4: Pure math (`src/lib/shopping-totals.ts`)

**Files:**
- Create: `src/lib/shopping-totals.ts`
- Test: `src/lib/shopping-totals.test.ts`

- [ ] **Step 1: Write failing tests** from the spec's worked example (one priced+selected item, one missing-price+selected item, one unselected item):

```typescript
import { describe, expect, it } from "vitest";
import { computeEstimatedTotals } from "@/lib/shopping-totals";

describe("computeEstimatedTotals", () => {
  it("sums only selected items with a known price", () => {
    const result = computeEstimatedTotals({
      items: [
        { isSelected: true, quantity: 2, estimatedUnitPrice: 5000 }, // 10000
        { isSelected: true, quantity: 1, estimatedUnitPrice: null }, // missing price
        { isSelected: false, quantity: 3, estimatedUnitPrice: 2000 }, // unselected
      ],
      allowance: null,
    });
    expect(result.estimatedTotal).toBe(10000);
    expect(result.hasMissingPrice).toBe(true);
    expect(result.overBudget).toBeNull();
  });

  it("does not flag hasMissingPrice for an unselected item with no price", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: false, quantity: 1, estimatedUnitPrice: null }],
      allowance: null,
    });
    expect(result.hasMissingPrice).toBe(false);
  });

  it("flags overBudget when the total exceeds the allowance", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: true, quantity: 1, estimatedUnitPrice: 10000 }],
      allowance: 5000,
    });
    expect(result.overBudget).toBe(true);
  });

  it("does not flag overBudget when the total is within the allowance", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: true, quantity: 1, estimatedUnitPrice: 3000 }],
      allowance: 5000,
    });
    expect(result.overBudget).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```typescript
export function computeEstimatedTotals(params: {
  items: { isSelected: boolean; quantity: number; estimatedUnitPrice: number | null }[];
  allowance: number | null;
}): { estimatedTotal: number; hasMissingPrice: boolean; overBudget: boolean | null } {
  const selected = params.items.filter((item) => item.isSelected);
  const hasMissingPrice = selected.some((item) => item.estimatedUnitPrice === null);
  const estimatedTotal = selected
    .filter((item) => item.estimatedUnitPrice !== null)
    .reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice as number), 0);
  const overBudget = params.allowance === null ? null : estimatedTotal > params.allowance;
  return { estimatedTotal, hasMissingPrice, overBudget };
}
```

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/lib/shopping-totals.ts src/lib/shopping-totals.test.ts
git commit -m "feat(shopping): add computeEstimatedTotals pure function"
```

---

## Task 5: List domain functions (`src/lib/shopping-list.ts`)

**Files:**
- Create: `src/lib/shopping-list.ts`
- Test: `src/lib/shopping-list.test.ts`

- [ ] **Step 1: Write failing tests** covering:
  - `createList` creates a list scoped to `userId`; if no other current list exists this becomes `isCurrent: true` automatically on first creation (check via a `findFirst({isCurrent: true})` before creating — if a current list already exists, the new one is NOT current by default)
  - `addItem`/`updateItem`/`deleteItem` — ownership-checked via the list
  - `toggleSelected`/`togglePurchased` — flips the boolean (assert the exact `update` call, e.g. reading the row first then writing `!current`)
  - `moveUnpurchasedToNewList`: creates a new list (`isCurrent: true`), moves (via `updateMany` re-parenting `listId`, not create+delete) every `isPurchased: false` item from the source list to the new one, clears the source list's `isCurrent`
  - `makeListCurrent`: clears any existing current list, sets the given list current; rejects when the list doesn't belong to the user
  - `computeShoppingAllowance`: returns `null` when `list.budgetCategoryId` is null; returns the matching allocation's `remaining` when set and an allocation exists for the active period; returns `null` when set but no allocation exists this period (not an error, not 0)

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```typescript
import type { PrismaClient } from "@prisma/client";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";

export type ShoppingMutationResult = { ok: true; id: string } | { ok: false; error: string };

type ListPrisma = Pick<PrismaClient, "shoppingList" | "shoppingListItem">;

export async function createList(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  input: { name: string; plannedDate: Date | null; budgetCategoryId: string | null },
) {
  const existingCurrent = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
  return prisma.shoppingList.create({
    data: { userId, ...input, isCurrent: existingCurrent === null },
  });
}

async function assertOwnedList(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  listId: string,
): Promise<boolean> {
  const list = await prisma.shoppingList.findFirst({ where: { id: listId, userId } });
  return list !== null;
}

export async function addItem(
  prisma: ListPrisma,
  userId: string,
  listId: string,
  input: {
    catalogItemId: string | null;
    freeTextName: string | null;
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  },
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  const item = await prisma.shoppingListItem.create({ data: { userId, listId, ...input } });
  return { ok: true, id: item.id };
}

async function assertOwnedItem(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
): Promise<boolean> {
  const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  return item !== null;
}

export async function updateItem(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
  input: Partial<{
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedItem(prisma, userId, itemId))) {
    return { ok: false, error: "Item not found" };
  }
  const item = await prisma.shoppingListItem.update({ where: { id: itemId }, data: input });
  return { ok: true, id: item.id };
}

export async function deleteItem(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedItem(prisma, userId, itemId))) {
    return { ok: false, error: "Item not found" };
  }
  await prisma.shoppingListItem.delete({ where: { id: itemId } });
  return { ok: true };
}

async function toggleBoolean(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
  field: "isSelected" | "isPurchased",
): Promise<ShoppingMutationResult> {
  const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  if (!item) return { ok: false, error: "Item not found" };
  const updated = await prisma.shoppingListItem.update({
    where: { id: itemId },
    data: { [field]: !item[field] },
  });
  return { ok: true, id: updated.id };
}

export async function toggleSelected(prisma: Pick<PrismaClient, "shoppingListItem">, userId: string, itemId: string) {
  return toggleBoolean(prisma, userId, itemId, "isSelected");
}

export async function togglePurchased(prisma: Pick<PrismaClient, "shoppingListItem">, userId: string, itemId: string) {
  return toggleBoolean(prisma, userId, itemId, "isPurchased");
}

export async function moveUnpurchasedToNewList(
  prisma: ListPrisma,
  userId: string,
  listId: string,
  newListName: string,
): Promise<{ ok: true; newListId: string } | { ok: false; error: string }> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  await prisma.shoppingList.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
  const newList = await prisma.shoppingList.create({
    data: { userId, name: newListName, isCurrent: true },
  });
  await prisma.shoppingListItem.updateMany({
    where: { listId, isPurchased: false },
    data: { listId: newList.id },
  });
  return { ok: true, newListId: newList.id };
}

export async function makeListCurrent(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  listId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  await prisma.shoppingList.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
  await prisma.shoppingList.update({ where: { id: listId }, data: { isCurrent: true } });
  return { ok: true };
}

export async function computeShoppingAllowance(
  prisma: Pick<PrismaClient, "budgetPeriod" | "budgetAllocation" | "transaction">,
  userId: string,
  list: { budgetCategoryId: string | null },
  cycleStartDay: number,
  asOf: Date = new Date(),
): Promise<number | null> {
  if (!list.budgetCategoryId) return null;
  const period = await resolveBudgetPeriodForDate(prisma, userId, asOf, cycleStartDay);
  const allocations = await listAllocationsWithActuals(prisma, userId, period.id);
  const allocation = allocations.find((a) => a.categoryId === list.budgetCategoryId);
  return allocation?.remaining ?? null;
}
```

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/lib/shopping-list.ts src/lib/shopping-list.test.ts
git commit -m "feat(shopping): add list domain functions (create/add/update/delete/toggle/moveUnpurchasedToNewList/computeShoppingAllowance)"
```

---

## Task 6: Validations + server actions

**Files:**
- Create: `src/lib/validations/shopping.ts`
- Create: `src/actions/shopping-catalog.actions.ts`
- Create: `src/actions/shopping-list.actions.ts`

- [ ] Write zod schemas for: catalog item (name/brand/size/unit/categoryId/defaultQuantity/preferredStoreId/aliases-as-comma-separated-string-split-into-array), price record (storeId/unitPrice/source), list (name/plannedDate/budgetCategoryId), list item (catalogItemId/freeTextName/quantity/unit/estimatedUnitPrice/preferredStoreId/categoryId/priority/notes).

- [ ] Write server actions mirroring `year-plan.actions.ts`'s exact shape: `createCatalogItemAction`, `updateCatalogItemAction`, `archiveCatalogItemAction`, `recordPriceAction`, `createListAction`, `addItemAction`, `updateItemAction`, `deleteItemAction`, `toggleSelectedAction`, `togglePurchasedAction`, `moveUnpurchasedToNewListAction`, `makeListCurrentAction`. Each: `auth()` check → zod parse (the last three take no form body, just an id) → `toMinorUnits` conversion for money fields → call the domain function → `revalidatePath("/shopping")` on success.

- [ ] Typecheck: `npx tsc --noEmit` (no test file for these — matches the project's convention of not unit-testing thin action wrappers)

- [ ] Commit:

```bash
git add src/lib/validations/shopping.ts src/actions/shopping-catalog.actions.ts src/actions/shopping-list.actions.ts
git commit -m "feat(shopping): add validations and server actions"
```

---

## Task 7: Shopping page

**Files:**
- Create: `src/app/(app)/shopping/page.tsx`
- Create: `src/components/shopping/current-list-view.tsx`
- Create: `src/components/shopping/saved-lists-view.tsx`
- Create: `src/components/shopping/catalog-view.tsx`
- Create: `src/components/shopping/purchase-history-view.tsx`
- Create: `src/components/shopping/list-form-dialog.tsx`
- Create: `src/components/shopping/catalog-item-form-dialog.tsx`
- Create: `src/components/shopping/list-item-form-dialog.tsx`
- Create: `src/components/shopping/delete-list-item-button.tsx`
- Create: `src/components/shopping/delete-catalog-item-button.tsx` (archive, with an "Archive" label since it's a soft delete — see Task 3's note)
- Modify: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Add nav link** — `{ href: "/shopping", label: "Shopping", icon: ShoppingCart }` (from `lucide-react`), placed after `Year Plan`.

- [ ] **Step 2: Build the five form dialogs and two delete buttons**, each following the exact pattern established in `src/components/year-plan/*` (this session's most recent prior work) — `existing` prop for edit mode, `AlertDialog`-based delete confirmation, `useForm` + plain `register`, no `zodResolver` (matching the simpler dialogs, not `AccountFormDialog`'s heavier one, since none of these forms have `watch`-dependent conditional UI).

- [ ] **Step 3: Build `current-list-view.tsx`** (client component, receives the current list + items + allowance as props): checklist rows (checkbox for `isSelected`, checkbox/strike-through for `isPurchased`, quantity/price/store shown inline, Edit/Delete per row), a running total banner at the top computed via `computeEstimatedTotals` (import directly — it's a pure function, safe to call client-side), an allowance/over-budget banner when `allowance !== null`, a mobile-specific larger-checkbox layout (`sm:hidden` / `hidden sm:block` split, same technique as `CutoffTable`), "Add item" (`ListItemFormDialog`) and "Move unpurchased to new list" actions.

- [ ] **Step 4: Build `saved-lists-view.tsx`**: every non-current list, most recent first, each as a `Card` with name/plannedDate/item count and a "Make current" button calling `makeListCurrentAction` (Task 6).

- [ ] **Step 5: Build `catalog-view.tsx`**: list of non-archived catalog items (`CatalogItemFormDialog` for add/edit, `DeleteCatalogItemButton` to archive), each row showing its latest price (via `getLatestPrice`) and an inline "Record price" action.

- [ ] **Step 6: Build `purchase-history-view.tsx`**: a simple reverse-chronological list of `ShoppingListItem` rows where `isPurchased: true` across all the user's lists (a plain `prisma.shoppingListItem.findMany({ where: { userId, isPurchased: true }, orderBy: ... })` — no new domain function needed for a read this simple, matching how simple list pages elsewhere query directly in the page component).

- [ ] **Step 7: Build `src/app/(app)/shopping/page.tsx`**: a simple tab switcher (`useState` in a small client wrapper, or a `?tab=` search param — prefer the search-param approach so a direct link to a tab works, matching how other pages in this app avoid unnecessary client state) over the five views, with the "Scan Receipt" tab rendering:

```tsx
<p className="text-muted-foreground">Receipt scanning is coming in a future update.</p>
```

- [ ] **Step 8: Typecheck, lint, build**

Run: `npx tsc --noEmit`, `npx eslint "src/app/(app)/shopping" src/components/shopping src/components/nav/nav-links.ts`, `npx next build`
Expected: all clean

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/shopping" src/components/shopping src/components/nav/nav-links.ts
git commit -m "feat(shopping): add the Shopping page (Current List, Saved Lists, Items & Prices, Purchase History, Scan Receipt placeholder)"
```

---

## Task 8: Dashboard integration

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] Fetch the current `ShoppingList` (if any) and its items, compute `computeEstimatedTotals` + `computeShoppingAllowance`, add one more compact Card (guarded, renders nothing when there's no current list or it has no selected items) labeled "Shopping estimate" showing the selected-items total and, when an allowance is linked, the remaining amount.

- [ ] Typecheck, lint, full test suite, build.

- [ ] Commit:

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): add Shopping estimate section (Plan 21.4's last deferred slot)"
```

---

## Task 9: Final verification and deploy

- [ ] `npx vitest run` — all pass
- [ ] `npx next build` — clean
- [ ] `git push`
- [ ] Wait ~30-60s for the Vercel deploy, then on the live site (demo account): visit `/shopping`, add a catalog item, record a price, create a list, add items (one with a price, one without), toggle selected/purchased, confirm the running total/missing-price/allowance banners render correctly, check Saved Lists/Items & Prices/Purchase History tabs, check the Dashboard's new section. Then delete everything created (catalog item, list, list items) via the UI to leave the demo account clean — this plan's delete/archive actions make this possible without a script, unlike Year Plan's initial pass.
