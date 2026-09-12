# Restricted Funds — Design

**Status:** Approved by user, 2026-09-13

## Goal

Build out "restricted/dedicated funds" — money set aside (an emergency fund, a savings goal) that should never be counted as spendable — beyond the existing bare on/off flag. This is Phase 8 of the Quick Capture roadmap: an account-form toggle with clearer wording, a dedicated dashboard grouping with obligation/projection figures, and the two Quick Capture question types (`restricted_fund_balance`, `restricted_fund_coverage`) that have been stubbed as "not available yet" since Phase 4.

## Context

`Account.includeInLiquidFunds` already exists and `computeLiquidFunds` (`src/lib/liquid-funds.ts`) already excludes accounts where it's `false` — the core exclusion this feature is about is ~80% done. What's missing: the account form's checkbox is worded as "Count toward liquid funds" rather than framed around restriction; there's no visual grouping or obligation/projection data anywhere for these accounts; and the two related Quick Capture question types return a canned "not available yet" message.

`Payable` (`prisma/schema.prisma`) already links to an `Account` via `accountId` and has only two statuses in active use, `"PENDING"` and `"PAID"` (no `"CANCELLED"` exists anywhere in the schema or domain code) — a payable is deleted rather than cancelled if abandoned, so filtering to `PENDING` already excludes both paid and (nonexistent) cancelled ones. `confirmRecurringPayableOccurrence` (`src/lib/recurring-payables.ts`) creates a new `Payable` row carrying the originating rule's `recurringPayableId` each time a user manually confirms an occurrence; nothing stops a second confirmation from happening before the first is marked paid, so two `PENDING` payables can legitimately share one `recurringPayableId` — an older, now-superseded ("overdue duplicate") one and a newer one.

## Approach

### 1. `src/lib/restricted-funds.ts` (new) — shared domain module

```ts
export type RestrictedFundGroup = {
  accountId: string;
  accountName: string;
  balance: number;               // minor units
  obligationTotal: number;       // minor units, deduped sum (see below)
  nextPayable: { name: string; amount: number; dueDate: Date } | null;
  projectedBalance: number;      // balance - obligationTotal
};

export async function listRestrictedFundGroups(
  prisma: Pick<PrismaClient, "account" | "transaction" | "payable">,
  userId: string,
): Promise<RestrictedFundGroup[]>
```

- **Restricted account** = `includeInLiquidFunds: false`, `archivedAt: null`, and `accountType` not in `["CREDIT_CARD", "LOAN"]` — the same exclusion list `computeLiquidFunds` already hard-codes for "this is a debt, not money you have," reused here as an imported constant rather than duplicated.
- **Obligation total, per account:** fetch that account's `PENDING` payables. Group by `recurringPayableId` (payables with a `null` recurringPayableId are never grouped — each always counts on its own). Within each non-null group, keep only the earliest-`dueDate` payable; drop the rest as superseded duplicates. Sum the kept payables' `amount`.
- **`nextPayable`:** the earliest-due payable among the kept (post-dedup) set, or `null` if there are none.
- **`projectedBalance`:** `balance - obligationTotal` (can go negative — that's the point, it's a warning signal, not clamped to zero).
- Balances come from the existing `computeAccountBalance`; no new balance logic.

This is the single source of truth both the dashboard and Quick Capture read from, so the two surfaces can never disagree about what a fund's obligations are.

### 2. Account form — reframe the toggle

`src/components/accounts/account-form-dialog.tsx`: the checkbox bound to `includeInLiquidFunds` changes label and sense:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={!watch("includeInLiquidFunds")}
    onChange={(e) => setValue("includeInLiquidFunds", !e.target.checked)}
  />
  Restricted fund (excluded from liquid funds and safe-to-spend)
</label>
```

No change to `accountSchema`, `account.actions.ts`, or the `Account` model — same field, same server contract, only the form's presentation inverts. (`safe-to-spend` doesn't exist yet — Phase 10's territory — but the checkbox's copy names both things this flag already/will exclude the account from, since that's the actual mental model a user has for "restricted.")

### 3. Accounts page — restricted tag

`src/components/accounts/account-list.tsx`: next to the existing `(primary funding)` tag, add `(restricted)` when `!account.includeInLiquidFunds`, same inline style:

```tsx
{!account.includeInLiquidFunds && (
  <span className="ml-2 text-xs text-muted-foreground">(restricted)</span>
)}
```

### 4. Dashboard — restricted funds section

`src/app/(app)/dashboard/page.tsx`: fetch `listRestrictedFundGroups(prisma, user.id)` alongside the existing `Promise.all`. Render a new section after "Upcoming," only when the list is non-empty:

```tsx
{restrictedFunds.length > 0 && (
  <div>
    <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted funds</h2>
    <div className="flex flex-col gap-2">
      {restrictedFunds.map((fund) => (
        <div key={fund.accountId} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{fund.accountName}</p>
            <p className="font-medium">{formatMoney(fund.balance, user.currency)}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {fund.obligationTotal > 0
              ? `Obligation: ${formatMoney(fund.obligationTotal, user.currency)}${
                  fund.nextPayable
                    ? ` · Next: ${fund.nextPayable.name} — ${formatMoney(fund.nextPayable.amount, user.currency)} due ${fund.nextPayable.dueDate.toLocaleDateString()}`
                    : ""
                }`
              : "No upcoming obligations"}
          </p>
          <p className="text-sm text-muted-foreground">
            Projected after payment: {formatMoney(fund.projectedBalance, user.currency)}
          </p>
        </div>
      ))}
    </div>
  </div>
)}
```

### 5. Quick Capture — the two stubbed question types

`src/lib/quick-capture/answer-question.ts`, replacing the two `unavailable` stubs:

- **`restricted_fund_balance`:**
  - `draft.account?.id` resolved → return that account's balance via the existing `computeAccountBalance` (identical to `account_balance`'s resolved-account branch — restriction status doesn't matter once a specific account is named).
  - Unresolved → sum every `RestrictedFundGroup.balance` from `listRestrictedFundGroups` (mirrors how `liquid_funds` aggregates over its own account set; an empty result naturally sums to 0, no special-casing needed).

- **`restricted_fund_coverage`:**
  - Resolve which fund: `draft.account?.id` if it names a restricted account; else, if the user has exactly one restricted fund, use it; else if zero, return `{ kind: "unavailable", message: "You don't have any restricted funds set up." }`; else (multiple, none named) return `{ kind: "unavailable", message: "Which fund did you mean?" }` — the same disambiguation shape `credit_card_balance`/`credit_card_due` already use for an unnamed card.
  - Once one fund is identified, compare `balance` to `obligationTotal` and return a `text`-kind answer:
    - Covers it: `` `Yes — ${(balance/100).toFixed(2)} covers ${(obligationTotal/100).toFixed(2)} in upcoming obligations (${(projectedBalance/100).toFixed(2)} left over).` ``
    - Falls short: `` `No — ${(balance/100).toFixed(2)} is short of the ${(obligationTotal/100).toFixed(2)} upcoming obligations by ${(Math.abs(projectedBalance)/100).toFixed(2)}.` ``
  - Plain decimal figures, no currency symbol — matches every other numeric value this file and `QuickCapturePanel`'s `summarize()` already produce.

`src/lib/quick-capture/deterministic-parser.ts` — two new entries in `QUESTION_PATTERNS`:

```ts
{ test: /\b(restricted|dedicated)\b.*\bfunds?\b/, questionType: "restricted_fund_balance" },
{ test: /\benough\b.*\bcover\b|\bcover\b.*\benough\b/, questionType: "restricted_fund_coverage" },
```

Placed before the catch-all `spending_by_category` pattern (`/\bspen(d|t|ding)\b.*\bon\b/`) so a phrase like "Is my emergency fund enough to cover my insurance premium?" can't accidentally fall through to a spending pattern first — neither new pattern's vocabulary overlaps with any existing one, so ordering relative to the rest is otherwise unconstrained.

## Data flow

```
Dashboard load:
  listRestrictedFundGroups(prisma, userId)
    → per restricted account: computeAccountBalance + payable.findMany(status: PENDING) → dedup by recurringPayableId → obligationTotal/nextPayable
    → rendered as one card per fund

Quick Capture "Is my emergency fund enough to cover my insurance premium?":
  parseCommand → question clause matches restricted_fund_coverage pattern, findMentionedRef extracts "emergency fund" if it names a real account
  → confirmQuickCaptureDraftAction path unused (read-only) → parseQuickCaptureAction already calls answerQuestion inline
  → answerQuestion resolves the fund (named, or the sole one, or asks) → listRestrictedFundGroups → compares balance vs obligationTotal → text answer
  → QuickCapturePanel renders the text answer inline, same as every other question type
```

## Testing

- `restricted-funds.test.ts` (new, mocked-Prisma): a restricted account with no payables (obligationTotal 0, nextPayable null); one with a single standalone payable; one with two payables sharing a `recurringPayableId` (asserts only the earlier-due one is kept, the later one is dropped, and `nextPayable` is the kept one); a non-restricted account and a `CREDIT_CARD`/`LOAN` account with `includeInLiquidFunds: false` are both excluded from the result entirely; `projectedBalance` going negative is returned as-is, not clamped.
- `answer-question.test.ts` (extended): `restricted_fund_balance` with a named resolved account, with no account and one restricted fund, with no account and multiple restricted funds (sums both), with no restricted funds at all (returns 0). `restricted_fund_coverage` covering: named fund that covers its obligations, named fund that falls short, no name + exactly one fund (auto-picked), no name + zero funds (unavailable message), no name + multiple funds (unavailable "which fund" message).
- `deterministic-parser.test.ts` (extended): the two example phrasings above each resolve to their intended `questionType`.
- No new tests for `account-form-dialog.tsx`, `account-list.tsx`, or `dashboard/page.tsx` — presentational-only changes, consistent with this codebase's existing convention (verified manually against the live deployment instead, as every prior phase's UI work has been).
- Manual verification on the live deployment: toggle a restricted-fund account on/off via the reworded checkbox and confirm it appears/disappears from the dashboard's new section and gains/loses the `(restricted)` tag on the Accounts page; confirm the obligation/next-payable/projected-balance figures for a fund with a real linked payable; ask both new Quick Capture questions against the demo data and confirm sensible answers, including the "which fund" and "no funds set up" disambiguation paths.

## Out of scope

- `safe_to_spend` (Phase 10's territory — the formula isn't designed yet).
- `expected_income` (unrelated, still undesigned).
- Any change to `computeLiquidFunds` itself — it already excludes restricted accounts correctly; this phase only adds visibility and Quick Capture support on top.
- Multiple currencies for restricted-fund totals — this app is PHP-only throughout; `listRestrictedFundGroups` sums minor units directly, same as every other aggregate in this codebase.
