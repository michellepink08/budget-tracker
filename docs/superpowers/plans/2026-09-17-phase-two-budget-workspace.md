# Phase 2 Budget Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, inline in the user's existing checkout. Do not delegate or isolate away the existing financial repairs.

**Goal:** Implement and deploy the approved four-destination budget workspace using real saved data.

**Architecture:** Preserve existing server pages and mutation actions. Group existing routes with a shared section navigation; add pure ledger-to-account-table and planning projection helpers, with small client components for view switching and live draft totals. No schema or historical financial repairs are needed for the layout.

**Tech Stack:** Next 16.3.5, React 19.2.8, Prisma 7.10, Tailwind 4, Vitest 5, Playwright.

**Spec:** docs/superpowers/specs/2026-09-17-phase-two-budget-workspace-design.md

## Global constraints

- Keep Phase 1 financial records, actions and calculations intact.
- Execute here with checkpoints; stop on an unexpected financial difference or ambiguous match.
- Four primary destinations; secondary tools remain accessible.
- Use saved categories and accounts, not mock amounts.
- ChinaBank reserves are separate by default, not blocked from transfers or withdrawals.
- Do not apply schema migrations, historical imports or balancing adjustments.

## Task 1: Ledger and planning contracts

Files: src/lib/workspace-ledger.ts, src/lib/workspace-ledger.test.ts, src/lib/plan-funding.ts, src/lib/plan-funding.test.ts.

- [ ] Write tests for one-row linked transfers, card liability signs, lending labels, filtered missing partners, pre-cycle opening balance and allocation remainder.
  Fixtures: transfer source -500 and linked destination +500 must produce one row; a card purchase -35879 minor units must display +35879 debt; opening 2000000 plus expected 8000000 less allocated 9524513 must yield 475487; actual receipts are not separately added.
- [ ] Run `npx vitest run src/lib/workspace-ledger.test.ts src/lib/plan-funding.test.ts` and verify missing contracts fail.
- [ ] Implement `buildAccountActivity(transactions, accounts)` and `computePlanFunding(opening, expected, allocated)` in minor units. Implement `computeOpeningSpendable(accounts, preCycleTransactions, earmarks)` using signed cash ledger rows and disposable-purpose accounts only.
- [ ] Rerun targeted tests to green.

## Task 2: Four-destination shell and real account table

Files: src/components/nav/nav-links.ts and test, side-nav.tsx, top-nav.tsx, nav-drawer.tsx, workspace-sections.tsx; src/app/(app)/layout.tsx; src/components/transactions/account-activity-table.tsx; src/app/(app)/transactions/page.tsx; src/app/globals.css.

- [ ] Add tests proving child planning/tracker routes activate the corresponding primary navigation.
- [ ] Run the navigation test and verify failures against old navigation.
- [ ] Replace primary links with Dashboard, Transactions, Plan and Trackers; put tools in a collapsed secondary section and Settings/sign-out in footer. Keep mobile left drawer and global capture. Group existing planning and tracker routes with route-aware tabs, preserving old URLs.
- [ ] Render Account columns by default and retained List view from the same records; query filtered activity by affected linked groups so both sides remain visible.
- [ ] Use wine/cream tokens and explicit readable table and native-control foregrounds. Set min-width:0 through the flex shell so table overflow remains contained.
- [ ] Rerun navigation/ledger tests and production type-check.

## Task 3: Planning worksheet

Files: src/components/budget/plan-funding-workspace.tsx, allocation-worksheet.tsx, cycle-income-plan-table.tsx; src/components/bills/payment-plan-form.tsx; src/app/(app)/budget/page.tsx.

- [ ] Extend funding tests for overspend and draft deltas; run red before adding behaviour.
- [ ] Query pre-cycle signed account transactions, preserving opening snapshots; render labelled opening + expected-income funding summary.
- [ ] Capture input changes with data-plan-key/base attributes and compute draft deltas immediately. Saving remains explicit through existing owned actions.
- [ ] Display existing expense/savings allocations plus unbudgeted saved category/subcategory rows without creating records on render. Editable planned amounts use existing create/update actions; preserve rollover and daily allowance options in the existing advanced editor.
- [ ] Do not double-allocate regular bills already represented by category spending: payment allocations add loans/cards only; regular bills are a breakdown of spending budgets.
- [ ] Run unit tests and type-check. Verify expected/due dates remain column two and copied amounts remain editable.

## Task 4: Dashboard and tracker integration

Files: src/app/(app)/dashboard/page.tsx; src/components/accounts/dashboard-account-details.tsx; src/app/(app)/lending/page.tsx; src/components/lending/lending-list.tsx; src/app/(app)/tierra-alta/page.tsx; src/components/nav/workspace-sections.tsx.

- [ ] Add lending status edge cases to ledger tests, run red, then implement derived Unpaid/Partially repaid/Fully repaid labels.
- [ ] Put real account breakdowns in collapsed details under group totals and account history/edit actions in drawers. Add cycle dates and hide/show balance control without changing financial effects.
- [ ] Group lending records by person, show historical and settled records and existing repayments from receiving accounts. Retain existing source/receiving-account forms.
- [ ] Show ChinaBank reserve, pending cheque commitments and projected reserve using saved obligations, not inferred amounts. Reuse existing payable clearing/payment flow and ordinary transaction transfers for emergency withdrawals.
- [ ] Run targeted tests and browser checks; stop if the existing payable flow cannot safely clear a cheque without duplicating payments.

## Task 5: Verification and deployment

Files: e2e/phase-two-workspace.spec.ts; docs/phase-two-release.md.

- [ ] Check all four destinations and tabs using the existing demo account without seeding or adding financial records. Verify account/list toggle, collapse, mobile drawer, light/dark controls and immediate draft funding changes without saving demo edits.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run build`, opt-in Phase 1 financial checks and repair dry run (never --apply). Compare protected balances and repeat-run zero writes.
- [ ] Self-review source diff and requirement coverage; preserve unrelated dirty work and do not commit mixed changes wholesale.
- [ ] Deploy using `npx --yes vercel --prod --yes`, verify READY and live login/navigation browser checks, and report the production URL with any unfinished checks explicitly.

## Plan self-review

All shell, account-column, lending and allocation requirements have explicit implementing files. Existing Yearly Plan, Calendar, savings and loan/card features are reused instead of rewritten. No task reseeds or imports financial records. Runtime/browser checks cover client interactivity rather than asserting source text. User has already chosen direct inline execution and production deployment.
