# Quick Capture Confirmation & Clarification Interface (Phase 2) — Design

**Status:** Approved by user, 2026-09-13 (roadmap phase pre-approved as part of the overall Quick Capture initiative)

## Goal

Make the Phase 1 parser actually usable: a compact command input in the sidebar (plus `Ctrl/Cmd+K`), a preview of what was understood, Confirm/Edit/Cancel, one-question clarification, and Undo after confirming. This is the first phase where Quick Capture becomes something a person can actually use, not just a tested library.

## Scope decisions (narrowing, not silently — documented here)

The Phase 1 parser's clause-matchers only actually produce 11 of the 14 declared intents today (`credit_card_payment`, `loan_payment`, and `payable_update` have Zod schemas and would-be confirm-handlers but no clause-matcher yet — no command phrasing routes to them). This phase:

- **Wires real execution** for every intent the parser can currently produce: `expense`, `income`, `refund`, `credit_card_charge`, `transfer` (with an optional separate fee expense), `person_borrowed`, `reconciliation`, `payable_create`, `transaction_update`, `transaction_delete`.
- **Shows `question` drafts read-only** with a "answering questions is coming in a later phase" note instead of a Confirm button — real question-answering is explicitly Phase 4 in the roadmap, not this one.
- **Still builds the confirm-handlers for `credit_card_payment`, `loan_payment`, `payable_update`** (so the system is coherent once a parser branch for them exists) but they're unreachable from the UI today since nothing produces those drafts yet. This is called out explicitly rather than left as a silent gap.

## Necessary small domain extensions

- **`updateTransaction`** (`src/lib/transactions.ts`) gains optional `amount`, `date`, `accountId` fields — today it only edits `description`/`notes`/`categoryId`/`subcategoryId`, which can't satisfy "Change the last transportation transaction to 250 total."
- **`Payable`** gains two fields: `dueDateConfirmed Boolean @default(true)` and `notes String?`. This is the minimum needed to satisfy "never present an estimated date as confirmed" for a payable created via Quick Capture. The richer field set from the original mega-design (statement date, minimum/planned payment, funding account, transfer-required, cutoff bucket, wider status enum) is **not** built now — it's real future work, but nothing in this phase's command examples needs it yet, and adding it speculatively would be exactly the "uncontrolled" scope growth the user warned against.
- **`person_borrowed` execution**: recorded as a plain `EXPENSE` transaction (reduces the account, description `"Lent to {person}"`) — there's no receivables/lending ledger concept in this schema, and building one wasn't asked for. This is a deliberate, documented simplification: the money leaving the account is tracked; who owes it back is only captured in the transaction's description text for now.

## UI shell

- A compact `QuickCaptureInput` lives in `SideNav`, always visible (both today's expanded sidebar — collapse/tooltip behavior is Phase 6). Clicking it, or pressing `Ctrl/Cmd+K` anywhere in the app, opens `QuickCapturePanel` — reusing the existing `Dialog` component (no new UI primitive needed), sized compact rather than full-screen.
- Inside: a text input (autofocus on open), a "Parse" affordance (Enter key or a button), then — once parsed — one preview card per draft (supporting the multi-transaction-in-one-command case from Phase 1 automatically, since `parseCommand` already returns an array).
- Each preview card shows: intent, amount, date (with an "estimated" badge when `confirmed: false`), account, destination account (transfers), category, cutoff override, description — plus **Confirm**, **Edit** (inline field editing on the same card — not the full form), **Cancel**.
- A draft with a non-null `clarification` shows that one question inline (radio-style options when provided) instead of Confirm/Edit/Cancel — answering it re-resolves that field and reveals the normal actions.
- After confirming, each card becomes a small success state: "Added ✓" (or "Updated"/"Deleted"), with **Undo** and **View** (navigates to `/transactions`, no per-transaction detail page exists to deep-link to, so this is as specific as it gets today) links.

## Undo, backed by `QuickCaptureLog`

A new small table, exactly as scoped in the original design spec:

```prisma
model QuickCaptureLog {
  id              String   @id @default(cuid())
  userId          String
  rawInput        String
  parsedDraftJson String
  resultingIds    String[]
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

One row is written per **confirmed draft** (not per command — a 3-clause command makes 3 rows, so each can be undone independently). `resultingIds` holds whatever was created/changed, so Undo knows exactly what to reverse:
- expense/income/refund/credit_card_charge/person_borrowed → delete that transaction
- transfer → delete both linked transaction rows
- reconciliation → delete the `BALANCE_ADJUSTMENT` row it created (if `alreadyBalanced` was true, nothing was created, so nothing to undo — the log row still exists but with an empty `resultingIds`, and Undo is a no-op)
- payable_create → delete that payable
- transaction_update → this one is **not simply reversible by ID deletion** — Undo needs the *previous* field values, so `parsedDraftJson` isn't enough; the log row for an update also stores a `previousValuesJson` snapshot taken right before the update, restored on Undo
- transaction_delete → **not undoable via re-creation** in this phase (recreating a deleted transaction with a new ID would break anything that referenced the old one, though nothing currently does) — deferred; the UI simply doesn't offer Undo for a delete confirmation, clearly labeled "This can't be undone" at confirm time instead

(`previousValuesJson` is a second new column on the same table, added alongside the three already listed above — noted here rather than silently added in the implementation.)

## Server actions

- `parseQuickCaptureAction(text: string)` — loads the user's accounts/categories (existing `listAccounts`/`listCategories`), calls `parseCommand`, returns the `CommandDraft[]` (dates serialized, since server actions cross a network boundary).
- `confirmQuickCaptureDraftAction(draft: CommandDraft)` — dispatches to the matching domain function based on `draft.intent`, writes one `QuickCaptureLog` row, returns `{ ok: true, logId, resultingIds } | { ok: false, error }`.
- `undoQuickCaptureAction(logId: string)` — loads the log row (scoped to the authenticated user, never trusts a client-supplied ID beyond that), reverses per the rules above.

## Testing

- `updateTransaction`'s new fields get unit tests (amount/date/account changes, still `userId`-scoped).
- `QuickCaptureLog`-backed confirm/undo logic gets unit tests per intent that's actually wired (the 10 listed above), plus the "already balanced reconciliation produces no undo-able row" and "delete confirmation offers no Undo" cases.
- No component/UI tests — consistent with this codebase's existing convention that only `src/lib/*.ts` gets unit tests; the panel itself is verified manually in the browser, same as every other page/component in this project.

## Out of scope (for this phase specifically)

- Voice input (Phase 7).
- Read-only question answering (Phase 4).
- Mobile entry point (Phase 6 — this phase is desktop-sidebar + `Ctrl/Cmd+K` only).
- `credit_card_payment`/`loan_payment`/`payable_update` parser coverage (documented gap above, not silently dropped).
- Sidebar collapse/tooltips (Phase 6).
