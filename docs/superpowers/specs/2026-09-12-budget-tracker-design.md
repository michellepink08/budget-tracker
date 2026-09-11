# Budget Tracker — Design Spec

Date: 2026-09-12

## Purpose

A personal budget tracker web app: category-based budgets against a custom
(non-calendar-month) pay cycle, with transactions, recurring items, and
multiple accounts/wallets. Built single-user-first but designed so it can be
published for anyone to sign up and use.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- shadcn/ui components
- lucide-react icons
- Prisma ORM + SQLite (`file:./dev.db`) — chosen for zero-setup local dev;
  swapping the Prisma datasource to Postgres later (e.g. for a public
  deployment) does not require a schema rewrite
- Auth.js (NextAuth v5), Credentials provider, passwords hashed with bcrypt
- shadcn chart components (Recharts under the hood) for dashboard charts
- zod + react-hook-form for form validation

## Core Concepts

### Users & multi-tenancy

Every meaningful row (accounts, categories, transactions, recurring rules) is
owned by a `User` via a `userId` foreign key. All queries are scoped to the
logged-in user's id. There is no cross-user sharing in v1 — each user's data
is fully private. This is designed in from the start (not bolted on later)
because the app is intended to be published for public sign-up eventually,
even though only one person uses it today.

### Budget cycle (not calendar month)

Each user sets a `cycleStartDay` (1–31) in Settings. The "current cycle" runs
from that day of one month to the day before that day the next month (e.g.
start day 25 → Sept 25–Oct 24). All dashboard/report/category-spend
calculations are computed against the current cycle window, not
`getMonth()`. Edge case: for start days like 29–31, cycles falling in shorter
months (e.g. February) clamp to the last day of that month.

### Accounts vs. Categories

These are two independent tags on a transaction:
- **Account** (wallet) — where the money physically is/was (checking, cash,
  credit card...). Tracks a running balance.
- **Category** — what the money was for, for budgeting purposes (Groceries,
  Rent...). Has a monthly limit compared against spend in the current cycle.

A transaction always has exactly one account; category is optional (to allow
quick/uncategorized entries), though the UI encourages picking one so it
counts toward a budget. Transfers between accounts are a separate feature,
out of scope for v1 (see below).

### Recurring transactions

A `RecurringRule` is a template (amount, category, account, note, cadence:
weekly/monthly/custom) plus a next-due-date. It does **not** auto-post. Each
time a cycle/period turns over, due rules appear in a "Recurring" review
list; the user confirms (optionally editing amount/date) before it becomes a
real `Transaction`. Declining/skipping an occurrence just advances its next
due date without creating a transaction.

### Theming

Base visual style is shadcn's neutral/minimal palette. Users get an accent
color picker in Settings (a handful of preset palettes, shadcn
theme-customizer style) plus light/dark/system mode. The signed-in user's
account stores their own preference; the seed/default for the first
(owner) account is coral. No visual theming decisions are hardcoded beyond
the neutral base + preset palette list.

## Data Model (Prisma, high level)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  cycleStartDay Int      @default(1) // 1-31
  currency      String   @default("PHP")
  accentColor   String   @default("coral")
  themeMode     String   @default("system") // light | dark | system
  createdAt     DateTime @default(now())

  accounts      Account[]
  categories    Category[]
  transactions  Transaction[]
  recurring     RecurringRule[]
}

model Account {
  id             String   @id @default(cuid())
  userId         String
  name           String
  type           String   // checking | cash | credit | savings | other
  startingBalance Decimal @default(0)
  createdAt      DateTime @default(now())

  user           User          @relation(fields: [userId], references: [id])
  transactions   Transaction[]
}

model Category {
  id           String   @id @default(cuid())
  userId       String
  name         String
  monthlyLimit Decimal
  icon         String   // lucide icon name
  color        String
  createdAt    DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id])
  transactions  Transaction[]
  recurring     RecurringRule[]
}

model Transaction {
  id         String   @id @default(cuid())
  userId     String
  accountId  String
  categoryId String?
  type       String   // income | expense
  amount     Decimal
  date       DateTime
  note       String?
  createdAt  DateTime @default(now())

  user       User      @relation(fields: [userId], references: [id])
  account    Account   @relation(fields: [accountId], references: [id])
  category   Category? @relation(fields: [categoryId], references: [id])
}

model RecurringRule {
  id         String   @id @default(cuid())
  userId     String
  accountId  String
  categoryId String?
  amount     Decimal
  type       String   // income | expense
  cadence    String   // weekly | monthly | custom
  intervalDays Int?   // used when cadence = custom
  note       String?
  nextDueDate DateTime
  active     Boolean  @default(true)

  user       User      @relation(fields: [userId], references: [id])
  account    Account   @relation(fields: [accountId], references: [id])
  category   Category? @relation(fields: [categoryId], references: [id])
}
```

(Account balance is computed as `startingBalance + sum(transactions)`, not
stored redundantly, to avoid drift.)

## Pages / Features

Layout: top nav (logo + links), not a sidebar — chosen for a lighter,
less "admin panel" feel.

- **Dashboard** — current-cycle summary cards (income, expense, net),
  budget-vs-actual bar chart per category, spending trend line chart across
  past cycles, account balance overview, and a "recurring items due" banner
  linking to the Recurring page when anything is pending confirmation.
- **Transactions** — searchable/filterable list; add/edit/delete; assign
  account + category + date + note.
- **Categories** — CRUD for categories: name, monthly limit, icon (lucide
  picker), color.
- **Accounts** — CRUD for accounts/wallets; shows computed current balance.
- **Recurring** — manage recurring rules (CRUD); review/confirm/skip items
  that are currently due.
- **Settings** — cycle start day, currency (default ₱ PHP), accent color
  picker, light/dark/system mode, change password.
- **Auth pages** — sign up, log in, log out.

## Error Handling

- Forms validated client + server side with zod schemas shared between
  react-hook-form and server actions.
- Server actions return a typed `{ ok: true, data } | { ok: false, error }`
  shape rather than throwing to the client; UI surfaces failures via shadcn
  `toast`.
- Auth errors (bad credentials, duplicate email on signup) show inline field
  errors, not generic alerts.

## Testing

- Unit tests for cycle-date math (`getCurrentCycleRange(cycleStartDay, now)`
  and month-length edge cases) — this is the most bug-prone piece of logic
  and the easiest to get subtly wrong.
- Unit tests for budget aggregation (spend per category within a cycle).
- Component/integration tests are lighter for v1; can expand once the core
  flows are stable.

## Out of Scope for v1

- Multi-currency per account (single currency per user for now)
- Shared/household budgets (multi-user sharing of one budget)
- Transfers between accounts as a distinct transaction type
- OAuth login providers (email/password only for now; architecture allows
  adding providers later without rework)
- Data export/import
