# Phase 2: Approved budget workspace design

## Purpose and implementation boundary

Implement the interactive design approved in this conversation in the existing D:\Budget Tracker application, then test and deploy to the existing Vercel budget-tracker project. The inline mock is a design reference, not deployable application code. Reuse existing financial helpers, records, actions and forms; do not replace the app or import mock figures into the database. Execute here with checkpoints, without delegated agents.

## Navigation and appearance

Use four main destinations: Dashboard, Transactions, Plan and Trackers. Settings and sign-out stay in the sidebar. Desktop navigation supports collapse; mobile navigation opens a left drawer. Keep global manual/voice quick capture, with confirmation before saving parsed transactions. Use the approved wine sidebar, cream surfaces and readable text in light and dark modes. Preserve existing tools, reports, shopping, audit and ledger access through secondary sections or drawers rather than deleting functionality.

## Dashboard

Keep the selected custom budget cycle visible. Account breakdown is collapsed by default; the overall total remains visible and users can expand individual accounts. Account details open in a drawer. Separate everyday funds, savings/earmarks and funds reserved mainly for Tierra Alta. Show expected versus actual income, planned versus actual spending and remaining obligations using existing audited calculations.

Confirmed past-due obligations with any unpaid remainder are overdue, including partially paid obligations. Estimated dates must be labelled and never treated as confirmed overdue. Unset dates appear under Needs a due date. Keep due-date state independent from date: CONFIRMED, ESTIMATED or UNSET.

## Transactions

Default to Account columns, a spreadsheet-style table with one column per saved account. Keep List view as an alternative. Show description, date and movement type before the account columns. Include all accounts, with horizontal scrolling contained inside the table rather than across the whole page.

Cash-account signs mean positive receipt and negative outflow. Card columns are explicitly labelled debt: purchases increase liability and payments reduce liability. Display one linked transfer/payment row with all affected account amounts; do not duplicate its underlying financial effects. Preserve existing search, filters, review, editing and deletion.

Lending movements are labelled Lent out and Repayment received. Each borrowing separately displays Unpaid, Partially repaid or Fully repaid based on its outstanding amount. A lending entry and its appearance in Transactions refer to the same records, not additional entries.

## Plan

Provide Monthly Plan, Yearly Plan and Calendar tabs; Calendar opens in month view. Monthly Plan is the editable worksheet, reusing the user's existing categories and subcategories every cycle. Add unlisted spending under Miscellaneous. Expected/due date is the second column. Use one difference/remaining column. Actual income and spending derive from eligible transaction types and categories; income source groups income but does not independently classify it. Actual contributions are inspectable.

Allow editable expected income, planned category spending, loan/card payments and savings allocations. Copy last cycle amounts into an editable new-cycle plan without copying actual transactions or payment links.

Label the funding calculation clearly:

- Total available to budget = opening spendable funds at cycle start + expected income for that cycle.
- Already allocated = planned spending + planned loan/card payments + planned savings.
- Remaining to budget = total available to budget minus already allocated.

Update the displayed remainder immediately as draft amounts change. Negative values show an over-budget shortfall. Do not add actual income on top of expected income or subtract actual payments again from planned allocations. This is an allocation calculation, not current cash or safe-to-spend. Derive opening funds from actual pre-cycle ledger state and applicable earmarks, never from the example mock opening of PHP20,000. ChinaBank reserve stays separate by default, but users can explicitly release it for emergency use. Release and transfer must not make the same funds available twice.

Yearly work-status and income scenarios remain projections and do not mutate actual transactions. Preserve existing yearly planning features.

## Trackers

Include Loans & Cards, Savings, Tierra Alta, and Lending & Repayments. Keep separate loans, schedules and balances, including both SLoans. Preserve card statement versus total liability distinctions and payment linking.

Lending & Repayments shows each person, outstanding amounts, individual borrowings and repayment history. Ask for the source account when lending and receiving account when recording repayment; these may differ. A normal borrowing reduces its source balance; repayment increases its receiving balance. Neither is spending or income. Preserve historical entries that intentionally do not change September opening cash. Mama's settled records remain in history with zero owed.

## Tierra Alta and ChinaBank

ChinaBank is reserved mainly for Tierra Alta, not locked against withdrawals. Allow ordinary transfers and emergency withdrawals/transfers out. Transfers into ChinaBank are account movements, not expenses. Excess deposits remain available as the Tierra Alta reserve across cycles.

A pending PDC is a commitment, not a cleared payment. Marking it cleared links or records one payment which reduces cash and settles the obligation once. Existing matches must be linked rather than recreated. Show actual ChinaBank balance, pending cheque commitments and reserve after commitments separately. Do not hardcode monthly amounts, clearance dates or saved schedules from the mock.

## Financial protections

Do not rerun historical imports or adjust balances to match display targets. Preserve Phase 1 records and reconciliation. No new forced liability values, schema reseeding or automatic reconciliation adjustments. Existing idempotent repairs remain repeat-safe. Stop on ambiguous matches or unexpected balance differences.

## Checkpoints and release acceptance

1. Review existing feature-to-navigation mapping and baseline financial reconciliation before app edits.
2. Build navigation and readable Dashboard/Transactions views, including account columns and preserved list view.
3. Build the monthly planning worksheet and verify live draft calculations, copied-plan editing and transaction-derived actuals.
4. Integrate Trackers, lending workflows and the ChinaBank/PDC reserve behaviour without duplicate entries.
5. Run full reconciliation and duplicate/repeat-run checks; investigate differences instead of adding adjustments.
6. Run the complete test suite, type-check, production build and browser checks of all four destinations, light/dark text, mobile drawer and principal workflows.
7. Deploy the tested app to its existing Vercel project, verify the deployment URL and report any blocked checks honestly.

## Self-review

The latest ChinaBank requirement supersedes earlier language describing the account as restricted against withdrawals. Lending & Repayments supersedes Money owed to me. Account columns supersedes the old single Account column as default, but does not remove List view. Example worksheet amounts are excluded from all production writes. Existing financial data and transaction effects remain authoritative.
