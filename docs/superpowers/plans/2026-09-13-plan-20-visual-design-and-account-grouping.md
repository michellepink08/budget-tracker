# Plan 20 — Visual Design System & Account-Purpose Grouping (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` sections A & B. **Audit reference:** `docs/superpowers/specs/2026-09-13-audit-and-classification.md` sections 1 & 2.

**Status:** Awaiting approval. This is a phase *roadmap* — each numbered phase below gets its own `writing-plans`-produced, TDD-step-level plan immediately before it's executed, same as every phase this session. Nothing here is coded yet.

**Explicitly omitted (already shipped, not touched):** light/dark/system mode + persistence (`next-themes`, `AppearanceSettings`'s theme picker), Manrope font, `lucide-react` as the icon library, `includeInLiquidFunds`/restricted-fund exclusion logic, `listRestrictedFundGroups`'s obligation/dedup/projection math.

## Phase 20.1 — Token replacement

- Replace `globals.css`'s 7-accent system with the fixed Wine palette + semantic `--success`/`--warning`/`--danger`/`--info` tokens (light + dark), per the design doc's token block.
- Remove `[data-accent="*"]` blocks, `User.accentColor` column (migration), the accent picker UI in `AppearanceSettings`.
- Add the typography scale tokens (`--text-2xs` … `--text-2xl`) to `@theme inline`.
- Revise `--chart-1..5` to a non-green data palette; update `income-vs-expense-chart.tsx` and `spending-by-category-chart.tsx` to not use green for a plain data series.
- Verification: manual, all three theme modes, both a light-mode and dark-mode screenshot pass over every existing page (Dashboard, Transactions, Budget, Bills, Accounts, Loans & Cards, Reports, Settings) confirming no page still reads a removed `--accent-*` token (a grep for `data-accent` and `accentColor` returning zero hits is the automated half of this check).

## Phase 20.2 — Shared `Card` and `IconBadge` components

- New `src/components/ui/card.tsx` (`Card`/`CardHeader`/`CardTitle`/`CardContent`, `raised`/`interactive` variants) per the design doc.
- New `src/components/ui/icon-badge.tsx`.
- Migrate every existing hand-written `<div className="rounded-lg border p-4">` (Dashboard, Accounts, Bills, Budget, Reports, Settings — an exact file list gets enumerated in this phase's own detailed plan) to `<Card>` — a mechanical swap, verified by the existing test suite staying green (these are presentational, so this is manual/visual verification, not new unit tests) plus a visual pass confirming shadows/surfaces render as specified.

## Phase 20.3 — Hover/focus/pressed interaction states

- Apply the `interactive` `Card` variant (or an equivalent utility class) to genuinely-clickable rows/cards across the app (account rows, transaction rows, upcoming-item rows) and confirm static cards (stat totals, informational panels) do **not** get it.
- Verify keyboard focus (`Tab` through a page) shows a visible ring everywhere a mouse hover shows a lift, on at least one full page pass.

## Phase 20.4 — `Account.purpose` schema + migration + form

- Prisma migration: add `Account.purpose` (default `"DISPOSABLE"`), backfill script per the design doc's rule (`CREDIT_CARD`→`CREDIT`, `LOAN`→`DEBT`, `includeInLiquidFunds:false`→`RESTRICTED`, else `DISPOSABLE`).
- `ACCOUNT_PURPOSES` constant, `accountSchema` gains `purpose`, account form's restricted-fund checkbox becomes a purpose selector (`includeInLiquidFunds` becomes derived, not user-set, going forward).
- Update `computeLiquidFunds`/`listRestrictedFundGroups`/`getRecommendedFundingTransfer` to filter by `purpose` instead of (or in addition to, during a transition) `includeInLiquidFunds`/`accountType` — this phase's detailed plan pins down whether both signals are read for one release or `purpose` fully replaces the boolean check immediately (recommendation: replace immediately, since the boolean becomes derived from purpose the moment this phase ships, so there's no window where they could disagree).
- Tests: extend `liquid-funds.test.ts`, `restricted-funds.test.ts` for purpose-based filtering; a new `accounts.test.ts` case for the backfill logic if it's expressed as a callable function rather than a one-off script.

## Phase 20.5 — Accounts page regrouping

- Accounts page groups its list into Disposable / Savings & Reserves / Restricted / Credit & Debt sections (still one page, per the request's "keep accounts inside the existing Accounts page").
- Disposable section: current/available balance, pending activity, recent activity, safe-to-spend inclusion badge, existing Reconcile action.
- Savings section: `SavingsGoal` schema (new model, per design doc section B) + CRUD, progress/assigned/unassigned display.
- Restricted section: existing `listRestrictedFundGroups` cards, extended with `paymentsCovered` and a deposit/payment history link (`listRestrictedAccountLedger`, a thin `listTransactions` wrapper).
- Credit/Debt section: existing credit card/loan data, explicitly never contributing to any of the three totals (test coverage: an assertion that a `CREDIT`/`DEBT`-purpose account is excluded from `computeLiquidFunds`, `listRestrictedFundGroups`, and the new savings sum, mirroring the existing exclusion tests).

## Open questions before Phase 20.1 starts

1. Confirm the accent-picker removal (see design doc section A's migration note) — or specify keeping a limited wine-only picker.
2. Confirm whether `SavingsGoal` is one-per-account (as drafted) or should allow multiple goals sharing one account's balance (the request's examples — rainy-day, emergency, vacation — read as one account per goal, but worth confirming before the schema is finalized).
