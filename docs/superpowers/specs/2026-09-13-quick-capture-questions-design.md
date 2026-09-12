# Quick Capture Read-Only Questions (Phase 4) — Design

**Status:** Approved by user, 2026-09-13 (roadmap phase pre-approved as part of the overall Quick Capture initiative)

## Goal

Make `question`-intent drafts actually answer, instead of showing "answering isn't available yet." Answers render as a compact card (amount/list/text) — never a chatbot paragraph — and nothing is written to the database.

## Scope decision

Of the 15 declared `QuestionType` values, this phase answers 11 for real, reusing existing domain functions with zero new schema:

- `liquid_funds`, `account_balance` (falls back to liquid funds if no specific account is named/resolvable — see below), `spending_current_cutoff`, `spending_previous_cutoff`, `spending_by_category`, `upcoming_payables`, `due_this_week`, `next_due`, `transfers_required`, `credit_card_balance`, `credit_card_due`.

Four remain "not available yet," each for a real, documented reason rather than a silent gap:
- `safe_to_spend` — the formula genuinely isn't designed yet (liquid funds minus which upcoming obligations, exactly? this deserves its own short design pass, not a guess baked in here).
- `restricted_fund_balance` / `restricted_fund_coverage` — these are Phase 8's territory (the richer restricted-fund model isn't built yet).
- `expected_income` — forecasting future income from recurring rules is genuinely ambiguous (which rules count? over what window?) without more design.

## Extending the parser: extracting an account/category mention from a question

Phase 1's `question` clause-matcher never attempted to resolve an account or category — every question draft had `account: null, category: null`. This phase adds one small, generic extraction: scan the clause for the longest known account/category name that appears as a substring (case-insensitive), and resolve it the same way `resolveRefOrClarify` already does elsewhere. If nothing matches (e.g. "cash" doesn't match any of this user's actual account names), the relevant answer function falls back to a sensible default rather than asking a clarifying question — a read-only question is never worth blocking on a follow-up, unlike a money-moving command.

## Answer shape

```typescript
export type QuestionAnswer =
  | { kind: "amount"; label: string; amountMinorUnits: number }
  | { kind: "list"; label: string; items: { label: string; amountMinorUnits: number }[] }
  | { kind: "text"; label: string; text: string }
  | { kind: "unavailable"; message: string };
```

`parseQuickCaptureAction` computes the answer inline for any `question` draft before returning it to the client — a question needs no separate Confirm step (nothing is being written), so the panel can render the answer immediately alongside the parsed summary.

## Per-question-type behavior

| Question | Behavior |
|---|---|
| `liquid_funds` | `computeLiquidFunds` — amount |
| `account_balance` | resolved account → `computeAccountBalance`; unresolved → falls back to `computeLiquidFunds` labeled "Total money you have" |
| `spending_current_cutoff` / `spending_previous_cutoff` | resolve the current/previous `BudgetPeriod` (previous: `getCycleForDate` on `currentCycle.start - 1 day`; if that period was never created, spend is 0), sum all `EXPENSE` transactions — amount |
| `spending_by_category` | resolved category → `computeCategoryActual` for the current period — amount; unresolved → `spendingByCategory` (existing, already sorted) — list |
| `upcoming_payables` | `listPayables` — list |
| `due_this_week` | `listDuePayables` with `asOf = now + 7 days` — list |
| `next_due` | `listPayables` (already sorted by due date ascending), first row — text (name + due date), or "Nothing due" |
| `transfers_required` | `getRecommendedFundingTransfer` (existing, already built, previously only surfaced on the Bills page) — text describing the recommended transfer, or "No transfer needed right now" |
| `credit_card_balance` / `credit_card_due` | resolved credit-card account, or the user's only credit card if there's exactly one, else "unavailable, please specify which card" — `computeAccountBalance` (balance) or the card's `paymentDueDay` (due) |

## Testing

Unit tests per resolved question type in `src/lib/quick-capture/answer-question.test.ts`, following this codebase's existing convention (mocked Prisma, no real database). No UI tests, consistent with every prior phase.

## Out of scope

- `safe_to_spend`, `restricted_fund_balance`, `restricted_fund_coverage`, `expected_income` (see Scope decision above).
- Any change to how `transfers_required`'s recommendation is displayed on the existing Bills page — this phase only adds a second surface (the question answer) for the same existing computation.
