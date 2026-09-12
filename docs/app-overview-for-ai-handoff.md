# Budget Tracker — Full Overview

A personal budget tracker web app, built for one person's actual financial workflow (not a generic multi-tenant SaaS product), currently live at **https://budget-tracker-maiava.vercel.app**.

This document exists to hand context to another AI/assistant helping decide what to build or change next. It covers what exists today, how it works, and what deliberately isn't built yet.

---

## 1. Core concept

A budget tracker organized around **custom pay cycles**, not the calendar month. You set a "cycle start day" (e.g. the 25th), and every budget period, report, and rollover calculation follows that cycle — not Jan 1–31 style months. This is the app's central differentiator.

---

## 2. Features, by area

### Accounts
- Multiple accounts per user: checking, savings, cash/e-wallet, credit card, loan — each type tracked distinctly.
- Every account has its own running balance, computed from its transaction history (not a manually-typed number).
- **Reconciliation**: you tell the app what an account actually holds; it computes the gap against its calculated balance and shows you the difference. Nothing is written until you explicitly confirm — then it records a single `BALANCE_ADJUSTMENT` transaction that closes the gap. It never silently overwrites a balance.
- Archive accounts (soft-delete, not permanent deletion).

### Transactions
- Every transaction is a self-contained signed ledger entry against one account (income positive, expense negative, in integer minor units — cents/centavos — never floating-point).
- **Transfers** between your own accounts are modeled as two linked transaction rows (`linkedTransactionId`), and are never counted as income or expense in reports — only a transfer fee (if any) shows up as spending. This was a deliberate design choice so moving your own money around never distorts your spending picture.
- Categories and subcategories for organizing transactions (each category has a color tag and icon, separate from the app's own UI theme).

### Budget
- Per-category budget allocations for the current cycle ("planned" amount vs. "actual" spent, computed from transactions).
- **Rollover**: unused or overspent amounts can carry into the next cycle, configurable per category (`NONE` / `CARRY_UNUSED` / `CARRY_OVERSPEND` / `CARRY_BOTH`).
- Progress bars per category show spent-vs-planned, and turn red when a category goes over budget (this was fixed during the visual refresh — it used to only say "over budget" in text without the bar itself changing color).

### Bills & recurring items
- One-off **Payables** (bills with a due date).
- **Recurring rules** for transactions that repeat (e.g. a subscription) — recurring items are deliberately never auto-posted; they're reminders/schedules, not automatic ledger entries, so nothing gets added to your accounts without you seeing and confirming it.
- **Recurring payables** (recurring bills specifically).
- A unified "what's due soon" view across one-off bills, recurring bills, and installment payments.

### Loans & credit cards
- Loans and credit cards tracked as their own account types with their own balances.
- **Installment purchases**: buying something on an installment plan generates the *entire* payment schedule up front (`InstallmentPurchase` + `InstallmentPayment` rows) — this is the one deliberate exception to "recurring items never auto-post," since an installment plan's schedule is fixed at the moment of purchase, not something that changes week to week.

### Reports
- Income vs. expense chart, spending-by-category chart (via Recharts), both cycle-aware (respect your custom cycle, not calendar months).

### Dashboard
- At-a-glance: liquid funds (total across accounts), budgeted-vs-spent for the current cycle, remaining amount, and a 7-day lookahead of upcoming bills/payments.

### Auth & account
- Email/password signup and login (Auth.js / NextAuth v5, Credentials provider, bcrypt-hashed passwords).
- **Forgot-password flow**: real email sent via Gmail SMTP (Nodemailer), with a single-use, sha256-hashed, 1-hour-expiring reset token — and the response is identical whether or not the email is actually registered, so no one can use it to discover which emails have accounts.
- A public demo account (`demo@example.com`) with an in-app "reset demo data" button that repopulates realistic fictional sample data — built for portfolio/demo purposes, kept even though the app's primary use is now personal.
- Onboarding for a new signup is currently just one question: cycle start day. (Currency and accent color used to also be asked here — see section 4.)

### Appearance
- Light / Dark / System theme toggle (works today).
- A single fixed color theme ("Wine" — a deep burgundy-rose) applied to everyone right now. The app *used to* let each user pick from 6 accent colors (Emerald, Teal, Amber, Indigo, Rose, Stone); that picker UI is hidden right now by deliberate choice (see section 4), not deleted — the underlying color system still exists and a 7th color (Wine) was added to it.
- Accent color drives three coordinated shades everywhere it's used: a dark shade (nav background), a base shade (buttons, active nav-link state, on-track progress-bar fill), and a light tint (progress-bar track backgrounds). Picking a different color (if the picker ever comes back) recolors all of these together, consistently.

### Navigation
- **Desktop:** a fixed left-side vertical panel — logo, all 8 main links (Dashboard/Transactions/Budget/Bills/Accounts/Loans & Cards/Reports/Settings), Add-transaction button and Sign-out pinned at the bottom.
- **Mobile:** a bottom tab bar — Home, Transactions, a center "Add" button, Bills, Accounts, and a "More" menu (opens Loans & Cards / Reports / Settings / Sign out).

---

## 3. Technical stack & architecture

- **Framework:** Next.js (App Router, TypeScript), Tailwind CSS v4, shadcn/ui components built on Base UI primitives (not Radix)
- **Database:** Postgres, hosted via Vercel's Storage tab (Neon underneath), accessed through `@prisma/adapter-neon` (a WebSocket/fetch-based driver suited to serverless — chosen specifically to avoid connection-pool exhaustion across Vercel's cold starts)
- **ORM:** Prisma, schema applied automatically during Vercel's own build step (`prisma db push`) — no separate migration-history system, matching how this project has always worked
- **Hosting:** Vercel (Hobby plan), deployed from a private-then-later-public GitHub repo (`michellepink08/budget-tracker`), auto-deploying on every push to `master`
- **Email:** Gmail SMTP via Nodemailer, using a Google App Password (not the real account password)
- **Auth:** Auth.js v5 (NextAuth), JWT session strategy, `trustHost: true` (required specifically because Vercel sits behind a proxy — a real bug that was hit and fixed during deployment)
- **Typography:** Manrope (Google Font), used for both headings and body text
- **Testing:** Vitest — every domain function in `src/lib/*.ts` is unit-tested against a mocked Prisma client (no test ever touches a real database); currently 225 passing tests
- **Validation:** zod schemas shared between client forms and server actions
- **Money:** always stored as integers in minor units (cents/centavos) — never floating-point, never Prisma's `Decimal` type

**Code layering** (consistent throughout): domain functions (`src/lib/*.ts`, pure logic + Prisma calls, unit-tested) → server actions (`src/actions/*.ts`, thin `"use server"` wrappers, zod-validated) → pages/components. This layering is deliberate and consistent across the whole codebase.

---

## 4. Deliberate simplifications currently in effect

These are choices made explicitly for *this one person's* use, not limitations — and each is documented as reversible:

- **No currency picker.** Fixed to PHP. (Onboarding used to ask; it doesn't anymore.)
- **No accent-color picker.** Fixed to one "Wine" color for everyone. The underlying 6-color system (plus Wine) still exists in code; only the picker UI is hidden.
- **Sign-up is still open** to anyone who finds the URL (this was a deliberate choice — not hidden, unlike the pickers above).
- **One shared Postgres database** serves both "production" and any local development — there's no separate dev/staging database yet. A schema change only takes effect once deployed.
- **No custom domain** — still on the default `budget-tracker-maiava.vercel.app` Vercel address.

---

## 5. What is NOT built (explicitly out of scope so far)

- No mobile app — this is a responsive web app only.
- No bank-sync / Plaid-style automatic transaction import — everything is entered manually.
- No multi-currency support within a single account (one currency is fixed per account/user right now).
- No shared/family accounts — every account belongs to exactly one user, no collaboration or shared budgets between people.
- No notifications (push, SMS) — the only "reminder" surface is the in-app "upcoming" list on the dashboard.
- No CSV import/export of transactions.
- No recurring-transaction auto-posting (deliberate, see section 2 — recurring items are reminders, not automatic entries, except installment plans).
- No formal Prisma migration history — schema changes are just pushed, not versioned as discrete migrations.
- No automated CI (tests only run locally/manually before a deploy, not on every PR).

---

## 6. How this was built

Every feature above went through the same process: a design conversation (sometimes with visual mockups), a written spec, a written step-by-step implementation plan, then TDD execution with a real test suite, followed by manual verification in a real browser against the actual live deployment. Nothing was built without the person actually looking at it working first. All of this history — every design doc and every implementation plan — is preserved in this repo under `docs/superpowers/specs/` and `docs/superpowers/plans/`, in case more detail on *why* something was built a particular way is ever needed.
