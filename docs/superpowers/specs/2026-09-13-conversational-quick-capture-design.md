# Conversational Quick Capture & Navigation Overhaul — Design

**Status:** Draft — awaiting user approval before any implementation

## Goal

Evolve the existing personal budget tracker so that recording, updating, and checking finances feels like a short chat exchange rather than filling out forms or navigating pages — without rebuilding the app's architecture, database, or existing features. Alongside this, replace the mobile bottom-tab nav and the "More" menu with a left-side drawer/sidebar pattern on every screen size.

This document is the required design step before any implementation plan is written, per the user's explicit process: inspect → find conflicts → propose schema → write spec → write phased plan → wait for approval.

---

## 1. What already exists (inspection findings)

The app already has almost everything a natural-language command needs to act on. Nothing here needs to be rebuilt:

- **Money/domain layer already correct for this feature.** Every amount is an integer minor unit; `src/lib/transaction-rules.ts` already classifies transaction types into signed effects; `src/lib/account-balance.ts` computes balances purely from transaction rows.
- **`createExpenseLikeTransaction` and `createTransferTransaction`** (`src/lib/transactions.ts`) already do exactly what "Paid 180 for food using cash" and "Transferred 1,000 from BPI to GCash" need — they resolve the correct budget cycle automatically from the transaction's date via `resolveBudgetPeriodForDate`, and accept a manual `budgetPeriodId` override already (this *is* the "manual cutoff override" the request asks for — it already exists, just unused by any UI yet).
- **`previewReconciliation` / `applyReconciliation`** (`src/lib/reconciliation.ts`) already implement exactly the "tell me a balance, I'll show you the difference, confirm before I write anything" flow the request describes for "My BPI balance is 166,232.27."
- **Credit-card charges already work correctly with zero new logic.** A credit-card purchase is just `createExpenseLikeTransaction` with `accountId` pointed at the card's own `Account` row. Because `CREDIT_CARD` accounts are already hard-excluded from `computeLiquidFunds` (`src/lib/liquid-funds.ts`), a charge already increases the card's liability without ever touching liquid cash — this is existing, tested behavior, not something to build.
- **"Restricted funds" is ~80% already built.** `Account.includeInLiquidFunds` (a boolean that already exists on every account) is precisely the "excluded from liquid funds / safe-to-spend" flag the request asks for. It's just not surfaced in the account form UI or given special dashboard treatment yet.
- **`updateTransaction` / `deleteTransaction`** (`src/lib/transactions.ts`) are already scoped to `userId` (never trust a client-supplied ID — already enforced) and already handle linked-transfer cleanup on delete. Gap: `updateTransaction`'s editable fields today are only `description`/`notes`/`categoryId`/`subcategoryId` — it cannot yet change `amount`, `date`, or `accountId`, which "Change the last transportation transaction to 250 total" needs. This is a small, additive extension, not a redesign.
- **`Payable` exists but is thin** compared to what's requested — see schema section below.
- **No default categories are created anywhere** (not at signup, only the demo account gets seeded categories via `src/lib/demo-seed.ts`). A brand-new real signup starts with zero categories today.

## 2. Conflicts with the current implementation

- **Plan 8 (mobile bottom nav) and Plan 11 (desktop left sidebar) directly conflict with this request's navigation requirements.** Plan 8 built exactly what this request says to remove: a fixed bottom tab bar with a center Add button and a "More" menu for overflow items. Plan 11's desktop sidebar is the right *concept* but doesn't collapse, doesn't remember a preference, and has no mobile/tablet equivalent (mobile still uses Plan 8's bottom bar). **Resolution:** supersede Plan 8 entirely (bottom nav removed, replaced by an off-canvas drawer on mobile/tablet); extend Plan 11's `SideNav` with collapse/tooltip/persistence behavior rather than rewriting it from scratch. Both existing spec/plan documents will get a "Superseded by [this spec]" note added at the top rather than being deleted — this project's convention has always been to keep design history, not erase it.
- **The personal-use simplification (Plan 10) hid the accent-color and currency pickers "for now."** Nothing in this request reopens either picker, so that decision stands unchanged.
- **No other conflicts found** — every other existing feature (accounts, transfers, budgets, bills, recurring, installments, loans, credit cards, reports, auth, password reset, demo data) is additive ground this feature builds on top of, not against.

## 3. Proposed Prisma schema changes

Kept deliberately minimal — extending existing models over adding new ones wherever the existing shape already fits.

### `Payable` — extended, not replaced

```prisma
model Payable {
  id                 String    @id @default(cuid())
  userId             String
  name               String
  amount             Int
  dueDate            DateTime
  dueDateConfirmed   Boolean   @default(true)   // NEW — false = estimated, must be visibly labeled as such
  statementDate      DateTime?                  // NEW
  minimumPayment     Int?                       // NEW
  plannedPayment     Int?                       // NEW — the amount actually intended to pay (may differ from `amount`/statement total or `minimumPayment`)
  fundingAccountId   String?                    // NEW — where the money will come from, if different from the paying account
  transferRequired   Boolean   @default(false)  // NEW
  notes              String?                    // NEW
  accountId          String                     // the paying account (existing)
  categoryId         String?
  budgetPeriodId     String?                    // NEW — the existing BudgetPeriod concept reused as the "current cutoff vs next cutoff" bucket, instead of a new bespoke field
  status             String    @default("PLANNED") // CHANGED default + widened value set (see below)
  paidTransactionId  String?
  recurringPayableId String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  user             User              @relation(fields: [userId], references: [id])
  account          Account           @relation(fields: [accountId], references: [id])
  fundingAccount   Account?          @relation("PayableFundingAccount", fields: [fundingAccountId], references: [id]) // NEW relation
  category         Category?         @relation(fields: [categoryId], references: [id])
  budgetPeriod     BudgetPeriod?     @relation(fields: [budgetPeriodId], references: [id]) // NEW relation
  recurringPayable RecurringPayable? @relation(fields: [recurringPayableId], references: [id])
}
```

`status` values widen from `PENDING`/`PAID` to: `PLANNED`, `NEEDS_CONFIRMATION`, `NEEDS_FUNDING`, `FUNDED`, `PAID`, `DUE_SOON`, `OVERDUE`. `DUE_SOON`/`OVERDUE` are *derived* at read time from `dueDate` vs. today (not stored, to avoid a background job keeping them in sync) — only `PLANNED`/`NEEDS_CONFIRMATION`/`NEEDS_FUNDING`/`FUNDED`/`PAID` are ever actually persisted.

### `Account` — no schema change, one new UI surface

`includeInLiquidFunds` already exists. The account form gains a "Restricted fund" toggle bound to this existing field (inverted: restricted = `includeInLiquidFunds: false`). No migration needed.

### New: `QuickCaptureLog` (optional, for Undo + audit — recommend building)

```prisma
model QuickCaptureLog {
  id              String   @id @default(cuid())
  userId          String
  rawInput        String              // the exact typed/transcribed text, preserved until confirmed or cancelled
  parsedDraftJson String              // the structured draft(s) the parser produced, as JSON
  resultingIds    String[]            // transaction/payable/account IDs actually created or changed, for Undo
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

This backs the "Undo" action after confirmation (know exactly what to reverse) and gives a private, per-user audit trail of commands — never exposed publicly, never in the demo account beyond fictional example commands. **Not required for the parser to work** — it's a small addition purely for reliable Undo; the parser and confirmation flow can be built and tested without it and this table added when Undo is implemented (Phase 5 below).

### No new models needed for: categories, transfers, credit cards, reconciliation, loans

All parser intents touching these map directly onto existing domain functions and existing schema, per section 1.

---

## 4. Architecture: the parser

### Parser abstraction (built first, deterministic, no external AI required)

```
src/lib/quick-capture/
  types.ts          — CommandDraft union type (one variant per intent), Zod schemas for each
  parser.ts         — ParserPort interface: parse(text: string, context: ParserContext): CommandDraft[]
  deterministic-parser.ts  — the actual first implementation: regex/keyword-based, deterministic, fully unit-testable
  aliases.ts        — account/category alias resolution (data-driven, not scattered conditionals — see below)
  clarification.ts  — logic for detecting an ambiguous/missing required field and generating the one follow-up question
```

`ParserPort` is the swappable abstraction the request asks for — a future AI-backed parser is just a second implementation of the same interface (`parse(text, context) => CommandDraft[]`), selected by a single config point, never required.

### `CommandDraft` — one Zod-validated shape per intent

Each of the 13 intents (expense, income, transfer, credit-card charge, credit-card payment, loan payment, money borrowed by another person, refund, balance reconciliation, payable creation, payable update, transaction update, transaction deletion, read-only question) gets its own Zod object type inside a discriminated union, e.g.:

```typescript
type ExpenseDraft = {
  intent: "expense";
  amountMinorUnits: number;
  accountId: string | null;        // null until resolved/confirmed
  accountRaw: string;               // what the user actually said, for the preview card and clarification
  categoryId: string | null;
  categoryRaw: string | null;
  description: string;
  date: Date;
  dateConfirmed: boolean;           // false for a relative/ambiguous date needing confirmation
  budgetPeriodId?: string;          // manual cutoff override, if the command named one explicitly
};
```

Multiple drafts from one command (e.g. "Paid 180 food cash, 213 medicine cash and 703 food GCash") are just `CommandDraft[]` of length 3 — the parser splits on the command-separator pattern (comma/"and") before parsing each clause independently, then re-validates the whole array.

### Alias resolution — one data-driven table, not scattered `if` statements

```typescript
// src/lib/quick-capture/aliases.ts
export type AliasEntry = { alias: string; resolvesTo: string; kind: "account" | "category" };
```

Seeded with the examples given (BPI→BPI Savings, GCash/CIMB→GCash/CIMB, Maya card→Maya Credit Card, Transpo→Transportation, Meds/medicine→Health, Hospital/hospitalization→Hospital, YouTube/ChatGPT/Claude/OneDrive→Subscriptions) as **per-user, database-backed rows** (a new small `AccountAlias`/`CategoryAlias` table, or one polymorphic `Alias` table — exact shape decided in the Phase 1 implementation plan), never hardcoded UI conditionals. "Aliases should eventually be configurable" — this data-driven shape is what makes a future Settings UI for managing them trivial to add later without touching the parser.

### Confirmation workflow

- Parsing never writes anything. A `CommandDraft[]` renders as one or more compact preview cards (type, amount, date — with an "estimated" badge if `dateConfirmed: false`, account, destination account, category, cutoff, description, balance effect, debt effect).
- **Confirm** calls the existing domain functions directly (`createExpenseLikeTransaction`, `createTransferTransaction`, `applyReconciliation`, etc.) — the parser never talks to Prisma itself, keeping the existing domain-function → server-action layering fully intact.
- **Edit** drops into inline field editing on the same preview card (not the full form) for small corrections, or opens the existing full form for anything bigger.
- **Cancel** discards the draft; nothing was ever written.
- A missing/ambiguous required field (e.g. two accounts named similarly, or no account at all) produces exactly one short follow-up question rendered inside the Quick Capture panel — never a modal, never the full form.
- **Corrections referencing recent records** ("Change the last transportation transaction to 250") resolve to a single specific `Transaction` row via `listTransactions` (existing, already `userId`-scoped) filtered/sorted by the referenced criteria; if more than one row matches ambiguously, the panel shows the candidates and asks which one — never silently picks based on "last"/"that one" when it's actually ambiguous, per the request.
- **Undo** (post-confirmation) reverses exactly the rows recorded in that command's `QuickCaptureLog.resultingIds` — a real, targeted undo, not a generic "last action" guess.

### Voice input

Browser `SpeechRecognition` API (already free, already privacy-respecting — no audio ever persisted, matching "never save audio"). Live transcript shown and editable before it's ever handed to the parser — voice and typed input converge on the exact same `CommandDraft[]` → confirmation pipeline, so nothing downstream needs to know which input method was used. Microphone-permission-denied and browser-unsupported are both handled as a graceful fallback to the typed input, never a hard error.

---

## 5. Navigation overhaul

- **`SideNav`** (already exists from Plan 11) gains: a collapsed/icon-only mode (tooltips on hover, active-page indicator preserved as a colored icon background instead of a text highlight), and the collapsed preference persisted in `localStorage` (per-viewer convenience, not account data — doesn't need a DB column).
- **Mobile/tablet**: `BottomNav` is deleted (not just hidden) and replaced with a new `NavDrawer` — an off-canvas panel sliding from the left, opened via a hamburger button in a new slim mobile header (which also carries the current page title and a Quick Capture/microphone shortcut button). The drawer includes every nav item in one plain vertical list (no "More"), Quick Capture, and Sign out. Standard drawer behavior: closes on link click, on backdrop click, and on Escape; locks background scroll while open; traps focus; has a visible close button and proper `aria-label`s.
- **Quick Capture entry points:** a compact command input in the sidebar (always visible, both expanded and collapsed sidebar states), `Ctrl/Cmd+K` global shortcut (desktop), and the mobile header's Quick Capture/mic button — all three open the exact same `QuickCapturePanel` component, just anchored differently (an inline expandable panel on desktop, a bottom sheet/dialog on mobile).

## 6. Dashboard reordering

Existing dashboard data sources are reused (liquid funds, budget-vs-spent, upcoming payables already exist); this is a reordering/regrouping of presentation, not new computation, except:
- **"Safe to spend"** is a new derived figure: liquid funds minus the sum of `NEEDS_FUNDING`/`FUNDED`/`PLANNED` payables due before the next cutoff minus any planned-but-unallocated budget amounts — the exact formula gets nailed down in that phase's plan, not guessed here.
- **"Transfers required"** reuses the existing `src/lib/transfer-recommendations.ts` (already built, currently only surfaced elsewhere — needs inspecting further in that phase).
- Restricted funds get their own visually separated dashboard group, using the existing `includeInLiquidFunds: false` accounts plus their linked payables for "upcoming obligation"/"projected balance after payment."

## 7. Export & backup

Settings → Data, three formats (CSV, XLSX via a library like `exceljs`, JSON), filterable by cutoff/date range/account/category/type, every export scoped by `userId` server-side (never trust a client filter to be the *only* scoping — the query itself is always additionally constrained to the authenticated user). XLSX gets one worksheet per model family listed in the request. No import — explicitly out of scope, as stated.

---

## 8. Reused vs. new — summary table

| Reused as-is | Extended | New |
|---|---|---|
| `createExpenseLikeTransaction`, `createTransferTransaction`, `listTransactions`, `deleteTransaction` | `updateTransaction` (add amount/date/account fields) | `src/lib/quick-capture/*` (parser, aliases, drafts) |
| `previewReconciliation`, `applyReconciliation` | `Payable` model + domain functions (richer fields/statuses) | `QuickCaptureLog` model |
| `computeLiquidFunds`, `computeAccountBalance` | `SideNav` (collapse/persistence) | `NavDrawer` component |
| `resolveBudgetPeriodForDate`, manual cutoff override (already exists, unused until now) | Account form (restricted-fund toggle) | `QuickCapturePanel` (desktop + mobile variants), voice input hook |
| `transaction-rules.ts` signed-effect logic | Dashboard page (reordering + safe-to-spend calc) | Alias table + seed data |
| Credit-card charge/payment logic | Default category seeding (new — doesn't exist today, even for real signups) | Export routes (CSV/XLSX/JSON) |

## 9. Risks & migration considerations

- **`Payable` status value change** (`PENDING`/`PAID` → the wider set) is a breaking change for any existing stored rows with `status: "PENDING"` — a one-time data migration (`PENDING` → `PLANNED`) must run as part of that phase's plan, not left implicit.
- **Deleting `BottomNav` entirely** (vs. just hiding it) means Plan 8's manual verification steps no longer apply — that plan's document gets a superseded note, not silent deletion, so the history of *why* it was built stays legible.
- **Multi-transaction commands and Undo interact**: undoing one command that created 3 transactions must undo all 3 together, atomically — `QuickCaptureLog.resultingIds` existing as an array (not one row per created transaction) is what makes that atomic.
- **Voice recognition browser support is inconsistent** (Safari/iOS support for the Web Speech API has historically been shakier than Chrome) — the graceful typed-input fallback isn't optional polish, it's load-bearing for a meaningful fraction of real usage.
- **Alias ambiguity is a real product-design risk**, not just an engineering one: "GCash or CIMB → GCash/CIMB" in the request implies two different real-world account names might intentionally resolve to the same target — worth a explicit confirmation with the user before Phase 1 locks in the exact alias-table shape, since getting this wrong is expensive to unwind once real transaction data references resolved account IDs.
- **Scope discipline**: this is a large initiative. Building all 10 phases before any of them ship real value would repeat the exact mistake the user explicitly warned against ("do not attempt this entire feature set in one uncontrolled rewrite"). Each phase below gets its own brainstorm-confirm → spec → plan → execute cycle, same as every other feature built in this project so far — this document and the phase list are the roadmap, not a single mega-plan.

---

## 10. Phased roadmap

Each phase ships independently and is verified live before the next one starts, per this project's established rhythm (spec → plan → TDD execution → manual browser verification against the real deployment → merge). Order matches the user's explicit priority:

1. **Typed Quick Capture + deterministic parser** — the parser package, alias table + seed, `CommandDraft` Zod types for all 13 intents, unit tests per intent (per the request's test list). No UI yet beyond a bare input box wired to the parser, so the hardest logic is proven correct in isolation first.
2. **Confirmation & clarification interface** — the real `QuickCapturePanel` UI: preview cards, Confirm/Edit/Cancel, one-question clarification flow, Undo, success/View-Transaction affordance.
3. **Multi-transaction commands** — extending the parser's clause-splitting and the confirmation UI to handle an array of drafts from one input.
4. **Read-only finance questions** — the same panel answering balance/spend/payable/transfer questions as compact cards instead of creating anything.
5. **Recent-record corrections & Undo** — transaction update/delete via natural language, `QuickCaptureLog`, real Undo.
6. **Navigation overhaul** — `NavDrawer` (mobile/tablet), `SideNav` collapse + persistence, superseding Plan 8's bottom nav.
7. **Voice transcription** — Web Speech API integration into the existing panel, editable transcript, permission handling.
8. **Restricted-fund improvements** — account-form toggle, dashboard grouping, obligation/projection figures.
9. **Server-side export & backup** — CSV/XLSX/JSON, filtered, scoped.
10. **Dashboard refinement** — final reordering/regrouping pass once everything above exists to actually show.

---

## Open question before writing Phase 1's implementation plan

The alias-table exact shape (one polymorphic table vs. separate account/category alias tables) and the precise `CommandDraft` field list per intent are the two genuinely open design decisions — everything else above is either a direct extension of existing code or a standard, low-risk addition. These get finalized in Phase 1's own plan, not guessed further here.
