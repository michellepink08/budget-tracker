# Major Feature Set — Updated Design Specification

**Status:** Draft — awaiting user approval before any implementation plan is executed.

**Companion document:** `docs/superpowers/specs/2026-09-13-audit-and-classification.md` (what's already shipped; read that first — nothing marked "Shipped" there is redesigned here).

This is the master design for six new initiatives (visual system, account grouping, dashboard update, Year Plan, Shopping, Calendar) plus their cross-cutting integration (conversational commands, export). Each initiative gets its own phased implementation plan (`docs/superpowers/plans/2026-09-13-plan-2X-*.md`); this document is the shared schema/calculation/safeguard reference all of them point back to, the same relationship the original `2026-09-13-conversational-quick-capture-design.md` had to its ten phase plans.

---

## A. Visual design system

### Token strategy

Replace the current 7-accent, green-default token set in `src/app/globals.css` with a **fixed Wine identity** (no more user-selectable accent — `User.accentColor` becomes unused/removable, a genuine simplification) plus a small set of **semantic status tokens** layered on top:

```css
:root {
  /* surfaces */
  --background: #FFF7F8;
  --card: #FFFFFF;
  --card-secondary: #FFFDFE;
  --panel-soft: #FBEAF0;      /* soft rose panel */
  --border: #E8D3DB;

  /* text */
  --foreground: #2C1720;
  --muted-foreground: #78636C;

  /* brand */
  --primary: #6F1D3A;         /* wine */
  --primary-dark: #54132B;
  --berry: #963956;
  --rose: #C94F70;
  --blush: #F2C7D4;

  /* status (semantic — NOT decorative) */
  --success: #2F7D5B;
  --success-background: #E5F4EC;
  --warning: #B86A2D;
  --danger: #B42335;
  --info: #657188;
}
.dark {
  --background: #150C12;
  --card: #24131B;
  --card-secondary: #301A24;
  --panel-soft: #3A1D2A;
  --border: #4C2937;
  --foreground: #FFF2F6;
  --muted-foreground: #C6AAB5;
  --primary: #D76A8D;
  --berry: #F08AAA;
  --success: #65C99A;
  --success-background: #173D2E;
  --warning: #E1A05B;
  --danger: #FF6B78;
  --info: #98A5BA;
}
```

`--sidebar`/`--nav-background` collapse to one fixed pair per mode (light: wine `#4A0F26`-family dark shade already used today, just no longer accent-parameterized; dark: `#2B101C`). `--chart-1..5` become a *data* palette drawn from berry/rose/blush/plum-neutral tones — **never** `--success` green, so a chart never accidentally implies "this is the good one" for a plain data series. Recharts series that plot income vs. expense use `--chart-1`(expense, berry) vs `--chart-2` (income, rose) — not green either; green is reserved for an explicit "under budget"/"fully funded" badge rendered next to a figure, not the figure's own color.

**Migration note:** `User.accentColor` and the `[data-accent="*"]` blocks are dropped. `AppearanceSettings` loses its accent picker (theme-mode picker stays). This is the one *removal* in an otherwise additive request — flagged explicitly since "preserve existing architecture" governs it: the accent-picker feature itself is small, already fully superseded by "the identity should remain Wine" (singular, fixed), and removing it is what the request's own palette section implies. If you'd rather keep a picker limited to wine tonal variants only, say so before the design-system plan is approved — default assumption here is a single fixed identity, since that's what "should remain Wine" reads as most plainly, and it can be revisited later without touching any other feature in this document if that reading is wrong.

### Typography scale

New Tailwind-level tokens (`@theme inline` additions), not ad-hoc classes:

| Token | Size | Used for |
|---|---|---|
| `--text-2xs` | 12px | supporting text, table data, small labels |
| `--text-xs` | 13px | nav/buttons |
| `--text-sm` | 14px (desktop) | desktop inputs, card text upper end |
| `--text-base` | 16px | mobile inputs (never smaller — prevents iOS zoom) |
| `--text-md` | 14–16px | card titles |
| `--text-lg` | 16–18px | section headers |
| `--text-xl` | 22–26px | page titles |
| `--text-2xl` | 24–32px | major financial totals (Safe to spend, Year Plan closing balance, etc.) |

### Card component

A new `src/components/ui/card.tsx` (shadcn-pattern, matching how `Dialog`/`Button` are already structured) with `Card`, `CardHeader`, `CardTitle`, `CardContent` — `bg-card` (not `bg-background`), `border-border`, light shadow `0 2px 8px rgba(84,19,43,.07), 0 1px 2px rgba(44,23,32,.05)` (dark: `0 4px 14px rgba(0,0,0,.28)`). A `raised` variant (dialogs/menus/drawers/dragged items) uses the stronger shadow. An `interactive` variant adds `hover:-translate-y-px hover:shadow-[...] transition-[transform,box-shadow] duration-150 active:translate-y-0 active:shadow-none` plus a visible `focus-visible` ring — applied only where a card is genuinely a link/button, never on purely informational cards (the request's explicit "static cards must not look clickable" rule).

Every existing hand-written `<div className="rounded-lg border p-4">` across Dashboard/Accounts/Bills/etc. becomes `<Card>` — this is the one place "already-shipped" pages get touched by this initiative, and it's a mechanical swap (no logic change), listed as its own task per page in the design-system plan.

### Icons

A new `IconBadge` component (`rounded-full`/`rounded-xl` container, sized `sm`/`md`, colored `wine`/`berry`/`blush`/`success`) wraps a `lucide-react` icon — used anywhere an icon currently floats bare (nav items, card headers, the new Shopping/Year Plan/Calendar pages).

---

## B. Account-purpose grouping

### Schema change

```prisma
model Account {
  // ...existing fields unchanged...
  purpose String @default("DISPOSABLE") // see AccountPurpose below
}
```

```ts
export const ACCOUNT_PURPOSES = ["DISPOSABLE", "SAVINGS", "RESTRICTED", "CREDIT", "DEBT"] as const;
```

**Backfill (one-time migration script, not a schema-breaking change):** existing accounts get `purpose` assigned from current signals — `accountType === "CREDIT_CARD"` → `CREDIT`; `accountType === "LOAN"` → `DEBT`; `includeInLiquidFunds === false` → `RESTRICTED`; everything else → `DISPOSABLE`. A user can then freely reclassify (e.g. mark a `SAVINGS`-typed account as `SAVINGS` purpose instead of the backfill's default) — `purpose` and `accountType` become independent, exactly as the request requires ("do not determine grouping from technical account type alone").

`includeInLiquidFunds` **stays** (it's still what `computeLiquidFunds` reads) but becomes *derived* from purpose going forward for new/edited accounts: `DISPOSABLE`/`SAVINGS` → `true`; `RESTRICTED`/`CREDIT`/`DEBT` → `false`. The account form's checkbox is replaced by a purpose selector; `includeInLiquidFunds` is set automatically from the chosen purpose (one less field for the user to keep in sync, and it removes the possibility of an internally-contradictory account like "Disposable but excluded from liquid funds").

### Savings goal (new, minimal)

```prisma
model SavingsGoal {
  id            String   @id @default(cuid())
  userId        String
  accountId     String   @unique   // one goal per Savings-purpose account, for this phase
  targetAmount  Int?                // minor units; null = no target set yet
  assignedAmount Int      @default(0) // minor units the user has earmarked toward this goal specifically
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user    User    @relation(fields: [userId], references: [id])
  account Account @relation(fields: [accountId], references: [id])
}
```

`unassignedAmount = account balance − assignedAmount` (a pure calculation, not stored). `progress = assignedAmount / targetAmount` when `targetAmount` is set. The Vacation Reserve (section C) is implemented as *one* `SavingsGoal` row linked from the Year Plan's reserve tracking — not a separate model — so "Year Plan connection" is just "this `SavingsGoal.id` is the one the active Year Plan references," and nothing hardcodes which account that is (directly satisfying "do not include unrelated restricted accounts such as Tierra Alta" and "do not hardcode... to that account").

### Restricted account: "number of payments covered" and deposit/payment history

Extend `RestrictedFundGroup` (`src/lib/restricted-funds.ts`) with:
- `paymentsCovered: number` — count of the deduped kept `PENDING` payables, in due-date order, whose cumulative `amount` sum stays `<= balance` (e.g. balance 50,000; obligations 20,000 + 15,000 + 30,000 in due-date order → covers the first two, `paymentsCovered = 2`).
- Deposit/payment history: a thin new function `listRestrictedAccountLedger(prisma, accountId)` = `listTransactions` filtered to that `accountId`, reusing the existing transaction list wholesale (no new model).

### Disposable account view

No new computation — `computeAccountBalance` (current), a "pending activity" list (`Transaction`s with `status: "PENDING"`, already a valid `TransactionStatus` value today, just not surfaced anywhere), and "safe-to-spend inclusion" is just `purpose === "DISPOSABLE"`.

---

## C. Dashboard balance overview

### Three purpose-scoped totals

```ts
disposableTotal = sum(computeAccountBalance(a) for a in accounts where purpose === "DISPOSABLE")
savingsTotal     = sum(computeAccountBalance(a) for a in accounts where purpose === "SAVINGS")
restrictedTotal  = sum(RestrictedFundGroup.balance for each RESTRICTED account)   // already computed by listRestrictedFundGroups
```

`CREDIT`/`DEBT` purposes are never summed into any of the three (same hard exclusion `computeLiquidFunds` already enforces by account type — now enforced by purpose instead, which is a strict superset of safety since a user could otherwise mislabel a credit card's *type* but purpose is the single explicit source of truth).

### Revised safe-to-spend

```
safeToSpend = disposableTotal
            − protectedCurrentObligations   // PENDING payables due before the next cutoff, tied to a DISPOSABLE account (RESTRICTED-tied ones are already covered by their own fund, same rule as today's computeSafeToSpend)
            − requiredTransfers              // getRecommendedFundingTransfer's shortfall amount, if any — a transfer not yet made is money already earmarked, not spendable
            − confirmedReserves              // SavingsGoal.assignedAmount total, but ONLY when that assignment is confirmed as "not disposable" — i.e., every SavingsGoal amount, since a SAVINGS-purpose account's balance was never in disposableTotal to begin with... 
```

**Fictional worked example** (why "confirmed reserves" doesn't double-subtract): Disposable checking has ₱80,000. A `SavingsGoal` for "Vacation Reserve" lives on a *separate* `SAVINGS`-purpose account with its own ₱150,000 balance. `disposableTotal` is ₱80,000 (the savings account was never counted here). So `confirmedReserves` in the formula above is **not** the savings account balance (already excluded) — it's the case where a user has manually earmarked part of the *disposable* checking balance itself toward a goal without having moved it yet (e.g. "₱10,000 of this checking account's ₱80,000 is spoken for, I just haven't transferred it"). This only applies if a `SavingsGoal.accountId` is ever a `DISPOSABLE`-purpose account, which the UI won't offer as a normal flow — so in the realistic case (goal lives on its own Savings account), `confirmedReserves` is **zero** and the term is a no-op safeguard, not a routine subtraction. This is documented explicitly in the plan so nobody "fixes" an apparent bug where the term never does anything in the common case — it's intentionally inert until/unless a disposable-account-assigned reserve is introduced.

`protectedCurrentObligations` and `requiredTransfers` reuse `listDuePayables`/`getRecommendedFundingTransfer` exactly as `computeSafeToSpend` already does — this is a **revision** of the existing pure function's parameters (add a `purpose` filter to which accounts count as the base total), not a rewrite of its logic shape.

### Three dashboard cards

Replace the current flat 4-stat row + separate Restricted-funds list with three `Card`s (Disposable / Savings & Reserves / Restricted Checking), each showing the fields the request lists, all derived from data already computed above plus the existing `restrictedFunds`/`getRecommendedFundingTransfer` fetches — no new queries beyond what section B already added (purpose-filtered account sums, `SavingsGoal` reads).

Below the three cards: Upcoming dues, Required transfers, Current-cutoff budget, Recent transactions (all shipped, just re-homed under the new cards) — plus three new compact sections once their features exist: Expected income (Year Plan), Year Plan reserve (Vacation Reserve progress), Shopping estimate (selected-list total). These three are added in the Year Plan and Shopping plans respectively, as a small addition to the Dashboard, not built here.

---

## D. Year Plan

### Schema

```prisma
model YearPlan {
  id             String   @id @default(cuid())
  userId         String
  name           String              // e.g. "2026–2027 Onboard Cycle"
  startDate      DateTime
  endDate        DateTime            // rolling 12–18mo, can cross Dec 31
  minCashBuffer  Int                 // minor units — the "floor" liquid funds must not projectedly cross
  scenario       String   @default("EXPECTED") // "EXPECTED" | "CONSERVATIVE" — see below
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user      User            @relation(fields: [userId], references: [id])
  phases    YearPlanPhase[]
  forecasts IncomeForecast[]
}

model YearPlanPhase {
  id         String   @id @default(cuid())
  userId     String
  yearPlanId String
  phaseType  String   // FULL_ONBOARD | PARTIAL_ONBOARD | TRANSITION_HOME | HOME_SALARY_ONLY | EXPECTED_RETURN | PARTIAL_RETURN | CUSTOM
  startDate  DateTime
  endDate    DateTime
  label      String?  // free text, e.g. "Papa onboard" — for CUSTOM or user override

  user     User     @relation(fields: [userId], references: [id])
  yearPlan YearPlan @relation(fields: [yearPlanId], references: [id])
}

model IncomeForecast {
  id                String    @id @default(cuid())
  userId            String
  yearPlanId        String
  source            String    // MY_SALARY | MY_BONUS | HUSBAND_SALARY | ALLOTMENT | PARTIAL_SALARY | FINAL_SALARY | CASH_BOND | OTHER
  expectedDate      DateTime
  expectedAmount    Int                 // minor units
  cutoffLabel       String              // matches a BudgetPeriod-style cutoff label, not a fixed calendar month
  phaseId           String?
  status            String    @default("EXPECTED") // CONFIRMED | EXPECTED | ESTIMATED | UNCERTAIN
  actualTransactionId String?           // links to Transaction once it clears — never mutates the transaction itself
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user            User            @relation(fields: [userId], references: [id])
  yearPlan        YearPlan        @relation(fields: [yearPlanId], references: [id])
  phase           YearPlanPhase?  @relation(fields: [phaseId], references: [id])
  actualTransaction Transaction?  @relation(fields: [actualTransactionId], references: [id])
}
```

The Vacation/Home-Period Reserve is **not** a new model — it's a `SavingsGoal` (section B) whose `id` the `YearPlan` references (`YearPlan.vacationReserveGoalId String? @relation(...)`), so "linked to a Savings account" is structural, not a special case.

### Calculations (fictional numbers throughout — none of these are the user's real figures)

**Reliable income per cutoff:** `MY_SALARY` + `ALLOTMENT` (statuses `CONFIRMED`/`EXPECTED` only — `ESTIMATED`/`UNCERTAIN` lines are shown but excluded from "reliable").

**Home-cutoff cash flow:** `reliable income − planned expenses` for a cutoff whose phase is `HOME_SALARY_ONLY` or `TRANSITION_HOME`.
Example: 3 home cutoffs, each with reliable income ₱35,000 (my salary only) and planned expenses ₱48,000 → cash flow −₱13,000 per cutoff, −₱39,000 cumulative across the 3.

**Required reserve:** the largest cumulative shortage across the whole home period, not a simple sum, per the spec's explicit rule — computed by walking the home-period cutoffs in order, running a cumulative balance starting from the reserve's current amount, and taking the most negative point that would cross `minCashBuffer`.
Example: cutoffs at −₱13,000, −₱13,000, −₱13,000, then +₱20,000 (a partial-income cutoff arrives) — cumulative: −13k, −26k, −39k, −19k. The worst point is −₱39,000. If `minCashBuffer` is ₱20,000, `requiredReserve = 39,000 + 20,000 = ₱59,000` (enough to still be at the buffer floor at the worst point, not just at zero).

**Remaining reserve:** `requiredReserve − SavingsGoal.assignedAmount` (or its current balance, whichever the plan settles as "already saved" — the design plan for Year Plan will pin this down with the user, since it affects whether a manual top-up outside the goal-tracking flow is "seen").

**Recommended saving per full onboard cutoff:** `remainingReserve ÷ remainingFullIncomeCutoffs`, where `remainingFullIncomeCutoffs` counts only `IncomeForecast` rows on `FULL_ONBOARD`-phase cutoffs not yet passed — a `PARTIAL_ONBOARD` cutoff is explicitly excluded from the denominator (the spec's explicit "do not treat a partial-income cutoff as a full saving opportunity" rule).
Example: `remainingReserve = ₱59,000`, 3 full-income cutoffs remain → ₱19,667/cutoff.

**Conservative scenario:** a second `YearPlan` row (or the same plan with `scenario: "CONSERVATIVE"` and its own `IncomeForecast` rows flagged accordingly) that swaps specific forecasts (delayed cash bond excluded or pushed later, lower partial salary, an earlier `TRANSITION_HOME` date) — implemented as **a second, independent set of `IncomeForecast`/`YearPlanPhase` rows under a second `YearPlan`**, not a runtime toggle over the same rows, so the two scenarios can diverge freely without one's edits ever silently touching the other's numbers.

### Double-counting safeguard

`IncomeForecast` never writes to any `Account`/`Transaction` balance. When real income actually lands, the user (or Quick Capture) creates the normal `INCOME` transaction as always, and separately sets `IncomeForecast.actualTransactionId` to point at it (a manual or Quick-Capture-assisted "link" action, not automatic matching — automatic matching risks silently linking the wrong forecast to the wrong transaction, which is worse than asking). Once linked, the Year Plan display shows that line as "Confirmed — received" alongside the real transaction's amount, but the forecast amount is **never** added to any balance calculation anywhere; only the real `Transaction` affects balances, exactly once, the same as every other transaction in the app.

---

## E. Shopping

### Schema

```prisma
model ShoppingCatalogItem {
  id              String    @id @default(cuid())
  userId          String
  canonicalName   String
  aliases         String[]            // reuses the Alias-table *pattern*, but inline here since aliases are private to one catalog item, not shared like account/category aliases
  brand           String?
  size            String?
  unit            String?
  categoryId      String?             // reuses the existing Category model
  defaultQuantity Float     @default(1)
  preferredStoreId String?
  isFavorite      Boolean   @default(false)
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user      User               @relation(fields: [userId], references: [id])
  category  Category?          @relation(fields: [categoryId], references: [id])
  store     ShoppingStore?     @relation(fields: [preferredStoreId], references: [id])
  prices    ShoppingPriceHistory[]
  listItems ShoppingListItem[]
}

model ShoppingStore {
  id     String @id @default(cuid())
  userId String
  name   String

  user  User                  @relation(fields: [userId], references: [id])
  items ShoppingCatalogItem[]
  prices ShoppingPriceHistory[]
}

model ShoppingPriceHistory {
  id           String   @id @default(cuid())
  userId       String
  catalogItemId String
  storeId      String?
  unitPrice    Int               // minor units
  confirmedAt  DateTime @default(now())
  source       String   @default("MANUAL") // MANUAL | RECEIPT
  receiptLineId String?

  user        User                @relation(fields: [userId], references: [id])
  catalogItem ShoppingCatalogItem @relation(fields: [catalogItemId], references: [id])
  store       ShoppingStore?      @relation(fields: [storeId], references: [id])
}
// Append-only — a new confirmed price is always a new row, never an UPDATE to
// an existing one. "Latest price" = most recent row per (catalogItem, store).

model ShoppingList {
  id        String   @id @default(cuid())
  userId    String
  name      String              // "Current" list is just the one with isCurrent:true
  isCurrent Boolean  @default(false)
  plannedDate DateTime?
  createdAt DateTime @default(now())

  user  User               @relation(fields: [userId], references: [id])
  items ShoppingListItem[]
}

model ShoppingListItem {
  id             String   @id @default(cuid())
  userId         String
  listId         String
  catalogItemId  String?             // null if a one-off item never added to the catalog
  freeTextName   String?             // used when catalogItemId is null
  quantity       Float
  unit           String?
  estimatedUnitPrice Int?            // minor units, null = missing-price state
  estimatedTotal Int?                // derived, stored for query convenience, recomputed on every read that matters
  preferredStoreId String?
  categoryId     String?
  priority       String   @default("NORMAL")
  notes          String?
  isSelected     Boolean  @default(false)
  isPurchased    Boolean  @default(false)
  sortOrder      Int      @default(0)

  user        User                 @relation(fields: [userId], references: [id])
  list        ShoppingList         @relation(fields: [listId], references: [id])
  catalogItem ShoppingCatalogItem? @relation(fields: [catalogItemId], references: [id])
  store       ShoppingStore?       @relation(fields: [preferredStoreId], references: [id])
}
```

### Calculations

```
estimatedItemTotal   = isSelected ? quantity × estimatedUnitPrice : 0
estimatedShoppingTotal = sum(estimatedItemTotal for all items in the list)
remainingAllowance   = shoppingAllowance − estimatedShoppingTotal   // shoppingAllowance: a plain user-set number for now, not a new budget-category type
```
**Missing-price:** `estimatedUnitPrice === null` → item renders a "Missing price" badge and is excluded from `estimatedShoppingTotal` (never treated as `0` — the request's explicit rule) until a price is entered (from the catalog's latest price, another store's latest price, or manual entry, in that fallback order).

### Receipt → transaction integration

```prisma
model Receipt {
  id            String   @id @default(cuid())
  userId        String
  transactionId String?             // set once confirmed — the ONE parent transaction
  storeId       String?
  purchaseDate  DateTime?
  receiptNumber String?
  subtotal      Int?
  discount      Int?     @default(0)
  tax           Int?     @default(0)
  fees          Int?     @default(0)
  grandTotal    Int?
  unitemizedDifference Int? @default(0)  // the explicit "Unitemized Receipt Difference" line when items don't reconcile to the total
  status        String   @default("DRAFT") // DRAFT | REVIEWED | CONFIRMED
  createdAt     DateTime @default(now())

  user  User          @relation(fields: [userId], references: [id])
  transaction Transaction? @relation(fields: [transactionId], references: [id])
  lines ReceiptLine[]
  images ReceiptImage[]
}

model ReceiptLine {
  id            String  @id @default(cuid())
  userId        String
  receiptId     String
  catalogItemId String?
  rawText       String?             // OCR's original line, for correction reference
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
  objectKey String              // pointer into private object storage — never the image bytes themselves
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  receipt Receipt @relation(fields: [receiptId], references: [id])
}
```

**One balance change, guaranteed:** `Receipt.transactionId` points at exactly one `Transaction` (an `EXPENSE`, created via the existing `createExpenseLikeTransaction` the moment the receipt is confirmed — same function every other expense already uses, so a credit-card receipt already correctly increases card liability without touching liquid funds, for free, via the existing account-type exclusion). `ReceiptLine` rows carry category/product detail **only** — they are never summed into any balance or report total a second time; every report/spending query that currently sums `Transaction.amount` continues to do exactly that, and a `ReceiptLine`'s only job is to answer "what category did this ₱180 grocery trip's spending actually break down into," a query that reads `ReceiptLine` **in addition to**, never instead of, the one parent transaction amount.

**Reconciliation check before confirm:** `subtotal − discount + tax + fees` must equal `grandTotal`, within the sum of line totals plus `unitemizedDifference`; if it doesn't, confirmation is blocked until the user corrects lines or explicitly sets `unitemizedDifference`.

### OCR adapter

```ts
// src/lib/receipts/ocr-adapter.ts
export type OcrResult = { store?: string; date?: Date; lines: { name: string; quantity?: number; unitPrice?: number; lineTotal: number }[]; subtotal?: number; tax?: number; grandTotal?: number; };
export interface OcrAdapter {
  extract(imageBuffer: Buffer): Promise<OcrResult>;
}
```
A `StubOcrAdapter` (returns an empty/manual-entry result — i.e., extraction "succeeds" with nothing pre-filled, so the review screen still works end-to-end with 100% manual entry) ships first; a real provider is swapped in behind this interface **only with your explicit approval**, per the request's "do not add a paid provider without approval."

### Receipt image storage

Images never touch Postgres. `ReceiptImage.objectKey` is a pointer into a private, per-user-scoped object store (Vercel Blob, in a private-access mode, is the natural fit for this stack — flagged as a choice for you to confirm in the Receipt-capture plan, not decided unilaterally here since it may have cost/plan implications). Deleting a `ReceiptImage` never touches `Receipt`/`ReceiptLine`/the confirmed `Transaction`. An "auto-delete image after confirm" setting is a user-toggleable follow-up action, not a forced default.

---

## F. Financial Calendar

**No new source-of-truth records.** A single query-time aggregation function:

```ts
// src/lib/calendar/aggregate.ts
export type CalendarEntry = {
  id: string; sourceType: "PAYABLE" | "CREDIT_CARD_STATEMENT" | "CREDIT_CARD_DUE" | "INSTALLMENT" | "RECURRING_RULE" | "RECURRING_PAYABLE" | "INCOME_FORECAST" | "SHOPPING_TRIP" | "YEAR_PLAN_PHASE" | "CUSTOM_REMINDER";
  sourceId: string;
  date: Date;
  label: string;
  amount: number | null;
  confidence: "CONFIRMED" | "EXPECTED" | "ESTIMATED" | "UNCERTAIN";
  state: "UPCOMING" | "PAID" | "SKIPPED" | "OVERDUE";
};
export async function listCalendarEntries(prisma, userId, range): Promise<CalendarEntry[]>
```

This function reads `Payable`, `CreditCard`, `InstallmentPayment`, `RecurringRule`, `RecurringPayable`, `IncomeForecast`, `ShoppingList.plannedDate`, `YearPlanPhase` — all **already-existing** queries (`listDuePayables` etc.), merged and mapped to one shape. A small new model exists **only** for reminders with no other source:

```prisma
model CustomReminder {
  id        String   @id @default(cuid())
  userId    String
  label     String
  date      DateTime
  amount    Int?
  state     String   @default("UPCOMING") // UPCOMING | PAID | SKIPPED
  linkedTransactionId String?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  linkedTransaction Transaction? @relation(fields: [linkedTransactionId], references: [id])
}
```

**No auto-posting:** every Calendar action (`Mark as paid`, `Create/link transaction`, `Confirm received income`) calls an **existing** mutation (`markPayablePaid`, `createExpenseLikeTransaction`, setting `IncomeForecast.actualTransactionId`) exactly once per click — the Calendar is a read+action surface over existing data, never a second writer of dated records.

---

## G. Cross-feature conversational commands

New `QUESTION_PATTERNS`/clause-parser entries only, following the exact pattern already used for `restricted_fund_balance`/`safe_to_spend` this session:

- Data-changing: "Add rice and milk to my shopping list" → new `shopping_list_add` intent, resolves items against `ShoppingCatalogItem` via the same `resolveAlias`-style matching already used for accounts/categories; "Mark rice and chicken for the next trip" → `shopping_list_select`; "Schedule grocery shopping for Saturday" → sets `ShoppingList.plannedDate`. All go through the existing confirm/Undo pipeline (`QuickCaptureLog`), unchanged.
- Read-only: "How much is my selected shopping list?" → new `question` type reading `estimatedShoppingTotal`; "Show what I need to pay this week" → already works today (`due_this_week`); "How much should we save before he comes home?" → reads the active `YearPlan`'s `recommendedSavingPerCutoff`; "Show the conservative Year Plan" is a **navigation** command (not a data question) — out of scope for `answerQuestion`, handled as a client-side route push if/when Quick Capture grows navigation intents (flagged as a small open question for the cross-feature plan, not assumed here).

No change to `QuickCapturePanel`, `execute.ts`'s dispatch shape, or Undo semantics — only new `CommandDraft` union members and new `case` branches, the same shape as every prior phase this session.

---

## H. Export additions

New sibling functions next to `buildTransactionExportRows`/`toCsv`/`toJson`/`toXlsx` (`buildYearPlanExportRows`, `buildShoppingExportRows`, etc.), each returning a plain-object-row array reusing the **same** `toCsv`/`toJson` serializers (generic over row shape already — no format-layer change needed) and `toXlsx`'s pattern (one workbook, one worksheet per model family, per the original master spec's export section). Image files (`ReceiptImage`) are **never** included in CSV/XLSX and are represented in the JSON backup only as their `objectKey` pointer, never inlined — the JSON backup preserves relationships (a `Receipt`'s `lines`/`images`/linked `transactionId`) as foreign-key references, the same way the rest of the schema already relates.

---

## Summary of all new Prisma models

`Account.purpose` (column addition) · `SavingsGoal` · `YearPlan` · `YearPlanPhase` · `IncomeForecast` · `ShoppingCatalogItem` · `ShoppingStore` · `ShoppingPriceHistory` · `ShoppingList` · `ShoppingListItem` · `Receipt` · `ReceiptLine` · `ReceiptImage` · `CustomReminder`.

Every model above: `userId` on every row, every domain function scoped by it, no exceptions — same as all 18 existing models.
