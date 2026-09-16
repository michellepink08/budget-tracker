# Monthly Plan Design

## Goal

Replace the overlapping Budget and Bills planning workflow with one Monthly Plan page for a selected budget cycle. It gives the user one place to enter expected income, category budgets, and planned obligations, then compare each against real transactions.

## Navigation

- The existing `/budget` page becomes **Monthly Plan**.
- `/bills` redirects to `/budget` so there is one planning workspace rather than two competing pages.
- Accounts, Transactions, Loans & Cards, and Year Plan remain available for setup, transaction recording, debt management, and long-range forecasts.

## Monthly Plan layout

The page has a cycle picker and a **Copy last cycle** action. It contains three clear tables.

### Income

Columns: Source, Expected, Actual received, Difference, Expected date, Actions.

- The user creates expected income directly for the selected cycle.
- Actual received comes from the income transaction linked to that income expectation.
- Difference is actual minus expected: positive means more received; negative means less received.

### Spending budget

Columns: Category, Planned, Actual spent, Difference, Remaining, Actions.

- Uses the existing budget allocation records and their transaction-derived actual amounts.
- Difference is actual minus planned. Positive means over budget and is shown as a warning; negative means under budget.
- The user can add and edit a planned amount for each category or subcategory in each cycle.

### Bills, loans, and cards

Columns: Item, Planned payment, Actual paid, Difference, Remaining, Due date, Actions.

- Regular bills use existing payable records and their linked payment transactions.
- Loans and cards use saved cycle payment plans.
- Actual paid is derived only from transactions explicitly linked to that loan or card. The user records those through the relevant payment flow.
- Difference is actual paid minus planned payment. Negative means some of the plan remains unpaid; positive means more was paid than planned.

## Cycle copy

Copy Last Cycle creates editable planning records in the selected cycle:

- expected-income rows, without actual transaction links;
- budget allocations, without actual spending;
- loan and card cycle payment plans.

It never copies actual transactions, payments, or received amounts. Existing planning records in the destination cycle are left unchanged; the action fills only missing matching rows, so it is safe to use without duplicating entries.

## Data and integrity

- Expected income needs cycle-specific records, linked to an optional actual income transaction.
- Existing budget allocation and cycle payment plan data remain the sources of planned category and debt amounts.
- Transactions remain the source of actual values. Plans never create transactions or move money.
- All changes are scoped to the signed-in user and selected cycle.

## Feedback and errors

- Saving a plan gives a visible confirmation and refreshes the relevant row.
- Copy Last Cycle reports how many income rows, allocations, and payment plans it copied.
- Invalid amounts, missing dates, missing prior cycles, and attempts to copy into a populated cycle show a clear message.

## Verification

- Unit tests cover cycle copy, difference calculations, and duplicate prevention.
- Integration tests cover saving expected income, linking actual income, and the Monthly Plan summary.
- TypeScript, full test suite, and production build must pass before deployment.
