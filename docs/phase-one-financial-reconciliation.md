# Phase 1 financial reconciliation

Verified September 17, 2026 (Asia/Manila). Repairs applied to the existing live database; application changes remain local in `D:\Budget Tracker`. No deployment or Phase 2 layout redesign was performed.

## Checkpoints

1. Additive schema and income-source backfill: passed. Five existing sources received category/subcategory references. No ledger amounts or account openings changed.
2. Read-only dry run and rollback verification: passed. Card liabilities were reread before applying writes; no mismatch or ambiguous match was accepted.
3. Income and payment plans: passed. Existing Engage income is included by type/category. The existing Maya payment was linked, not recreated.
4. EastWest historical purchases: passed. Two card purchases belong to August 11–September 10; no cash account was affected.
5. Full reconciliation and repeat-run audit: passed. Zero proposed creates, updates, duplicate links or unresolved repair matches on rerun.
6. Complete tests, type check, production build and final browser check: passed.

## Cards

All amounts are PHP. Statement amounts are independent of total liability and editable planned payment.

| Card | Statement / remaining | Total liability | Planned payment | Paid / status | Due date / status | Cycle |
| --- | ---: | ---: | ---: | --- | --- | --- |
| BPI Amore | 25,389.83 / 25,389.83 | 32,529.65 | 25,389.83 | 0.00 / unpaid | October 5 / CONFIRMED | September 11–October 10 |
| Maya | 7,494.04 / 0.00 | 18,695.66 | 7,494.04 | 7,494.04 / paid | September 30 / CONFIRMED | September 11–October 10 |
| UnionBank | 35,711.73 / 35,711.73 | 59,111.73 | 35,711.73 | 0.00 / unpaid | Unconfirmed / UNSET | September 11–October 10 |
| EastWest | 45,519.14 expected / 45,519.14 | 45,519.14 | 45,519.14 | 0.00 / unpaid | October 25 / ESTIMATED | October 11–November 10 |

UnionBank: limit 65,000.00, available credit 5,888.27, verified unbilled charges 23,400.00. It belongs under “Needs a due date,” not overdue or due soon. A rollback-only payment simulation using the real payment helpers reduced total liability to 23,400.00 without changing income or expenses. Every simulated record was rolled back.

Maya: available credit 26,304.34. Its two existing Claude charges total 1,432.11 and remain separate purchases. The full outstanding-debt split is not verified; do not label all remaining debt as unbilled or force liability to match those two purchases.

BPI: available credit 2,470.35. Its full outstanding-debt split is not verified.

EastWest: available credit 53,480.86. Its expected October 5 statement is a future projection, not a confirmed issued statement. Current billed/unbilled split is not separately verified; the card display labels the statement expected and does not present a future projected zero-unbilled snapshot as a verified current figure. Hospital purchases: September 6, 30,000.00; September 10, 15,519.14. Future payment is not a second expense.

## Cash and savings accounts

Compared with the verified pre-repair balances; no automatic adjustments were made.

| Account | Expected | Verified | Difference |
| --- | ---: | ---: | ---: |
| BPI Savings | 112,078.95 | 112,078.95 | 0.00 |
| MariBank | 1,289.43 | 1,289.43 | 0.00 |
| Maya Savings | 964.47 | 964.47 | 0.00 |
| GCash/CIMB | 5,393.68 | 5,393.68 | 0.00 |
| Cash | 1,471.00 | 1,471.00 | 0.00 |
| ChinaBank | 38,160.68 | 38,160.68 | 0.00 |
| GoTyme | 1.11 | 1.11 | 0.00 |
| OwnBank | 63.72 | 63.72 | 0.00 |
| UnionBank Savings | 36.91 | 36.91 | 0.00 |

ChinaBank's restricted-fund classification is preserved.

## Protected loans, receivables and cycle totals

Exactly two active SLoans remain, with one September 12 payment each:

| Loan | September 10 opening | September 12 payment | Remaining |
| --- | ---: | ---: | ---: |
| SLoan 1 | 91,012.00 | 10,112.44 | 80,899.56 |
| SLoan 2 | 15,370.92 | 1,537.09 | 13,833.83 |
| Combined | 106,382.92 | 11,649.53 | 94,733.39 |

No additional loan deductions. Remaining balances unchanged: SPaylater 49,195.54; GGives 40,509.98; Maya Loan 45,875.91; GLoan 123,133.28; MariBank Loan 47,390.00. Saved due days and end dates are preserved. Payments affect only their named loans and are excluded from expenses.

Mama's four receivables remain fully settled, combined outstanding 0.00. Repayments are not income. The MariBank 5.00 PLDT cashback remains a refund, not salary.

| Cycle | Actual income | Net expenses |
| --- | ---: | ---: |
| August 11–September 10 | 0.00 recorded | 45,519.14 |
| September 11–October 10 | 164,363.45 | 6,975.01 |
| October 11–November 10 | 0.00 recorded | 0.00 recorded |

Recorded zeroes above describe the current ledger, not a claim that no other historical transactions occurred. Engage: expected 22,000.00; actual 24,046.68; difference +2,046.68. Current net expenses include the 5.00 refund offset. Transfers, loan/card payments and receivable repayments are excluded from income/expenses.

## Repair counts and verification

Initial Phase 1 creates: 2 cycles, 1 Health category, 1 Hospital subcategory, 2 historical purchase transactions, 4 card plans and 1 association to the existing Maya payment (11 financial/planning records). Also 13 repair audit entries, 2 verified income-transaction classification updates and 5 income-source backfills. Existing 36 ledger records were preserved rather than re-imported; the ledger now contains 38 records.

Repeat repair audit: 0 creates, 0 updates, 0 unresolved matches. All 11 repair-created financial/planning records are retained without duplication. Migration/backfill rerun also proposes 0 updates and 0 conflicts. Unrelated existing budget periods and pre-existing development changes were preserved.

Complete suite with both live verification flags: 122 test files, 850 tests passed. Live payment simulation is rollback-only. Type check passed. Production browser smoke check passed using the existing demo login for Dashboard, Monthly Plan, Calendar and Loans & Cards; no financial entries were submitted or demo reseed run. Personal financial amounts were verified separately through the live database and production calculation helpers.

The checks uncovered and fixed environment-dependent cycle boundaries and concurrent cycle creation, both of which could cause page-loading failures. Cycle boundaries now use canonical UTC date stamps with Manila calendar-day selection. Generated calendar schedules remain ESTIMATED rather than producing confirmed overdue alerts. Explicit plans override their owning cycle's generated events; partially paid confirmed obligations remain overdue for their unpaid remainder.

Final production build passed (Next.js 16.3.5); final Chrome browser rerun passed (1 smoke test covering four pages, no page errors). A final actual `--apply` repeat repair completed successfully with zero creates across every model, zero updates, zero conflicts and protected balances unchanged. Phase 1 exit checks pass. No deployment, push, merge or layout redesign was performed. Implementation files remain uncommitted in the existing checkout, preserving unrelated work.
