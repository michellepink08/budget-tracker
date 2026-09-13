# Audit History — Design (plan-38 Stage G, §11)

## Purpose

Every balance-affecting mutation in the app must leave a permanent, reviewable
record: what changed, what it was before, what it became, when, how the
change was triggered, and — where safe — a way to undo it. Historical
financial data must never be silently rewritten; the only way a past change
disappears from view is by being explicitly reversed, and the reversal itself
becomes its own permanent entry.

This is additive to the existing codebase. It does not replace or modify
`QuickCaptureLog` or Quick Capture's own undo (`undoExecution` in
`src/lib/quick-capture/execute.ts`) — Quick Capture is explicitly out of
scope for this stage and is untouched.

## Scope

**In scope** — every mutation that touches a real account balance:

1. Manual transaction create / update / delete (`src/lib/transactions.ts`:
   `createExpenseLikeTransaction`, `createTransferTransaction`,
   `updateTransaction`, `deleteTransaction`, reached via
   `src/actions/transaction.actions.ts`)
2. `markPayablePaid` (`src/lib/payables.ts`)
3. `confirmReceipt` (`src/lib/receipts.ts`)
4. `confirmRecurringOccurrence` (`src/lib/recurring.ts`)
5. `confirmRecurringPayableOccurrence` (`src/lib/recurring-payables.ts`)
6. `payInstallmentTerm` (`src/lib/installment-purchases.ts`)
7. `makeCreditCardPayment` (`src/lib/credit-cards.ts`, reached via
   `src/actions/credit-card.actions.ts`)
8. `calendar/reminders.ts`'s `markPaid`
9. `applyReconciliation` (`src/lib/reconciliation.ts`, reached via
   `src/actions/reconciliation.actions.ts`)

**Out of scope for this stage** (explicitly deferred):

- Anything originating from Quick Capture (its own log + undo already work
  and are untouched).
- Non-balance-affecting edits: shopping lists/items, receipt drafts before
  confirm, income forecasts, category/budget edits, account metadata
  (name/color/icon), `CustomReminder.linkTransaction` (links an *existing*
  transaction, creates nothing).
- Redo of a reversed entry.
- Any voice-originated action (Stage I hasn't been built yet).

## Data model

```prisma
model AuditLog {
  id                 String    @id @default(cuid())
  userId             String
  entityType         String    // TRANSACTION | TRANSFER | PAYABLE_PAYMENT | RECEIPT_CONFIRMATION |
                                // RECURRING_OCCURRENCE | RECURRING_PAYABLE_OCCURRENCE |
                                // INSTALLMENT_PAYMENT | CREDIT_CARD_PAYMENT | REMINDER_PAYMENT | RECONCILIATION
  entityId           String    // the primary affected record's id
  action             String    // CREATE | UPDATE | DELETE | REVERSE
  source             String    // FORM | RECEIPT | RECURRING_RULE | SYSTEM
  previousValuesJson String?   // null for a CREATE
  newValuesJson      String?   // null for a DELETE
  relatedRecordIds   String[]  // e.g. price-history row ids a receipt-confirm also created
  reversalOfId       String?   // set only on a REVERSE row
  createdAt          DateTime  @default(now())

  user       User       @relation(fields: [userId], references: [id])
  reversalOf AuditLog?  @relation("AuditReversal", fields: [reversalOfId], references: [id])
  reversedBy AuditLog[] @relation("AuditReversal")

  @@index([userId, createdAt])
  @@index([userId, entityType, entityId])
}
```

`entityType` says *what kind of change*; `source` says *how it was
triggered*. They vary independently in principle, but within this stage's
scope each entity type has exactly one source in practice:

| entityType | source |
|---|---|
| `TRANSACTION`, `TRANSFER`, `PAYABLE_PAYMENT`, `INSTALLMENT_PAYMENT`, `CREDIT_CARD_PAYMENT`, `REMINDER_PAYMENT` | `FORM` |
| `RECEIPT_CONFIRMATION` | `RECEIPT` |
| `RECURRING_OCCURRENCE`, `RECURRING_PAYABLE_OCCURRENCE` | `RECURRING_RULE` |
| `RECONCILIATION` | `SYSTEM` (the adjustment amount is computed, not typed) |

## `recordAudit` helper

```ts
// src/lib/audit-log.ts
export type AuditEntityType =
  | "TRANSACTION" | "TRANSFER" | "PAYABLE_PAYMENT" | "RECEIPT_CONFIRMATION"
  | "RECURRING_OCCURRENCE" | "RECURRING_PAYABLE_OCCURRENCE"
  | "INSTALLMENT_PAYMENT" | "CREDIT_CARD_PAYMENT" | "REMINDER_PAYMENT" | "RECONCILIATION";
export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "REVERSE";
export type AuditSource = "FORM" | "RECEIPT" | "RECURRING_RULE" | "SYSTEM";

export async function recordAudit(
  prisma: Pick<PrismaClient, "auditLog">,
  input: {
    userId: string;
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    source: AuditSource;
    previousValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    relatedRecordIds?: string[];
    reversalOfId?: string;
  },
): Promise<{ id: string }>
```

## Where it's called

Two wiring patterns, depending on whether Quick Capture also calls the
underlying domain function:

- **Embedded** (Quick Capture never calls these): `recordAudit` is called
  inside the domain function's existing `$transaction`, using `tx` —
  `markPayablePaid`, `confirmReceipt`, `confirmRecurringOccurrence`,
  `confirmRecurringPayableOccurrence`, `payInstallmentTerm`,
  `calendar/reminders.markPaid`. Each function's Prisma `Pick` type widens to
  include `"auditLog"`.
- **Action-layer** (Quick Capture also calls these directly, and must stay
  untouched): `recordAudit` is called from the server action, wrapping the
  existing call — `transaction.actions.ts` (create/update/delete/transfer),
  `credit-card.actions.ts` (`makeCreditCardPayment`),
  `reconciliation.actions.ts` (`applyReconciliation`). Each of these three
  action functions runs the domain call and the `recordAudit` call inside one
  `prisma.$transaction` at the action layer, so the two stay atomic together
  even though the domain function itself isn't touched.

## Reversal

One paired reversal function per entity type, in a new
`src/lib/audit-log-reversal.ts`, each wrapped in its own `$transaction`, each
writing a `REVERSE` `AuditLog` row (`reversalOfId` pointing at the entry it
reverses) at the end:

| entityType | Reversal | Guard |
|---|---|---|
| `TRANSACTION` | CREATE→delete the transaction; UPDATE→restore `previousValuesJson`; DELETE→recreate it with its original id and fields (the DELETE audit row's `previousValuesJson` stores the transaction's complete pre-delete row, not just the editable fields, so recreation is exact) | ownership only |
| `TRANSFER` | delete both linked transaction rows | ownership only |
| `PAYABLE_PAYMENT` | delete the payment transaction; `Payable.status`→`PENDING`, clear `paidTransactionId` | ownership only |
| `RECEIPT_CONFIRMATION` | delete the transaction and every price-history row in `relatedRecordIds`; `Receipt.status`→`REVIEWED`, clear `transactionId` | ownership only |
| `RECURRING_OCCURRENCE` | delete the transaction; `RecurringRule.nextDate`→`previousValuesJson.nextDate` | refuse if the rule's current `nextDate` no longer equals the date this confirm advanced it to (a later occurrence was already confirmed) |
| `RECURRING_PAYABLE_OCCURRENCE` | delete the created `Payable`; `RecurringPayable.nextDueDate`→`previousValuesJson.nextDueDate` | refuse if that `Payable`'s status is no longer `PENDING` (already paid), or if `nextDueDate` has moved on |
| `INSTALLMENT_PAYMENT` | delete the transaction; `InstallmentPayment.status`→`PENDING`, clear `paidTransactionId` | ownership only |
| `CREDIT_CARD_PAYMENT` | delete the transaction | ownership only |
| `REMINDER_PAYMENT` | delete the transaction; `CustomReminder.state`→`UPCOMING`, clear `linkedTransactionId` | ownership only |
| `RECONCILIATION` | delete the `BALANCE_ADJUSTMENT` transaction | ownership only |

```ts
export async function undoAuditLogEntry(
  prisma: /* union of every Pick type the 10 reversal functions need, plus "auditLog" */,
  userId: string,
  auditLogId: string,
): Promise<{ ok: true } | { ok: false; error: string }>
```

`undoAuditLogEntry` loads the row (scoped to `userId`), refuses if
`action === "REVERSE"` or the row already has a `reversedBy` entry, then
dispatches by `entityType` to the matching reversal function. A `REVERSE` row
is terminal — no redo, matching Quick Capture's own undo, which also has
none.

## UI

- **`/audit-log`** — a new page listing every `AuditLog` row for the signed-in
  user, newest first, with a filter by `entityType`. Each row shows: date/time,
  a human-readable summary (e.g. "Paid bill: Internet — ₱1,200.00"), the
  source, and an Undo button when eligible (not a `REVERSE` row, not already
  reversed). Clicking Undo calls a server action wrapping
  `undoAuditLogEntry` and shows the result as a toast; a refused undo shows
  the guard's error message.
- **Per-record "history" links** — a small link/icon added next to existing
  rows on Transactions, Payables, Receipts, Loans & Cards (credit card
  payments, installment payments), and Calendar, linking to
  `/audit-log?entityType=<X>&entityId=<id>` (pre-filtered).

## Testing

Per existing convention (mocked-Prisma unit tests, one file per lib module):

- `src/lib/audit-log.test.ts` — `recordAudit` writes the row with the given
  fields; `undoAuditLogEntry` refuses a non-existent/foreign row, refuses an
  already-reversed row, refuses a `REVERSE` row, and dispatches correctly by
  `entityType`.
- `src/lib/audit-log-reversal.test.ts` — one test per entity type's happy
  path (reversal restores/deletes correctly and writes the `REVERSE` row),
  plus one test per entity type's specific guard (payable already paid,
  recurring rule/payable rule already advanced past this occurrence).
- Existing test files for the 9 wired domain functions gain a test asserting
  `recordAudit`/`auditLog.create` is called with the right `entityType`,
  `action`, and `source`.
- Named invariant test (extends `financial-invariants.test.ts` or a new
  file): reversing a `PAYABLE_PAYMENT` restores the payable to exactly its
  pre-payment state and does not affect any other account's balance.

## Non-goals

- No redo.
- No time-limited undo window — a reversal is available for as long as its
  entity-specific guard allows it, with no separate expiry.
- No UI change to Quick Capture's own recent-actions surface (if any) — it
  keeps using `QuickCaptureLog` exactly as today.
