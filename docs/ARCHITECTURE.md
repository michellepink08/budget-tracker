# Architecture

A short, public-facing tour of how this app is built and why. For the full history of design decisions as they were made, see `docs/superpowers/specs/` and `docs/superpowers/plans/` — this document is a condensed summary, not a replacement for that record.

## Layering

Every piece of financial logic follows the same three-layer pattern:

1. **Domain functions** (`src/lib/*.ts`) — plain, dependency-injected functions that take a Prisma client (or a narrow `Pick<PrismaClient, "...">` slice of one) as their first real argument, plus a `userId` and whatever input they need. Every mutation scopes its `where` clause by that `userId`, so ownership is enforced at the data layer, not just the UI. These are unit-tested against **mocked** Prisma clients — no test in this project hits a real database.
2. **Server actions** (`src/actions/*.ts`) — thin `"use server"` wrappers: check the session, validate the input with a `zod` schema, call the domain function, `revalidatePath` on success. They return a typed `{ ok: true, ... } | { ok: false, error }` shape rather than throwing.
3. **Pages and components** — server components fetch data through the domain layer and render it; a handful of client components (dialogs, forms) call the server actions above.

## Money representation

Amounts are stored as integers in the currency's minor unit (centavos for PHP, cents for USD) rather than as Prisma `Decimal`. Both avoid floating-point rounding error, but integers are simpler to add/subtract/compare in plain TypeScript without a decimal-math library, and this app only ever needed two currencies at two decimal digits each. Display formatting (dividing by 100, adding the currency symbol) is one shared helper (`src/lib/money.ts`), not scattered per-page math.

## The budget cycle

Each user sets a `cycleStartDay` (1–31) — a cycle runs from that day of one month to the day before that day the next month. For `cycleStartDay = 11`: September 10 belongs to the Aug 11–Sep 10 cycle, September 11 starts a new one (Sep 11–Oct 10). If `cycleStartDay` is 29–31 and the current month is shorter, the boundary clamps to that month's last valid day instead of landing on a date that doesn't exist. This logic lives in exactly one place, `src/lib/cycle.ts`'s `getCycleForDate` — every page, report, and domain function that needs "what cycle does this date belong to" calls into it rather than re-deriving it.

## The transaction and transfer model

Every transaction row is a **self-contained signed ledger entry against its own `accountId`**. Inflow types (`INCOME`, `REFUND`) store a positive amount; outflow types (`EXPENSE`, `SAVINGS`, `LOAN_PAYMENT`, `CREDIT_CARD_PAYMENT`, `TRANSFER_FEE`) store a negative one; `BALANCE_ADJUSTMENT` stores whatever signed delta closes a reconciliation gap. A transfer between two of a user's own accounts creates **two linked rows** sharing a `linkedTransactionId` — one outgoing, one incoming — rather than one row magically affecting two balances. The transferred principal is never counted as income or spending; only a `TRANSFER_FEE` row is a real expense.

## Account-balance rule

An account's balance is always computed, never stored redundantly:

```
balance = openingBalance + sum(amount) across every transaction row belonging to that account
```

"Liquid funds" (shown on the Dashboard) sums the balances of accounts flagged `includeInLiquidFunds` — with a hard rule on top of that flag: `CREDIT_CARD` and `LOAN` account types are never included, because available credit isn't "your money," regardless of how that flag happens to be set.

## Recurring items never auto-post

A `RecurringRule` (regular transactions) or `RecurringPayable` (bills) is a template plus a next-due-date. Its due date reaching today only makes it appear in a "due" review list — a real transaction or bill is only created once the user explicitly confirms it (optionally editing the amount or date first), or the occurrence is skipped, advancing the next-due-date without creating anything.

**Installment purchases are the one exception.** An `InstallmentPurchase`'s whole payment schedule is generated up front at creation time — a fixed `totalAmount` split evenly across a fixed `numberOfTerms`, with monthly due dates. Unlike a recurring rule's open-ended cadence, an installment plan's full schedule is genuinely known the moment it's created, so there's nothing to defer.

## Reconciliation never silently overwrites

When a user enters what an account actually holds, the app computes the difference against the calculated balance and shows it — nothing is written until they explicitly confirm. Only then does it create a `BALANCE_ADJUSTMENT` transaction closing the gap. That adjustment is a normal transaction row, so it's part of the same audit trail as everything else — no separate reconciliation-history table was needed.

## Deployment: SQLite → Postgres

This schema was written from the start to not require a rewrite when moving off SQLite. To switch:

1. Change `prisma/schema.prisma`'s `datasource db` block: `provider = "postgresql"`, and point `DATABASE_URL` at a real Postgres connection string.
2. Swap `@prisma/adapter-better-sqlite3` for a Postgres-compatible driver adapter (or Prisma's default query engine — the schema-engine-binary constraint documented in the README is specific to this one development machine's Application Control policy, not to Postgres or to production deployment generally).
3. Apply the schema against the new database.

`prisma/schema.sql` — the hand-written mirror this project uses locally via `npm run db:push` — is this machine's own workaround for a blocked native binary. It isn't part of what a normal deployment target needs; a real Postgres target can use Prisma's own migration tooling directly.
