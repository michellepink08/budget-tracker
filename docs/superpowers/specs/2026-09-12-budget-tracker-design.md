# Budget Tracker — Design Spec

Date: 2026-09-12 (originally) — revised 2026-09-12 for portfolio direction

> **Revision note:** This spec was written for a personal-use v1, then
> revised the same day into a portfolio-ready, multi-user financial
> product. Sections below reflect the current combined direction. Where a
> decision changed from the original v1 spec, that's called out explicitly
> rather than silently rewritten, since Plan 1 (auth/foundation) and the
> onboarding flow are already built against parts of this doc.

## Purpose

A budget tracker web app people other than me can sign up and use, built to
be shown in a professional portfolio — so it needs to read as a real
product, not a personalization of my own spreadsheet. Every user's data is
fully private to them. The core differentiators (see below) are what make
this more than a generic expense tracker.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- shadcn/ui components
- lucide-react icons
- Prisma ORM + SQLite (`file:./dev.db`) — chosen for zero-setup local dev;
  swapping the Prisma datasource to Postgres later (e.g. for a public
  deployment) does not require a schema rewrite
- Auth.js (NextAuth v5), Credentials provider, passwords hashed with bcrypt
- shadcn chart components (Recharts under the hood) for report charts
- zod + react-hook-form for form validation
- Vitest for unit tests

**Environment constraint (unchanged, not a defect):** this development
machine's Application Control policy blocks native `.exe` binaries,
including Next.js's Turbopack and Prisma's schema-engine. The project
therefore forces Webpack for `dev`/`build`, and schema changes are applied
via a hand-written `prisma/schema.sql` run through `npm run db:push`
(`scripts/db-push.mjs`) instead of `prisma db push` — Prisma Client itself
works normally via the `@prisma/adapter-better-sqlite3` driver adapter.
**Whenever a Prisma model changes, `prisma/schema.prisma` and
`prisma/schema.sql` must both be updated, in the same commit.** This is a
property of this dev machine, not the application; it doesn't affect a
normal deployment target where the native binaries aren't blocked.

## Product Direction

This is a portfolio piece, so:

- It must support **multiple registered users**, each seeing only their own
  data (already true structurally — every row is scoped by `userId`).
- No real personal financial data anywhere, including the demo account —
  demo data is fictional.
- The application doesn't have a final name yet. A single `APP_NAME`
  constant (in `src/lib/config.ts`) is the one place that gets edited to
  rename it later — nothing else hardcodes the name.

### Core differentiators

These are the features meant to set this apart from a generic expense
tracker, roughly in order of how load-bearing they are to the product's
identity:

1. Flexible budget cycles with a custom cutoff date (already partly built
   via `cycleStartDay`; Plan 2A adds the real cycle-boundary math)
2. Account-based cash tracking (multiple wallets/accounts, each with a
   running balance)
3. Correct transfer handling (a transfer is two linked movements, not
   income/spend; only a transfer fee is a real expense)
4. Bills and payable planning (due dates, statement dates, paying/funding
   accounts, "due this week" style views)
5. Recommended funding transfers between accounts (e.g. "move ₱2,000 from
   Savings to Checking to cover this week's bills")
6. Credit-card and installment-payment schedules
7. Budget rollover (unused/overspent amounts can carry into the next
   period, per category)
8. Clear financial reconciliation (comparing the app's calculated balance
   against what the user says an account actually holds, with an audited
   adjustment — never a silent overwrite)

### Visual identity

- Warm, light-cream page background
- Deep muted-green navigation bar and major section headers — this is the
  app's brand chrome and does **not** change with the user's accent color
- Coral as the default **accent** color (buttons, the active-nav
  indicator/underline, progress bars, and similar interactive/highlight
  elements) — user-selectable at onboarding (already built) and later in
  Settings; sage and restrained warm-neutral tones as supporting colors
- White or soft-cream cards, rounded corners, subtle borders/shadows, clean
  and friendly-but-professional typography
- The base interface (text contrast, focus states, disabled states) stays
  accessible regardless of which accent a user picks — accent choice is
  restricted to a small vetted preset list for this reason (already the
  shape of the onboarding accent picker; the preset list itself may grow,
  but every option must meet contrast requirements against the cream/green
  base)

This replaces the original v1 decision of "neutral/minimal shadcn base
with a free accent picker" — the base chrome is now a specific brand look,
and only the accent layer is user-customizable.

## Core Concepts

### Users & multi-tenancy

Every meaningful row (accounts, categories, subcategories, budget periods,
budget allocations, transactions, recurring rules) is owned by a `User` via
a `userId` foreign key, and every query is scoped to the logged-in user's
id. Unchanged from v1 — this was already designed in from the start.

### Budget cycle (not calendar month)

Each user sets a `cycleStartDay` (1–31) at onboarding (already built) and
can change it later in Settings. A cycle runs from that day of one month
to the day before that day in the next month. Worked examples for
`cycleStartDay = 11`:

- September 10 → belongs to the Aug 11–Sep 10 cycle
- September 11 → belongs to the Sep 11–Oct 10 cycle
- October 10 → belongs to the Sep 11–Oct 10 cycle
- October 11 → belongs to the Oct 11–Nov 10 cycle

**Short-month handling:** if `cycleStartDay` is 29, 30, or 31 and the
current month doesn't have that many days, the cycle boundary clamps to
the last valid day of that month (e.g. `cycleStartDay = 31` in February
means the cycle boundary falls on Feb 28/29, not a nonexistent Feb 31).

This logic lives in exactly one place — a domain service (`src/lib/cycle.ts`,
see Plan 2A) — and every page/report/calculation that needs "what cycle
does this date belong to" calls into it rather than re-deriving it.

### Accounts, categories, and budgeting

Three previously-conflated ideas are now separate:

- **Account** — where money physically is (checking, cash, e-wallet, credit
  card, loan, investment, or an excluded/other fund). Tracks a computed
  running balance (see Account-Balance Rules below). An account can be
  flagged to exclude it from "liquid funds" totals (e.g. a locked
  investment account), and one account can be marked the user's default
  "funding" account for recommended-transfer suggestions.
- **Category** (and optional **Subcategory**) — what money was for
  (Groceries, Rent...), independent of which account it moved through. A
  category has a `type` (income / expense / savings / debt payment) but,
  unlike v1, **does not carry a budget limit itself**.
- **BudgetPeriod + BudgetAllocation** — a budget period is one cycle
  instance (start/end date, status). A budget allocation is "category X
  gets a planned amount of Y in period Z," plus a rollover mode. This
  replaces v1's `Category.monthlyLimit` — the same category can have a
  different planned amount each period, and unused/overspent amounts can
  roll forward per the allocation's rollover setting. This is the
  architectural change that makes budget rollover (a core differentiator)
  possible at all.

A transaction has exactly one account (its `accountId`) and, for
transfers, a second account (`destinationAccountId`). Category/subcategory
remain optional on a transaction (uncategorized entries are allowed, but
won't count toward any budget allocation).

### Transfers, and what counts as income/spend

A transfer between two of the user's own accounts creates **two linked
rows** (an outgoing one on the source account and an incoming one on the
destination account) sharing a `linkedTransactionId`, not one transaction
magically affecting two balances. The transferred principal is **never**
counted as income or spending — only a transfer fee (its own transaction
type, `TRANSFER_FEE`) is a real expense.

Each row is a **self-contained signed ledger entry against its own
`accountId`** — this is the key simplifying rule that makes every other
piece of balance math uniform:

- Inflow types (`INCOME`, `REFUND`, and a transfer's *incoming* row) store
  a positive `amount`.
- Outflow types (`EXPENSE`, `SAVINGS`, `LOAN_PAYMENT`,
  `CREDIT_CARD_PAYMENT`, `TRANSFER_FEE`, and a transfer's *outgoing* row)
  store a negative `amount`.
- `BALANCE_ADJUSTMENT` stores whatever signed delta closes the gap found
  during reconciliation.

Since every row already carries the correct sign for its own `accountId`,
an account's balance is just its opening balance plus the sum of that
row's `amount` across every row belonging to it — no per-type branching
needed at balance-computation time, and no risk of a transfer's two rows
disagreeing about the total effect. `destinationAccountId` on a row is
**informational only** (e.g. "this outgoing transfer went to Savings," for
display without a join) — it plays no part in the balance calculation
itself.

### Account-balance rules

An account's balance is always computed, never stored redundantly (same
principle as v1, now precisely defined):

```
balance = openingBalance + sum(amount) across every transaction row
                            whose accountId is this account
```

Written out by category of effect, this is equivalent to:

```
balance = openingBalance
        + income + refunds + incoming transfers
        − expenses − loan payments − credit-card payments
        − outgoing transfers − transfer fees
        ± balance adjustments
```

- **Liquid funds** (shown on the dashboard) sum the balances of accounts
  where `includeInLiquidFunds` is true. As a hard rule (not just relying on
  that flag being set correctly), `CREDIT_CARD` and `LOAN` account types
  are never included in liquid funds — available credit is not "your
  money."
- **Reconciliation:** when a user enters an actual balance that differs
  from the calculated one, the app shows the difference, asks for
  confirmation, and — only on confirmation — creates a
  `BALANCE_ADJUSTMENT` transaction to close the gap. The balance is never
  silently overwritten, and the adjustment is a normal transaction row, so
  it's part of the audit history.

**Open question (flagging rather than assuming):** the `SAVINGS`
transaction type isn't mentioned in the balance formula above (only
`SAVINGS` as a *category* type is defined). Plan 2A's assumption, to be
confirmed before building it: a `SAVINGS`-type transaction reduces the
balance of the account money leaves from, the same way an expense does
(the money is still physically leaving that account) — it's distinguished
from `EXPENSE` only for reporting/categorization purposes, not for a
different balance effect. If actual money movement into a distinct savings
*account* is intended, that's a `TRANSFER`, not a `SAVINGS` transaction.

### Money representation

**Decision (revised from v1):** amounts are stored as integers in the
currency's minor unit (centavos for PHP, cents for USD — both currently
supported currencies use 2 minor-unit digits) rather than as Prisma
`Decimal`.

*Why this changed:* the original v1 spec used `Decimal` fields. Prisma's
`Decimal` is backed by an arbitrary-precision string, so it doesn't have
the classic floating-point rounding problem — that part of the original
reasoning was sound. But nothing was actually built against `Decimal` yet
(no `Account`/`Category`/`Transaction` tables exist in code so far), and
integer minor units are simpler to add/subtract/compare in plain
TypeScript without pulling in a decimal-math library, with no meaningful
downside for a two-currency (PHP/USD), two-decimal-digit app. All money
fields in the schema below (`openingBalance`, `plannedAmount`, `amount`,
etc.) are `Int`, in minor units. Display formatting (dividing by 100,
adding the currency symbol) is a single shared helper, not scattered
per-page math.

### Recurring transactions

Unchanged from v1: a `RecurringRule` is a template plus a next-due-date. It
does **not** auto-post — due rules surface for the user to confirm
(optionally editing amount/date) before becoming a real `Transaction`.

### SQLite has no enum type

Every field described elsewhere in this doc as "one of a fixed set of
values" (`Account.accountType`, `Category.type`, `Transaction.type`,
`RecurringRule.frequency`, `BudgetPeriod.status`,
`BudgetAllocation.rolloverMode`) is a plain Prisma `String`, not a Prisma
`enum` — SQLite doesn't support enums, so Prisma disallows declaring one
against a `sqlite` datasource. The fixed value sets are defined once as
shared TypeScript `const` arrays/zod enums (e.g.
`src/lib/constants/account-types.ts`) and reused by both the zod validation
schemas and the UI, so "what are the valid account types" still has exactly
one source of truth even though the database column itself is just text.

## Data Model (Prisma, current + planned)

Each model below is tagged with the phase that builds it — **Plan 2A
builds only `Account`, `Category`, `Subcategory`, `BudgetPeriod`, and
`Transaction`.** `BudgetAllocation` and `RecurringRule` are shown here for
the full target shape but are **Plan 3A** work — don't create those two
tables/models while implementing Plan 2A.

```prisma
model User {
  // unchanged from v1 — see prisma/schema.prisma
}

// Plan 2A
model Account {
  id                     String    @id @default(cuid())
  userId                 String
  name                   String
  accountType            String    // CASH | CHECKING | SAVINGS | EWALLET | CREDIT_CARD | LOAN | INVESTMENT | EXCLUDED_FUND
  openingBalance         Int       @default(0) // minor units
  currency               String    @default("PHP")
  includeInLiquidFunds   Boolean   @default(true)
  isPrimaryFundingAccount Boolean  @default(false)
  color                  String
  icon                   String
  archivedAt             DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  user                   User          @relation(fields: [userId], references: [id])
  transactionsFrom       Transaction[] @relation("TransactionAccount")
  transactionsTo         Transaction[] @relation("TransactionDestinationAccount")
  recurringRules         RecurringRule[] // Plan 3A — omit this relation until RecurringRule exists
}

// Plan 2A
model Category {
  id           String    @id @default(cuid())
  userId       String
  name         String
  type         String    // INCOME | EXPENSE | SAVINGS | DEBT_PAYMENT
  color        String
  icon         String
  sortOrder    Int       @default(0)
  archivedAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user          User            @relation(fields: [userId], references: [id])
  subcategories Subcategory[]
  allocations   BudgetAllocation[] // Plan 3A
  transactions  Transaction[]
  recurringRules RecurringRule[] // Plan 3A
}

// Plan 2A
model Subcategory {
  id         String    @id @default(cuid())
  userId     String
  categoryId String
  name       String
  sortOrder  Int       @default(0)
  archivedAt DateTime?

  user         User          @relation(fields: [userId], references: [id])
  category     Category      @relation(fields: [categoryId], references: [id])
  transactions Transaction[]
  recurringRules RecurringRule[] // Plan 3A
}

// Plan 2A
model BudgetPeriod {
  id         String   @id @default(cuid())
  userId     String
  name       String
  startDate  DateTime
  endDate    DateTime
  status     String   // UPCOMING | ACTIVE | CLOSED
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user         User               @relation(fields: [userId], references: [id])
  allocations  BudgetAllocation[] // Plan 3A
  transactions Transaction[]

  @@unique([userId, startDate])
}

// Plan 3A
model BudgetAllocation {
  id             String   @id @default(cuid())
  userId         String
  budgetPeriodId String
  categoryId     String
  plannedAmount  Int      // minor units
  rolloverMode   String   // NONE | CARRY_UNUSED | CARRY_OVERSPEND | CARRY_BOTH
  rolloverAmount Int      @default(0) // minor units, carried in from the prior period
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id])
  budgetPeriod BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])
  category     Category     @relation(fields: [categoryId], references: [id])

  @@unique([budgetPeriodId, categoryId])
}

// Plan 2A
model Transaction {
  id                    String    @id @default(cuid())
  userId                String
  date                  DateTime
  type                  String    // EXPENSE | INCOME | TRANSFER | REFUND | SAVINGS | LOAN_PAYMENT | CREDIT_CARD_PAYMENT | BALANCE_ADJUSTMENT | TRANSFER_FEE
  amount                Int       // minor units, signed effect on accountId's balance (see Account-balance rules)
  accountId             String
  destinationAccountId  String?   // informational only — the "other side" of a transfer, not used in balance math
  categoryId            String?
  subcategoryId         String?
  budgetPeriodId        String?
  description           String
  notes                 String?
  status                String    @default("CLEARED") // PENDING | CLEARED
  linkedTransactionId   String?   // pairs the two rows of a transfer
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user                User          @relation(fields: [userId], references: [id])
  account             Account       @relation("TransactionAccount", fields: [accountId], references: [id])
  destinationAccount  Account?      @relation("TransactionDestinationAccount", fields: [destinationAccountId], references: [id])
  category            Category?     @relation(fields: [categoryId], references: [id])
  subcategory         Subcategory?  @relation(fields: [subcategoryId], references: [id])
  budgetPeriod        BudgetPeriod? @relation(fields: [budgetPeriodId], references: [id])
}

// Plan 3A
model RecurringRule {
  id              String   @id @default(cuid())
  userId          String
  name            String
  transactionType String   // same value set as Transaction.type
  amount          Int      // minor units
  frequency       String   // WEEKLY | MONTHLY | CUSTOM
  intervalDays    Int?     // used when frequency = CUSTOM
  nextDate        DateTime
  accountId       String
  categoryId      String?
  subcategoryId   String?
  active          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id])
  account     Account      @relation(fields: [accountId], references: [id])
  category    Category?    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id])
}
```

**Later phases** (Plan 3A/3B, not in Plan 2A) add: `Payable`,
`RecurringPayable`, `Loan`, `CreditCard`, `InstallmentPurchase`,
`InstallmentPayment`, `AccountReconciliation` (an audit-trail model
separate from the `BALANCE_ADJUSTMENT` transaction it produces, if a
richer reconciliation history turns out to be needed beyond "read the
transaction list").

## Navigation / Pages

**Public:** Landing page, Login, Sign up, Forgot password, Demo entry.
Forgot password needs a transactional email provider, not yet chosen —
that's a Plan 4 decision, not Plan 2A. Demo entry's exact mechanism (log
straight into the existing demo account vs. spin up an ephemeral one) is
also a Plan 4 decision.

**Authenticated, desktop nav:** Dashboard, Transactions, Budget, Bills,
Accounts, Loans & Cards, Reports, Settings.

**Authenticated, mobile nav:** Home, Transactions, Add, Bills, Accounts —
with Loans & Cards, Reports, and Settings inside a "More" menu.

Categories/subcategories and recurring-rule management move into Settings
(or contextual management screens reached from Transactions/Budget) rather
than being permanent top-level nav items — this is a change from v1's flat
"Categories" and "Recurring" nav items, reflecting the larger final page
set.

This is a UI/routing change that lands in Plan 2B onward — Plan 2A itself
adds no pages, only schema + domain services (see below).

## Error Handling

Unchanged from v1:
- Forms validated client + server side with zod schemas shared between
  react-hook-form and server actions.
- Server actions return a typed `{ ok: true, data } | { ok: false, error }`
  shape rather than throwing to the client; UI surfaces failures via shadcn
  `toast`.
- Auth errors (bad credentials, duplicate email on signup) show inline
  field errors, not generic alerts.

## Testing

- Every domain calculation (cycle boundaries, budget-period assignment,
  account-balance effects, liquid-funds totals, reconciliation, rollover)
  gets real unit tests against real business behavior — not just "does the
  component render." This was already the pattern for auth/onboarding
  (dependency-injected functions tested against a mocked Prisma client) and
  continues for all financial logic.
- Component/integration tests stay lighter; UI-level testing expands once
  the CRUD interfaces (Plan 2B) exist to test.

## Roadmap

- ~~Plan 1: Foundation & Auth~~ — done
  (`docs/superpowers/plans/2026-09-12-foundation-auth.md`)
- ~~Onboarding~~ — done (`docs/superpowers/plans/2026-09-12-onboarding.md`)
- **Plan 2A: Financial foundation** (next) — schema for accounts,
  categories, subcategories, budget periods, and transactions; the
  cycle-date service; the account-balance service; transaction
  classification/transfer logic; unit tests for all of it; fictional demo
  seed data. No UI yet.
- **Plan 2B: Core CRUD interface** — Accounts, Categories/Subcategories,
  Transactions pages; a global "Add Transaction" modal; search/filters;
  responsive layouts; empty/loading/error states.
- **Plan 3A: Planning features** — split into three sub-plans, each
  independently shippable (the combined scope was too large for one plan,
  the same reasoning that split Plan 2 into 2A/2B):
  - **Plan 3A.1** — `BudgetAllocation` schema, rollover math, the Budget
    page (current + previous periods, planned/actual/remaining/% used per
    category, manual period creation).
  - **Plan 3A.2** — `RecurringRule` schema, due-date advancement, the
    Recurring page (CRUD plus the due-now confirm/edit/skip review list —
    replaces today's placeholder page).
  - **Plan 3A.3** — `Payable`/`RecurringPayable` schema, the Bills page,
    transfer recommendations, and account reconciliation (a
    `previewReconciliation`/`applyReconciliation` service plus preview +
    confirm UI, per this doc's "Account-balance rules" section — Plan 2A
    deliberately didn't build reconciliation at all, so this is new work,
    not an extension of existing code).
- **Plan 3B: Debt features and dashboard** — loans, credit cards,
  installment purchases and schedules, dashboard calculations, reports,
  Settings integration, accent-color/theme wiring.
- **Plan 3B: Debt features and dashboard** — loans, credit cards,
  installment purchases and schedules, dashboard calculations, reports,
  Settings integration, accent-color/theme wiring.
- **Plan 4: Portfolio presentation** — public landing page, demo-mode
  improvements (resettable fictional data), README, architecture docs,
  screenshots, accessibility/responsive/performance review, deployment
  prep.

## Out of Scope (for now)

- Multi-currency *per account* mixing within one user beyond PHP/USD
  (each account has a currency field for future flexibility, but
  cross-currency conversion/display is not built yet)
- Shared/household budgets (multi-user sharing of one budget)
- OAuth login providers (email/password only; architecture allows adding
  providers later without rework)
- Data export/import
- Email delivery (blocks "Forgot password" until a provider is chosen)
