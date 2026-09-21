# Automatic card statement payables

Approved behavior: card purchases update a statement-level forecast; cash is not deducted until a real card payment. Unpaid principal carries forward. Each card has an editable monthly interest estimate, initially 3%, separate from its existing APR.

The statement payable is derived from the signed card-account ledger and statement cutoff. One stable projection is returned per card/statement; rendering or rerunning it writes no financial records. Purchases after a cutoff belong to the following statement. Dates use Manila posted days and clamp month-end cutoffs.

Plan and Calendar consume the projection, and Loans & Cards displays the next automatic statement payable. Verified existing statements and explicitly saved payment amounts are preserved. Unedited full-payment forecasts update with new purchases. Manual payment budgets remain editable alongside the calculated payable.

Interest estimates apply to the previous statement's unpaid remainder, not new purchases. They are planning amounts, not ledger charges, and are not compounded as though they were actual charges. A refund reduces the previous interest base only when linked to a purchase from that statement. Unknown due dates stay UNSET; UnionBank interest remains unestimated until its due date is confirmed.

“Record bank interest” posts one actual EXPENSE to the card and tags its statement. It reduces available credit, increases actual liability and expenses, does not touch cash, and suppresses that statement's estimate. Repeating an identical confirmation is a no-op; conflicting amounts stop for review. Saved confirmed statements are protected against adding interest that may already be included in their balance.

Additive schema extensions: CreditCard.monthlyInterestEstimate defaults to 3; Transaction.cardInterestStatementDate is nullable. The checked migration preserves all existing financial fields. Repeat dry run proposes zero changes.

Verification before release:

- 898 tests passed across 127 files, including database-backed reconciliation, overpayment status and rolled-back purchase/refund/actual-interest scenarios.
- Browser check passed, including the editable monthly-interest setting without saving changes.
- Production build and TypeScript passed.
- Read-only repair audit: zero creates, updates or conflicts; 38 personal transactions preserved.
- No personal transaction, payment, account balance, loan balance or receivable was changed to release this feature.
- Published production deployment: `dpl_59ACUDdYEyqErT8aztY9BmRJZsQn`, READY, https://budget-tracker-tau-five.vercel.app.
- Live browser smoke check passed for Plan, Loans & Cards, Calendar, Transactions, editable monthly interest and mobile containment; no financial entries saved.

Read-only September 18 forecast check (assumes no additional transactions before cutoff):

| Card | Next statement | Principal | Estimated interest | Expected payable |
| --- | --- | ---: | ---: | ---: |
| BPI Amore | October 12 | ₱32,529.65 | ₱761.69 | ₱33,291.34 |
| Maya Credit Card | October 10 | ₱18,695.66 | ₱0.00 | ₱18,695.66 |
| UnionBank Credit Card | September 20 | ₱59,111.73 | Not estimated—due date unset | ₱59,111.73 |
| EastWest Credit Card | October 5 | ₱45,519.14 | ₱0.00 | ₱45,519.14 |

BPI's estimate assumes the September statement remains unpaid after October 5; recording a payment updates the estimate. These forecasts do not change the audited liabilities. Actual bank charges can differ from this simplified planning calculation.
