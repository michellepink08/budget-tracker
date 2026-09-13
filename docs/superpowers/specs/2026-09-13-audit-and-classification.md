# Audit & Requirement Classification — New Feature Request

**Purpose:** Before any design or code, this classifies every requirement in the new mega-request against what is actually in the repository today (verified by reading `prisma/schema.prisma`, `src/lib/**`, `src/app/**`, `src/components/**`, and the existing `docs/superpowers/specs/*` at the time of this audit). Nothing in the plans that follow re-designs or re-implements anything marked **Shipped** below.

## Method

- `prisma/schema.prisma` read in full — 18 models, none named `Purpose`, `ShoppingList`, `ShoppingItem`, `Catalog*`, `Receipt*`, `YearPlan*`, `IncomeForecast*`, `VacationReserve*`, or `ScheduledEvent`.
- `src/lib/*.ts` listed in full (55 files) — every domain function that exists today is listed under "Reusable building blocks" below. No file relating to shopping, receipts, OCR, a year/vacation plan, or a calendar exists.
- `src/app/**` page tree listed — primary pages today: Dashboard, Transactions, Budget, Bills, Accounts, Loans & Cards, Reports, Settings, plus auth pages and one export API route. No Shopping, Year Plan, or Calendar page exists.
- `src/app/globals.css` read in full — the current theme system, described below.
- Grepped the whole `src` tree for `shopping|year.?plan|calendar|receipt|ocr|vacation` — every match was incidental (marketing copy, the existing `Receipt` lucide icon already used for the Bills nav item, a `shopping-cart` icon string on the seeded "Groceries" category, a `noCreditCardAccounts` variable). None is a real feature.

## 1. Updated visual design system

| Requirement | Status | Evidence |
|---|---|---|
| Light/dark/system mode, persisted preference, live device-theme changes | **Shipped** | `User.themeMode`, `AppearanceSettings` component, `next-themes` `ThemeProvider` in `layout.tsx`. Not touched by this request. |
| Manrope font | **Shipped** | `layout.tsx` loads `Manrope` via `next/font/google`, wired as `--font-manrope`. |
| A "wine" identity option | **Partially implemented** | `[data-accent="wine"]` already exists in `globals.css` as one of 7 selectable accents (`emerald` is the schema default) — but its hex values (`#7c1d3f`/`#4a0f26`) don't match the new spec's exact tokens, and it is only one of 7 user-choosable accents, not the fixed app identity. The other 6 accent options, the generic `--chart-1..5` palette, and the current neutral gray `--background`/`--card`/`--border` tokens are all unrelated to Wine and must go. |
| Green reserved for success states only | **Not implemented** | The *default* accent is `emerald` (`--primary: #059669`), used today as the general button/ring/nav color for any user who hasn't changed accent. `--chart-2` (green) is used as the "Income" bar fill in `income-vs-expense-chart.tsx` — a plain data color, not a success state. There is no semantic `--success`/`--success-background` token anywhere. |
| Semantic design tokens (not hardcoded colors in components) | **Partially implemented** | The token layer itself (`@theme inline` + CSS custom properties) already exists and is the right mechanism — but several components reference raw Tailwind utility colors directly (e.g. `text-destructive`, `text-emerald-700`/`text-amber-600` literals seen in `quick-capture-panel.tsx`, `side-nav.tsx`) instead of semantic tokens. These need auditing and, where they hardcode a color that should be semantic (success, warning), replacing. |
| Typography hierarchy (12–32px scale) | **Not implemented** | No type-scale tokens exist; every heading/label size is an ad-hoc Tailwind class (`text-xl`, `text-sm`, `text-2xl`) chosen per-component with no documented system. |
| Card/panel elevation (shadows, contrasting surface, tinted headers) | **Not implemented** | There is no shared `Card` component at all (`src/components/ui/` has no `card.tsx`). Every "card" in the app is a hand-written `<div className="rounded-lg border p-4">` — a border only, no shadow, `--card` background is literally `#ffffff` against a `#fafafa` page background (barely distinguishable, and neither matches the new palette). |
| Hover/focus/pressed states, 1–2px lift, ~150–200ms transitions | **Not implemented** | No interactive-card treatment exists; static and clickable divs look identical today. |
| Friendly `lucide-react` icon set, consistent rounded icon containers | **Partially implemented** | `lucide-react` is already the icon library used everywhere. Several suggested icons (`Wallet`, `PiggyBank`, `CreditCard`, `Receipt`→`ReceiptText`, `CalendarDays`, `Home`→`House`) are already in use in `nav-links.ts`. No shared "rounded icon container" component exists yet — icons are rendered bare. |

## 2. Account-purpose grouping

| Requirement | Status | Evidence |
|---|---|---|
| Accounts page exists, lists accounts | **Shipped** | `src/app/(app)/accounts/page.tsx` + `AccountList`/`AccountFormDialog`. Not rebuilt. |
| `includeInLiquidFunds` flag (restricted vs. counted) | **Shipped** (Phase 8, this session) | `Account.includeInLiquidFunds`, reframed as a "Restricted fund" toggle; `computeLiquidFunds` and `listRestrictedFundGroups` already exclude/group on it. |
| A dedicated `purpose` field (Disposable / Savings / Restricted / Credit / Debt) | **Not implemented** | No such column exists. Today, "restricted" is inferred from `includeInLiquidFunds: false` plus `accountType` (excluding `CREDIT_CARD`/`LOAN`) — a boolean-and-type combination, not an explicit purpose enum. `ACCOUNT_TYPES` (`CASH, CHECKING, SAVINGS, EWALLET, CREDIT_CARD, LOAN, INVESTMENT, EXCLUDED_FUND`) is a *type*, not a *purpose* — the request explicitly says purpose must not be derived from type alone. |
| Restricted-fund obligation/projection figures (upcoming obligation, next payable, projected balance, dedup of recurring duplicates) | **Shipped** (Phase 8) | `src/lib/restricted-funds.ts` `listRestrictedFundGroups` already computes exactly this, already dedupes same-`recurringPayableId` overdue duplicates, already excludes `PAID` payables (no `CANCELLED` status exists in the schema — see below). |
| "Number of payments covered" for a restricted account | **Not implemented** | Not computed anywhere yet — `listRestrictedFundGroups` returns a total and a single next payable, not a count of how many upcoming payables the current balance would cover. |
| Deposit and payment history for a restricted account | **Not implemented** | No dedicated view — a restricted account's transaction history is only visible via the generic Transactions page filter today. |
| Savings-account target/progress/assigned-vs-unassigned | **Not implemented** | No "savings goal" concept exists at all — a Savings-type account today is just a balance, with no target amount or assignment tracking. |
| Credit/debt accounts excluded from disposable/savings/restricted/liquid/safe-to-spend | **Shipped** | `EXCLUDED_FROM_LIQUID_FUNDS = ["CREDIT_CARD", "LOAN"]` is already hard-excluded in `computeLiquidFunds`, `listRestrictedFundGroups`, and `getRecommendedFundingTransfer`. This rule is preserved, not rebuilt. |

## 3. Dashboard balance overview

| Requirement | Status | Evidence |
|---|---|---|
| Liquid funds total | **Shipped** | `computeLiquidFunds`, already on the dashboard. |
| Safe to spend | **Shipped** (Phase 10, this session) | `computeSafeToSpend` (liquid funds − upcoming obligations − uncommitted budget), already on the dashboard and in Quick Capture. |
| Restricted-funds dashboard section | **Shipped** (Phase 8) | Already renders one card per restricted fund with obligation/projection. |
| Funding-recommendation banner on the Dashboard | **Shipped** (Phase 10) | `FundingRecommendationBanner` reused on the Dashboard from Bills. |
| Three-card grouping by **purpose** (Disposable / Savings & Reserves / Restricted Checking), each with the specific sub-figures listed (protected upcoming bills, assigned/unassigned savings, payment coverage, etc.) | **Not implemented** | The current Dashboard groups by computation (Safe to spend, Liquid funds, Budgeted, Remaining, then a flat Restricted-funds list), not by account purpose with a Savings-specific card. "Assigned/unassigned savings" and "payment coverage count" don't exist (see section 2). |
| Formula: `safe to spend = disposable total − protected current obligations − required transfers − confirmed reserves` | **Partially implemented** | The *shape* of this formula is new (four terms, keyed to "disposable" specifically and "confirmed reserves" as a new subtracted term) — the current `computeSafeToSpend` has three terms (liquid funds, cutoff-scoped obligations, uncommitted budget) and doesn't know about "disposable" as a purpose-scoped total or a reserve confirmation concept. This needs to be revised once `purpose` exists, not rebuilt from scratch — same double-counting discipline, new inputs. |

## 4. Year Plan

**Not implemented** in its entirety — no schema, no page, no domain function. Everything reusable is listed in the plan document as dependencies (cutoff math via `src/lib/cycle.ts`, money via `src/lib/money.ts`, the `resolveBudgetPeriodForDate` pattern, `Transaction`/`Payable` linking patterns already established for Undo).

## 5. Shopping (lists, catalog, receipt scanning)

**Not implemented** in its entirety — no schema, no page, no domain function, no OCR adapter, no object storage integration.

## 6. Financial Calendar

**Not implemented** as a page or aggregation function. However, every *source* of dated records it needs to unify already exists and is directly reusable: `Payable.dueDate`, `CreditCard.statementDay`/`paymentDueDay`, `InstallmentPayment.dueDate`, `RecurringRule.nextDate`, `RecurringPayable.nextDueDate` — all already queryable per-user. No new "duplicate" records need to be created for any of these; only Year Plan cutoffs and Shopping trip dates (both new, from sections 4–5) and free-standing custom reminders are genuinely new sources.

## 7. Conversational-entry integration

**Shipped, extend only.** The deterministic parser (`src/lib/quick-capture/deterministic-parser.ts`), the confirmation panel (`QuickCapturePanel`), Undo (`QuickCaptureLog`), and the question-answering path (`answerQuestion`) are all complete and are not touched except to add new intents/question types for the new features, exactly the same way `restricted_fund_balance` and `safe_to_spend` were added this session without changing the panel or the execution/Undo machinery.

## 8. Export additions

**Partially implemented.** The export *mechanism* (`/api/export/transactions`, `buildTransactionExportRows`, `toCsv`/`toJson`/`toXlsx` in `src/lib/export-format.ts`) is shipped for transactions only. It does not yet know about Year Plan, Shopping, or Receipt data (none of which exist yet) — extending it is additive (new export functions reusing the same serializers), not a rewrite.

## 9. Data-integrity requirements

All of these are **already the established convention** in this codebase (every domain function takes `userId` and scopes every query; money is always integer minor units; every mutation is server-action-gated by `auth()`) and are **carried forward as hard constraints** on every new model and function in the plans below — not something to newly "add," but something every new plan must not violate. The specific *new* double-counting risks this request introduces (forecast vs. actual income, parent purchase vs. item lines, Calendar view vs. source record) are net-new and are addressed individually in each area's plan.

## Reusable building blocks (for reference in every plan below)

| Existing | Location | Reused by |
|---|---|---|
| `getCycleForDate`, custom pay-cycle math | `src/lib/cycle.ts` | Year Plan cutoffs, Calendar's "Cutoff view" |
| `resolveBudgetPeriodForDate` | `src/lib/budget-period.ts` | Year Plan cutoff resolution, safe-to-spend revision |
| `computeAccountBalance`, `computeLiquidFunds` | `src/lib/account-balance.ts`, `src/lib/liquid-funds.ts` | Account grouping, Dashboard |
| `listRestrictedFundGroups` | `src/lib/restricted-funds.ts` | Account grouping (Restricted card), Dashboard |
| `computeSafeToSpend` | `src/lib/safe-to-spend.ts` | Dashboard revision |
| `getRecommendedFundingTransfer` | `src/lib/transfer-recommendations.ts` | Dashboard "required transfers" |
| `listPayables`/`listDuePayables`, `Payable` model | `src/lib/payables.ts` | Calendar, restricted-account obligation/coverage, Year Plan expense lines |
| `listDueInstallmentPayments` | `src/lib/installment-purchases.ts` | Calendar |
| `RecurringRule`/`RecurringPayable` + `advanceNextDate` | `src/lib/recurring-schedule.ts` | Calendar |
| `toMinorUnits`/`toMajorUnits`/`formatMoney` | `src/lib/money.ts` | Every new model with a money amount |
| `buildTransactionExportRows`, `toCsv`/`toJson`/`toXlsx` | `src/lib/export-transactions.ts`, `src/lib/export-format.ts` | Export additions |
| Quick Capture parser/panel/Undo/`answerQuestion` | `src/lib/quick-capture/*` | Cross-feature commands |
| `Alias` model + `resolveAlias` | `src/lib/quick-capture/aliases.ts` | Matching shopping items/catalog entries by name, same pattern as accounts/categories |
| `QuickCaptureLog` Undo pattern | `src/lib/quick-capture/execute.ts` | Any new confirmable command (shopping additions, reminders) |

This audit is the basis for every "omit already-shipped work" instruction in the eight plans that follow.
