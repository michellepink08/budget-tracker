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

## Password-reset email (Gmail SMTP)

The forgot-password flow (`src/lib/password-reset.ts`, `src/lib/mailer.ts`) sends its reset link over Gmail SMTP via Nodemailer, authenticated with a Google **App Password** rather than the account's real password. `src/lib/mailer.ts`'s `sendPasswordResetEmail` never throws — a failed send is logged server-side and swallowed, so the user-facing response stays identical whether the email was sent, failed to send, or was never registered in the first place (this is the same account-enumeration protection `src/lib/password-reset.ts` already relies on).

One-time setup for whichever Gmail account will send these:
1. Enable 2-Step Verification on that Google account.
2. Generate an App Password: Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail".
3. Set `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` (the generated 16-character password) in `.env`.

Without these two variables set, `createMailer()` will build a transport that fails auth on every send — which `sendPasswordResetEmail` catches and logs, so the app keeps working (the reset link just won't arrive by email; check the server logs for the failure).

## Deployment: Vercel + Postgres (Neon)

The app is deployed on Vercel, backed by a Postgres database provisioned through Vercel's Storage tab (Neon under the hood). `src/lib/prisma.ts` uses `@prisma/adapter-neon` — a WebSocket-based driver adapter well suited to serverless cold starts, and (like the SQLite adapter it replaced) pure JS, so it never needs the native schema-engine/query-engine binaries this development machine's Application Control policy blocks.

Schema changes are applied by Vercel's own build step (`prisma db push`, part of the project's configured Build Command), which runs on Vercel's unrestricted Linux build machine — never on this Windows machine. That's also why `prisma/schema.sql` and `scripts/db-push.mjs` (the old hand-rolled SQLite-syntax workaround for the same binary block) were retired: schema application no longer needs to happen locally at all.

**Single shared database:** for now, the same Postgres database serves both production and local development — the same one-environment model this project has always had (previously one local SQLite file), just relocated to the cloud. The practical consequence: a schema change only takes effect once deployed (edit `schema.prisma`, commit, push, let Vercel's build apply it) — local dev then sees the new schema automatically, since it points at the same database. Splitting into separate dev/prod databases later (e.g. via Neon's branching, or Vercel's Development/Preview/Production environment-variable scoping) is a clean future upgrade if stronger isolation is ever needed — not built here.
